export const ENVELOPE_SOURCES = Object.freeze({
  LIVE: 'live',
  SNAPSHOT: 'snapshot',
  CACHE: 'cache',
  SEED: 'seed',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
});

export const ENVELOPE_FRESHNESS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  EXPIRED: 'expired',
  EMPTY: 'empty',
  UNKNOWN: 'unknown',
});

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

export function fnv1aHex(input) {
  const text = String(input ?? '');
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

export function makeEnvelope(partial = {}) {
  // A rendered payload alone is not evidence that acquisition or validation succeeded.
  // Do not invent a current provider or an acquisition timestamp for retained bytes.
  const ok = partial.ok === true;
  const data = partial.data ?? null;
  const source = partial.source || ENVELOPE_SOURCES.UNKNOWN;

  return Object.freeze({
    ok,
    datasetId: partial.datasetId || 'unknown',
    data,
    payloadHash: partial.payloadHash || fnv1aHex(stableStringify(data)),
    source,
    freshness: partial.freshness || ENVELOPE_FRESHNESS.UNKNOWN,
    generatedAt: partial.generatedAt ?? null,
    fetchedAt: partial.fetchedAt ?? null,
    lastGoodAt: partial.lastGoodAt ?? null,
    schemaVersion: partial.schemaVersion || '1.0.0',
    fallbackUsed: source !== ENVELOPE_SOURCES.LIVE,
    validation: partial.validation ?? { passed: null, errors: [], warnings: ['not_evaluated'] },
    slo: partial.slo ?? { passed: null, score: null, reasons: ['not_evaluated'] },
    diagnostics: partial.diagnostics || [],
    error: partial.error ?? null,
  });
}

export function isUsableEnvelope(env) {
  return Boolean(env && env.ok === true && env.data != null);
}
