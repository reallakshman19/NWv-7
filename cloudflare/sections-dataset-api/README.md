# Cloudflare Sections shadow API

Issue #493 Phase B adds an **independent shadow-only** Cloudflare boundary for Sections/Top Stories.

## Authority state

```text
Production browser serving = /newsdata/sections_latest.json (unchanged)
Cloudflare Sections         = SHADOW ONLY
Public write API            = NONE
Live acquisition            = disabled in PR-B
D1 database                 = nw-sections-shadow (independent)
```

The Worker exposes only read-side engineering endpoints:

```text
GET /api/shadow/sections/latest
GET /api/shadow/sections/<section>
GET /api/shadow/parity/latest
OPTIONS ...
```

`POST`, `PUT`, `PATCH` and `DELETE` are not write controls; they return method-not-allowed.

## Atomic publication invariant

A source epoch can leave partial evidence and STAGED rows for RCA. Those rows are never current. Empty qualified sections are represented explicitly by `section_snapshot_partitions`; section cardinality is never inferred from the presence of item rows.

Publication uses a two-step fail-closed state machine:

```text
STAGED  -- exact run/partition/item cardinality -->  SEALED
SEALED  -- immutable digest verification --> COMMITTED + pointer (one D1 batch)
```

Only STAGED partitions/items are writable. SEALED rows are invisible to current reads and immutable, eliminating the digest TOCTOU window. After sealing, the Worker recomputes the persisted partition and item-row digests. Only exact matches can enter the final transactional D1 batch that performs both:

```text
SEALED snapshot -> COMMITTED
current_snapshot_pointer -> that COMMITTED snapshot
```

Database triggers independently reject direct STAGED→COMMITTED transitions, reject pointer writes to non-COMMITTED snapshots, require complete run/partition/item cardinality for seal/commit, and reject partition/item mutation once a snapshot leaves STAGED.

Therefore an interrupted S101 at 7/10 partitions and 201/284 rows remains STAGED RCA evidence; if S100 was current, reads continue to return S100. A crash after sealing leaves an immutable/invisible SEALED S101 that the same logical retry can safely resume through digest verification and final commit.

## Shared ranking authority

`src/replayExecutor.js` imports the merged PR-A frozen-input/evaluator/registry contracts and production Top Stories ranker. The Worker does not copy ranking weights, event regexes, source aliases, admission thresholds or the 41-feed registry.

The Worker compatibility date is 2026-08-26. Cloudflare enables supported Node.js APIs by default for compatibility dates on or after 2026-08-04, so the shared `node:crypto` SHA-256 helper is usable without a copied Worker-specific digest implementation.

## Phase boundary

PR-B intentionally does **not** implement independent live 41-lane acquisition. PR-C owns acquisition sharding, source-health dispositions and live parity. No Cron trigger is configured here.
