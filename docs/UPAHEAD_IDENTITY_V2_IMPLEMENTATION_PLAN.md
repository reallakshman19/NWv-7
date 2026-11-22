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
