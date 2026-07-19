# NW-RANK-011M — Versioned executable ranker-limit classifier scope

## Status

Owner-corrected on the existing PR branch under Work Pack #455. Pending exact-head CI and final owner review.

## Mission

Make `includeOutsideRankerLimit` executable without changing or reinterpreting the active Version 0.3 pilot's period-classifier v1 behavior.

## Root cause

The v1 policy declared and hashed:

```text
includeOutsideRankerLimit: true
```

Draft PR #454 initially made `false` executable while keeping the same v1 classifier version. That would allow the same version identity to produce different behavior before and after merge.

The draft also allowed `selected` as an alias for ranked-within-limit evidence. This weakened the distinction between ranked and displayed/selected populations.

## Version boundary

The active default remains:

```text
nw-top-stories-period-classifier-v1
```

Its behavior remains:

```text
inspect all scored candidates
```

The executable population-scope contract is introduced as:

```text
nw-top-stories-period-classifier-v2
```

Under v2:

```text
includeOutsideRankerLimit = true
→ inspect all scored candidates

includeOutsideRankerLimit = false
→ inspect only explicitly ranked candidates
```

A v1 policy requesting `includeOutsideRankerLimit = false` fails closed:

```text
period_classifier_scope_requires_v2
```

An unsupported policy version fails closed:

```text
period_classifier_version_unsupported
```

The active study configuration remains on v1 and is not changed by this mission.

## Population contract

The all-scored population may come from:

1. snapshot `scoredCandidates`;
2. candidate trace `scoredCandidates`;
3. a direct candidate-trace array.

The v2 within-limit population may come only from:

1. snapshot `rankedCandidates`;
2. snapshot `ranked`;
3. candidate trace `rankedCandidates`;
4. candidate trace `ranked`.

The classifier does not treat these as ranked evidence:

```text
selected
displayed
```

## Fail-closed behavior

When v2 requests within-limit scope, ranked evidence is mandatory for both observations.

Missing evidence produces:

```text
prior_ranked_candidate_population_missing
current_ranked_candidate_population_missing
```

An explicitly present empty ranked array is valid evidence. It may classify calm when no other active evidence exists.

## Determinism and compatibility

The policy digest includes:

- classifier version;
- `includeOutsideRankerLimit`;
- critical event types;
- evidence requirements;
- source-health requirement;
- material-update thresholds.

Therefore v1, v2/all-scored and v2/within-limit policies have distinct digests.

No active study configuration, ranker behavior, snapshot schema, source acquisition, generated data, deployment, UI, persistence or residence behavior changes.

## Certification

Focused certification proves:

1. default v1 all-scored behavior is preserved;
2. v1/within-limit requests fail closed;
3. v2/all-scored behavior is executable;
4. v2/within-limit excludes an outside-limit critical candidate;
5. v2/within-limit detects an inside-limit critical candidate;
6. explicit ranked candidate-trace evidence is accepted;
7. missing prior/current ranked evidence fails closed;
8. empty ranked populations are valid;
9. `selected` and `displayed` cannot substitute for ranked evidence;
10. v1/v2 and true/false policies have distinct digests;
11. sequential replay applies explicit v2 scope without mutating observations;
12. the active pilot config remains on v1.

## Scope

Changed files are restricted to:

```text
src/services/topStories/topStoriesPeriodClassifier.js
src/services/topStories/topStoriesPeriodClassifierScope.cert.test.js
reports/NW-RANK-011M_executable_ranker_limit_scope.md
```

## Explicit non-goals

This amendment does not:

- change ranking, admission, ordering, diversity or display;
- change event taxonomy or critical-event definitions;
- change identity resolution;
- enforce normalization segmentation;
- change trace or funnel schemas;
- change pilot dates, authority or decision artifacts;
- change browser/deployment behavior;
- authorize production ranking or automatic policy changes.
