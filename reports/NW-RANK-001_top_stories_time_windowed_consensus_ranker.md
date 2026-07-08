# NW-RANK-001 — Top Stories time-windowed consensus ranker

## Status
Completed. Validation rebase is reconciled on current `main` with obsolete legacy ViewModel Top Stories tests removed.

## Runtime architecture delivered
- `src/context/NewsContext.jsx` builds `frontPage` through `rankTopStories`.
- `src/data/datasets/sectionsDataset.js` builds hybrid/static `frontPage` through `rankTopStories`.
- `src/viewModels/useMainTabViewModel.js` preserves supplied `frontPage` order and caps Top Stories at 25 instead of recomputing final order through `rankTopStoriesByRecency`.

## Validation rebase
- Obsolete legacy tests that treated `rankTopStoriesByRecency` as the final Top Stories authority were removed from current `main`.
- `src/viewModels/topStoriesRecency.js` was removed from current `main`.
- `useMainTabViewModel.recency.cert.test.mjs` was removed because the ViewModel is no longer the final recency ranking layer.
- Remaining validation should certify the dedicated Top Stories ranker and source/path guardrails, not restore the retired final ViewModel ranking behavior.

## Cleanup in this PR
- Removed the stale `allCurrentArticles` declaration/comment block left behind after `composeBalancedFeed` was replaced by `rankTopStories` in `NewsContext.jsx`.
- Updated this report from partial/not-achieved status to completed/rebased status.

## Scope compliance
- Runtime ranking compatibility hack added: no.
- Core Top Stories ranking logic changed: no.
- Generated files changed: no.
- Package files changed: no.
- NW-RANK-002 work introduced: no.

## Follow-up
After this PR lands and #383/#385 are closed as completed, create `NW-RANK-002: Top Stories dedicated top-feed snapshot signals`.
