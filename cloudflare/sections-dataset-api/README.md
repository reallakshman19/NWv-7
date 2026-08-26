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

A source epoch can leave partial evidence and STAGED rows for RCA. Those rows are never current. Publication requires:

```text
run state = COMPLETE
snapshot state = STAGED
observed distinct sections = expected_section_count
observed item rows = expected_item_count
persisted row digest = expected_item_rows_digest
```

The final D1 transaction performs both guarded operations together:

```text
STAGED snapshot -> COMMITTED
current_snapshot_pointer -> that COMMITTED snapshot
```

The migration also installs database triggers that reject any pointer insert/update to a non-COMMITTED snapshot and make COMMITTED item rows immutable.

Therefore an interrupted S101 at 7/10 sections and 201/284 rows remains RCA evidence only; if S100 was current, reads continue to return S100.

## Shared ranking authority

`src/replayExecutor.js` imports the merged PR-A frozen-input/evaluator/registry contracts and production Top Stories ranker. The Worker does not copy ranking weights, event regexes, source aliases, admission thresholds or the 41-feed registry.

The Worker compatibility date is 2026-08-26. Cloudflare enables supported Node.js APIs by default for compatibility dates on or after 2026-08-04, so the shared `node:crypto` SHA-256 helper is usable without a copied Worker-specific digest implementation.

## Phase boundary

PR-B intentionally does **not** implement independent live 41-lane acquisition. PR-C owns acquisition sharding, source-health dispositions and live parity. No Cron trigger is configured here.
