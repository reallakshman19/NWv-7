# NW Hybrid Cloudflare Sections Shadow — Concept Note Rev0

## 1. Decision

NW will add Cloudflare as a second Sections data plane while GitHub/static
remains the sole production browser authority. The current target state is:

```text
S1_GITHUB_PRIMARY_CF_SHADOW
```

Cloudflare may independently acquire, normalize, rank, store, and report on
Sections data. GitHub/static remains the browser default and sole production
authority. A user-authorized, clearly labelled Cloudflare Preview may read only
the validated current epoch; it does not promote Cloudflare.

The implementation must remain within Cloudflare's Free-plan limits. When its
conservative capacity budget is exhausted, it pauses new shadow epochs and
preserves the last valid result. It never removes sources, publishes partial
coverage, or silently lowers quality to stay free.

## 2. Product value compared with the GitHub workflow

The GitHub/static workflow is simple and auditable, but data refresh is tied to
a repository workflow and a published file. That makes freshness, per-source
failure visibility, and rapid recovery harder than they need to be.

The Cloudflare shadow improves the app in five ways without risking the current
experience:

1. **Independent resilience.** A second producer can keep collecting evidence
   when the GitHub workflow, repository permissions, or static publication path
   has a problem.
2. **Faster freshness path.** Small feed jobs can run near the sources and update
   shadow state without a repository commit or site deployment.
3. **Better diagnosis.** Every one of the 41 source lanes ends in an explicit
   result. A missing headline can be traced to acquisition, identity,
   normalization, classification, admission, ranking, health, or infrastructure.
4. **Safe comparison.** The app offers a clearly labelled
   `GitHub / Cloudflare (Preview)` choice. GitHub remains selected by default,
   and Preview failure or stale evidence falls back automatically to GitHub.
5. **Safer future cutover.** Exact replay, live comparison, atomic publication,
   fault tests, and an evidence window precede any decision to make Cloudflare
   primary.

Cloudflare does not automatically make the editorial result better. Both paths
must use the same ranking and policy authority. Its immediate benefit is a more
current, observable, independently operated alternative whose quality can be
measured before users depend on it.

## 3. Scope and domain boundaries

The present implementation covers Sections and its Top Stories decision. The
broader app domains remain related but separate:

| Domain | Near-term role | Evidence horizon | Storage rule |
| --- | --- | ---: | --- |
| Sections / Top Stories | PR-B shadow now; independent acquisition in PR-C | 36 hours for matching raw news; 7 days for drift/failure and normalized evidence | Dedicated Sections shadow D1 |
| Insight | Later shadow profile using the same operating principles | 36 hours visible/news evidence | Its own dataset contract |
| Up Ahead | Existing edge path; later comparison integration if required | 7 days | Existing dedicated storage remains separate |
| Daily Digest | Existing daily product; later comparison integration if required | Daily edition | Existing dedicated storage remains separate |

Shared principles do not mean shared databases. Sections shadow never reuses the
Daily Digest or Up Ahead stores.

## 4. Authority model

```text
SERVING AUTHORITY
  GitHub/static snapshot read by the production browser

REFERENCE EXECUTOR
  Repository code at an exact revision

REFERENCE ACQUISITION RUNNER
  Explicit repository-side acquisition, added in PR-C

CLOUDFLARE SHADOW PRODUCER
  Independent acquisition, isolated storage, opt-in Preview only

PARITY JUDGE
  Repository/reference side, so the system being judged does not judge itself
```

These roles cannot be collapsed. In particular, a checked-in JSON file is a
serving artifact, not proof that the reference acquisition runner is currently
healthy.

## 5. One editorial authority

There is one executable authority for:

```text
source registry
publisher-family identity
normalization
event classification
admission
ranking and scoring
selection and diversity
```

The Cloudflare bundle imports those modules. It must not copy weights, aliases,
regular expressions, source tiers, thresholds, or the 41-feed registry. A
semantic source-registry digest and executable version set travel with every
epoch.

