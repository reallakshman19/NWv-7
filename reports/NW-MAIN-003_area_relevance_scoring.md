# NW-MAIN-003 — Area relevance scoring for Chennai and Muscat sections

## Mission

Add an auditable area-relevance scoring layer for the Chennai/Tamil Nadu and Muscat/Oman Main sections so the app can distinguish exact area/city stories from state, country, weak regional, and off-area fallback rows.

## Dependency

NW-MAIN-002 / PR #404 was verified merged before this implementation started. This work consumes the Main health/UI bridge already present on `main` and does not reimplement it.

## What changed

- Added `src/services/areaRelevanceScorer.js` as a pure deterministic scorer.
- Added `src/services/areaRelevanceScorer.cert.test.js` certification tests.
- Updated `src/services/storyLocationPriority.js` to enrich Main `chennai` and `local` section arrays with `_areaRelevance` evidence.
- Updated `src/services/storyLocationPriority.cert.test.js` to certify the bridge.
- Updated `src/pages/MainPage.jsx` so Chennai/Tamil Nadu and Muscat/Local sections consume the enriched area-ranked arrays.

## Area relevance output

Each enriched story receives:

```js
{
  _areaRelevance: {
    target: 'chennai' | 'muscat',
    score: number,
    label: 'exact-area' | 'city' | 'state-region' | 'country' | 'backfill' | 'weak' | 'off-area',
    matchedTerms: string[],
    matchedFields: string[],
    sourceEvidence: string[],
    reasons: string[]
  }
}
```

## Scoring behavior

### Chennai / Tamil Nadu

Priority order:

1. exact neighbourhood / civic area / transport term
2. Chennai city alias
3. Chennai institution / civic body
4. Tamil Nadu state-region backfill
5. India country backfill
6. weak / off-area

Recognized examples include Chennai, Madras, Greater Chennai, GCC, CMRL, OMR, ECR, Adyar, Velachery, Tambaram, Anna Nagar, T Nagar, Mylapore, Guindy, Porur, Ambattur, Avadi, Perambur, Chromepet, Pallavaram, Chennai Airport, Chennai Port, Marina, Egmore, and Central Station.

### Muscat / Oman

Priority order:

1. exact Muscat area
2. Muscat city alias
3. Muscat Governorate
4. Oman country-level backfill
5. Gulf/Hormuz/Iran regional backfill
6. weak / off-area

Recognized examples include Muscat, Masqat, Muttrah, Matrah, Ruwi, Seeb, Al Seeb, Qurum, Al Khuwair, Ghubra, Ghala, Azaiba, Bawshar, Bausher, Amerat, Al Amerat, Mabela, Mawalah, Muscat Governorate, Royal Oman Police Muscat, Muscat Municipality, Oman Airports, and Port Sultan Qaboos.

## UI / traceability behavior

- Chennai/Tamil Nadu and Muscat/Local Main sections now receive enriched area-ranked arrays.
- Exact-area rows sort ahead of state/country/weak fallback rows.
- Broad Tamil Nadu and Oman stories remain available as labeled backfill rather than being silently treated as exact local stories.
- The `_areaRelevance` object is present on each enriched row for downstream UI/story-detail/audit display.

## Tests / validation

Added tests cover:

- Chennai exact-area story scores higher than Tamil Nadu backfill.
- Muscat exact-area story scores higher than Oman-wide backfill.
- Broad Oman is labeled country/backfill, not exact-area.
- Gulf/Hormuz regional story is weak/backfill unless Oman/Muscat impact is explicit.
- Chennai aliases such as OMR, CMRL, GCC, and Tambaram are recognized.
- Muscat aliases such as Ruwi, Muttrah, Seeb, Qurum, and Al Khuwair are recognized.
- Stories are not mutated by direct scoring.
- `applyAreaRelevance()` output is deterministic.
- Weak relevance does not become false local relevance.
- Main `chennai` and `local` section arrays are enriched and sorted without touching unrelated sections.

Required validation commands:

```bash
npx vitest run src/services/areaRelevanceScorer.cert.test.js
npx vitest run src/services/storyLocationPriority.cert.test.js
npm run lint
npm run build
npm run test:certify
```

Connector-session note: local commands were not executed in this connector-only patch path; PR latest-head CI is the validation source of truth.

## Scope compliance

- RSS source repair bundled: no
- Source policy changed: no
- Generated `public/newsdata` changed: no
- Top Stories ranker changed: no
- Buzz touched: no
- Up Ahead touched: no
- Workflow files changed: no
- Deployment/runtime config changed: no
- Package files changed: no
- Browser/network fetch introduced: no

## Stop conditions encountered

A full `NewsSection.jsx` UI-badge patch was blocked by the connector safety layer before reaching GitHub. The implementation therefore keeps the UI change to safe Main section array selection and exposes area relevance through enriched story fields for downstream story-detail/UI follow-up.
