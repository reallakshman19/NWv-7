# NW Sections Cloudflare shadow

This package implements the PR-B/PR-C boundary for `S1_GITHUB_PRIMARY_CF_SHADOW`.
It is an isolated Cloudflare Worker, Queue, and D1 database. D1 is the only
persistent data service, so the shadow does not require an R2 subscription.
It does not publish to `/newsdata/sections_latest.json` and has no HTTP write
route. GitHub/static remains the default browser source. A user may explicitly
select the read-only Cloudflare Preview, which automatically falls back to the
GitHub/static snapshot on failure or stale evidence.

## Implemented guarantees

- Imports the repository's executable source registry, identity, normalization,
  classification, admission, ranking, and selection authorities.
- Replays the frozen PR-A benchmark with the exact decision digest
  `74a012724be58b1c834c88f699d0627eb3e82a2d24721a279ca70e6eff429fe2`.
- Requires one terminal disposition for all 41 source lanes.
- Uses `STAGED -> SEALED -> SHADOW_COMMITTED`; incomplete epochs are invisible.
- Stores normalized evidence as immutable, content-addressed D1 rows and
  verifies the stored digest before sealing.
- Couples the final commit and `sections_shadow_current_pointer` update in one
  D1 transaction.
- Rejects delayed epochs that would move the pointer backwards.
- Makes queue retries idempotent and rejects changed retry evidence.
- Stops admitting epochs when the conservative Free-plan envelope is full.
- Acquires each registered feed independently, records a bounded normalized lane
  payload in D1, and finalizes only after all 41 lanes terminate.
- Staggers Google News lanes, limits Queue concurrency, and permits one bounded
  retry for transient HTTP responses without hiding the final disposition.
- Provides a qualification-only Browser Run transport for the 11 Google News
  lanes, guarded to `news.google.com`, with a separate D1 quota ledger and
  bounded 20-item field extraction.
- Runs the explicitly authorized qualification acquisition hourly while keeping
  Cloudflare primary serving disabled.
- Exposes only the verified current `SHADOW_COMMITTED` live epoch through the
  public, GET-only `/preview/sections/latest` projection. Staged, sealed,
  rejected, aborted, frozen-replay, and incomplete epochs remain invisible.

## Free-plan operating envelope

One full 41-lane epoch reserves conservative worst-case capacity before it is
staged:

| Resource | Reservation per epoch | Daily internal ceiling | 48 epochs/day |
| --- | ---: | ---: | ---: |
| Queue operations | 160 | 8,000 | 7,680 |
| D1 rows read | 3,500 | 4,000,000 | 168,000 |
| D1 writes | 600 | 80,000 | 28,800 |
| Worker invocations | 60 | 80,000 | 2,880 |
| Browser Run time | 20 seconds | 480,000 ms | 24 browser-assisted epochs/day |

Queue reservations include the coordinator, 41 lane jobs, finalization, and
bounded transient retries.
The ceilings are deliberately below the corresponding Cloudflare Free limits.
The D1 database reserves at most 350 MB for normalized evidence, leaving about
150 MB of the Free plan's 500 MB per-database maximum for tables, indexes, and
operational headroom. Each normalized evidence object is capped at 1 MB and
each decision-evidence row at 64 KB. Expired evidence is pruned before a new
epoch starts, except for the current committed epoch. Live feed bodies are
streamed through a 500 KB acquisition limit; D1 retains at most 20 normalized
items and 60 KB per lane, never an unbounded feed payload.
The browser-assisted path has a stricter application ceiling of eight minutes
per UTC day against the provider's ten-minute Free allowance. It transfers at
most 20 entries per Google lane from the browser, and only the bounded title,
summary, URL, and publication-time fields. Its maximum qualifying cadence is
hourly, so 200 comparable browser-assisted epochs require at least nine days.
They protect this workload but cannot observe usage by unrelated Workers in the
same Cloudflare account. Account-level usage alerts remain required.

If a reservation would cross a ceiling, the Worker records
`FREE_TIER_CAPACITY_EXHAUSTED` or `FREE_TIER_STORAGE_CAPACITY_EXHAUSTED`,
acknowledges the control message, creates no partial epoch, and leaves the last
committed shadow pointer unchanged.

## Local certification

From this directory:

```text
npm install
npm run check
```

The check runs TypeScript validation, Worker-runtime tests with a real local D1
binding, and a Wrangler deployment dry run.

## Cloudflare resource setup

