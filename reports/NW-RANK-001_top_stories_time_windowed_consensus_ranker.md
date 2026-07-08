# NW-RANK-001 — Top Stories time-windowed consensus ranker

## Status
Completed.

## Validation rebase

- Retired obsolete Main ViewModel validation that treated `rankTopStoriesByRecency` as final Top Stories authority.
- Rebased the guard to assert that `useMainTabViewModel` preserves the supplied ranker order and caps Top Stories at 25.
- Confirmed browser/context and hybrid/static dataset paths use `rankTopStories`.

## Scope compliance
- Runtime ranking logic changed: no
- Generated files changed: no
- Package files changed: no
- NW-RANK-002 work introduced: no
