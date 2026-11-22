# NW-UPAHEAD-IDENTITY-V2 — Occurrence contract and gated delivery

**Governing issue:** [#200](https://github.com/reallakshman19/NWv-7/issues/200)  
**Initial RCA baseline:** `c9c5420bdaa31fb5e91c4940d7af9b0b01347a82`  
**Status:** P1/P2 shadow implementation in progress; **no production wire-up, merge or deploy**.  
**Reviewer classification:** Exposed author/technical review; a separate genuine Stage-1 cold review must be frozen before design/PR disclosure.

## Intended outcome

One actionable card for each *source-verified* real-world occurrence, with complete provenance and safe separation of sessions, releases, hazard phases, products and store scopes. Distinguish raw observations, physical occurrences, canonical IDs, source aliases and Planner saved-plan IDs. A title, source URL or partial time slot is insufficient to prove occurrence equivalence.

## Work packages and release gates

| Gate | Module | Exit evidence |
| --- | --- | --- |
| 0 | Existing audit / owner authority / source custody | Issue #200 created; native independent reviewer and exact Stage-1 return *not yet confirmed*. Preserve original published November 21 and 22 snapshots. |
| 1 | Typed source observation and trusted binding contract | Explicit external adjudication registry, evidence URLs, category/authority namespace and session conflict policy, plus source-derived positive and negative fixtures. |
| 2 | Deterministic occurrence engine in `scripts/upahead_identity/` | Same ID and complete sorted projection for source-order permutations. No silent merge without separately supplied trusted evidence; unknown session conflict becomes REVIEW. Source aliases/provenance retained. |
| 3 | Persistent cross-run ledger | Bounded storage with atomic schema validation, explicit observed-vs-verified timestamps, durable alias redirects, stable ID under reschedule, tombstone precedence, idempotent refresh. Never infer renewal from a JSON rebuild. |
| 4 | Category-specific match decisions | Organizer session, official alert issuer/hazard/period, work/platform/date and retailer/SKU/channel/market separately; negative controls for parallel sessions and products. |
| 5 | Publisher and retention | Source observations → resolved occurrences → lifecycle → validator → atomic GitHub snapshot. Eight three-hour refreshes, day 7/day 8, actual expiration, cancellation and upstream omissions. |
| 6 | JS/Planner migration | Publisher canonical ID is authority; translate legacy alias IDs into persistent savedPlanId with backups and no destructive ambiguous rewrites. Actual browser save/refresh/reopen/remove and static/edge parity. |
| 7 | Retail/source repair | Fix Ubuntu 26.04 runner incompatibility and obtain real verified online/offline offers, with truthful zero/unknown/stale diagnostic states. |
| 8 | Independent acceptance/release | Exact-head CI, two real collections, source-to-published-to-browser evidence, independent Stage-2 negative controls, owner release approval and rollback receipts. |

## Initial shadow-only interface

`resolve_observations(observations, trusted_bindings={}, prior_ledger={})` returns a sorted shadow projection, a ledger draft, review candidates, explicit Planner alias redirect **proposals**, and a semantic digest. It is **not** invoked by the publisher and may not authorize publication.

`binding_alias(source_observation)` returns a deterministic source-scoped alias that includes source/group, URL or ID and optional source record/session identifiers. An alias identifies a record, not a real event.

The caller, *not* a raw source record, owns `trusted_bindings[alias]`. Each binding requires `authorityRole`, `authorityNamespace`, `authorityOccurrenceId`, `evidenceRefs` and `adjudicatedBy`. These are contract guards only: a subsequent work package must verify registry custody, reviewer approval and authoritative issuer scope. A `verified: true` claim inside an RSS item is **never** accepted as evidence by this module. Without a binding, records remain unmerged. A contradictory session binding is REVIEW, not a merge.

Canonical IDs are based on the bound authority namespace and immutable native occurrence key, **not** mutable title/date or collector ordering. The ledger carries source aliases and evidence digests, retains unobserved prior records as historical entries for later lifecycle policy, and emits redirect *proposals* rather than rewriting Planner state automatically. Cancellation is sticky pending separately verified reinstatement rules.

## Known limitations intentionally blocking live integration

- The earlier 15 workshop variants remain distinct without an independently verified November organizer session ID. That is a safe *non-merge*, not a completed dedup fix.
- The first resolver does not fetch original organizer/authority sources or validate curator permissions. It assumes supplied bindings are external and therefore MUST NOT accept unreviewed feed-supplied bindings in a live pipeline.
- Source aliases with contradictory explicit slots reject input without verified revision custody; the remaining revision/cancellation authority model must be formalized before publication.
- There is no bounded persistent ledger, purge, lifetime migration implementation, source-retention integration, JS/Planner wiring, production change, or browser verification in this PR slice.
- `semanticDigest` is a source-level comparator, not a signed publication certificate. Source changes may change its value while canonical identity remains stable.
- Concurrency, immutable receipts, archive caps, failed-source re-acquisition and publisher/edge parity require separate end-to-end gates.

## Mandatory regression and opposite cases

1. Three source titles for one **externally confirmed** organizer session → one canonical ID, three source aliases; the same three unconfirmed article variants → three `UNVERIFIED` identities until evidence arrives.
2. Same venue, date and time but *different* program or session ID → distinct or REVIEW, never a silent merge.
3. Source-order permutation and identical source revisions → bitwise-identical semantic results.
4. Source-derived claims containing `verified` or `occurrenceId` do not elevate themselves to occurrence authority.
5. Same authoritative source occurrence is rescheduled → ID preserved and original first-visible clock unchanged; cancellation tombstone cannot be undone by older source.
6. Original unbound source alias is later verified → emits explicit migration proposal; never automatically rewrites a user plan.
7. Cross-category identical authority ID never merges; invalid ledger schema fails closed.

## Commands

From repository root:

```bash
python -m unittest discover -s scripts -p 'test_upahead_identity_v2_shadow.py' -v
```

Run the existing UpAhead retention / JS / browser suites at the exact PR head before any further integration. Record actual source and browser receipts instead of treating this source-unit pass as product acceptance.


## P-CF — Cloudflare UpAhead serving plane (MANDATORY, before release)
**Status:** NOT_IMPLEMENTED for v2; current Worker code exists, production activation remains UNVERIFIED. This is part of issue #200, not a separate untracked WBS. Cross-reference existing operational-only [#107](https://github.com/reallakshman19/NWv-7/issues/107), which must not be re-scoped by this work.

### Actual source-first baseline
- `cloudflare/upahead-dataset-api/src/index.js` serves `GET /api/datasets/upAhead`; `UP_AHEAD_DATASET_URL` fetches the static GitHub Pages publication per request. This is an **HTTP proxy**, not an independent UpAhead occurrence publisher, nor an R2/KV/D1 durable store. Existing Worker responds with `X-NW-UpAhead-Source/Reason/Freshness/Age-Seconds`, CORS and no-cache.
- A 12-hour header freshness classification uses the upstream `fetchedAt`/`lastUpdated` timestamp, **not** proof of verified expiry, occurrence membership or current authoritative generation.
- On upstream timeout/bad JSON/invalid shape the Worker returns a syntactically valid **HTTP 200 empty fallback**, and the dataset client may next use static/retained data. Invariant: an empty fallback must never masquerade as a verified-zero canonical dataset.
- `src/data/datasets/upAheadDatasetApiClient.js`, `upAheadDataset.js`, `upAheadProviderPolicy.js` decide Worker vs cache/static. Current source-selection may merge historical source rows unless bounded by a generation/alias-aware manifest. `VITE_API_BASE_URL` is optional, configuration-dependent. Deployed Worker URL, Cloudflare deployment/activation and real browser consumption have not been authenticated/observed here.

### Target design
**GitHub producer remains canonical occurrence authority; Cloudflare becomes an identity-preserving distribution and verification layer, not a second fuzzy-dedup engine.**
1. **Versioned immutable publication:** publisher emits a release manifest with `schemaVersion`, `generationId`, `sourceCommit`, `retentionPolicyVersion`, `identityVersion`, `ledgerVersion`, `observedAt`, `publishedAt`, `semanticDigest`, `recordCounts` and accepted expiry/cancellation state. Digest covers canonical entries, aliases, revision/cancellation state, not just fetchedAt/number of rows. Producer retains immutable generation payload to permit rollback.
2. **Cloudflare edge verification:** Worker validates manifest+payload, coherence of generation and digest, canonical identity uniqueness, expiry/cancellation constraints and bounded source freshness; return exact accepted-generation metadata to the browser. Reject mismatched/partially published/invalid generations, never return false 'fresh' from a recent fetch of old data.
3. **Atomic authority / fallback:** atomic current-generation pointer owned by producer after publication checks. Choose an immutable manifest+asset-on-Pages design first (free existing infrastructure); optional **Cloudflare R2 last-known-good immutable objects** only after cost/quota/credential/operator approval. Never silently introduce KV/D1/R2 or change serving authority. `Cache-Control: no-cache` alone is not version coherency.
4. **Failure semantics:** differentiate `VALID`, `STALE_VALID`, `INVALID`, `UPSTREAM_UNAVAILABLE`, `VERIFIED_EMPTY`, `NOT_CONFIGURED`. Return 503 (or explicit non-usable state) for unverified fallback, not an ordinary success dataset; preserve last independently verified generation only within validity boundaries, without reviving expired or cancelled items.
5. **Frontend gating:** `upAheadDatasetApiClient` and `upAheadDataset` validate generation and source metadata before selecting/merging API, Pages and cache. Never combine records from incompatible generations as if one authoritative snapshot; saved Planner aliases resolve via the canonical ledger and cancelled IDs stay retired. Declare one serving authority per request, keep provenance for fallback.
6. **Activation/rollback:** reuse #107 readiness and smoke harness, confirm real `VITE_API_BASE_URL` is configured in actual Pages build if edge mode intended. No live Worker host/secrets recorded in GitHub. Rollback to source-hash pinned Pages publication, not arbitrary older cache.

### Mandatory Cloudflare proof cases
- Same immutable generation from GitHub Pages, Worker, browser cache and service selection => identical canonical IDs, supported aliases, per-category counts, tombstones and semantic digest.
- Newer generation updates a rescheduled occurrence across all surfaces; old cache and older Worker results cannot reintroduce duplicate source aliases or cancel a tombstone.
- Upstream timeout, HTTP errors, invalid JSON, missing/downgraded identity manifest, digest mismatch, torn two-file publication, stale `fetchedAt`, partial category availability and verified zero each produce distinct safe states.
- Worker returns the correct generation headers and avoids false success for empty fallback.
- Two real consecutive publication cycles + deployed Worker smoke and browser DOM/source receipts, desktop/mobile and Planner reopen; include Worker-disabled static fallback.
- 100, 1000 and policy-cap performance and free-tier CPU/request/response size budget. Verify no expensive per-request re-dedup or mandatory paid dependency.
- **NO-GO** on any mismatched generation, false merge, resurrection, Planner alias loss, source integrity failure or unverified Cloudflare activation claim.

### PR sequencing
- **PR-A / present PR #201:** append verified edge inventory and *shadow-only manifest/parity test*, no live Worker behavior changes.
- **PR-B/C:** implement publisher immutable publication manifest and ledger, then Workers edge validation/error semantics with paired failing-negative tests.
- **PR-D:** integrate frontend generation-aware provider policy and Planner state migrations.
- **PR-E:** real Pages↔Worker↔browser parity, health diagnostics, rollback and live activation evidence. Deployment of Cloudflare account resources requires separate explicit approval.