## 6. Free-plan execution shape

A single Worker invocation must not directly fetch all 41 feeds. The normal
path shards one feed lane per Queue job, followed by a small finalization job:

```text
epoch coordinator
      │
      ├── lane 01 ── fetch ── normalize ── terminal disposition
      ├── lane 02 ── fetch ── normalize ── terminal disposition
      ├── ...
      └── lane 41 ── fetch ── normalize ── terminal disposition
                              │
                              ▼
                    shared ranking authority
                              │
                              ▼
                       custody finalization
```

Google News is the measured transport exception, not an editorial-policy
exception. Its 11 lanes return HTTP 503 to standard Worker fetches. When an
operator explicitly enables the still-shadow-only fallback, one guarded Browser
Run session acquires those 11 feeds and returns 11 separate, bounded lane
dispositions. The session may contact only `news.google.com`; it transfers no
more than 20 entries per lane and only title, summary, URL, and publication
time. Ranking, normalization, custody, and parity remain shared and unchanged.
Running one browser per feed would exceed the Free allowance and would add no
independence benefit inside that single source family.

This structure respects per-invocation CPU, connection, and external-request
limits while preserving all sources. On the standard-fetch path, a maximum
30-minute cadence of 48 news
epochs use an internal reservation of 7,680 Queue operations, 168,000 D1 rows
read, 28,800 D1 writes, and 2,880 Worker invocations per day. Queue accounting
includes the coordinator, all lane jobs, finalization, and bounded retries.
Those reservations are below the relevant Free limits and leave headroom for
retries.

Browser-assisted epochs reserve 20 seconds each in a D1-backed quota ledger.
The application stops at 480,000 browser milliseconds per UTC day—eight
minutes, below Cloudflare's ten-minute Free allowance—so it can admit at most
24 browser-assisted epochs per day. The corresponding maximum qualification
cadence is hourly. Collecting 200 comparable browser-assisted epochs therefore
requires at least nine calendar days, which also exceeds the seven-day minimum.

D1 is the only persistent Cloudflare data service in this phase. Normalized
evidence is stored as immutable, content-addressed rows under a strict 350 MB
application ceiling. That leaves about 150 MB below D1's 500 MB Free-plan
per-database limit for relational metadata, indexes, and safety headroom. One
evidence object may not exceed 1 MB, one decision-evidence row may not exceed
64 KB, and expired non-current evidence is pruned before admitting another
epoch. The current committed object is never removed by retention cleanup.

The finalizer uses verified JSON-backed bulk inserts so a complete 41-lane
replay stays below D1's Free limit of 50 queries per Worker invocation. The
deployment relies on Cloudflare's automatically enforced Free-plan Worker
limits; a custom CPU limit is intentionally absent because that setting requires
a paid Workers plan. Deployed CPU telemetry is a PR-C acceptance gate; repeated
CPU-limit errors pause acquisition instead of weakening coverage.

The application budget is enforced before an epoch starts. It is intentionally
stricter than the provider limits. Because it cannot see unrelated account
usage, Cloudflare account alerts are also required.

## 7. Epoch and custody model

```text
STAGED
  writable, invisible
    │
    ├── failure before validation ──> ABORTED
    │
    ▼
SEALED
  immutable, invisible
    │
    ├── stale/out-of-order ─────────> REJECTED
    │
    ▼
SHADOW_COMMITTED
  immutable, eligible for sections_shadow_current_pointer
```

An epoch contains:

- immutable logical slot, evaluation clock, attempt, mode, registry version and
  registry digest;
- exactly 41 lane records;
- normalized decision evidence for every candidate;
- exact lane and decision cardinalities;
- input and output digests;
- a content-addressed immutable D1 evidence object;
- retention times and, where relevant, a terminal failure code.

Every lane ends as `OK`, `EMPTY`, `TIMEOUT`, `HTTP_ERROR`, `PARSE_ERROR`, or
`POLICY_BLOCKED`. A feed never disappears from the record.

