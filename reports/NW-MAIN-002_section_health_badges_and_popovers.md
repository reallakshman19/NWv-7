# NW-MAIN-002 — Main section health badges and diagnostics popovers

## Mission
Wire the NW-MAIN-001 section-health summary contract into Main section headers so users can see section-wise feed health, degraded sources, dead/silent RSS evidence, stale feeds, and source-quality reasons directly in the Main UI.

## What changed
- Added `src/components/SectionHealthBadge.jsx`.
- Added `src/components/SectionHealthPopover.jsx`.
- Updated `src/components/NewsSection.jsx` to accept an optional `healthSummary` prop and render the badge/popover without disturbing section collapse behavior.
- Updated `src/viewModels/useMainTabViewModel.js` to build a `sectionHealthSummaries` map from the existing `sectionHealthSummary` bridge.
- Updated `src/pages/MainPage.jsx` to pass section health summaries into Main `NewsSection` instances.
- Added component certification tests for badge state mapping, popover rendering, NewsSection integration, and ViewModel section alias mapping.

## Health behavior
The UI consumes the normalized NW-MAIN-001 contract. It does not recompute source health in React components.

```text
ok       -> 🟢 OK
warning  -> 🟠 Warning
critical -> 🔴 Critical
missing  -> ⚪ Unknown
```

Expected examples:

```text
Muscat partial source failure + visible stories -> warning
Entertainment single-source/thin section -> warning
Business empty + failed known feeds -> critical
Missing diagnostics -> unknown, not false-ok
```

## UI behavior
- Each Main section header can show a compact section-health badge.
- Clicking/tapping the badge opens a diagnostics popover.
- Badge clicks call `stopPropagation()` so they do not collapse/expand the section accidentally.
- Existing section header collapse behavior remains on the section title row.
- Existing story info modal behavior remains unchanged.

## Diagnostics popover fields
The popover renders stable fields from the normalized contract:

```text
sectionId
status
storyCount
sourceGroupCount
topSources
warningFeeds
deadFeeds
staleFeeds
zeroItemFeeds
lastCheckedAt
lastNonZeroSuccess
lastError
reasons
```

Feed URLs and errors are shown only when present. Empty arrays render as `None recorded`; raw JSON blobs are not used as the primary UI.

## ViewModel mapping
`useMainTabViewModel.js` now returns:

```text
sectionHealthSummaries
```

The map is keyed by Main UI aliases:

```text
topStories / top-stories / topstories
india / india-news
chennai / chennai-news / tn / tamilNadu
local / local-news / muscat / muscat-news
world / world-news
```

The source inputs come from the existing `datasetEnvelope` when available. No separate runtime fetch or source-health dataset load was introduced.

## Tests added
- `src/components/SectionHealthBadge.cert.test.jsx`
  - status mapping for ok/warning/critical/unknown
  - missing diagnostics renders unknown
  - Muscat partial source failure renders warning
  - NewsSection badge click opens diagnostics without collapsing content
  - ViewModel maps section health summaries to Main section aliases
- `src/components/SectionHealthPopover.cert.test.jsx`
  - renders all normalized diagnostic fields
  - handles empty arrays gracefully
  - renders unknown diagnostics when no summary is supplied

## Validation commands
Required validation commands:

```bash
npx vitest run src/services/sectionHealthSummary.cert.test.js
npx vitest run src/components/SectionHealthBadge.cert.test.jsx
npx vitest run src/components/SectionHealthPopover.cert.test.jsx
npm run lint
npm run build
npm run test:certify
```

Connector-session status:

```text
Local npm/vitest commands were not executed in this connector-only patching path. GitHub Actions are the merge-gate source of truth.
```

## Scope compliance
- UI changed: yes, only Main section header health badge/popover bridge.
- ViewModel changed: yes, only to expose `sectionHealthSummaries` from existing envelope data.
- Dataset runtime changed: no.
- Source policy changed: no.
- Generated public/newsdata changed: no.
- Package files changed: no.
- Workflow files changed: no.
- Buzz files touched: no.
- Up Ahead files touched: no.
- Data Health schema touched: no.
- Top Stories ranker changed: no.
- Deployment/runtime config changed: no.

## Do-not-touch confirmation
This PR intentionally does not modify:

```text
config/section_sources.json
public/newsdata/*
.github/workflows/*
src/services/topStories/*
src/services/upAhead*
src/data/datasets/upAhead*
Buzz-related files
Top Stories ranker files
deployment/runtime config
package files
```

## Stop conditions encountered
None.
