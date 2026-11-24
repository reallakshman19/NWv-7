/**
 * The Market workpack isolation allowlist applies when an actual Market
 * runtime/policy file changes. Running it for every unrelated PR made
 * Newspaper-only changes fail; testing only src/market made market policy
 * files elsewhere invisible.
 *
 * Keep these predicates independent of the allowed-path lists in each
 * workpack so an unrelated consumer cannot silently relax the trigger.
 */
export function isMarketSensitivePath(path) {
  if (typeof path !== 'string') return false;
  return path.startsWith('src/market/') ||
    path.startsWith('src/pages/MarketPage.') ||
    path.startsWith('src/services/market');
}

export function marketIsolationInput(changedFiles) {
  if (!Array.isArray(changedFiles)) throw new TypeError('Expected changed file paths');
  return changedFiles.some(isMarketSensitivePath) ? changedFiles : [];
}

/** Existing vNext assurance scope; no other workflow or executable report. */
export function isMarketVNextAssurancePath(path) {
  return typeof path === 'string' && (
    path === '.github/workflows/market_vnext_responsive.yml' ||
    /^reports\/market-vnext\/[A-Za-z0-9_-]+\.md$/.test(path)
  );
}
