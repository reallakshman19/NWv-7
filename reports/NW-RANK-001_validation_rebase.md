# NW-RANK-001-VALIDATION-REBASE — Top Stories validation ownership correction

## Status
Implemented on branch `claude/nw-rank-001-validation-rebase-3dmx9b`.

## Why this rebase exists
NW-RANK-001 (PR #384) moved Top Stories ranking authority to the dedicated
`rankTopStories` engine (`src/services/topStories/`). `NewsContext.jsx`
(browser/context) and `sectionsDataset.js` (hybrid/static) both build
`frontPage` with it, and `useMainTabViewModel.js` now preserves the supplied
order, caps the rail to 25, and only demotes read/heavily viewed stories when
`customSortTopStories` is enabled.

After that merge, the validation layer that assumed the old
`composeBalancedFeed` / `rankTopStoriesByRecency` authority was deleted rather
than rebased:

- `src/services/topStories/topStoriesRanker.cert.test.js` (deleted in `f44ef2b`)
- `src/viewModels/useMainTabViewModel.cert.test.js` (deleted in `deedf1f`)
- `src/viewModels/useMainTabViewModel.recency.cert.test.mjs` (deleted in `79340bc`)
- `src/viewModels/useMainTabViewModel.rank.cert.test.js` (deleted in `82f1c8b`)
- `src/viewModels/useMainTabViewModel.breaking.cert.test.js` (deleted in `be1dc21`)
- `src/viewModels/topStoriesRecency.js` (retired runtime helper, deleted in `b7f2b32`)

That left two live breaks and a regression-protection gap:

- `.github/workflows/data_freshness_contracts.yml` still ran
  `node src/viewModels/useMainTabViewModel.recency.cert.test.mjs` (missing file).
- `npm run test:main-migration` still pointed at
  `src/viewModels/useMainTabViewModel.cert.test.js` (missing file).
- No test certified ranker determinism, order preservation, or the cap of 25.

## What changed (validation/report files only)

### Restored + rebased
- `src/services/topStories/topStoriesRanker.cert.test.js` — restored the
  NW-RANK-001 ranker certification (freshness bands, breaking/live gating,
  consensus caps, entertainment-promo suppression, determinism). Two stale
  expectations were rebased to the merged runtime:
  - Metadata retention (`sourceCount`) is certified on the same-story dedupe
    path (`buildTopStoryCandidates` merge); cluster-collapse is certified
    separately as "one slot per cluster" without demanding cross-item metadata
    merge, which the merged runtime does not perform for distinct ids.
  - Diversity caps are certified as the merged soft-cap design: the per-source
    cap holds when enough diverse alternatives exist, and remaining slots are
    backfilled (never under-filled) when alternatives run out.
  - The no-browser-fetch guard now covers all four topStories modules.
- `src/viewModels/useMainTabViewModel.cert.test.js` — restored all still-valid
  projection/envelope/refresh coverage; the two obsolete recency-authority
  tests were replaced with the new contract: supplied-order preservation,
  cap of 25, custom sort preserving order when nothing is read, demotion of
  read/heavily viewed stories only, minimum-of-10 backfill in supplied order,
  and a static guard that the view model does not import
  `rankTopStoriesByRecency` / `topStoriesRecency` / `composeBalancedFeed`.
  This also makes `npm run test:main-migration` (certification gate step
  `main-migration`) whole again with no package.json change.

### Recreated with new purpose (filename kept for CI continuity)
- `src/viewModels/useMainTabViewModel.recency.cert.test.mjs` — the standalone
  node guardrail run by the Data Freshness Contracts workflow. It no longer
  certifies recency ranking; it certifies the ownership boundary:
  `rankTopStories` is the frontPage authority in both `NewsContext.jsx` and
  `sectionsDataset.js`, the Main ViewModel preserves supplied order / caps to
  25 / only demotes read/viewed items, `rankTopStories` is deterministic and
  bounded, and no topStories module fetches from the browser.

### Dead-code lint remediation (flagged for auditor attention)
- `src/context/NewsContext.jsx` — removed the unused
  `const allCurrentArticles = Object.values(redistributed).flat();` line and
  the stale composeBalancedFeed-era comment block above it. This variable
  became dead code when NW-RANK-001 replaced
  `composeBalancedFeed(allCurrentArticles, …)` with
  `rankTopStories(redistributed, …)`, and it made `npm run lint`
  (`no-unused-vars`) — and therefore the CI/certification gates — fail on the
  branch base for every PR. The removal deletes 11 lines with zero behavior
  change (the expression had no side effects and no remaining readers); the
  `frontPage` construction via `rankTopStories` is untouched. Without this,
  acceptance criterion 11 ("all required checks are green") cannot be met.

### Updated wiring/report text
- `.github/workflows/data_freshness_contracts.yml` — replaced the stale
  `src/viewModels/topStoriesRecency.js` path trigger with
  `src/services/topStories/**` + `src/viewModels/useMainTabViewModel.js`, and
  renamed the step to "Certify Main Top Stories order-preservation guardrail".
- `reports/NW-RANK-001_validation_rebase.md` — this report.

### Intentionally retired without restoration
- `useMainTabViewModel.rank.cert.test.js` and
  `useMainTabViewModel.breaking.cert.test.js` demanded that the view model
  re-rank by temporal decay and pin breaking stories — both are now the
  ranker's responsibility (certified in `topStoriesRanker.cert.test.js`;
  breaking pinning for legacy surfaces remains covered by
  `frontPageComposer.breaking.cert.test.js` and
  `breakingNewsService.cert.test.js`, which are unchanged).
- `src/viewModels/topStoriesRecency.js` stays deleted; reintroducing it is
  forbidden under this mission.

## Boundary compliance
- Runtime ranking logic changed: no (`topStoriesRanker/Policy/Signals/
  EventClassifier`, `sectionsDataset.js`, `useMainTabViewModel.js`,
  `frontPageComposer.js`, `breakingNewsService.js` all untouched;
  `NewsContext.jsx` had only the dead-code lint remediation above — no
  logic or ordering change).
- Generated `public/data` / `public/newsdata` changed: no.
- `package.json` / `package-lock.json` changed: no.
- Buzz / Up Ahead / Data Health touched: no.
- NW-RANK-002 (top-feed snapshot ingestion) introduced: no.

## Validation executed locally
- `npx vitest run src/services/topStories/topStoriesRanker.cert.test.js` — 20 passed.
- `npx vitest run src/viewModels/useMainTabViewModel.cert.test.js` — 29 passed.
- `node src/viewModels/useMainTabViewModel.recency.cert.test.mjs` — PASS.
- `npm run test:unit` — 168 files / 944 tests passed.
- `npm run lint` — 0 errors (after the dead-code remediation; it failed on the
  branch base).
- `npm run test:data-freshness-contracts` and
  `node src/services/rssAggregator.lifecycle.cert.test.mjs` — PASS (the other
  steps of the workflow this change re-wires).
