# NW-RANK-012F — Pages deployment provenance

## Mission result

GitHub Pages deployment is now joined to one immutable repository source commit,
one checked-out tree, one frozen build timestamp, one additive data manifest, and
post-deployment byte verification.

This closes the repository-to-deployed-data provenance gap only. It does not
establish browser-visible Top Stories ranking equivalence and does not pass G3.

## Pre-mission gap

The Pages workflow previously checked out without an explicit ref. A deployment
triggered by `workflow_run` could therefore build a newer default-branch state
than the upstream data workflow's immutable `head_sha`.

The existing `pages_data_manifest.json` preserved useful source/dist checks, but
it did not identify the repository SHA, checked-out SHA, triggering workflow, or
full SHA-256 values. The World-health browser verifier remained a UI-health gate,
not a repository/build/deployed-byte provenance gate.

## Event-specific source authority

The deployment resolves exactly one source SHA before checkout:

```text
workflow_run      -> github.event.workflow_run.head_sha
push              -> github.sha
workflow_dispatch -> github.sha
```

Missing, malformed, or unsupported source context fails closed. A missing
`workflow_run.head_sha` never falls back to current `main`.

For a `workflow_run`, upstream workflow name, run ID, run attempt, head SHA, and
conclusion are recorded. For push and manual dispatch, every upstream field is
explicitly `null` in the manifest.

## Exact checkout proof

The build job exposes the resolved SHA as a job output and checks out:

```yaml
ref: ${{ steps.source.outputs.source_sha }}
fetch-depth: 1
```

Before dependency installation or build, the workflow verifies:

```text
git rev-parse HEAD == resolved source SHA
```

A single UTC `frozenAt` timestamp is then captured and used by manifest
publication. No concurrency cancellation mode was added; existing Pages
sequencing remains intact.

## Additive manifest contract

The existing root contract remains unchanged:

```text
schemaVersion: 1
manifestVersion: pages-data-publish-v1
```

Existing top-level sections and file-record fields remain present. One additive
object is published:

```text
provenance.schemaVersion = nw-pages-deployment-provenance/v1
provenance.sourceSha
provenance.checkedOutSha
provenance.triggerEvent
provenance.deployWorkflowRunId
provenance.deployWorkflowRunAttempt
provenance.frozenAt
provenance.upstreamWorkflowName
provenance.upstreamWorkflowRunId
provenance.upstreamWorkflowRunAttempt
provenance.upstreamHeadSha
provenance.upstreamConclusion
provenance.sourceCheckoutMatched
```

`generatedAt` equals the same frozen timestamp. Source and checked-out SHAs are
lowercase 40-character Git SHAs, and publication fails unless they match.

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
SHA-256 digest. `matched` is derived from complete byte-digest equality, not the
truncated display values. The tracked file set was not reduced.

## Deployed verification flow

A separate Node-only verifier runs after Pages deployment. It does not use
Playwright and does not alter the existing World-health verification.

The verifier:

1. fetches `newsdata/pages_data_manifest.json` with cache busting and
   `cache: no-store`;
2. rejects HTTP failures, HTML fallbacks, malformed JSON, invalid provenance,
   checkout mismatch, wrong expected source SHA, or non-conserved tracked files;
3. fetches deployed bytes for `sections_latest.json` and `source_health.json`;
4. calculates SHA-256 over the served response bytes;
5. compares each result with the manifest's `distSha256`;
6. writes `artifacts/pages-deployment-provenance/report.json` before returning a
   non-zero status.

The evidence report contains the expected source SHA, observed provenance,
request and final URLs, HTTP status, content type, byte size, expected and
observed hashes, checked-file verdicts, final verdict, and reason codes.

## Commit-status semantics

The post-deployment gate publishes:

```text
deployment/pages-provenance
```

against the resolved immutable `sourceSha`. It does not post against an
ambiguous newer workflow/default-branch SHA. Evidence uploads use `if: always()`
and 30-day retention.

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

Historical deployed artifacts are not backfilled or rewritten. Newly deployed
artifacts without valid provenance fail the new gate.

## G3 and production authorization

The mission proves immutable repository/build/deployed-data provenance. It does
not prove that repository replay equals personalized browser-visible Top Stories
ranking, settings, travel prioritization, read/view ordering, or display depth.

G3 therefore remains blocked. No production ranking or policy change is
authorized.
