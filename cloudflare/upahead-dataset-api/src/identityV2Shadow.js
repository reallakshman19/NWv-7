/**
 * UpAhead v2 edge generation integrity prototype.
 *
 * SHADOW ONLY. Not imported by the production Worker/client, and not an
 * authorisation to publish a v2 snapshot. The publisher must separately attest
 * the manifest's origin; a hash supplied by the same untrusted source is NOT
 * a signature or an independent source-of-truth.
 *
 * Portable WebCrypto API: suitable for future Workers/browser integrations.
 */
export const UPAHEAD_IDENTITY_SHADOW_VERSION = 'upahead-generation-shadow/v1';
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const ALLOWED_CLASSES = new Set([
  'events', 'movies', 'shopping', 'airlines', 'alerts',
  'weather_alerts', 'civic', 'festivals', 'sports',
]);
const TOP_LEVEL_COLLECTIONS = [
  'items', 'pendingItems', 'retiredOccurrences', 'retiredRevisions',
  'sourceAliases',
];

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => Number.isSafeInteger(value) && value > 0;

// Canonical JSON is independent of object-key order, and of input order for
// top-level identity/source history sets. Nested arrays remain order-sensitive;
// the publication producer must decide their semantic order consistently.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (record(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('non-finite JSON number');
    return JSON.stringify(value);
  }
  throw new TypeError('unserializable value');
}

function normalizedRows(rows) {
  return [...rows].map(row => ({ ...row })).sort((a, b) => {
    const ka = String(a.canonicalOccurrenceId || a.occurrenceId || a.alias || a.identity || '');
    const kb = String(b.canonicalOccurrenceId || b.occurrenceId || b.alias || b.identity || '');
    return ka.localeCompare(kb) || stableJson(a).localeCompare(stableJson(b));
  });
}

export function canonicalGenerationPayload(payload) {
  if (!record(payload)) throw new TypeError('not an object payload');
  // Include every published field except any embedded transport manifest. A
  // payload's actual row contents, including source aliases and cancellations,
  // must participate in the digest. Top-level row-set order is not identity.
  const result = { ...payload };
  delete result.manifest;
  for (const key of TOP_LEVEL_COLLECTIONS) {
    if (Array.isArray(result[key])) result[key] = normalizedRows(result[key]);
  }
  return stableJson(result);
}

export async function contentDigest(payload) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto SHA-256 is required');
  const bytes = new TextEncoder().encode(canonicalGenerationPayload(payload));
  const hash = await subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
}

function fail(reason, detail = '') {
  return { usable: false, status: 'INVALID', reason, detail };
}

export async function verifyGeneration(payload, manifest, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const freshnessMs = opts.freshnessMs ?? 12 * 60 * 60 * 1000;
  if (!record(payload) || !record(manifest)) return fail('missing-payload-or-manifest');
  if (manifest.schemaVersion !== 2 || payload.schemaVersion !== 2) return fail('unsupported-version');
  if (!manifest.generationId || manifest.generationId !== payload.generationId) return fail('generation-mismatch');
  if (!COMMIT_SHA.test(manifest.sourceCommit || '')) return fail('invalid-source-commit');
  if (manifest.identityVersion !== 2 || !manifest.retentionPolicyVersion || !manifest.ledgerVersion) {
    return fail('missing-identity-policy-ledger');
  }
  if (!time(manifest.publishedAt) || manifest.publishedAt > nowMs + 5 * 60 * 1000) {
    return fail('invalid-publication-clock');
  }
  if (!time(manifest.observedAt) || manifest.observedAt > manifest.publishedAt) {
    return fail('invalid-observation-clock');
  }
  if (!SHA256.test(manifest.semanticDigest || '')) return fail('missing-semantic-digest');
  if (!Array.isArray(payload.items) || !Array.isArray(payload.pendingItems)
    || !Array.isArray(payload.retiredOccurrences) || !Array.isArray(payload.sourceAliases)) {
    return fail('missing-occurrence-collections');
  }

  const activeIds = new Set();
  const aliases = new Set();
  for (const row of [...payload.items, ...payload.pendingItems]) {
    if (!record(row) || typeof row.canonicalOccurrenceId !== 'string' || !row.canonicalOccurrenceId) {
      return fail('missing-canonical-occurrence-id');
    }
    if (!ALLOWED_CLASSES.has(String(row.category || ''))) return fail('invalid-content-class');
    if (activeIds.has(row.canonicalOccurrenceId)) return fail('duplicate-canonical-occurrence-id');
    activeIds.add(row.canonicalOccurrenceId);
    if (row.status !== 'ACTIVE') return fail('invalid-occurrence-status');
    if (!time(row.expiryAt)) return fail('invalid-occurrence-expiry');
    if (payload.items.includes(row) && row.expiryAt <= nowMs) {
      return fail('expired-active-occurrence');
    }
    if (row.eventStartAt != null && (!time(row.eventStartAt) || row.expiryAt < row.eventStartAt)) {
      return fail('invalid-occurrence-window');
    }
  }
  for (const retired of payload.retiredOccurrences) {
    if (!record(retired) || !retired.canonicalOccurrenceId) return fail('invalid-retired-occurrence');
    if (activeIds.has(retired.canonicalOccurrenceId)) return fail('retired-occurrence-resurrected');
  }
  for (const alias of payload.sourceAliases) {
    if (!record(alias) || !alias.alias || !alias.canonicalOccurrenceId) return fail('invalid-source-alias');
    if (aliases.has(alias.alias)) return fail('duplicate-source-alias');
    aliases.add(alias.alias);
    if (!activeIds.has(alias.canonicalOccurrenceId)
      && !payload.retiredOccurrences.some(row => row.canonicalOccurrenceId === alias.canonicalOccurrenceId)) {
      return fail('orphan-source-alias');
    }
  }
  if (!record(manifest.recordCounts)
    || manifest.recordCounts.active !== payload.items.length
    || manifest.recordCounts.pending !== payload.pendingItems.length
    || manifest.recordCounts.retired !== payload.retiredOccurrences.length
    || manifest.recordCounts.aliases !== payload.sourceAliases.length) {
    return fail('record-count-mismatch');
  }
  let actualDigest;
  try {
    actualDigest = await contentDigest(payload);
  } catch (error) {
    return fail('unhashable-payload', error?.message || '');
  }
  if (actualDigest !== manifest.semanticDigest) return fail('semantic-digest-mismatch');
  const ageMs = nowMs - manifest.publishedAt;
  return {
    usable: true,
    status: ageMs > freshnessMs ? 'STALE_VALID' : 'VALID',
    generationId: manifest.generationId,
    sourceCommit: manifest.sourceCommit,
    identityVersion: manifest.identityVersion,
    ledgerVersion: manifest.ledgerVersion,
    semanticDigest: actualDigest,
    ageMs,
    counts: { ...manifest.recordCounts },
  };
}

export async function compareTransportGenerations(left, right, opts = {}) {
  const first = await verifyGeneration(left?.payload, left?.manifest, opts);
  const second = await verifyGeneration(right?.payload, right?.manifest, opts);
  if (!first.usable || !second.usable) {
    return { equivalent: false, reason: 'invalid-side', source: first, edge: second };
  }
  if (first.generationId !== second.generationId
    || first.sourceCommit !== second.sourceCommit
    || first.semanticDigest !== second.semanticDigest) {
    return { equivalent: false, reason: 'generation-or-payload-drift', source: first, edge: second };
  }
  return { equivalent: true, reason: 'same-verified-generation', source: first, edge: second };
}
