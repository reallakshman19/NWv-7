# Daily Digest repair and Market work checkpoint

19 November 2026. Publication target: `checkpoint/market-revamp-20261119`.

The Owner requested a remote push after stopping Market coding and preparing
the revamp plan. This branch saves the exact unfinished work for review and
continuity. **It is not a release candidate: seven Market regressions are red.**
Do not merge or deploy the unfinished Market changes on the strength of this
checkpoint publication.

## Daily Digest

Commit `b3f90c9` contains the completed local repair. In an isolated browser,
the short Sections acquisition and two-second GitHub recovery timeout reproduced
the unavailable screenshot despite current public source data. Recovery now
allows eight seconds, preserves the actual fallback failure, and offers a
working Retry action.

Verification performed before this push:

- 55 focused tests passed across four files.
- Targeted ESLint and Vite build passed.
- Three isolated browser cases passed: three-second publication delay; mobile
  source failure followed by Retry; actual current public Sections inputs.
- Each successful case displayed eight source tabs with ten cards per source,
  article publication times and source snippets, without page exceptions.
- The tested build was `assets/index-COISFeoI.js`.

These are recorded earlier checks on unchanged product bytes, not a new full
test run during publication. Browser evidence:
[before/after receipt](evidence/NWv7_Daily_Digest_Recovery_20261119.json).
The stale local Vite server was repointed at the verified build. An already-open
SPA may still hold older loaded JavaScript; the served build alone does not
identify an existing tab's loaded bundle.

## Market: implementation stopped, defects reproduced

The earlier partial Market implementation is preserved: bounded manual refresh,
quote provenance, seed suppression, partial-feed rendering, tracked-index counts,
and preceding-session close calculation. Final combined certification is pending.

The latest targeted run was **7 failed / 12 passed across two test files**:

- Newer global quote masking older India data.
- Newer publication dropping fuller India coverage.
- Mixed India quote ages causing regression.
- Equal-clock partial live response replacing fuller data.
- Newer partial live response dropping existing valid rows.
- In-memory service fallback bypassing the 24-hour limit.
- A long-open Provider retaining expired data when refresh throws.

[Reproduction log](evidence/NWv7_Market_Regression_Reproduction_20261119.txt)
(trailing empty lines trimmed for publication; the native log remains local).
The tests are intentionally preserved as failure evidence. The buddy plan
recommends per-instrument merging; some conservative whole-payload rejection
assertions need refinement to that policy before implementing the fixes.
Do not weaken the tests to match the existing behavior or call the Market work
complete. No Market product repair followed the Owner's stop instruction.

## Revamp guide and supplied page evidence

[Read the detailed working buddy guide](architecture/NWv7_Market_Revamp_Buddy_Plan_20261119.md).
It covers Indices, Equity, Funds and Currency; source/data contracts; row-wise
fallback and retention; ASCII UI; source limits; settings and migrations;
implementation slices and acceptance journeys for a Low reasoning agent.

The Owner's three screenshots and eleven-page image-only PDF are included as
source references. All PDF pages were rendered and visually inspected. These
are supplied page captures, not a completed fresh in-app-browser interaction
audit: the built-in browser access tool was unavailable for this chat.

## Publication and protected boundaries

PR170 was found **already merged** at `911918f40d421215926884abf08cad1649997987`.
Its former head `dab31fa6e1b8aae7eeae931c9ce99ea2efc8d5a5` remains the base of
this exact local checkpoint. This branch is not claimed to contain later main
changes, and main was not rebased, overwritten or deployed by this push.

All 25 intended local product/test postimages matched the saved native checkpoint
before commit. Its original patch SHA-256 is
`0df5968847849d1d22bf79818885cfe8123ab27bc6cf22896cc910e4d9c498e4`.
The unrelated local PR-template edit, personal Planner/recovery files, database
backups, generated application bundles and local credentials are excluded.
No Cloudflare deployment, D1 operation, production merge or new scheduler occurs
as part of saving this checkpoint remotely.
