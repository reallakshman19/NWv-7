import { ShadowCustodyError, type ShadowQueueMessage } from './contracts';

const KNOWN_MESSAGE_TYPES = new Set([
  'RUN_FROZEN_REPLAY',
  'START_LIVE_EPOCH',
  'ACQUIRE_LIVE_LANE',
  'ACQUIRE_LIVE_BROWSER_LANES',
  'FINALIZE_LIVE_EPOCH',
]);

const KNOWN_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError',
  'SyntaxError', 'DOMException', 'AbortError', 'TimeoutError',
]);

function safeEpochId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Match only the two issued epoch forms, never arbitrary queue-supplied text.
  return /^(?:live-[0-9]{10,16}|frozen-(?:[0-9]{10,16}|[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{1,4}))$/.test(value)
    ? value : null;
}

function safeLaneId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // buildLiveLaneDefinitions: section:index:12hex digest, no feed URL.
  return /^[a-z][A-Za-z0-9]{1,30}:[0-9]{2}:[a-f0-9]{12}$/.test(value) ? value : null;
}

function exceptionType(error: unknown): string {
  if (!(error instanceof Error)) return 'NON_ERROR_THROW';
  return KNOWN_ERROR_NAMES.has(error.name) ? error.name : 'OTHER_ERROR';
}

/**
 * Diagnostic metadata only: no raw exception message, SQL query, feed URL,
 * article content, stack trace, tokens, headers or arbitrary message fields.
 *
 * Do not use these diagnostics to ACK or alter Queue retries.
 */
export function queueFailureFields(
  body: Partial<ShadowQueueMessage> | null | undefined,
  error: unknown,
  deliveryAttempt?: number,
) {
  const messageType = KNOWN_MESSAGE_TYPES.has(body?.type ?? '')
    ? body?.type : 'UNRECOGNIZED';
  const code = error instanceof ShadowCustodyError &&
    /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
    ? error.code : 'UNEXPECTED_FAILURE';
  const laneId = 'laneId' in (body || {}) ? safeLaneId((body as { laneId?: unknown })?.laneId) : null;
  return {
    code,
    messageType,
    epochId: safeEpochId(body?.epochId) ?? 'UNRECOGNIZED',
    logicalSlot: typeof body?.logicalSlot === 'number' &&
      Number.isSafeInteger(body.logicalSlot) && body.logicalSlot >= 0
      ? body.logicalSlot : null,
    laneId,
    deliveryAttempt: typeof deliveryAttempt === 'number' &&
      Number.isSafeInteger(deliveryAttempt) && deliveryAttempt > 0
      ? deliveryAttempt : null,
    exceptionType: exceptionType(error),
  };
}

/** A failed finalizer records its last attempted stage and rethrows the original error. */
export function logUnexpectedFinalizationStage(
  phase: string,
  epochId: string,
  error: unknown,
): void {
  if (error instanceof ShadowCustodyError) return;
  console.error('Sections shadow finalization phase failed', {
    ...queueFailureFields({
      type: 'FINALIZE_LIVE_EPOCH',
      epochId,
    }, error),
    phase,
  });
}
