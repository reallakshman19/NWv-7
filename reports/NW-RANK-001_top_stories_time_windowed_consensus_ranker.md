# NW-RANK-001 — Top Stories time-windowed consensus ranker

## Status
Partially implemented on branch `nw-rank-001-top-stories-ranker`.

## Implemented
- Added dedicated Top Stories policy, signal extraction, deterministic event classifier, ranker, and certification tests.
- Wired the hybrid/static `sectionsDataset` frontPage generation through the dedicated ranker.

## Not completed in this draft
- `src/context/NewsContext.jsx` browser-context integration could not be committed because the connector rejected the required full JSX file replacement.
- `src/viewModels/useMainTabViewModel.js` order-preservation edit was not committed for the same full-file replacement constraint class.
- Local validation could not be run because the sandbox cannot resolve `github.com` for clone/install/test execution.

## Scope compliance
- Forbidden files intentionally not modified.
- No generated `public/newsdata` files modified.
- No workflow/package files modified.
- No helper extraction or broad refactor performed.

## Owner waiver tracking
- Pre-existing oversized files touched: no.
- Files covered by owner waiver but not modified in this draft: `src/context/NewsContext.jsx`, `src/viewModels/useMainTabViewModel.js`.
- Net line growth in waived files: 0.

## Validation attempted
- Local clone attempt failed: `Could not resolve host: github.com`.
- Targeted tests were added but not executed in this environment.

## Mission completion
Not achieved. This draft preserves useful implementation work but does not satisfy full NW-RANK-001 acceptance until browser context and main tab order-preservation edits are landed and tests run.