Sealing requires exact cardinality and successful D1 evidence digest
verification. The
transition to `SHADOW_COMMITTED` and movement of
`sections_shadow_current_pointer` occur in one D1 transaction. A monotonic
logical-slot fence prevents a delayed older epoch from replacing newer state.

## 8. Two proof modes

| Mode | Question | Acceptance |
| --- | --- | --- |
| Frozen deterministic replay | Does Cloudflare execute the same algorithm from identical evidence and clock? | Exact candidates, identity, decisions, scores, ranks, selections and digest; `UNKNOWN_DRIFT = 0` |
| Independent live acquisition | Does Cloudflare behave acceptably when sources are fetched independently? | Differences allowed only when classified at the first divergent boundary and within agreed tolerances |

Final Top-10 difference is a symptom, not a diagnosis. The frozen drift vocabulary
is `MATCH`, `ACQUISITION_DRIFT`, `IDENTITY_DRIFT`, `NORMALIZATION_DRIFT`,
`CLASSIFICATION_DRIFT`, `ADMISSION_DRIFT`, `RANKING_DRIFT`,
`SOURCE_HEALTH_DRIFT`, `INFRASTRUCTURE_DRIFT`, and `UNKNOWN_DRIFT`.

The parity judge runs on the reference side. This preserves independent
assessment and prevents Cloudflare from silently classifying its own faults as
acceptable.

## 9. Serving and preview policy

In S1, the production browser defaults to:

```text
/newsdata/sections_latest.json
```

The Cloudflare Worker has no HTTP write route and no public bucket. Its public
read surface is limited to a CORS-enabled, GET-only browser projection of the
verified current `SHADOW_COMMITTED` live epoch. The hourly independent
acquisition remains qualification infrastructure.

The user-authorized product Preview is a clearly labelled UI choice:

```text
GitHub               Cloudflare (Preview)
default/production   opt-in committed shadow snapshot
```

Preview failure, stale evidence, invalid schema, or a disabled endpoint falls
back to GitHub without changing the saved Preview choice. This opt-in read does
not waive qualification gates and cannot move the deployment to S2 or S3.

## 10. Qualification and promotion

```text
S0  existing GitHub/static only

S1  GITHUB_PRIMARY_CF_SHADOW
    current implementation target

S2  GITHUB_PRIMARY_CF_QUALIFIED
    eligible for a separate operational promotion decision

S3  CF_PRIMARY_GITHUB_HOT_FALLBACK
    future, separately authorized decision
```

Promotion requires all of the following, and none independently authorizes it:

- exact deterministic replay;
- live drift classification;
- fault-injection proof of fail-closed custody;
- at least seven calendar days and 200 comparable epochs;
- weekend and daypart coverage;
- at least 95% canonical-reference coverage;
- at least 95% shadow precision;
- at least 90% Top-10 overlap;
- zero stale admissions, policy violations, false publisher corroboration, and
  unknown critical drift;
- agreed read availability, latency, quota, and recovery results;
- a separate owner decision to change deployment state.

## 11. Delivery plan

### PR-A — shared executable authority (complete dependency)

- Freeze the canonical registry and source-family identity.
- Make classification, admission, ranking, and selection importable.
- Freeze an anti-circular deterministic benchmark and expected digests.

### PR-B — independent custody foundation (implemented in this repository)

- Add isolated Worker, Queue, and D1 bindings.
- Add Free-capacity reservations and fail-closed admission.
- Add explicit 41-lane evidence and idempotent retries.
- Add immutable content-addressed evidence.
- Add staged, sealed, rejected, aborted, and committed states.
- Add atomic monotonic shadow pointer.
- Run the PR-A frozen benchmark inside the Worker runtime.
- Keep production browser authority and all HTTP writes disabled.

### PR-C — independent acquisition and parity

