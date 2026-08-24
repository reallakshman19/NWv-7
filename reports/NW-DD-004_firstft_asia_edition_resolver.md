# NW-DD-004 — Financial Times FirstFT Asia edition resolver

## Mission

Qualify the regional edition resolver for Financial Times FirstFT Asia without inventing an unproven current-edition discovery transport.

This PR is stacked on draft PR #477 / NW-DD-003. It does not waive any predecessor validation gate.

## Direct publisher evidence

Financial Times' own newsletter catalogue lists three distinct weekday products:

- FirstFT Europe/Africa
- FirstFT Asia
- FirstFT Americas

The catalogue describes FirstFT Asia as the top news stories from Asia plus analysis and commentary on the day's biggest global stories.

The FT-owned FirstFT Asia sample page contains direct regional evidence including:

- `How satisfied are you with FirstFT Asia?`
- `Markets at 0600 GMT+8`
- an explicit newsletter date
- `Sent every weekday`

The sample observed during qualification was dated 3 Aug 2026. The sample permalink's update timestamp corresponds to approximately 03:30 IST, consistent with other observed FirstFT Asia editions published in the early India morning.

## Authority decision

Edition identity is now technically resolvable from FT-owned content, but a stable current-day discovery endpoint has not been proven.

Therefore DD-004 intentionally does **not** make Financial Times selectable.

Registry transition:

```text
before:
  qualificationState = HOLD
  holdReason = EDITION_RESOLVER_NOT_QUALIFIED

after:
  qualificationState = HOLD
  holdReason = CURRENT_EDITION_DISCOVERY_NOT_QUALIFIED
  editionResolverKey = FINANCIAL_TIMES_FIRSTFT_ASIA
  editionResolverQualification = QUALIFIED
  acquisitionQualification = HOLD
```

No `discoveryUrl` is registered for Financial Times in this PR.

## Resolver contract

The resolver accepts only HTTPS URLs owned by Financial Times:

- `ft.com`
- `www.ft.com`
- `ep.ft.com`

Regional identity is resolved lexically from explicit FT content:

```text
FirstFT Asia          -> ASIA / EXACT
FirstFT Europe/Africa -> EUROPE_AFRICA / EXACT
FirstFT Americas      -> AMERICAS / EXACT
```

A generic `FirstFT` title alone is **UNRESOLVED**.

`Markets at 0600 GMT+8` may support an Asia resolution only when the page also identifies the FirstFT product. Publication time alone never assigns an edition.

## Canonical identity and date

Canonical ID:

```text
financial-times:firstft:asia:<digestDate>
```

The digest date comes from, in order:

1. the explicit newsletter date when present;
2. otherwise the publisher `datePublished` converted to `Asia/Kolkata`.

If both exist and disagree, the evidence is `INVALID`.

This matters because FirstFT Asia is commonly published late in the prior UTC calendar day but belongs to the following India/Asia morning.

## Publication calendar

Pilot calendar recorded for future acquisition work:

```text
publicationDays: MON..FRI
publisherTimezone: Asia/Kolkata
expectedPublicationStart: 01:30
expectedPublicationEnd: 05:00
publicationGraceMinutes: 30
calendarQualification: PILOT
```

The window is deliberately broad and remains PILOT until direct current-edition observations are collected.

## Selection boundary

Evidence objects emitted by the resolver use:

```text
qualificationState = HOLD
selectionEligible = false
accessibilityState = UNKNOWN
```

Collector/page availability is not treated as proof that a user can access a paywalled FT article.

## Validation performed without Actions

```text
PASS: node --check on resolver and focused cert
PASS: Asia / Europe-Africa / Americas regional separation
PASS: generic FirstFT remains UNRESOLVED
PASS: FT-owned Asia sample -> exact Asia evidence
PASS: canonical identity includes edition + digest date
PASS: UTC-late publication resolves to next Asia/Kolkata digest date
PASS: explicit date / published date disagreement -> INVALID
PASS: foreign host rejected
PASS: weekend -> NOT_SCHEDULED
PASS: weekday 03:00 IST -> EXPECTED publication phase
PASS: direct runtime assertions against existing state/calendar semantics
PASS: reconstructed DD-004 static scope guard against DD-003 base
```

## NOT_RUN

```text
NOT_RUN: repository dependency-backed Vitest execution
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
NOT_RUN: live Cloudflare current-edition FT discovery
NOT_RUN: direct current-edition FT acquisition series
```

These are not replaced by GitHub Actions.

## Explicit non-goals

- no Financial Times promotion to QUALIFIED/selectable
- no search-engine discovery
- no Google News or aggregator fallback
- no Reuters or Guardian work
- no production Cron activation
- no scheduled snapshot write
- no UI/Main changes
- no Top Stories or Daily Brief policy changes
- no GitHub Actions change or dispatch
- no article-body persistence
- no AI editorial ranking
