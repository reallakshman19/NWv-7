# NW-RANK-011M — Executable ranker-limit classifier scope

## Status

Implemented on an isolated Version 0.3 branch for review and certification.

## Governing objective

Make the existing Top Stories period-classifier policy field `includeOutsideRankerLimit` executable without changing the default classifier behavior, ranker behavior, snapshot schema, study configuration, pilot version boundary, source acquisition, persistence, deployment or UI behavior.

## Root cause

The period policy already declared and hashed:

```text
includeOutsideRankerLimit: true
```

However, the classifier always consumed `scoredCandidates`. Changing the policy to `false` changed the policy digest but did not change the candidate population inspected by the classifier.

The field was therefore declarative rather than executable.

## Existing evidence populations

Run snapshots already publish two distinct candidate populations:

```text
candidateEvidence
= all post-normalization scored candidates

ranked
= candidates retained inside the configured ranker limit after admission,
  ordering and diversity selection
```

No new snapshot population or schema is required.

## Executable semantics

The classifier now selects its analytical population as follows:

```text
includeOutsideRankerLimit = true
→ inspect all scored candidates

includeOutsideRankerLimit = false
→ inspect only ranked candidates inside the ranker limit
```

The default remains `true`, so existing pilot behavior is preserved.

## Fail-closed rule

When `includeOutsideRankerLimit` is `false`, ranked-population evidence is mandatory for both observations.

Missing evidence produces an uncertain classification with explicit reasons:

```text
prior_ranked_candidate_population_missing
current_ranked_candidate_population_missing
```

The classifier does not silently fall back to all scored candidates because that would violate the configured scope.

An explicitly present empty ranked population remains valid and produces calm unless other active evidence exists.

## Candidate-source precedence

For the all-scored path, the existing precedence is preserved:

1. snapshot `scoredCandidates`;
2. trace `scoredCandidates`;
3. direct trace array;
4. empty population.

For the within-ranker-limit path, the classifier accepts:

1. snapshot `rankedCandidates`;
2. snapshot `ranked`;
3. snapshot `selected`;
4. trace `rankedCandidates`;
5. trace `ranked`;
6. trace `selected`.

This supports repository run snapshots and direct classifier fixtures without broadening the production contract.

## Versioning decision

The executable classifier version remains:

```text
nw-top-stories-period-classifier-v1
```

This amendment corrects implementation to match a field already present in the v1 policy and its policy digest. It does not introduce a new default policy, threshold, critical-event definition or pilot configuration.

Policy instances with true and false remain distinguishable through the existing `policyDigest`.

## Certification

Focused certification proves:

1. the default true policy still detects a qualified critical candidate outside the ranker limit;
2. false excludes the same outside-limit candidate;
3. false still detects a qualified critical candidate retained inside the ranker limit;
4. ranked candidate-trace evidence is accepted when snapshot-ranked evidence is absent;
5. missing ranked evidence fails closed as uncertain;
6. true and false produce different policy digests;
7. sequential replay applies the selected population scope.

## Explicit non-goals

This amendment does not:

- change candidate construction, normalization or deduplication;
- change admission, scoring, ordering, diversity or ranker limits;
- change display projection or visible depth;
- change critical-event definitions or evidence thresholds;
- change identity resolution;
- change the run-snapshot schema or normalization digest;
- change study configuration or split the active pilot version segment;
- add persistence, hysteresis or cross-run state;
- authorize a production ranking-policy change.
