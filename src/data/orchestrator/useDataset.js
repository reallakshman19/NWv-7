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

function cacheEnvelope(cacheKey, datasetId, envelope, normalizedOptions) {
  envelopeCache.set(cacheKey, envelope);
  cacheMetadata.set(cacheKey, { datasetId, cacheKey, options: normalizedOptions });
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

function getInitialEnvelope(datasetId, options) {
  const normalizedOptions = normalizeDatasetOptions(options, { liveMode: isLiveMode() });
  return envelopeCache.get(buildDatasetCacheKey(datasetId, normalizedOptions)) || null;
}

export async function loadDataset(datasetId, options = {}) {
  const startedAt = Date.now();
  const fetchMode = getFetchMode();
  const loader = getDatasetLoader(datasetId);

  if (!loader?.load) {
    throw new Error(`Unknown dataset: ${datasetId}`);
  }

  const normalizedOptions = normalizeDatasetOptions(options, { liveMode: isLiveMode() });
  const cacheKey = buildDatasetCacheKey(datasetId, normalizedOptions);
  const bypassCache = normalizedOptions.forceRefresh;

  if (!bypassCache && envelopeCache.has(cacheKey)) {
    return decorateDatasetEnvelope(envelopeCache.get(cacheKey), makeLifecycleDetails({
      datasetId, fetchMode, cacheKey, normalizedOptions, startedAt, servedFrom: 'memory-cache',
    }));
  }

  if (!bypassCache && inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey).then(env => decorateDatasetEnvelope(env, makeLifecycleDetails({
      datasetId, fetchMode, cacheKey, normalizedOptions, startedAt, servedFrom: 'in-flight',
    })));
  }

  const promise = loader.load(normalizedOptions)
    .then(env => {
      const decorated = decorateDatasetEnvelope(env, makeLifecycleDetails({
        datasetId,
        fetchMode,
        cacheKey,
        normalizedOptions,
        startedAt,
        servedFrom: bypassCache ? 'loader-force' : 'loader',
      }));
      cacheEnvelope(cacheKey, datasetId, decorated, normalizedOptions);

      recordDiagnostic({
        datasetId,
        severity: decorated.ok ? 'info' : 'warn',
        event: 'dataset_loaded',
        message: decorated.ok ? 'Dataset loaded' : (decorated.error || 'Dataset degraded'),
        details: {
          freshness: decorated.freshness,
          source: decorated.source,
          payloadHash: decorated.payloadHash,
          fetchLifecycle: getFetchLifecycle(decorated),
        },
      });

      return decorated;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  if (!bypassCache) {
    inFlight.set(cacheKey, promise);
  }
  return promise;
}

export function useDataset(datasetId, options = {}) {
  const { auto = true, forceRefresh, liveOnly, includeInsight, policy, asOfDate } = options;
  const mountedRef = useMountedRef();
  const baseLoadOptions = useMemo(() => ({
    forceRefresh, liveOnly, includeInsight, policy, asOfDate,
  }), [forceRefresh, liveOnly, includeInsight, policy, asOfDate]);
  const initialEnvelope = getInitialEnvelope(datasetId, baseLoadOptions);

  const [state, setState] = useState(() => ({
    envelope: initialEnvelope,
    loading: auto && !initialEnvelope,
    error: null,
  }));

  const reload = useCallback(async (reloadOptions = true) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const requestOptions = mergeDatasetOptions(baseLoadOptions, reloadOptions);
      const envelope = await loadDataset(datasetId, requestOptions);

      if (mountedRef.current) {
        setState({ envelope, loading: false, error: envelope.ok ? null : envelope.error });
      }

      return envelope;
    } catch (error) {
      const message = error?.message || String(error);

      if (mountedRef.current) {
        setState(prev => ({ ...prev, loading: false, error: message }));
      }

      throw error;
    }
  }, [baseLoadOptions, datasetId, mountedRef]);

  useEffect(() => {
    if (!auto) return;
    queueMicrotask(() => {
      reload(false).catch(() => {});
    });
  }, [auto, reload]);

  return {
    ...state,
    reload,
  };
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
