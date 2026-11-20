// src/services/marketTrust.js

// Qualified per-instrument clock and provenance contract; do not silently accept
// legacy v3 prices whose source timestamps may be missing or synthetic.
export const MARKET_CACHE_SCHEMA_VERSION = 'market-v4';

export const MARKET_CONTEXT_CACHE_KEY = 'market_cache_v4';
export const MARKET_SERVICE_CACHE_KEY = 'indian_market_stable_data_v4';

export const MARKET_FRESH_CACHE_TTL_MS = 15 * 60 * 1000;
export const MARKET_SERVICE_CACHE_TTL_MS = 30 * 60 * 1000;
export const MARKET_STALE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MARKET_SNAPSHOT_FRESH_MS = 6 * 60 * 60 * 1000;
export const MARKET_EXPIRED_DISPLAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function parseMarketTimestamp(payload) {
  if (!payload) return null;

  const candidates = [
    payload.fetchedAt,
    payload.generatedAt,
    payload.generated_at,
    payload.asOf,
    payload.timestamp
  ];

  for (const value of candidates) {
    if (!value) continue;

    if (typeof value === 'number' && Number.isFinite(value) && value > 946684800000 &&
        value <= Date.now() + 5 * 60 * 1000) return value;

    // Date-only strings and local-time instants are not publication clocks.
    if (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 946684800000 &&
        parsed <= Date.now() + 5 * 60 * 1000) return parsed;
  }

  return null;
}

export function getMarketPayloadAgeMs(payload, nowMs = Date.now()) {
  const ts = parseMarketTimestamp(payload);
  if (!ts) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - ts);
}

export function isMarketPayloadUsable(payload) {
  return Boolean(
    payload &&
    ['indices', 'globalIndices', 'sectorals', 'equities'].some((key) =>
      Array.isArray(payload[key]) && payload[key].some((item) =>
        (item?.name || item?.symbol) &&
        Number.isFinite(Number(String(item?.value ?? item?.price ?? '').replace(/,/g, ''))) &&
        Number(String(item?.value ?? item?.price ?? '').replace(/,/g, '')) > 0 &&
        String(item?.sourceMode || item?.source || '').toLowerCase() !== 'seed'))
  );
}

export function isMarketPayloadFresh(payload, ttlMs, nowMs = Date.now()) {
  return isMarketPayloadUsable(payload) && getMarketPayloadAgeMs(payload, nowMs) <= ttlMs;
}

export function isMarketPayloadDisplayable(payload, maxAgeMs = MARKET_EXPIRED_DISPLAY_MAX_AGE_MS) {
  if (!isMarketPayloadUsable(payload)) return false;

  const mode = String(payload.sourceMode || '').toLowerCase();

  // Seed is always displayable because it is explicit non-live fallback.
  if (mode === 'seed') return true;

  const ageMs = getMarketPayloadAgeMs(payload);

  // Never show unknown-age live/snapshot/cache data as normal data.
  if (!Number.isFinite(ageMs)) return false;

  // Reject the 900h+ stale case.
  return ageMs <= maxAgeMs;
}

export function markMarketPayload(payload, sourceMode, extra = {}) {
  const timestamp = parseMarketTimestamp(payload);

  return {
    ...payload,
    ...extra,
    schemaVersion: MARKET_CACHE_SCHEMA_VERSION,
    sourceMode,
    fetchedAt: timestamp,
    generatedAt: payload?.generatedAt || payload?.generated_at || (timestamp ? new Date(timestamp).toISOString() : null),
    sourceHealth: normalizeSourceHealth(payload?.sourceHealth || extra.sourceHealth || {}, sourceMode)
  };
}

export function normalizeSourceHealth(rawHealth = {}, fallbackMode = 'unknown') {
  const normalized = {};

  for (const [key, value] of Object.entries(rawHealth || {})) {
    if (typeof value === 'string') {
      normalized[key] = {
        status: normalizeHealthStatus(value),
        provider: key,
        mode: value,
        message: value
      };
      continue;
    }

    if (value && typeof value === 'object') {
      normalized[key] = {
        provider: value.provider || key,
        status: normalizeHealthStatus(value.status || value.mode || fallbackMode),
        mode: value.mode || fallbackMode,
        winner: value.winner || null,
        freshnessMs: Number.isFinite(Number(value.freshnessMs)) ? Number(value.freshnessMs) : null,
        message: value.message || value.reason || ''
      };
      continue;
    }

    normalized[key] = {
      provider: key,
      status: 'unknown',
      mode: fallbackMode,
      message: ''
    };
  }

  if (Object.keys(normalized).length === 0) {
    normalized[fallbackMode] = {
      provider: fallbackMode,
      status: normalizeHealthStatus(fallbackMode),
      mode: fallbackMode,
      message: fallbackMode
    };
  }

  return normalized;
}

