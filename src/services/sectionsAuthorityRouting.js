/**
 * Decide whether section reads must use the configured Sections authority
 * instead of browser-wide RSS acquisition.
 *
 * Static production hosts cannot reliably perform wide RSS fetches. In that
 * runtime, Live mode means "refresh the selected authority", not "bypass the
 * authority and fan out through public CORS proxies".
 */
function requiresSectionsAuthority(runtime) {
  const allowed = runtime?.browserWideFeedFetchAllowed ?? runtime?.allowWideFeedFetch;
  return allowed === false || Boolean(runtime?.isStaticHost && allowed !== true);
}

export function shouldUseSectionsAuthoritySnapshot({
  liveMode = false,
  runtime = {},
  usePrefetchedSections = true,
} = {}) {
  if (requiresSectionsAuthority(runtime)) return true;

  return !liveMode && usePrefetchedSections !== false;
}

/**
 * Live mode on a static host should bypass the in-memory snapshot TTL so the
 * selected Cloudflare/GitHub authority is actually refreshed.
 */
export function shouldForceSectionsAuthorityRefresh({
  liveMode = false,
  force = false,
  runtime = {},
} = {}) {
  if (force) return true;

  return Boolean(
    liveMode &&
    requiresSectionsAuthority(runtime)
  );
}