- Add the explicit repository reference acquisition runner.
- Add one-feed-per-job Cloudflare acquisition adapters, with one budgeted
  source-family Browser Run session for Google News that still produces 11
  individual lane records.
- Preserve source-specific HTTP, timeout, parsing, and policy dispositions.
- Add explicit operator-triggered execution; recurring scheduling remains a
  separate activation decision after controlled transport confirmation.
- Build reference-side stage-by-stage parity classification.
- Add cost and CPU telemetry; automatically pause before Free thresholds.

Implementation status: the S1 foundation and controlled transport confirmation
are complete. The explicitly authorized hourly qualification schedule is
active, with Browser Run restricted to shadow acquisition and guarded by the
D1 quota ledger. Two controlled browser-assisted probes completed 41/41 lanes;
the first reached 9/9 displayed-story overlap in 12.759 seconds, and the
hardened bounded-extraction confirmation reached 8/9 with 6.639 additional
browser seconds. Both classified their first difference as acquisition drift,
with zero safety violations. Default serving remains GitHub/static; the
Cloudflare browser path is explicitly labelled Preview only.

### PR-D — qualification and fault certification

- Inject lane loss, duplicate delivery, changed retry evidence, D1 evidence corruption,
  D1 failure, queue delay, out-of-order completion, and capacity exhaustion.
- Verify no partial or stale epoch becomes current.
- Operate the seven-day/200-epoch qualification window.
- Publish a readiness report; do not auto-promote.

Implementation status: the executable readiness gate and core fail-closed
fault suite exist. The real operating window is active but currently contains
only 6/200 comparable epochs across two calendar days, so the state remains S1
and is not qualified for promotion.

### Preview product boundary (implemented by explicit owner direction)

- Design and test `GitHub / Cloudflare (Preview)` in the UI.
- Show freshness and availability state in plain language.
- Fall back safely to GitHub.
- Keep S3 cutover behind a separate authorization.

## 12. Non-goals

- No default browser cutover or replacement of GitHub serving authority in this phase.
- No copied ranking policy or copied source registry.
- No public Cloudflare write API.
- No reuse of Daily Digest or Up Ahead storage.
- No source deletion, hidden sampling, or reduced coverage to fit Worker limits.
- No automatic S2 or S3 promotion.
- No claim that a successful deployment proves live parity or readiness.

## 13. Current implementation evidence

The PR-B/PR-C package is at `cloudflare/sections-shadow`. Its Worker-runtime
certification verifies:

- the exact frozen decision digest;
- complete 41-lane commit;
- partial-epoch invisibility;
- idempotent and conflicting retries;
- immutable D1 object corruption rejection;
- atomic monotonic pointer behavior;
- Free-capacity exhaustion with preservation of the last commit;
- GitHub/static serving authority with qualification-only scheduling;
- absence of an HTTP write surface;
- bounded live feed parsing and one-feed-per-job fanout;
- guarded, quota-ledgered Browser Run transport with bounded field extraction;
- transient retry termination and retry-attempt evidence;
- stage-by-stage live drift classification;
- a non-promoting seven-day/200-epoch readiness gate.

The dedicated D1 database and Queue resources are provisioned, migrations
`0001` through `0004` are applied, and the Worker is deployed. A remote frozen replay
committed with 41/41 terminal lanes, 18/18 decisions, verified immutable D1
evidence, and the exact benchmark decision digest. Scheduling, opt-in Preview,
and production authority remain separate: the hourly shadow qualification
schedule and GET-only Preview are active, but GitHub remains the default and
sole production authority. Controlled independent epochs commit
atomically and classify their first divergent boundary. The live observation is
`ACQUISITION_DRIFT`, including Google News HTTP 503 responses from Worker
egress, with 8/9 displayed-story overlap on standard fetch. The guarded
Browser Run probes reached 9/9 and 8/9 while remaining `ACQUISITION_DRIFT`.
Live acquisition and the guarded fallback are active only for the evidence
window. This proves live execution and RCA, not operational qualification or
promotion readiness.