export function normalizeHealthStatus(value) {
  const text = String(value || '').toLowerCase();

  if (text.includes('live') || text.includes('ok') || text.includes('success')) return 'live';
  if (text.includes('official')) return 'official';
  if (text.includes('snapshot')) return text.includes('stale') ? 'stale' : 'snapshot';
  if (text.includes('cache')) return text.includes('stale') ? 'stale' : 'cache';
  if (text.includes('seed')) return 'seed';
  if (text.includes('eod')) return 'eod';
  if (text.includes('failed') || text.includes('error')) return 'failed';
  if (text.includes('empty')) return 'empty';
  if (text.includes('partial')) return 'partial';

  return 'unknown';
}

export function summarizeMarketSourceHealth(marketData = {}) {
  const sourceMode = String(marketData?.sourceMode || '').toLowerCase();
  const health = normalizeSourceHealth(marketData?.sourceHealth || {}, sourceMode || 'unknown');
  const values = Object.values(health);

  const counts = {
    live: 0,
    official: 0,
    snapshot: 0,
    cache: 0,
    stale: 0,
    seed: 0,
    failed: 0,
    empty: 0,
    partial: 0,
    unknown: 0
  };

  for (const item of values) {
    const status = normalizeHealthStatus(item.status || item.mode);
    counts[status] = (counts[status] || 0) + 1;
  }

  let modeStr = 'cached';
  let modeLabel = 'Cached';

  // The delivery mode describes this result; source-health entries describe
  // its upstream history and must not turn a cached result into a live one.
  if (sourceMode === 'stale-cache' || sourceMode === 'stale-snapshot') {
    modeStr = 'degraded';
    modeLabel = 'Stale';
  } else if (sourceMode === 'cache') {
    modeStr = 'cached';
    modeLabel = 'Cached';
  } else if (sourceMode === 'seed') {
    modeStr = 'degraded';
    modeLabel = 'Unavailable';
  } else if (sourceMode === 'live') {
    // Yahoo's public endpoints do not establish a real-time entitlement.
    modeStr = 'cached';
    modeLabel = 'Delayed';
  } else if (sourceMode === 'official') {
    modeStr = 'live';
    modeLabel = 'Official';
  } else if (sourceMode === 'snapshot') {
    modeStr = 'snapshot';
    modeLabel = 'Snapshot';
  } else if (counts.stale > 0) {
    modeStr = 'degraded';
    modeLabel = 'Stale';
  } else if (counts.seed > 0) {
    modeStr = 'degraded';
    modeLabel = 'Unavailable';
  } else if (counts.snapshot > 0) {
    modeStr = 'snapshot';
    modeLabel = 'Snapshot';
  } else if (counts.failed > 0 || counts.empty > 0 || counts.partial > 0) {
    modeStr = 'degraded';
    modeLabel = 'Limited';
  }

  return {
    health,
    counts,
    modeStr,
    modeLabel
  };
}

export function shouldRejectMarketPayload(payload, options = {}) {
  const {
    maxAgeMs = MARKET_EXPIRED_DISPLAY_MAX_AGE_MS,
    allowSeed = true
  } = options;

  if (!isMarketPayloadUsable(payload)) {
    return {
      reject: true,
      reason: 'Market payload has no displayable qualified quote rows.'
    };
  }

  const sourceMode = String(payload?.sourceMode || '').toLowerCase();

  if (allowSeed && sourceMode === 'seed') {
    return { reject: false, reason: null };
  }

  const ageMs = getMarketPayloadAgeMs(payload);

  if (!Number.isFinite(ageMs)) {
    return {
      reject: true,
      reason: 'Market payload has no valid freshness timestamp.'
    };
  }

  if (ageMs > maxAgeMs) {
    return {
      reject: true,
      reason: `Market payload expired: ${Math.round(ageMs / 3600000)}h old.`
    };
  }

  return { reject: false, reason: null };
}