# NW-OPS-002 — Sections Worker current-epoch stall: read-only triage

## Confirmed evidence, not a root-cause claim

Public-source GitHub Actions probe (2026-10-19 07:36:52 UTC):
https://github.com/reallakshman19/NWv-7/actions/runs/39216612994

- Worker `GET /health`: responded `status=ok` with
  `previewReadEnabled=true`, `shadowScheduleEnabled=true`,
  `liveAcquisitionEnabled=true`. These are *configuration flags*, not
  proof that Cron events or Queue messages are being delivered.
- `GET /preview/sections/latest`: HTTP 200, verified current epoch
  `live-1791572400000`, `fetchedAt=2026-10-09T19:00:00.000Z`,
  **13,717 minutes old**, 30 stored World stories, **zero fresh World**.
- GitHub Pages fallback: `fetchedAt=2026-07-21T18:14:10.918Z`;
  30 stored World stories, **zero fresh World**.
- This is an operational data freshness **FAIL**. It does not establish that
  the current deployed Worker uses the same `wrangler.jsonc` contents as
  GitHub main, nor whether Cron, Queue, D1, upstream providers, or commit
  finalization is the failing stage.

Do not claim that `/health: ok` demonstrates a functioning producer.
Do not rewrite `fetchedAt`, loosen publishedAt age windows, move the
D1 current pointer to a noncommitted epoch, or fabricate feed items.

## Operator access and safety preconditions

Requires a Cloudflare account operator with READ permission to Worker
deployments/logs, Queues/DLQ and the Worker-bound D1 database. These tools
are **not connected** in this audit; commands below are **NOT_RUN**.

Use the real ignored account-specific `wrangler.local.jsonc` (per
`cloudflare/sections-shadow/README.md`) from within
`cloudflare/sections-shadow/`. The tracked `wrangler.jsonc` contains a
placeholder D1 ID and is not sufficient for remote inspection.

- Check the deployed Worker version and environment variables against the
  **approved release SHA** and note if the deployed config differs.
- Verify the actual deployed Cron trigger `0 * * * *`; observe last 10
  schedule invocations, execution outcome and error code. An enabled
  `SHADOW_SCHEDULE_ENABLED` flag alone does not prove a trigger exists.
- Verify Queue `nw-sections-shadow` has an active consumer bound to the
  expected Worker, inspect incoming/delivered/retried messages and the
  `nw-sections-shadow-dlq` dead-letter count. Do not dequeue/replay them
  during diagnosis.
- Inspect Cloudflare Worker logs for `Sections shadow scheduled event`,
  `LIVE_EPOCH_ENQUEUED`, `Sections shadow epoch paused`,
  `Sections shadow replay failed`, quota and D1 errors. Record timestamp,
  invocation and error code; redact credentials.

## D1 queries — strictly SELECT, non-mutating

From `cloudflare/sections-shadow/`, with an authenticated **read-only**
operator credential and a verified local Wrangler config:

```bash
npx wrangler d1 execute nw-sections-shadow --remote \
  -c wrangler.local.jsonc \
  --command "SELECT epoch_id, state, acquisition_mode, logical_slot,
    expected_lane_count, terminal_lane_count, evidence_verified,
    expected_decision_count, actual_decision_count, failure_code,
    created_at_ms, sealed_at_ms, committed_at_ms
    FROM sections_shadow_epochs
    ORDER BY logical_slot DESC, attempt DESC LIMIT 30"
```

```bash
npx wrangler d1 execute nw-sections-shadow --remote \
  -c wrangler.local.jsonc \
  --command "SELECT dataset_key, epoch_id, logical_slot,
    generation, updated_at_ms
    FROM sections_shadow_current_pointer"
```

```bash
npx wrangler d1 execute nw-sections-shadow --remote \
  -c wrangler.local.jsonc \
  --command "SELECT day_key, epochs_started, blocked_starts,
    queue_operations_estimate, d1_reads_estimate, d1_writes_estimate,
    worker_invocations_estimate, updated_at_ms
    FROM sections_shadow_quota_daily
    ORDER BY day_key DESC LIMIT 14"
```

