# NW-RANK-011K — Editorial identity funnel population

## Status

Implemented on an isolated Version 0.3 branch for review and certification.

## Governing objective

Populate the missing `EDITORIAL_IDENTITY` analytical population in Top Stories shadow snapshots and daily rail/funnel evidence without changing production ranking, candidate admission, selection, display projection, source acquisition, persistence, deployment, or UI behavior.

## Root cause

The snapshot runner already attached `_studyIdentity` evidence to every scored ranking candidate, but its population funnel jumped directly from:

```text
SOURCE_ROW
→ RANKING_CANDIDATE
→ admission
```

The editorial-stability layer therefore consumed resolved editorial identities without a corresponding funnel population, unit declaration, exclusion ledger, or conservation check.

## Population architecture

Editorial identity is an analytical side population, not a replacement for the ranker's candidate population.

```text
Production ranking flow
SOURCE_ROW
→ RANKING_CANDIDATE
→ admission
→ RANKED_ITEM
→ DISPLAYED_ITEM

Analytical identity projection
RANKING_CANDIDATE
→ EDITORIAL_IDENTITY
```

The identity stage is explicitly marked:

```text
populationRole = ANALYTICAL_SIDE_POPULATION
stage = editorial_identity_population
inputUnit = RANKING_CANDIDATE
outputUnit = EDITORIAL_IDENTITY
```

Admission continues to consume `RANKING_CANDIDATE`. No identity projection result is fed back into production ranking.

## Population schema

The new versioned evidence contract is:

```text
nw-top-stories-editorial-identity-population/v1
```

Every snapshot publishes:

```text
editorialIdentityPopulationSchemaVersion
editorialIdentityPopulation
```

The population records:

- input and output units;
- input and output counts;
- resolved candidate count;
- distinct resolved editorial identity count;
- candidates sharing an already represented editorial identity;
- ambiguous, conflicting and unavailable identity counts;
- identity-state counts;
- identity-method counts;
- deterministic reason counts;
- sorted resolved identity values;
- accounting delta and conservation status.

## Conservation rule

Every ranking candidate must be represented exactly once as one of:

1. the first candidate contributing a distinct resolved editorial identity;
2. an additional candidate sharing a resolved editorial identity;
3. an ambiguous identity exclusion;
4. a conflicting identity exclusion;
5. an unavailable identity exclusion;
6. a fail-closed resolved state missing its identity value.

The enforced accounting equation is:

```text
input RANKING_CANDIDATE count
=
distinct resolved EDITORIAL_IDENTITY count
+ shared_editorial_identity count
+ identity_ambiguous count
+ identity_conflict count
+ identity_unavailable count
+ identity_resolved_without_value count
```

The population emits `accountingDelta = 0` and `accountingConserved = true` only when this equation holds.

## Daily aggregation

Rail/funnel analytics now retain:

- the identity stage population role and schema;
- input/output count distributions;
- identity-resolution coverage;
- aggregate identity-state and identity-method counts;
- aggregate identity reason counts;
- identity accounting status;
- identity reasons under the dedicated `identity` reason category.

The daily Markdown report surfaces the median resolved `EDITORIAL_IDENTITY` population, median candidate identity-resolution coverage, population role and conservation result.

## Certification

Focused certification covers:

- two ranking candidates resolving to one editorial identity;
- ambiguous title-only identity;
- conflicting strong identifiers;
- unavailable editorial identity;
- fail-closed resolved state without an identity value;
- exact candidate conservation;
- deterministic output under source permutation;
- snapshot root schema and population publication;
- side-population funnel units;
- daily aggregation and reason categorization;
- daily Markdown visibility;
- unchanged authoritative ranked output and byte-stable artifact requirements.

## Explicit non-goals

This amendment does not:

- change candidate construction or its existing dedupe key;
- deduplicate, admit, reject, rank or display stories by editorial identity;
- change ranking weights, thresholds, age windows, event rules, limits or diversity constraints;
- change identity-resolution precedence or identity version;
- alter Main-page ordering or visible depth;
- add persistence, hysteresis, residence or cross-run state;
- change source workflows, generated news data or deployment;
- authorize an automatic ranking-policy change.