Resource creation is intentionally separate from repository implementation.
Use a dedicated Cloudflare account/project boundary where practical.

```text
npx wrangler d1 create nw-sections-shadow
npx wrangler queues create nw-sections-shadow
npx wrangler queues create nw-sections-shadow-dlq
```

Keep the real database identifier in ignored `wrangler.local.jsonc`; leave the
tracked placeholder unchanged. Do not commit account credentials. Then apply
migrations, certify, and deploy with the local deployment configuration:

```text
npx wrangler d1 migrations apply nw-sections-shadow --remote -c wrangler.local.jsonc
npm run check
npx wrangler deploy -c wrangler.local.jsonc
```

`SHADOW_READ_TOKEN` is optional until an operator status route is attached. If
used, configure it as a Worker secret; never put it in either Wrangler file.

The explicitly labelled browser Preview is deployed on `workers.dev`.
`GET /preview/sections/latest` returns a browser-compatible projection of the
verified current live epoch with public-read CORS and a five-minute cache
policy. `GET /internal/shadow/status` still requires the bearer secret. There
is no HTTP write route.

## Running controlled Cloudflare replays

The replay is triggered through Cloudflare's authenticated Queue control plane,
not through the application Worker. Push this JSON message to the
`nw-sections-shadow` queue, or use Wrangler's remote scheduled-test endpoint
with both schedule and frozen-replay trigger variables enabled for that test
session only:

```json
{
  "body": {
    "type": "RUN_FROZEN_REPLAY",
    "epochId": "frozen-2026-08-26-001",
    "logicalSlot": 1787702400000,
    "attempt": 1
  },
  "content_type": "json"
}
```

Use a token limited to `Queues Write` and the Cloudflare endpoint documented at
<https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/push/>.

For a live epoch, send `START_LIVE_EPOCH` with a unique `live-*` epoch ID and
use the same millisecond value for `logicalSlot` in the repository reference
runner:

```text
npm run sections:reference:live -- --now-ms <logicalSlot> --output <reference.json>
npm run sections:parity:remote -- --reference <reference.json> --epoch-id <epochId>
```

Store parity reports in a dedicated evidence directory. The readiness command
fails until every qualification gate is met:

```text
npm run sections:qualification -- --input-dir <parity-report-directory> --output <readiness.json>
```

## Deliberately absent in S1

- Any schedule faster than the hourly, fail-closed qualification cadence.
- Default Cloudflare reads or production-authority traffic.
- Automatic promotion to a later deployment state.
- Reuse of Daily Digest or Up Ahead databases.

The browser toggle is an explicit user-selected Preview. It does not represent
qualification, promotion, or a change to the saved default authority.

## Current deployment status

The dedicated D1 database, producer Queue, consumer Queue, and dead-letter
Queue are provisioned. Migrations `0001` through `0004` are applied, and the Worker
is deployed with Queue triggers plus the explicitly authorized hourly
qualification trigger. Live acquisition and the budgeted Browser Run transport
are enabled only for shadow evidence; frozen-test dispatch and every browser
write path remain disabled. The only application read is the explicit,
GET-only Cloudflare Preview projection.

The first remote frozen replay committed successfully with 41/41 terminal
lanes, 18/18 decision records, verified immutable D1 evidence, and decision
digest `74a012724be58b1c834c88f699d0627eb3e82a2d24721a279ca70e6eff429fe2`.
Two controlled independent live epochs have also committed with 41/41 terminal
lanes and verified D1 evidence. Their parity is correctly classified as
`ACQUISITION_DRIFT`; Google News returns HTTP 503 from standard Worker fetches,
while the latest standard-fetch Top Stories overlap is 8/9. A separate,
controlled Browser Run probe completed 41/41 lanes, achieved 9/9 displayed
Top Stories overlap, 100% reference coverage and precision, recorded zero
safety violations, and consumed 12.759 browser seconds against a 20-second
reservation. This proves feasibility on one sample; it does not qualify or
promote browser serving.

A second controlled epoch confirmed the hardened extraction boundary with
41/41 lanes, 273 verified candidates, 31 healthy shadow lanes, 8/9 displayed
overlap, zero safety violations, and 6.639 additional browser seconds. The
hourly qualification window is now active, paired with an independent local
repository observer that writes parity reports and recalculates readiness. The
current aggregate is 6/200 comparable epochs across two calendar days, with
85.19% aggregate coverage, precision, and Top-10 overlap. It remains
`NOT_QUALIFIED`.