If the newest epochs are STAGED but incomplete, inspect which lanes
actually reached terminal evidence (do not dump payload JSON or source URLs):

```bash
npx wrangler d1 execute nw-sections-shadow --remote \
  -c wrangler.local.jsonc \
  --command "SELECT e.epoch_id, e.logical_slot, e.state,
    e.terminal_lane_count, e.expected_lane_count,
    COUNT(l.lane_id) AS saved_lanes,
    SUM(CASE WHEN l.disposition = 'OK' THEN 1 ELSE 0 END) AS ok_lanes,
    SUM(CASE WHEN l.disposition != 'OK' THEN 1 ELSE 0 END) AS other_lanes
    FROM sections_shadow_epochs e
    LEFT JOIN sections_shadow_lane_evidence l ON l.epoch_id = e.epoch_id
    WHERE e.acquisition_mode = 'INDEPENDENT_LIVE'
    GROUP BY e.epoch_id
    ORDER BY e.logical_slot DESC LIMIT 15"
```

For a **specific independently selected** stalled epoch ID, examine
bounded failure categories; do not expose feed URL, sensitive headers, or
body data:

```bash
npx wrangler d1 execute nw-sections-shadow --remote \
  -c wrangler.local.jsonc \
  --command "SELECT lane_id, section_key, source_group, disposition,
    item_count, http_status, error_code, attempt_count
    FROM sections_shadow_lane_evidence
    WHERE epoch_id = 'OPERATOR_VERIFIED_EPOCH_ID'
    ORDER BY lane_id LIMIT 41"
```

## Decision matrix (no guessed causes)

| Grounded observation | Interpretation / next read-only action |
| --- | --- |
| No recent epochs at all | Verify Cron delivery, deployed binding/flag, D1 access, Queue send, and daily admission failures; flag status is insufficient |
| New STAGED epochs with 0 lanes | Verify Queue producer/consumer association, batch enqueue and DLQ; look for dispatch/start errors |
| STAGED with 1–40 of 41 terminal lanes | Identify absent lane(s) from registry; examine retry/DLQ and D1 payload-stage failures; do **not** mark missing lanes OK |
| STAGED 41/41 but no committed pointer update | Examine finalizer Queue delivery, decision evidence, D1 storage cap and seal errors; no forced commit |
| SEALED without commit | Inspect pointer ordering / D1 commit errors and `OUT_OF_ORDER_EPOCH` without relaxing atomicity |
| New ABORTED/REJECTED | Read actual `failure_code` and operator logs; do not reclassify as committed |
| New SHADOW_COMMITTED but pointer still old | Inspect current-pointer DB read/transaction evidence and deployment/database binding mismatch |
| Quota `blocked_starts` increasing | Identify which conservative Free Tier resource bound was reached; do not increase limits blind |
| Recent committed preview but 0 current World | Investigate actual source lanes, published timestamps and source-family evidence; do not invent stories |

### Recovery rules

1. Preserve the last verified committed D1 epoch and audit evidence.
2. Fix only the observed failing infrastructure or runtime code path after
   independent review. Do not bypass the 41/41 terminal-lane requirement.
3. Run an *authorized* canary epoch and require 41/41 immutable terminal
   evidence, current `SHADOW_COMMITTED` pointer advancement, verified
   data-source digest and fresh World publisher evidence.
4. Check fresh `/preview/sections/latest` (HTTP 200, `fetchedAt` within
   the existing age window) and Pages Static/Hybrid browser rendering.
5. Keep separate issue #141 for the dormant/stale GitHub fallback producer.
   A recovered Worker **does not** repair the GitHub fallback or eliminate
   that failure mode.
6. Record exact deployment SHA, actual Cron/Queue/D1 traces, operator
   approval and rollback. Until then: **BLOCKED / NOT VERIFIED**.

Related: #138, #141, #143, #144. Production write/deploy: **NOT_RUN**.
