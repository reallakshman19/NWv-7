# NW-RANK-012F — Pages deployment provenance

## Mission result

GitHub Pages deployment is joined to one observed checkout commit, one frozen build
timestamp, one additive data manifest, and post-deployment byte verification.

This closes the repository-to-deployed-data provenance gap only. It does not
establish browser-visible Top Stories ranking equivalence and does not pass G3.

## Pre-mission gap

The Pages workflow previously checked out without proving which repository tree
entered the build. A `workflow_run` deployment could therefore observe a branch
state different from the upstream workflow's starting commit, while the manifest
published no repository or workflow provenance and only truncated file hashes.

The World-health browser verifier remains a UI-health gate, not a repository,
build, or served-byte provenance gate.

## Three distinct evidence identities

The implementation keeps these identities separate:

```text
upstream workflow input SHA
actual deployment checkout/source SHA
deployed served-byte evidence
```

The upstream `workflow_run.head_sha` is antecedent trigger evidence. It is not
claimed to be a later generated-data commit made during the upstream run.

## Event-specific source resolution

The source-resolution modes are:

```text
workflow_run      -> workflow-run-default-branch-checkout
push              -> push-event-sha
workflow_dispatch -> workflow-dispatch-event-sha
```

For `push` and `workflow_dispatch`, the workflow checks out `github.sha` and
requires the observed checkout SHA to equal that event SHA.

For `workflow_run`, the workflow validates and records the upstream head SHA,
checks out the repository default branch once after the upstream run completes,
and immediately freezes `git rev-parse HEAD` as the deployment `sourceSha`.
That frozen SHA is then used for the build, manifest, verifier checkout, evidence
artifact identity, and commit-status target. The default branch is not resolved
again later in the workflow.

Missing, malformed, or unsupported source context fails closed.

## Exact checkout proof

The workflow resolves one checkout ref before checkout, performs one checkout,
and then captures:

```text
checkedOutSha = git rev-parse HEAD
sourceSha     = checkedOutSha
```

For push and manual dispatch, the checkout is additionally required to match the
event SHA. For `workflow_run`, `upstreamHeadSha` remains complete antecedent
evidence but is not required to equal the actual checkout/source SHA.

A single UTC `frozenAt` timestamp is captured after checkout and used by manifest
publication. Existing Pages concurrency sequencing remains unchanged.

## Additive manifest contract

The existing root contract remains unchanged:

```text
schemaVersion: 1
manifestVersion: pages-data-publish-v1
```

Existing top-level sections and file-record fields remain present. One additive
`provenance` object publishes:

```text
schemaVersion
sourceSha
checkedOutSha
sourceResolutionMode
triggerEvent
deployWorkflowRunId
deployWorkflowRunAttempt
frozenAt
upstreamWorkflowName
upstreamWorkflowRunId
upstreamWorkflowRunAttempt
upstreamHeadSha
upstreamConclusion
sourceCheckoutMatched
```

For push and manual dispatch, upstream fields are explicit `null`. For
`workflow_run`, upstream workflow identity, run IDs, conclusion, and a valid
40-character upstream head SHA are required.

`generatedAt` equals the same frozen timestamp. Publication fails unless the
actual source and checked-out SHAs are valid and equal, and unless the resolution
mode matches the trigger event.

## Full byte-hash accounting

Every tracked file preserves:

```text
name
sourceExists
distExists
sourceHash
distHash
matched
```

and adds:

```text
sourceSha256
distSha256
```

The legacy hashes remain the first 16 characters of the corresponding full
SHA-256 digest. `matched` is derived from complete byte equality. The tracked file
set was not reduced.

## Deployed verification flow

A separate Node-only verifier runs after Pages deployment. It does not use
Playwright and does not alter the existing World-health verification.

The verifier fetches the cache-busted manifest, rejects HTTP or HTML fallback
responses and malformed provenance, requires the exact expected frozen
`sourceSha`, fetches the served bytes for `sections_latest.json` and
`source_health.json`, hashes those bytes, compares them with manifest
`distSha256`, and writes `artifacts/pages-deployment-provenance/report.json`
before returning a non-zero status.

## Commit-status semantics

The post-deployment gate publishes:

```text
deployment/pages-provenance
```

against the frozen checkout-derived `sourceSha`. It does not post against the
upstream input SHA or a later re-resolved default-branch SHA. Evidence uploads use
`if: always()` and 30-day retention.

## Compatibility posture

Unchanged:

- Pages manifest root schema and manifest version;
- all previous manifest file-record fields;
- `newsdataRuntimeStatus.js` consumption;
- the Pages trigger set and official Pages artifact/deploy actions;
- deployment concurrency sequencing;
- the World-health browser verifier and its evidence/status gate;
- Top Stories repository-snapshot observation semantics;
- ranking, source collection, persistence, recommendation, UI, and policy.

Historical deployed artifacts are not backfilled. Newly deployed artifacts
without valid provenance fail the new gate.

## G3 and production authorization

The mission proves repository checkout, build, Pages artifact, and deployed-data
byte provenance. It does not prove that repository replay equals personalized
browser-visible Top Stories ranking, settings, travel prioritization, read/view
ordering, or display depth.

G3 remains blocked. No production ranking or policy change is authorized.
