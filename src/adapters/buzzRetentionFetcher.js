// Buzz-only supplemental retention source. Never becomes Sections authority or
// a source of fresh Top Stories. The signed-off GitHub RSS snapshot remains separate.
const H = 60 * 60 * 1000;
const RETAINED_MAX_AGE_MS = 12 * H;
const MAX_STORY_AGE_MS = 7 * 24 * H;
const MAX_SOCIAL_AGE_MS = 72 * H;
const MAX_BYTES = 3_000_000;
const MAX_ITEMS = 400;
const SECTIONS = new Set(['entertainment', 'social', 'technology']);
const LOW = new Set(['low', 'unknown', 'fallback']);
const SOURCE_BAD = new Set(['missing', 'invalid', 'fetch_time_fallback', 'fetchedat', 'unknown']);
const BLOCKED = new Set(['withdrawn', 'retracted', 'removed', 'cancelled', 'canceled']);
const FUTURE = 5 * 60 * 1000;

function ms(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number < 10_000_000_000 ? number * 1000 : number;
}

function validHttp(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function storyEligible(item, now) {
  if (!item || !SECTIONS.has(item.buzzSection) || !validHttp(item.url || item.link)) return false;
  if (!String(item.title || '').trim() || item.suppressionReason || item.withdrawnAt || BLOCKED.has(String(item.status || '').toLowerCase())) return false;
  const published = ms(item.publishedAt);
  const deadline = ms(item.retention?.displayUntil);
  if (!published || published > now + FUTURE || !deadline || now >= deadline) return false;
  if (now - published > (item.buzzSection === 'social' ? MAX_SOCIAL_AGE_MS : MAX_STORY_AGE_MS)) return false;
  if (LOW.has(String(item.timestampConfidence || '').toLowerCase())) return false;
  if (SOURCE_BAD.has(String(item.publishedAtSource || '').toLowerCase())) return false;
  const firstSeen = ms(item.firstSeenAt);
  const verified = ms(item.lastVerifiedAt);
  if (!firstSeen || !verified || firstSeen > verified || verified > now + FUTURE) return false;
  const cap = item.buzzSection === 'social' ? MAX_SOCIAL_AGE_MS : MAX_STORY_AGE_MS;
  const expected = Math.min(published + cap,
    Math.max(published + 36 * H, verified + 36 * H),
    ms(item.expiryAt) || Infinity);
  return deadline === expected && ms(item.retention?.freshUntil) === published + 36 * H;
}

export function qualifyBuzzRetainedSnapshot(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.kind !== 'buzz_rolling_retention'
    || snapshot.policyVersion !== 'buzz-retention-v1' || !Array.isArray(snapshot.items)
    || snapshot.items.length > MAX_ITEMS || snapshot.maxItems !== MAX_ITEMS || snapshot.maxBytes !== MAX_BYTES) {
    return { ok: false, reason: 'unsupported_buzz_retention', sections: {}, items: [] };
  }
  const generated = ms(snapshot.generatedAt);
  if (!generated || generated > now + FUTURE) {
    return { ok: false, reason: 'invalid_buzz_retention_clock', sections: {}, items: [] };
  }
  // The publishing snapshot may become stale during an outage, but its
  // independently verified stories stay eligible until their own deadlines.
  const stale = now - generated > RETAINED_MAX_AGE_MS;
  const counts = { entertainment: [], social: [], technology: [] };
  let invalid = 0;
  for (const item of snapshot.items) {
    if (!storyEligible(item, now)) {
      invalid += 1;
      continue;
    }
    counts[item.buzzSection].push({
      ...item,
      _buzzRetained: true,
      _buzzRetentionSource: 'github_rss_rolling',
    });
  }
  return { ok: Object.values(counts).some(rows => rows.length > 0),
    stale,
    reason: stale ? 'stale_buzz_retention_snapshot' : invalid ? 'some_retained_items_expired' : null,
    sections: counts, items: Object.values(counts).flat(), rejectedAtRuntime: invalid,
    source: snapshot.source || null, generatedAt: generated };
}

export function buzzRetentionUrl() {
  // Consume only the reviewed Pages release, not an unpinned main-branch blob.
  // The rolling publication workflow alone does not authorize a Pages deploy.
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base.slice(0, -1) : base}/newsdata/buzz_retained_latest.json`;
}

export async function loadBuzzRetainedSnapshot({ now = Date.now(), timeoutMs = 1800,
  fetcher = globalThis.fetch, url = buzzRetentionUrl() } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`buzz_retention_http_${response.status}`);
    // Bound response size before JSON.parse, including absent Content-Length.
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (contentLength > MAX_BYTES) throw new Error('buzz_retention_oversize');
    const body = await response.text();
    if (new TextEncoder().encode(body).length > MAX_BYTES) throw new Error('buzz_retention_oversize');
    const qualified = qualifyBuzzRetainedSnapshot(JSON.parse(body), now);
    if (!qualified.ok) return { ...qualified, failed: true };
    return { ...qualified, failed: false };
  } catch (error) {
    return { ok: false, failed: true, reason: error?.message || 'buzz_retention_unavailable',
      sections: {}, items: [] };
  } finally {
    clearTimeout(timer);
  }
}
