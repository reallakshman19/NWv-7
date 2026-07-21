# NW-RANK-012E — Single pilot decision authority

## Mission result

NW-RANK-012E removes the obsolete manual pilot rollup and diagnostic recommendation path. The repository now has one executable pilot decision authority.

This mission is intentionally deletion-oriented. It does not repair, adapt, redirect, alias, wrap, or replace the retired path.

## Retired files

The following workflow, CLI, implementation modules, and certifications were deleted:

```text
.github/workflows/top_stories_shadow_pilot_rollup.yml
scripts/build_top_stories_pilot_rollup.mjs
scripts/top-stories-shadow/pilotRollup.mjs
scripts/top-stories-shadow/pilotDecisionPack.mjs
scripts/top-stories-shadow/pilotRollupMarkdown.mjs
src/services/topStories/topStoriesPilotRollup.cert.test.js
src/services/topStories/topStoriesPilotDecisionPack.cert.test.js
src/services/topStories/topStoriesPilotRollupWorkflow.cert.test.js
```

No compatibility shim, replacement workflow, replacement CLI, schema alias, redirect, or fallback was introduced.

## Why a diagnostic label was insufficient

The retired path was executable and could be invoked with an arbitrary manual date range. It produced downloadable decision-like artifacts through independent aggregation, threshold, quantile, duplicate-day, and recommendation logic.

A `diagnostic-only` declaration did not remove that executable authority surface. Two independently executable recommendation paths could disagree even when one claimed to be non-authoritative.

The safe boundary is structural: remove the parallel path and retain one executable decision implementation.

## Sole remaining authority

The following remain the only executable pilot decision authorities:

```text
Workflow  .github/workflows/top_stories_shadow_pilot_decision.yml
CLI       scripts/build_top_stories_pilot_decision.mjs
Builder   scripts/top-stories-shadow/pilotDecision.mjs
Schema    nw-top-stories-seven-day-pilot-decision/v1
```

The workflow remains scheduled and fixed-window. It reads `pilotStartDate` and `pilotWindowDays` from committed study configuration and does not accept arbitrary pilot start or end dates.

The governing CLI continues to build:

```text
pilot_decision.json
pilot_decision.md
pilot_input_manifest.json
pilot_manifest.json
```

## Authority byte-equivalence

The authoritative workflow, CLI, and builder were not modified by this mission.

Baseline Git blob identities remain:

```text
top_stories_shadow_pilot_decision.yml  27233b0e554a93a9b92a0a4e143ebcadeabf4b37
build_top_stories_pilot_decision.mjs   0c5be7797ef026f52ffbff8fcfd1ab12deb4060d
pilotDecision.mjs                     3ce6053547516b507fe47cc459baeb1d4f4bd12f
```

Therefore this deletion changes no authoritative threshold, date, comparison, recommendation, readiness, checklist, or authorization behavior.

## Historical records versus executable authority

Historical reports under `reports/NW-RANK-011H_*` remain unchanged. Previously uploaded workflow artifacts and historical GitHub Actions runs also remain immutable historical evidence.

Historical records describe what the retired path produced at the time. They are not current executable authority and are not migrated, rewritten, or backfilled.

There is intentionally no runtime compatibility promise for artifacts produced by the deleted manual rollup CLI. The authoritative v1 decision artifacts remain unchanged.

## Exclusivity certification

`topStoriesPilotAuthorityExclusivity.cert.test.js` proves:

1. all eight retired files are absent;
2. retired executable identifiers do not remain under `.github/workflows`, `scripts`, or `src`;
3. exactly one pilot decision workflow remains;
4. that workflow is scheduled and obtains its fixed window from committed configuration;
5. the authoritative CLI, builder, schema, and false authorization flags remain intact;
6. the historical NW-RANK-011H report family remains present.

The certification is read-only and does not snapshot entire authority files.

## Production and G3 posture

This mission does not change production ranking, persistence, publication, UI, deployment, or browser behavior.

The authoritative builder continues to publish:

```text
productionChangeAuthorized: false
automaticPolicyChangeAuthorized: false
```

G3 browser/production equivalence remains blocked. No production policy change is authorized by this cleanup.
