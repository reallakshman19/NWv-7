export const TOP_STORIES_SHADOW_SLOT_VERSION =
  'nw-top-stories-shadow-slot/v1';

export const TOP_STORIES_SHADOW_SLOT_MINUTES = Object.freeze([
  7,
  22,
  37,
  52,
]);

export class NominalSlotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NominalSlotError';
    this.code = code;
  }
}

function parseRunAt(runAt) {
  const value = typeof runAt === 'number' ? runAt : Date.parse(runAt);
  if (!Number.isFinite(value)) {
    throw new NominalSlotError(
      'invalid_run_at',
      'Nominal-slot resolution requires a valid runAt timestamp',
    );
  }
  return value;
}

function candidateAt(hourStartMs, minute) {
  return hourStartMs + (minute * 60 * 1000);
}

function slotKey(timestampMs) {
  return new Date(timestampMs)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('.000', '');
}

export function resolveTopStoriesNominalSlot(runAt) {
  const runAtMs = parseRunAt(runAt);
  const date = new Date(runAtMs);
  const hourStartMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
  );
  const currentHourCandidates = TOP_STORIES_SHADOW_SLOT_MINUTES
    .map(minute => candidateAt(hourStartMs, minute))
    .filter(candidate => candidate <= runAtMs);
  const scheduledAtMs = currentHourCandidates.length > 0
    ? currentHourCandidates[currentHourCandidates.length - 1]
    : candidateAt(
      hourStartMs - (60 * 60 * 1000),
      TOP_STORIES_SHADOW_SLOT_MINUTES.at(-1),
    );
  return {
    version: TOP_STORIES_SHADOW_SLOT_VERSION,
    method: 'latest-cron-grid-slot-at-or-before-run-at',
    gridMinutes: [...TOP_STORIES_SHADOW_SLOT_MINUTES],
    scheduledAt: new Date(scheduledAtMs).toISOString(),
    runAt: new Date(runAtMs).toISOString(),
    scheduleDelaySeconds: (runAtMs - scheduledAtMs) / 1000,
    slotKey: slotKey(scheduledAtMs),
  };
}
