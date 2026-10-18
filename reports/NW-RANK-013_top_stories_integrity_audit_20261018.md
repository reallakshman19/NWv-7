# NW-RANK-013 — Top Stories ranking integrity audit

Date: 2026-10-18  
Base: `8d8f9c32fc7199472a29f5f127c167972de47877`

## Scope

This audit follows the production ranking defects observed in Top Stories and reviews the current
runtime path from Sections acquisition through candidate construction, evidence admission,
selection, and the first 10 displayed stories.

The scope intentionally excludes visual redesign, Cloudflare deployment, and changes to the
underlying publisher registry.

## Runtime path audited

```
Sections authority / RSS
  -> fetchSectionNews()
  -> legacy per-section filtering/ranking
  -> sectionsDataset
  -> cross-section dedupe/cluster
  -> Top Stories observed ranker
  -> evidence admission
  -> diversity selection
  -> Main first 10
```

## Confirmed defects

### 1. Candidate starvation before the authoritative Top Stories ranker

`sectionsDataset` requested roughly 15 rows per section. `fetchSectionNews` applied the older
per-section impact ranking and truncated to that limit before the observed Top Stories ranker saw
the data.

Result: the final ranker could only rank survivors of a different scoring system. A lower legacy
impact score could prevent an otherwise stronger hard-news candidate from ever reaching Top Stories.

Fix: acquire a substantially wider ranking population (minimum 30; normally 3x the section display
limit), preserve the normal section display slice, and rank from the wider candidate population.

### 2. Raw rows and cluster representatives were both fed into Top Stories

After cross-section clustering, the dataset built:

```
{ ...rawSectionItems, __all: dedupedClusterRepresentatives }
```

The observed ranker therefore saw source-specific raw rows plus the representative for the same
event. Because source rows can have different ids, one event could re-enter the rail multiple times
and evade the intended max-per-cluster policy.

Fix: the final Top Stories population now contains only the cross-section cluster representatives.

### 3. The dedicated Top Stories authority lane was collected but not used

The authoritative Sections source registry contains a `topStories` section with broad feeds from
The Hindu, NDTV, Hindustan Times, Economic Times, and Google News Top. The client did not load that
section and the ranker's top-feed evidence input was normally empty.

Result: source availability in ordinary section feeds could disproportionately determine Top Stories
even while a dedicated top-feed evidence lane existed in the authority snapshot.

Fix:
- acquire the `topStories` authority section as a hidden ranking/evidence lane;
- keep that hidden lane out of visible section health/SLO calculations;
- normalize it into top-feed evidence;
- pass it as `topFeedSignalItems`;
- do not inject those evidence rows as extra ranking candidates.

### 4. Weak single-source non-local critical stories could still dominate inside 0–4h

The prior mature-evidence gate applied only in secondary/fallback age bands. A weak single-source
non-local public-safety story at ~3h could exceed the primary 0.50 score threshold using freshness
and public-interest weight alone, with zero corroboration.

Fix: non-local critical events now require either:
- independent evidence,
- an authoritative source,
- or the existing tightly bounded trusted cold-start lane (<=15 minutes, source quality >=0.75).

Local critical events remain exempt from the non-local corroboration rule.

### 5. The visible Top 10 allowed excessive publisher concentration

The global source cap was four. That permits one publisher family, including the normalized
`google_news` family, to occupy 40% of the first 10 stories.

Fix: the visible rail has stricter caps:
- max 2 per publisher family;
- max 4 per section;
- max 6 per geography.

The wider 25-story selected set retains the existing broader caps.

### 6. Registry source tier did not reach the ranker

The Sections source registry already classifies feeds as tier A/B, but story rows dropped that
metadata. Top Stories source quality therefore depended on a separate hard-coded family list.

Fix: live authority story rows now carry `sourceTier` and `sourceTopic`. Source quality uses
registry tier first (A=1.00, B=0.72, C=0.55), with publisher-family fallback for legacy snapshots.

### 7. Acquisition geography was stored as story geography

The live Sections assembler stamped every non-Muscat lane with `region: in`. That included World,
Business, Technology, Sports and Top Stories. Selection then used `story.region` as a geography
diversity key, so unrelated global/topical stories could all be treated as one India geography.

Fix:
- live acquisition now writes `acquisitionRegion` / `acquisitionCountryCode` provenance instead
  of claiming story-level geography;
- display diversity derives geography from the ranker's explicit story-location signal, with section
  fallback for generic stories;
- legacy `region: in` snapshot metadata therefore no longer collapses the visible rail.

### 8. Trace evidence did not identify critical-evidence rejection precisely

A qualified critical event rejected for missing corroboration appeared as evidence
`not_required` until the terminal admission stage.

Fix: evaluator trace now records
`nonlocal_critical_without_evidence` /
`mature_nonlocal_critical_without_evidence`
at the qualification/evidence stage and exposes source-quality and location-relevance details.

## Provenance

The executable ranker version is advanced from `nw-top-stories-ranker-observed-v1` to
`nw-top-stories-ranker-observed-v2`. Historical v1 shadow-study configuration and frozen pilot
fixtures are intentionally unchanged; they describe the earlier executable semantics and must not
be rewritten retroactively.

## Explicitly unchanged

- public-interest weights;
- freshness weight;
- consensus weight;
- breaking/live weight;
- primary / secondary / fallback score thresholds;
- 4h / 8h / 12h age windows;
- source registry membership;
- publisher URLs;
- Cloudflare deployment configuration;
- GitHub Actions.

## Certification added/updated

Coverage now certifies:

1. wider candidate acquisition while section displays remain bounded;
2. cluster representatives are the only ordinary ranking population;
3. dedicated Top Stories authority rows become signal-only evidence;
4. weak single-source non-local critical news is rejected in the primary window;
5. authoritative and trusted cold-start exceptions remain eligible;
6. registry tier metadata controls source quality;
7. first-10 publisher-family cap is two;
8. evaluator traces terminate at the correct evidence stage;
9. registry tier/topic metadata is propagated by live Sections acquisition.

## Remaining operational risks

This patch improves ranking integrity but does not manufacture source availability. If a publisher
feed is down, the authority still has fewer publisher families to work with. Cloudflare production
deployment and current-epoch verification remain separate operational gates.

Direct non-static browser Live mode can also have a different acquisition population than static
production authority mode. The ranker is now common, but acquisition parity should remain an
explicit validation item.
