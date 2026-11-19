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
- The local repair candidate schedules qualification acquisition every three hours while keeping
  Cloudflare primary serving disabled.
- Exposes only the verified current `SHADOW_COMMITTED` live epoch through the
  public, GET-only `/preview/sections/latest` projection. Staged, sealed,
  rejected, aborted, frozen-replay, and incomplete epochs remain invisible.

## Free-plan operating envelope

One full 41-lane epoch reserves conservative worst-case capacity before it is
staged:

| Resource | Reservation per epoch | Daily internal ceiling | 8 epochs/day |
| --- | ---: | ---: | ---: |
| Queue operations | 600 | 8,000 | 4,800 plus maintenance |
| D1 rows read | 25,000 | 4,000,000 | 200,000 plus 200,000 for cleanup |
| D1 writes | 3,500 | 80,000 | 28,000 plus 48,000 for cleanup |
| Worker invocations | 180 | 80,000 | 1,440 plus maintenance |
| Browser Run time | 20 seconds | 480,000 ms | At most 160,000 ms reserved |

Queue reservations include the coordinator, 41 lane jobs, finalization, and
bounded transient retries. Identical decision retries perform no row rewrite;
persisted content is still compared to detect conflicts. Large decision batches
use UTF-8-aware, one-megabyte bound strings in one atomic D1 transaction.
The ceilings are deliberately below the corresponding Cloudflare Free limits.
New epochs stop at 450 MB of reported D1 storage and the existing 350 MB
limit on retained JSON includes payloads, normalized snapshots and ranking
decisions. Migration 0006 backfills a storage ledger once; transactional SQL
triggers maintain it on insert, update and delete. Admission then reads one
ledger row instead of scanning every retained payload for every feed. The
database trigger also enforces the hard 350 MB body ceiling for concurrent writers.
The three-hour cron queues cleanup under the same daily quota as acquisition.
Each run reserves 6,000 estimated D1 writes, including ledger and index writes, and removes expired history in
bounded batches. It expires abandoned incomplete epochs after 36 hours and
retains seven days of history plus the current published epoch. The current
epoch's lane payloads can be needed to serve its snapshot. Live feed bodies
are streamed through a 500 KB acquisition limit. D1 retains up to 20
normalized items and 60 KB per lane, 1 MB per normalized snapshot, and
64 KB per decision row.

Apply migrations 0005 and 0006 before deploying this Worker version.
An existing backlog drains over multiple days. Check D1's reported size
after cleanup. If the database still reports 450 MB or more, new acquisition
stays paused and a compact copy that preserves the current snapshot must be
verified before changing the binding.
The browser-assisted path has a stricter application ceiling of eight minutes
per UTC day against the provider's ten-minute Free allowance. It transfers at
most 20 entries per Google lane from the browser, and only the bounded title,
summary, URL, and publication-time fields. Its maximum qualifying cadence is
every three hours, so 200 comparable browser-assisted epochs require at least 25 days.
They protect this workload but cannot observe usage by unrelated Workers in the
same Cloudflare account. Account-level usage alerts remain required.
Environment values can reduce these ceilings, but cannot increase them.
The eight epoch and cleanup reservations total 76,000 writes per UTC day, below
the 80,000 internal limit. Retries and manual maintenance consume that same
ledger and can stop further work. These are conservative estimates, not account
usage measurements or a guarantee of provider availability.

The authenticated status route reports publication age and storage; public
`/health` explicitly reports configuration only. Neither a healthy configuration
nor a local replay certifies a current production snapshot.

### Production recovery verified on 18 November 2026

The original database rejected the migration with Cloudflare error 7500,
`Exceeded maximum DB size`. Its reported size was 542,056,448 bytes. A verified
copy of the retained seven-day data and protected current epoch was restored to
a new Free-plan D1 database before changing the Worker binding. All retained
row hashes, 941 original body digests, foreign keys and storage accounting were
checked independently after the remote restore. Migrations 0005/0006 applied
successfully to that copy. Acquisition counters were carried forward, with
additional conservative reservations for the account read budget and copy.

