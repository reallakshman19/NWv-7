import { checkPriceSourceRequest } from '../contracts/priceSourceQualification.js';
import { qualifyPriceObservation } from '../contracts/priceObservation.js';

/** MP06 in-memory, per-source/instrument coordinator. No storage or telemetry.
 * Adapters must enforce endpoint paths, payload identity and freshness.
 * A failure retains a prior qualified observation as historical evidence only.
 */
export function createPriceRefreshCoordinator({timeoutMs = 8000, maxRetries = 1} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) {
    throw new TypeError('Invalid refresh bounds');
  }
  const pending = new Map(), retained = new Map();
  const keyFor = r => JSON.stringify([r.sourceId,r.instrument.instrumentId,r.kind,r.action,r.url ?? null]);
  const failure = (reasonCode, previous = null) => Object.freeze({
    state:'UNAVAILABLE', reasonCode, observation:null, retainedObservation:previous
  });
  const clock = o => Date.parse(o.observedAt);
  async function run(request, acquire, key) {
    let lastReason = 'TRANSPORT_FAILED';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => acquire({signal:controller.signal,attempt})),
          new Promise((_,reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); },timeoutMs);
          })
        ]);
        const qualified = qualifyPriceObservation({instrument:request.instrument,observation:result?.observation,receiptRecord:result?.receiptRecord});
        const previous = retained.get(key) ?? null;
        if (!qualified.ok || qualified.observation.sourceId !== request.sourceId || qualified.observation.kind !== request.kind) return failure('UNQUALIFIED_RESPONSE',previous);
        if (previous && (clock(qualified.observation) < clock(previous) ||
            (clock(qualified.observation) === clock(previous) && qualified.observation.value !== previous.value))) {
          return failure('OLDER_OR_CONFLICTING_OBSERVATION',previous);
        }
        retained.set(key,qualified.observation);
        return Object.freeze({state:'QUALIFIED_NATIVE',reasonCode:null,observation:qualified.observation,retainedObservation:null});
      } catch (error) {
        lastReason = controller.signal.aborted ? 'TIMEOUT' : 'TRANSPORT_FAILED';
        // Only an explicitly classified transient failure is retryable.
        if (!controller.signal.aborted && error?.retryable !== true) break;
      } finally { clearTimeout(timer); }
    }
    return failure(lastReason,retained.get(key) ?? null);
  }
  function refresh(request, acquire) {
    const decision = checkPriceSourceRequest(request);
    if (!decision.allowed) {
      // Revocation must hide previous observations, not surface a fallback.
      if (request?.instrument?.instrumentId) {
        for (const key of retained.keys()) {
          const [sourceId,instrumentId] = JSON.parse(key);
          if (sourceId === request.sourceId && instrumentId === request.instrument.instrumentId) retained.delete(key);
        }
      }
      return Promise.resolve(Object.freeze({state:decision.state,reasonCode:decision.reasonCode,observation:null,retainedObservation:null}));
    }
    if (request.action !== 'BROWSER_FETCH' || typeof acquire !== 'function') return Promise.resolve(failure('NATIVE_ADAPTER_REQUIRED'));
    const key = keyFor(request);
    if (pending.has(key)) return pending.get(key);
    const work = run(request,acquire,key).finally(() => pending.delete(key));
    pending.set(key,work);
    return work;
  }
  async function refreshMany(jobs) {
    return Promise.all(jobs.map(job => Promise.resolve().then(() => refresh(job.request,job.acquire)).catch(() => failure('REFRESH_FAILED'))));
  }
  return Object.freeze({refresh,refreshMany});
}
