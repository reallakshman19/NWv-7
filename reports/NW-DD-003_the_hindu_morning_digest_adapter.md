# NW-DD-003 — The Hindu Morning Digest acquisition adapter

## Mission

Qualify a product-specific direct-publisher acquisition adapter for The Hindu Morning Digest, stacked on NW-DD-002, without UI exposure, production Cron activation, generated snapshots, GitHub Actions changes, or global-source work.

## Dependency

This PR is stacked on draft PR #476 / NW-DD-002, which is itself stacked on draft PR #475 / NW-DD-001. It does not waive any dependency-backed validation gate in either predecessor PR.

## Source authority

Runtime discovery uses only The Hindu's direct national RSS:

`https://www.thehindu.com/news/national/feeder/default.rss`

NW already uses this publisher-owned feed as a The Hindu RSS fallback in `scripts/daily_brief.py`. DD-003 reuses only the transport/source precedent; Daily Digest retains a separate registry, adapter and selection contract.

No search-engine result, Google News redirect, mirror, archive or third-party source is accepted by the adapter.

## Product identity

A feed item is a Morning Digest candidate only when all of the following hold:

1. title starts with `Morning digest` or `The Hindu Morning Digest`;
2. link host is `thehindu.com` or `www.thehindu.com`;
3. path matches `/news/morning-digest-<month>-<day>-<year>/article<id>.ece` with optional `/amp/`;
4. URL slug date is parseable;
5. publisher RSS `pubDate` is parseable and has the same Asia/Kolkata calendar date as the URL slug.

The canonical identity remains:

`the-hindu:morning-digest:default:<digestDate>`

AMP suffixes, query parameters and fragments are stripped from the user-facing canonical URL.

## Current evidence

The user supplied the direct 24 Aug 2026 publisher URL:

`https://www.thehindu.com/news/morning-digest-august-24-2026/article71382371.ece/amp/`

Public indexing on 24 Aug 2026 showed the corresponding Morning Digest at approximately 06:42 IST with the publisher description `Here is a select list of stories to start the day.` Earlier August observations ranged from early morning to approximately 08:53 IST.

External indexes are research evidence only. They are not runtime discovery authorities.

## Publication calendar

```text
publicationDays: SUN..SAT
publisherTimezone: Asia/Kolkata
expectedPublicationStart: 06:00
expectedPublicationEnd: 09:15
publicationGraceMinutes: 30
calendarQualification: PILOT
```

This calendar remains PILOT until direct collector timing is observed over the planned cadence window.

## Registry transition

Registry version advances from `daily-digest-registry/v0.2` to `daily-digest-registry/v0.3`.

The Hindu moves from:

```text
qualificationState = HOLD
holdReason = ACQUISITION_ADAPTER_NOT_QUALIFIED
```

to:

```text
qualificationState = QUALIFIED
adapterKey = THE_HINDU_MORNING_DIGEST
acquisitionQualification = PILOT
```

Runtime selection still requires an actual current candidate with non-critical acquisition state. A failed or stale feed therefore cannot enter a slot merely because the registry product is qualified.

## State semantics

- exact requested URL date + matching publisher `pubDate` -> `CURRENT`
- valid prior product item -> `STALE`
- URL date and publisher `pubDate` disagree -> `INVALID`
- successful RSS fetch -> acquisition `OK`
- user-facing accessibility -> `UNKNOWN` unless separately measured
- missing/non-OK fetch uses the publication calendar's warning/critical state

Collector reachability is not treated as proof that the user can open the article.

## Validation performed without Actions

```text
PASS: node --check on new adapter/helper/test/registry modules
PASS: AMP/query/fragment canonicalization fixture
PASS: foreign-host and ordinary-article rejection fixtures
PASS: exact current edition preferred over stale feed item
PASS: stale edition classification
PASS: URL/pubDate mismatch classified INVALID
PASS: no fetch before publication window
PASS: direct registered RSS is the only discovery URL in adapter fixtures
PASS: accessibility remains UNKNOWN after collector success
PASS: reconstructed DD-003 static scope guard against DD-002 base
```

## NOT_RUN

```text
NOT_RUN: repository dependency-backed Vitest execution
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
NOT_RUN: live Cloudflare Worker fetch of The Hindu RSS
NOT_RUN: 14-day direct collector timing series
```

These are not replaced with GitHub Actions.

## Explicit non-goals

- no `.github/workflows/*` changes
- no GitHub Actions schedule or dispatch
- no production Cron activation
- no scheduled snapshot write
- no Main/UI integration
- no Top Stories or Daily Brief policy changes
- no article-body fetch or persistence
- no search-engine or mirror fallback
- no FT/Reuters/Guardian/Moneycontrol work
- no AI editorial ranking