Worker version `9451cc0c-9dbc-4b8c-b381-30dcf2484395` now uses the compact
database. Queue delivery is resumed, the three-hour cron and eight-epoch daily
ceiling are active, and Browser Run fallback remains disabled. A new live epoch
committed at slot `2026-11-18T12:00:00Z`, advancing the pointer from generation
840 to 841 with 41 terminal lanes and 228 decisions. Twenty-two lanes succeeded;
sixteen returned HTTP errors and three returned parse errors. A committed epoch
does not imply that every upstream feed is healthy.

One bounded retention run removed 128 expired raw payloads and marked 32
abandoned epochs. The protected pointer survived, the active database has zero
epochs outside seven days, and its usage ledger matches the independently
measured 7,559,518 JSON bytes. D1 reports 8,916,992 database bytes. After separate
explicit Owner approval, the retired 542 MB database was permanently deleted
on 18 November at 13:24 UTC. The native account list confirmed its absence and
the active replacement's presence; public health and the fresh snapshot passed
again with unchanged content. Verified local current/seven-day exports remain
available for recovery. Do not rebind to the deleted original database. Local
deployment configuration points at the verified replacement, while tracked
configuration keeps its placeholder.

Public health and the committed preview passed real HTTP checks. The published
Main page displayed active Cloudflare authority and loaded stories in both
Hybrid and Live. Fallback/source warnings remain, and Insight still reports
degraded quality. This backend rollout does not certify the separate frontend
audit candidate or Insight's editorial quality floor.

### Production repair sequence

The read-only check on 18 November found 542 MB reported D1 storage, 70,463,175
payload bytes, 228,924 decision rows and 41,599 lane-evidence rows. Installed
migrations stopped at 0004. The served pointer was still 16 November noon UTC.
The subsequent Wrangler migration returned native Cloudflare error 7500,
confirming that the original database had exceeded its size limit.

1. Reconfirm usage, current pointer, deployed version and migration list. Save a
   local verified export of the current epoch and its required child rows before
   deleting expired history. The export must preserve its original digests.
2. Apply 0005 then 0006 with acquisition paused for the change. Backfilling the
   ledger scans the existing JSON once; budget its observed reads/writes.
   If Cloudflare rejects writes with size error 7500, prepare and verify the
   bounded copy in step 5 first, then apply the migrations on that copy. Do not
   repeatedly retry writes against the full database.
3. Deploy the tested candidate with three-hour cron, eight-epoch ceiling and
   browser fallback disabled. Preserve the existing Queue identifier and set
   the verified database binding in ignored local configuration. No paid plan
   or resource upgrade is needed.
4. Queue one `PRUNE_HISTORY` message at a time, reserving 6,000 writes per batch.
   Check actual Cloudflare account usage as well as the application ledger;
   stop before either free limit or the internal ceiling. Expired history is
   deleted, but current-pointer and recent sealed evidence remain protected.
5. Recheck database size. If it remains at or above 450 MB, acquisition stays
   paused. Prepare a fresh D1 copy of the retained/current data, compare native
   row counts and content digests, then switch the binding only after that copy
   is verified. Keep the original database for rollback until a separate explicit
   retirement decision. Do not delete the source during copy verification.
6. Dispatch one new live epoch. Require 41 terminal lanes, verified committed
   evidence, a forward-moving pointer and snapshot age below twelve hours.
   Finally verify the deployed app in Hybrid/Live and recheck expired rows.

This sequence changes production and deletes expired history. The completed
rollout above has its own Owner approval and native receipts; this runbook does
not authorize future production changes or deletion of the rollback database.

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

The original PR-A frozen fixture remains unchanged. Its v1 hash predates the
audited publisher identity and classifier policies. The bundled local replay
uses separate, versioned audited-v2 expectations: the Reuters URL and its TOI
wrapper count as one publisher, with zero independent corroboration. Original
selected story order and date-boundary assertions remain pinned. This is a
Coder reconciliation of reference output, not independent editorial review.

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
npx wrangler d1 migrations apply SHADOW_DB --remote -c wrangler.local.jsonc
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

## Historical deployment and qualification receipt · August 2026

This section preserves the earlier qualification evidence. It does not describe
the current production freshness or approve the repair sequence above.

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
