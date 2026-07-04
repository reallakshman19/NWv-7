import { useCallback, useEffect, useState } from 'react';
import { getDatasetLoader } from '../datasets/index.js';
import { recordDiagnostic } from '../diagnosticsStore.js';
import { useMountedRef } from '../../hooks/useMountedRef.js';
import { getFetchMode, isLiveMode } from '../../utils/fetchMode.js';

const envelopeCache = new Map();
const inFlight = new Map();
const fetchLifecycleByEnvelope = new WeakMap();

function makeFetchLifecycle(env, details) {
  return {
    ...(env.fetchLifecycle || fetchLifecycleByEnvelope.get(env) || {}),
    datasetId: details.datasetId,
    fetchMode: details.fetchMode,
    servedFrom: details.servedFrom,
    durationMs: Math.max(0, Date.now() - details.startedAt),
    force: details.force,
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

export async function loadDataset(datasetId, force = false) {
  const startedAt = Date.now();
  const fetchMode = getFetchMode();
  const loader = getDatasetLoader(datasetId);

  if (!loader?.load) {
    throw new Error(`Unknown dataset: ${datasetId}`);
  }

  const effectiveForce = force || isLiveMode();

  if (!effectiveForce && envelopeCache.has(datasetId)) {
    return decorateDatasetEnvelope(envelopeCache.get(datasetId), {
      datasetId,
      fetchMode,
      servedFrom: 'memory-cache',
      startedAt,
      force: effectiveForce,
    });
  }

  if (!effectiveForce && inFlight.has(datasetId)) {
    return inFlight.get(datasetId).then(env => decorateDatasetEnvelope(env, {
      datasetId,
      fetchMode,
      servedFrom: 'in-flight',
      startedAt,
      force: effectiveForce,
    }));
  }

  const promise = loader.load()
    .then(env => {
      const decorated = decorateDatasetEnvelope(env, {
        datasetId,
        fetchMode,
        servedFrom: effectiveForce ? 'loader-force' : 'loader',
        startedAt,
        force: effectiveForce,
      });
      envelopeCache.set(datasetId, decorated);

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
      inFlight.delete(datasetId);
    });

  inFlight.set(datasetId, promise);
  return promise;
}

export function useDataset(datasetId, options = {}) {
  const { auto = true } = options;
  const mountedRef = useMountedRef();

  const [state, setState] = useState(() => ({
    envelope: envelopeCache.get(datasetId) || null,
    loading: auto && !envelopeCache.has(datasetId),
    error: null,
  }));

  const reload = useCallback(async (force = true) => {
    if (mountedRef.current) {
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
      }));
    }

    try {
      const envelope = await loadDataset(datasetId, force);

      if (mountedRef.current) {
        setState({
          envelope,
          loading: false,
          error: envelope.ok ? null : envelope.error,
        });
      }

      return envelope;
    } catch (error) {
      const message = error?.message || String(error);

      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: message,
        }));
      }

      throw error;
    }
  }, [datasetId, mountedRef]);

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
  return Array.from(envelopeCache.entries()).map(([datasetId, envelope]) => ({
    datasetId,
    envelope,
  }));
}

export function __getDatasetCacheForTest() {
  return envelopeCache;
}

export function clearEnvelopeCache() {
  envelopeCache.clear();
  inFlight.clear();
}

export function __clearDatasetCacheForTest() {
  envelopeCache.clear();
  inFlight.clear();
}
