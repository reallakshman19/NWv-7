# NW-DD-004A — Global v1 source decision

## Mission

Close the remaining v1 global-source qualification decision without weakening the Daily Digest source-authority contract.

This PR is stacked on draft PR #478 / NW-DD-004. It does not waive predecessor validation gates.

## G1 role remains unchanged

```text
G1 = GLOBAL_BUSINESS_AND_WORLD
```

DD-004A does not redefine G1 merely to make another publisher fit.

## Financial Times

DD-004 qualified the `FIRSTFT / ASIA` edition resolver from FT-owned evidence but did not prove a stable current-day FT-owned discovery endpoint.

Additional current-source review found current generic FirstFT article pages on `ft.com`, but no stable FT-owned public index/feed was proven that can deterministically discover today's `FirstFT Asia` edition and distinguish it from the other FirstFT regional editions.

Therefore:

```text
FINANCIAL_TIMES / FIRSTFT / ASIA
qualificationState = HOLD
editionResolverQualification = QUALIFIED
acquisitionQualification = HOLD
v1Eligibility = EXCLUDED
v1ExclusionReason = CURRENT_EDITION_DISCOVERY_AUTHORITY_NOT_PROVEN
```

No search engine or third-party index is promoted into runtime authority.

## Associated Press

Official AP material identifies Morning Wire as AP's flagship daily/weekday morning newsletter covering the day's major stories across politics, business, sports and other areas.

Direct publisher evidence:

- https://www.ap.org/the-definitive-source/announcements/introducing-ap-morning-wire/
- https://www.ap.org/the-definitive-source/topics/ap-morning-wire/

A stable public AP-owned per-edition discovery surface was not proven during qualification.

Therefore:

```text
ASSOCIATED_PRESS / MORNING_WIRE
role = GLOBAL_GENERAL
productQualification = QUALIFIED
qualificationState = HOLD
acquisitionQualification = HOLD
v1Eligibility = EXCLUDED
```

It is also not silently treated as `GLOBAL_BUSINESS_AND_WORLD`.

## BBC

BBC Help currently lists `News Briefing` for international audiences and describes it as a briefing with top headlines and expert analysis.

Direct publisher evidence:

- https://help.bbc.com/hc/en-us/articles/48211825274131-How-do-I-sign-up-for-BBC-Newsletters-for-International-Audiences-Outside-of-UK

A stable public per-edition BBC-owned discovery page was not proven during qualification.

Therefore:

```text
BBC / NEWS_BRIEFING / INTERNATIONAL
role = GLOBAL_GENERAL
productQualification = QUALIFIED
qualificationState = HOLD
acquisitionQualification = HOLD
v1Eligibility = EXCLUDED
```

## Guardian

The Guardian directly publishes a First Edition series page and states that the newsletter is delivered every weekday at 07:00 UK time.

Direct publisher evidence:

- https://www.theguardian.com/world/series/first-edition
- https://www.theguardian.com/global/2022/sep/20/sign-up-for-the-first-edition-newsletter-our-free-news-email

During British Summer Time, 07:00 UK is approximately 11:30 IST, after the 10:15 IST pilot freeze. The product is also a `GLOBAL_GENERAL_UK` briefing rather than the existing G1 role.

Therefore Guardian remains:

```text
qualificationState = HOLD
v1Eligibility = EXCLUDED
v1ExclusionReason = G1_ROLE_AND_1015_IST_TIMING_MISMATCH
```

## Reuters

LSEG's Reuters Open Interest product information states that `Trading Day` is the former `Morning Bid Asia` and describes it as market/economic commentary, released New York late afternoon.

Direct publisher/product evidence:

- https://www.lseg.com/content/dam/data-analytics/en_us/documents/fact-sheets/lseg-reuters-open-interest-factsheet.pdf

Therefore:

```text
REUTERS / TRADING_DAY / ASIA_MARKETS
role = GLOBAL_MARKETS
qualificationState = HOLD
v1Eligibility = EXCLUDED
v1ExclusionReason = G1_ROLE_MISMATCH
```

## v1 decision

There is currently no product satisfying all of:

```text
role == GLOBAL_BUSINESS_AND_WORLD
qualificationState == QUALIFIED
v1Eligibility != EXCLUDED
```

The deterministic v1 state is therefore:

```text
GLOBAL_UNAVAILABLE
```

This is not an error in the selector and must not trigger automatic role broadening.

## Pilot consequence

DD-005 may proceed with the already-authorized degraded composition semantics:

```text
I1 + I2 + I3
compositionState = DEGRADED_GLOBAL_UNAVAILABLE
```

or fewer India slots if current-day acquisition requires further degradation.

The pilot must not fabricate G1, pull a prior-day global briefing, use a search-engine result, or reinterpret a `GLOBAL_GENERAL`/`GLOBAL_MARKETS` product as `GLOBAL_BUSINESS_AND_WORLD`.

## Registry transition

Registry version advances:

```text
daily-digest-registry/v0.4 -> daily-digest-registry/v0.5
```

AP Morning Wire and BBC News Briefing are added as HOLD qualification candidates for traceability only. No new source becomes selectable.

## Validation performed without Actions

```text
PASS: direct Node syntax/behavior assertions for globalV1Qualification
PASS: G1 role remains GLOBAL_BUSINESS_AND_WORLD
PASS: resolveGlobalV1Availability() returns GLOBAL_UNAVAILABLE
PASS: eligiblePublisherFamilies is empty
PASS: FT remains HOLD and v1 EXCLUDED
PASS: AP/BBC are product-qualified but acquisition HOLD and GLOBAL_GENERAL
PASS: Reuters/Guardian remain non-G1 roles
PASS: reconstructed DD-004A static scope guard against DD-004 base
PASS: no FT/AP/BBC runtime discovery URL invented
PASS: no workflow, UI, production Cron or scheduled writer change
```

The synthetic static-guard workspace does not define an `origin/...` remote ref; the guard's first lookup therefore emits the expected git diagnostic and then successfully falls back to the local DD-004 base branch.

## NOT_RUN

```text
NOT_RUN: repository dependency-backed Vitest
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
```

No GitHub Actions workflow or dispatch is used as a substitute.
