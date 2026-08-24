# NW-DD-002 — India source adapters and publication calendars

## Mission

Add product-specific, direct-publisher adapters for the two already-qualified India sources:

- Akashvani — Morning News / English National
- Indian Express — Daily Briefing

Add deterministic publication-calendar state logic without activating the Daily Digest scheduled writer, changing UI, or changing GitHub Actions.

## Dependency

This PR is stacked on draft PR #475 / NW-DD-001. It does not waive or complete DD-001's remaining dependency-backed validation gates.

## Source authority

Only direct publisher surfaces are authorized:

- Akashvani product: `https://newsonair.gov.in/bulletins-detail-category/morning-news/`
- Indian Express discovery index: `https://indianexpress.com/section/live-news/`

No Google News, search-engine result, mirror, newsletter archive, or third-party page is accepted by either adapter.

## Current source evidence

### Akashvani

The direct Morning News publisher page exposes a recurring 8:15 AM English national bulletin. On 24 Aug 2026 the publisher surface showed Morning News dated 24 Aug 2026 at 8:15 AM.

The publisher URL is a rolling product URL rather than a unique dated URL. The adapter therefore separates:

- canonical daily identity: `akashvani:morning-news:english-national:<date>`
- user link semantics: `ROLLING_PRODUCT_URL`

An older edition on the rolling page is `STALE`, never current.

### Indian Express

The direct Live News index exposes recurring articles whose titles begin `Daily Briefing` and whose paths are under `/article/live-news/`.

Observed August 2026 editions include publication/update times from roughly 08:25 through 10:04 IST, including an Aug 22 edition first published at 09:07 and updated at 09:40.

The adapter:

1. discovers only direct Indian Express `/article/live-news/` anchors whose visible title starts `Daily Briefing`;
2. canonicalizes `/lite/` and query variants;
3. reads publisher structured metadata from the target article;
4. requires the publisher `datePublished` to match the requested digest date;
5. retains `dateModified` separately when available.

## Publication calendars

### Akashvani

```text
publicationDays: SUN..SAT
publisherTimezone: Asia/Kolkata
expectedPublicationStart: 08:15
expectedPublicationEnd: 08:45
publicationGraceMinutes: 30
calendarQualification: QUALIFIED
```

### Indian Express

```text
publicationDays: MON..SAT
publisherTimezone: Asia/Kolkata
expectedPublicationStart: 08:30
expectedPublicationEnd: 10:15
publicationGraceMinutes: 30
calendarQualification: PILOT
```

Indian Express remains `PILOT` because retrospective publisher timing is available but a complete direct-collector 14-day observation series is not.

## Missing-publication semantics

Publication absence is not one overloaded health flag.

```text
before expected window -> NOT_YET_EXPECTED + WARNING
inside window/grace    -> EXPECTED + WARNING
past grace deadline    -> EXPECTED + CRITICAL
non-publication day    -> NOT_SCHEDULED + OK
```

This prevents a normal Sunday absence or publication/indexing lag from being counted as an outage.

## Acquisition/accessibility separation

A collector-success result does not claim that the user-facing page is definitely open in every client. Both adapters therefore emit:

```text
accessibilityState = UNKNOWN
```

until a distinct accessibility probe is introduced. Acquisition state remains based only on the collector path.

## Registry change

Registry version advances from `daily-digest-registry/v0.1` to `daily-digest-registry/v0.2`.

No HOLD source is promoted.

## Validation

Executed isolated logic checks:

```text
PASS: node --check on new modules/tests
PASS: direct publication-calendar assertions
PASS: Akashvani current/stale canonical identity assertions
PASS: Akashvani no-fetch-before-window assertion
PASS: Indian Express direct-link filter and /lite canonicalization
PASS: Indian Express raw JSON-LD edition/timestamp extraction
PASS: Indian Express current edition discovery using explicit publisher-shaped fixtures
PASS: Indian Express Sunday NOT_SCHEDULED/no-fetch assertion
PASS: reconstructed two-branch DD-002 static scope guard
```

Self-review corrections before PR:

```text
FIXED: collector success no longer sets accessibilityState=OPEN
FIXED: JSON-LD is parsed as raw script JSON rather than HTML-entity-decoded JSON
FIXED: one failing Indian Express candidate fetch no longer aborts checking later direct candidates
```

Environment-dependent validation remains `NOT_RUN` where the complete repository/dependency toolchain is unavailable:

```text
NOT_RUN: focused Vitest through repository dependency install
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
NOT_RUN: live Cloudflare Worker publisher fetch
```

No GitHub Actions workflow was created, modified, or dispatched to cover those gaps.

## Explicit non-goals

- no production Cron activation
- no scheduled snapshot write
- no UI/Main integration
- no Top Stories or Daily Brief changes
- no GitHub Actions change
- no The Hindu adapter
- no FT adapter
- no Moneycontrol/Reuters/Guardian promotion
- no third-party discovery fallback
- no article-body persistence
- no AI editorial ranking
