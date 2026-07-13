# NW-MAIN-001 — Section health diagnostics bridge for Main feed

## Mission
Normalize existing section summaries and source-health artifacts into a stable per-section health summary model that Main UI can consume in a later UI mission.

## What changed
- Added `src/services/sectionHealthSummary.js`, a pure service for section health normalization and summary construction.
- Added `src/services/sectionHealthSummary.cert.test.js`, certification tests for old/new source-health shapes, warning/critical rules, deterministic output, and immutability.

## Inputs supported
The bridge accepts the existing Main/section diagnostics shapes without changing runtime data flow:

```text
sectionsDataset envelope data.summaries
sectionsDataset data.sections fallback
sourceHealthDataset normalized rows
source_health.json-style array rows
source_health.json-style object maps
section_source_policy_report-style rows with sections[]
reduced/legacy rows such as { ok, items, lastSuccess }
```

## Output contract
Each section health row has this stable shape:

```js
{
  sectionId,
  status,
  storyCount,
  sourceGroupCount,
  topSources,
  warningFeeds,
  deadFeeds,
  staleFeeds,
  zeroItemFeeds,
  singleSource,
  lastCheckedAt,
  lastNonZeroSuccess,
  lastError,
  reasons
}
```

## Health rules

```text
critical:
  section fetch failed
  empty section with failed known sources
  all known sources failed
  zeroItemRuns >= 10 only when the section has no visible stories or all known sources failed

warning:
  single-source section
  thin source group count
  stale/fallback reason present
  zeroItemRuns >= 3
  persistent zeroItemRuns >= 10 while the section still has visible stories
  warning source status
  partial source failure while section still has stories

ok:
  section has stories, at least two source groups, and no warning/critical source evidence
```

## Behavior delivered
- Healthy multi-source sections remain `ok`.
- Single-source/thin sections become `warning`.
- Empty sections with failed known feeds become `critical`.
- Partial source failures become `warning` while preserving visible story count.
- Persistent zero-item feeds remain `warning` when another feed still keeps the section populated.
- Old/reduced source-health object maps normalize into the same source row shape as newer array records.
- Source rows with `sections: []` are supported for source-policy-report compatibility.
- Missing source health degrades gracefully using section summaries only.
- Output is deterministic and sorted by section id.
- Inputs are not mutated.

## Tests / validation
Required validation commands:

```bash
npx vitest run src/services/sectionHealthSummary.cert.test.js
node src/viewModels/useMainTabViewModel.recency.cert.test.mjs
npm run lint
npm run test:unit
```

Connector-session status:

```text
Local npm/vitest commands were not executed in this connector-only patching path. GitHub checks are the merge-gate source of truth.
```

## Scope compliance
- UI changed: no
- ViewModel changed: no
- Dataset runtime changed: no
- Source policy changed: no
- Generated public/newsdata changed: no
- Package files changed: no
- Workflow files changed: no
- Buzz / Up Ahead / Data Health schema touched: no
- Runtime Top Stories ranker changed: no

## Stop conditions encountered
None.

## Follow-up
NW-MAIN-002 can consume this bridge to add section health badges/popovers in Main. NW-MAIN-005 can later repair or disable dead/silent feeds using the same normalized evidence.
