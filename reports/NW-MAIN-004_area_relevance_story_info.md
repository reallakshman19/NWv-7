# NW-MAIN-004 — Area relevance story info evidence

## Mission

Render the already-enriched `_areaRelevance` object in the existing story info/details path so users can see why a Chennai/Tamil Nadu or Muscat/Oman story was treated as exact-area, city, state-region, country, backfill, weak, or off-area.

## Dependency

NW-MAIN-003 / PR #407 was verified merged into `main` before this work started.

## What changed

- Updated `src/components/NewsSection.jsx` to append a compact Area Relevance block to the existing story info modal when a story carries `_areaRelevance`.
- Added `src/components/NewsSection.cert.test.jsx` with focused component coverage for the area relevance story-info path.
- No area relevance scoring, alias, weight, label, or ranking logic was changed.

## UI behavior

The existing story info icon remains the entry point. When `_areaRelevance` exists, the modal now renders readable rows for:

- target
- label with user-facing guidance
- score
- matched terms
- matched fields
- source evidence
- reasons
- version

When `_areaRelevance` is absent, the Area Relevance block is not rendered. This avoids false/empty local evidence.

## Label guidance

- `exact-area` — strong local/area evidence
- `city` — city-level evidence
- `state-region` — state/governorate-level backfill
- `country` — country-level backfill
- `backfill` — weak regional fallback
- `weak` — insufficient local evidence
- `off-area` — likely wrong-area story

## Tests added

`src/components/NewsSection.cert.test.jsx` covers:

- story info modal renders area relevance label and score
- matched terms render as readable comma-separated evidence
- matched fields render when present
- source evidence renders when present
- reasons render in human-readable form
- missing `_areaRelevance` does not render a false/empty Area Relevance block
- empty arrays render as `None` instead of raw JSON or broken UI

## Validation commands

Connector-session note: local npm/vitest commands were not executed in this connector-only patch path. Required validation commands for reviewer/CI:

```bash
npx vitest run src/components/NewsSection.cert.test.jsx
npx vitest run src/services/areaRelevanceScorer.cert.test.js
npx vitest run src/services/storyLocationPriority.cert.test.js
npm run lint
npm run build
npm run test:certify
```

## Scope compliance

- UI changed: yes, only the existing story info modal path in `NewsSection.jsx`.
- Scoring behavior changed: no.
- Ranking behavior changed: no.
- Area alias/weight tuning changed: no.
- Source policy changed: no.
- Generated `public/newsdata` changed: no.
- Workflow files changed: no.
- Package files changed: no.
- Top Stories files changed: no.
- Up Ahead files changed: no.
- Buzz files changed: no.
- Deployment/runtime config changed: no.
- Browser/network fetch introduced: no.

## Stop conditions encountered

None.
