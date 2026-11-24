import { createPriceRefreshCoordinator } from './priceRefreshCoordinator.js';

/** Bridge existing on-demand clients to the vNext contract without replacing
 * their return shapes, store-level coalescing, cache or provider cooldown.
 * A single attempt preserves provider-specific fallback and avoids extra
 * requests after a 429. No data is persisted by this bridge.
 */
export async function acquireQualifiedReference(request, acquire, { signal, project } = {}) {
  const coordinator = createPriceRefreshCoordinator({timeoutMs:8000,maxRetries:0});
  let payload, originalError;
  const result = await coordinator.refresh(request, async ({signal:deadline}) => {
    const combined = signal ? AbortSignal.any([signal,deadline]) : deadline;
    try {
      combined.throwIfAborted();
      payload = await acquire(combined);
      combined.throwIfAborted();
      return project(payload);
    } catch (error) {
      originalError = error;
      throw error;
    }
  });
  if (result.state !== 'QUALIFIED_NATIVE') {
    throw originalError ?? new Error('Reference acquisition rejected: ' + result.reasonCode);
  }
  return payload;
}

export function projectReferenceObservation(request, payload, value) {
  const receipt = payload?.receipt;
  const id = JSON.stringify([request.sourceId,request.instrument.instrumentId,payload?.date]);
  return {
    observation:{
      instrumentId:request.instrument.instrumentId, sourceId:request.sourceId,
      currency:request.instrument.currency, kind:request.kind, receiptId:id,
      value, observedAt:payload?.date, tradingDate:payload?.date, validity:'VALID'
    },
    receiptRecord:{id,receipt}
  };
}
