# NW-RANK-011L — Top Stories normalization digest

## Status

Implemented on an isolated Version 0.3 branch for review and certification.

## Governing objective

Publish deterministic evidence for the post-candidate-build population actually consumed by Top Stories scoring, without changing candidate construction, ranking, selection, display, persistence, source acquisition, deployment, or UI behavior.

## Root cause

The shadow snapshot already publishes:

- `inputDigest` for repository section and Top Feed inputs;
- `settingsDigest`;
- `topFeedDigest`;
- `policyDigest`.

However, it did not publish a digest of the normalized candidate population produced after flattening, validation, deduplication and duplicate-evidence merging.

That omission matters because the raw input digest intentionally removes volatile fetch fields. At least one such field, `fetchedAt`, participates in executable timestamp-confidence inference. Two runs could therefore share the same `inputDigest` while presenting different candidate evidence to the evaluator.

## Contract

The executable normalization evidence version is:

```text
nw-top-stories-normalization-v1
```

Every successful snapshot now publishes:

```text
normalizationVersion
normalizationDigest
```

The digest value contains:

- normalization version;
- raw source-row count;
- normalized candidate count;
- candidate-build disposition counts;
- candidate-build reason counts;
- the canonical post-dedupe candidate population.

## Canonicalization rules

The digest is deterministic under source-row permutation. Object keys and candidate arrays are canonicalized before SHA-256 hashing.

The digest recursively excludes fields that are not part of ranking normalization evidence. Exclusion matching is case-insensitive so alternate credential-key casing cannot perturb the digest:

- article bodies and licensed full content;
- HTML;
- credentials, tokens, cookies and authorization values;
- read/viewed and personalization state;
- request, trace and duration metadata;
- `_candidateSeenAt`;
- downstream `_topStoryRank` and `_studyIdentity` results.

Rank-relevant candidate evidence remains included. In particular, `fetchedAt` is retained because the timestamp-confidence logic can use it to detect fetch-time fallback timestamps.

## Certified properties

Focused certification demonstrates that:

1. repeated evaluation produces the same digest;
2. permutation of distinct source rows produces the same digest;
3. a `fetchedAt` change can leave `inputDigest` unchanged while changing executable timestamp confidence and `normalizationDigest`;
4. licensed bodies, secrets, mixed-case credential keys, nested tokens and runtime-only candidate timestamps do not change the normalization digest;
5. duplicate collapse and candidate-build accounting change the digest;
6. snapshots publish a 64-character SHA-256 digest and the executable normalization version;
7. repeated artifact generation remains byte-stable;
8. sensitive source fields remain absent from snapshot artifacts.

## Scope boundary

This amendment is observational only. It does not yet:

- use `normalizationDigest` as a pair-eligibility or pilot-decision gate;
- add normalization-version boundaries to sequential replay;
- change the existing `inputDigest` contract;
- change ranking, admission, diversity, selection or display logic;
- authorize a production policy change.

Those enforcement choices require a separate amendment so evidence publication is not mixed with analytical policy.
