// S1 Github/static PRIMARY prepublication candidate check.
// This evaluates a locally rehearsed, publicly named browser response against
// the exact immutable build artifact. It is NOT public-host H01-H12 qualification.
export const S1_PREPUBLICATION_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const ORDINARY_STORY_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const EXPECTED_S1_ORIGIN = 'https://reallakshman19.github.io';
const EXPECTED_S1_PATH = '/NWv-7/newsdata/sections_latest.json';
const SHA256_RE = /^[0-9a-f]{64}$/i;

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function storyIdentity(item) {
  const id = String(item?.id || '').trim();
  const url = canonicalUrl(item?.url || item?.link);
  return id && url ? JSON.stringify([id, url]) : null;
}

function isPublisherTimeEligible(item, checkedAt) {
  const t = Number(item?.publishedAt || 0);
  if (!Number.isFinite(t) || t <= 0 || t > checkedAt ||
      checkedAt - t > ORDINARY_STORY_MAX_AGE_MS) return false;
  const confidence = String(item?.timestampConfidence || '').toLowerCase();
  const source = String(item?.publishedAtSource || item?.timestampSource || '').toLowerCase();
  return confidence !== 'low' && !['missing', 'invalid', 'fetch_time_fallback', 'unknown'].includes(source);
}

function isStaticSnapshotResponse(record) {
  try {
    const url = new URL(record?.url);
    return url.origin === EXPECTED_S1_ORIGIN && url.pathname === EXPECTED_S1_PATH;
  } catch {
    return false;
  }
}

export function evaluateS1PrepublicationWorldHealth({
  report,
  observed = [],
  checkedAt = Date.now(),
  expectedByteSha256 = null,
  maxSnapshotAgeMs = S1_PREPUBLICATION_SNAPSHOT_MAX_AGE_MS,
} = {}) {
  const errors = [];
  const now = new Date(checkedAt).getTime();
  if (!Number.isFinite(now)) errors.push('observation_clock_missing');
  if (report?.badgeStatus !== 'ok' || report?.sectionId !== 'world') {
    errors.push('world_health_not_ready');
  }
  if (!Number.isFinite(report?.storyCount) || report.storyCount < 5 ||
      !Number.isFinite(report?.sourceGroupCount) || report.sourceGroupCount < 2 ||
      !report?.topSourcesText || /none recorded/i.test(report.topSourcesText)) {
    errors.push('world_readiness_evidence_insufficient');
  }

  const events = Array.isArray(report?.selectedSourceEvents) ? report.selectedSourceEvents : [];
  const selection = events.at(-1);
  if (!selection || selection.requested !== 'github_static' ||
      selection.effective !== 'github_static' || selection.fallback ||
      events.some(e => e.effective === 'cloudflare_preview' || e.fallback)) {
    errors.push('browser_not_using_authorized_s1_static');
  }

  const matches = Array.isArray(observed) ? observed.filter(isStaticSnapshotResponse) : [];
  const selected = matches.at(-1);
  if (!selected || matches.length === 0 ||
      matches.some(response => response.responseStatus !== 200 ||
        !response.body || response.body.schemaVersion !== 2)) {
    errors.push('s1_static_snapshot_missing_or_invalid');
  }

  // All observed same-name responses must match the frozen candidate, not
  // merely the last response. Otherwise a later good refresh can conceal an
  // earlier stale/forged response that the browser may already have consumed.
  const expectedHash = String(expectedByteSha256 || '').toLowerCase();
  if (!SHA256_RE.test(expectedHash) || matches.length === 0 ||
      matches.some(response => !SHA256_RE.test(String(response.bytesSha256 || '')) ||
        String(response.bytesSha256).toLowerCase() !== expectedHash)) {
    errors.push('selected_public_named_bytes_do_not_match_candidate');
  }

  const fetchedAt = Number(selected?.body?.fetchedAt || 0);
  const generationAge = now - fetchedAt;
  if (!Number.isFinite(generationAge) || fetchedAt <= 0 ||
      generationAge < 0 || generationAge > maxSnapshotAgeMs) {
    errors.push('s1_generation_expired_or_time_invalid');
  }

  const raw = selected?.body?.sections?.world;
  const eligible = Array.isArray(raw)
    ? raw.filter(item => Number.isFinite(now) && isPublisherTimeEligible(item, now))
    : [];
  const validIdentities = new Set(eligible.map(storyIdentity).filter(Boolean));
  const families = new Set(eligible.map(item => String(item?.sourceGroup || '').trim()).filter(Boolean));
  if (validIdentities.size < 5 || families.size < 2) {
    errors.push('world_qualified_coverage_insufficient');
  }

  // Cards have div/article click handlers, not links: use explicit DOM identity
  // data attributes from the candidate renderer, preserving duplicate counts.
  const cards = Array.isArray(report?.visibleWorldCards) ? report.visibleWorldCards : [];
  const witnessed = cards.map(c => storyIdentity({ id: c?.id, url: c?.url }));
  if (cards.length === 0 || witnessed.some(identity => !identity) ||
      witnessed.some(identity => !validIdentities.has(identity)) ||
      new Set(witnessed).size !== witnessed.length) {
    errors.push('rendered_world_card_identity_not_bound_to_selected_source');
  }

  return {
    ok: errors.length === 0,
    errors,
    selectedAuthority: selection?.effective || null,
    selectedUrl: selected?.url || null,
    selectedByteSha256: selected?.bytesSha256 || null,
    candidateByteSha256: expectedByteSha256,
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
    generationAgeMs: Number.isFinite(generationAge) ? generationAge : null,
    eligibleWorldItems: eligible.length,
    eligibleWorldFamilies: families.size,
    renderedWorldCards: cards.length,
  };
}
