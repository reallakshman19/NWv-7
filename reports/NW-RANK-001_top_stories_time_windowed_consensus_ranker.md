# NW-RANK-001 — Top Stories time-windowed consensus ranker

## Status
Completed.

## Validation rebase

- Retired obsolete Main ViewModel validation that treated `rankTopStoriesByRecency` as final Top Stories authority.
- Rebased the guard to assert that `useMainTabViewModel` preserves the supplied ranker order and caps Top Stories at 25.
- Confirmed browser/context and hybrid/static dataset paths use `rankTopStories`.
- Removed stale browser-context comments and unused `allCurrentArticles` lint residue left by the prior ranker integration.

## Scope compliance
- Runtime ranking logic changed: no
- Generated files changed: no
- Package files changed: no
- NW-RANK-002 work introduced: no

## Validation commands
- `npm run lint`
- `npm run test:certify`
- `npm run test:data-freshness-contracts`

## Owner note
This is a local maintenance patch under Issue #385, not a new Work Pack. The change stays below the owner threshold for small maintenance activities and does not introduce a new feature track.
