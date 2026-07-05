import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDatasetLoader } from '../datasets/index.js';
import { recordDiagnostic } from '../diagnosticsStore.js';
import { useMountedRef } from '../../hooks/useMountedRef.js';
import { getFetchMode, isLiveMode } from '../../utils/fetchMode.js';
import {
  buildDatasetCacheKey,
  mergeDatasetOptions,
  normalizeDatasetOptions,
} from './datasetPolicy.js';

const envelopeCache = new Map();
const cacheMetadata = new Map();
const inFlight = new Map();
const fetchLifecycleByEnvelope = new WeakMap();

function makeFetchLifecycle(env, details) {
  return {
    ...(env.fetchLifecycle || fetchLifecycleByEnvelope.get(env) || {}),
    datasetId: details.datasetId,
    fetchMode: details.fetchMode,
    servedFrom: details.servedFrom,
    durationMs: Math.max(0, Date.now() - details.startedAt),
    force: details.normalizedOptions.forceRefresh,
    policy: details.normalizedOptions.policy,
    forceRefresh: details.normalizedOptions.forceRefresh,
    liveOnly: details.normalizedOptions.liveOnly,
    includeInsight: details.normalizedOptions.includeInsight,
    asOfDate: details.normalizedOptions.asOfDate,
    cacheKey: details.cacheKey,
  };
}

function decorateDatasetEnvelope(env, details) {
  if (!env || typeof env !== 'object') return env;
  const fetchLifecycle = makeFetchLifecycle(env, details);
  if (Object.isExtensible(env)) {
    env.fetchLifecycle = fetchLifecycle;
  } else {
    fetchLifecycleByEnvelope.set(env, fetchLifecycle);
  }
  return env;
}

function getFetchLifecycle(env) {
  return env?.fetchLifecycle || fetchLifecycleByEnvelope.get(env) || null;
}

function makeLifecycleDetails(params) {
  return {
    datasetId: params.datasetId,
    fetchMode: params.fetchMode,
    servedFrom: params.servedFrom,
    startedAt: params.startedAt,
    normalizedOptions: params.normalizedOptions,
    cacheKey: params.cacheKey,
  };
}

function cacheEnvelope(cacheKey, datasetId, envelope, normalizedOptions) {
  envelopeCache.set(cacheKey, envelope);
  cacheMetadata.set(cacheKey, { datasetId, cacheKey, options: normalizedOptions });
}

function recordDatasetLoaded(datasetId, envelope) {
  recordDiagnostic({
    datasetId,
    severity: envelope.ok ? 'info' : 'warn',
    event: 'dataset_loaded',
    message: envelope.ok ? 'Dataset loaded' : (envelope.error || 'Dataset degraded'),
    details: {
      freshness: envelope.freshness,
      source: envelope.source,
      payloadHash: envelope.payloadHash,
      fetchLifecycle: getFetchLifecycle(envelope),
    },
  });
}

function createLoadContext(datasetId, options) {
  const normalizedOptions = normalizeDatasetOptions(options, { liveMode: isLiveMode() });
  return {
    datasetId,
    startedAt: Date.now(),
    fetchMode: getFetchMode(),
    loader: getDatasetLoader(datasetId),
    normalizedOptions,
    cacheKey: buildDatasetCacheKey(datasetId, normalizedOptions),
    bypassCache: normalizedOptions.forceRefresh,
  };
}

function decorateFromContext(env, context, servedFrom) {
  return decorateDatasetEnvelope(env, makeLifecycleDetails({ ...context, servedFrom }));
}

function readCachedEnvelope(context) {
  if (context.bypassCache || !envelopeCache.has(context.cacheKey)) return null;
  return decorateFromContext(envelopeCache.get(context.cacheKey), context, 'memory-cache');
}

function readInFlightEnvelope(context) {
  if (context.bypassCache || !inFlight.has(context.cacheKey)) return null;
  return inFlight.get(context.cacheKey).then(env => decorateFromContext(env, context, 'in-flight'));
}

function startLoaderRequest(context) {
  const promise = context.loader.load(context.normalizedOptions)
    .then(env => {
      const servedFrom = context.bypassCache ? 'loader-force' : 'loader';
      const decorated = decorateFromContext(env, context, servedFrom);
      cacheEnvelope(context.cacheKey, context.datasetId, decorated, context.normalizedOptions);
      recordDatasetLoaded(context.datasetId, decorated);
      return decorated;
    })
    .finally(() => {
      inFlight.delete(context.cacheKey);
    });

  if (!context.bypassCache) inFlight.set(context.cacheKey, promise);
  return promise;
}

function getInitialEnvelope(datasetId, options) {
  const normalizedOptions = normalizeDatasetOptions(options, { liveMode: isLiveMode() });
  return envelopeCache.get(buildDatasetCacheKey(datasetId, normalizedOptions)) || null;
}

function useBaseLoadOptions(options) {
  const { forceRefresh, liveOnly, includeInsight, policy, asOfDate } = options;
  return useMemo(() => ({
    forceRefresh, liveOnly, includeInsight, policy, asOfDate,
  }), [forceRefresh, liveOnly, includeInsight, policy, asOfDate]);
}

export async function loadDataset(datasetId, options = {}) {
  const context = createLoadContext(datasetId, options);
  if (!context.loader?.load) throw new Error(`Unknown dataset: ${datasetId}`);

  const cached = readCachedEnvelope(context);
  if (cached) return cached;

  const pending = readInFlightEnvelope(context);
  return pending || startLoaderRequest(context);
}

export function useDataset(datasetId, options = {}) {
  const { auto = true } = options;
  const mountedRef = useMountedRef();
  const baseLoadOptions = useBaseLoadOptions(options);
  const initialEnvelope = getInitialEnvelope(datasetId, baseLoadOptions);

  const [state, setState] = useState(() => ({
    envelope: initialEnvelope,
    loading: auto && !initialEnvelope,
    error: null,
  }));

  const reload = useCallback(async (reloadOptions = true) => {
    if (mountedRef.current) setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const requestOptions = mergeDatasetOptions(baseLoadOptions, reloadOptions);
      const envelope = await loadDataset(datasetId, requestOptions);
      if (mountedRef.current) {
        setState({ envelope, loading: false, error: envelope.ok ? null : envelope.error });
      }
      return envelope;
    } catch (error) {
      const message = error?.message || String(error);
      if (mountedRef.current) setState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, [baseLoadOptions, datasetId, mountedRef]);

  useEffect(() => {
    if (!auto) return;
    queueMicrotask(() => {
      reload(false).catch(() => {});
    });
  }, [auto, reload]);

  return { ...state, reload };
}

export function listDatasetCache() {
  return Array.from(envelopeCache.entries()).map(([cacheKey, envelope]) => ({
    ...(cacheMetadata.get(cacheKey) || { datasetId: cacheKey, cacheKey }),
    envelope,
  }));
}

export function __getDatasetCacheForTest() {
  return envelopeCache;
}

export function clearEnvelopeCache() {
  envelopeCache.clear();
  cacheMetadata.clear();
  inFlight.clear();
}

export function __clearDatasetCacheForTest() {
  envelopeCache.clear();
  cacheMetadata.clear();
  inFlight.clear();
}
