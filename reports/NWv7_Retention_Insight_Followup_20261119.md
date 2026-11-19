# Up Ahead retention and Insight publication repair — 19 November 2026

Implementation/reproduction by the current Coder; this is author verification,
not independent acceptance. Base main: `077c1e5cbb25336d537076b50d8ee9509371e002`.
Branch: `fix/upahead-retention-followup-20261119`. No Worker deployment, database
mutation, migration, queue dispatch, merge or production acceptance is claimed.

## Up Ahead correction

The publisher previously discarded a dated event outside its seven-day visible
window. Its original announcement was then outside the seven-day acquisition
lookback when the event became relevant. `pendingItems` now preserves source-dated
future occurrences separately from `items`. The browser retains that pool and
projects its calendar view independently. A fixed-clock thirty-day announcement
survives twenty-four days without rediscovery, enters the visible week and is
removed at its exact end. Source publication/fetch clocks are preserved.

New admission limits are180days ahead,500pending rows and1,000,000serialized
bytes. The nearest admissible occurrences win under overflow; rejection counts
are reported. These are code defaults, not a newly exposed Settings control.
An admitted occurrence ages toward the view and keeps its finite true deadline;
a reschedule beyond the admission bound is explicitly rejected. The publisher's
rolling seven-day projection and browser's seven calendar days remain separate
projections; no C09 unknown-venue timezone decision is implied.

Revisions are applied before projection/expiry. Seven-day bounded retirement
markers prevent delayed older versions from undoing reschedules or cancellations,
including a browser that never received the cancelled revision. Distinct times,
venues, sessions and declared occurrences survive publisher deduplication.

Clockless legacy feed rows no longer return Infinity. Browser cache maintenance
keeps recoverable copies in a seven-day quarantine, bounded to100rows/256KB,
without inventing publication dates. Duplicate copies do not restart quarantine
age. Cache reads persist safe expiry pruning; storage-write failure preserves
the original bytes. A commit-time custody check avoids overwriting a changed
cache. The independent2026–2027 holiday calendar, explicit personal Planner and
`nw_planner_seed_recovery_v1` are outside automated feed deletion.

## Insight root causes and correction

1. The deployed primary Insight publication was still the July793-story file.
   Its collector had no active refresh workflow. A new three-hour GitHub workflow
   collects free RSS and commits only a qualified publication, with seven-day
   archives/artifacts. It fails safely on no successful acquisition, malformed,
   stale, future-dated, undated or insufficient current input. A concurrent main
   update fails its push rather than overwriting newer work.
2. The dormant collector used local-time `mktime`, fabricated publication time
   when missing, repeated feed requests between slots, retained obsolete story
   fields and advanced failed-slot clocks. It now uses genuine UTC publication
   dates, one bounded request per distinct URL per run, true revision fields,
   original clocks on failure, a36-hour editorial pool,1,000-story/3MB output
   limits and temporal preservation under overflow. Insight health files are
   separate from Sections health.
3. The primary browser path silently capped each time slot at40 and borrowed
   reports into other slots. Its admission pool is now300total, bounded to1,000
   scanned rows, balanced by actual publication window and source group. A large
   markets feed cannot evict every smaller publisher before event analysis.
4. Collector hints replaced named entities/actions with generic topic words and
   angle-label fragments. The browser now extracts actual local NLP entities and
   verbs while retaining genuine collector evidence. Angle labels supply no
   topic/verb identity. Collector headline subjects remain ahead of repeated
   summary reaction words; merely sharing a weather forecast is not a financial
   market reaction.
5. General daily roundups, letters pages and empty share-price trackers could
   become event parents. These wrappers are excluded while dedicated event
   liveblogs and substantive financial reports remain eligible. A diplomatic
   meeting identity rule joins reordered reports naming three actual headline
   actors within36hours, subject to summit-family, venue, labelled-date and
   existing occurrence vetoes. It grants no extra angle or publisher credit.
   Counterexamples retain different summits, countries, dates, actor groups and
   company meetings. Eight related summit reports previously split across three
   top parents now form one event.

## Free-source coverage

Sections registry v3 preserves41lanes across10sections, with18source groups and
17Tier-A configured lanes. Digest:
`eb374f0e6330d3f6ac1d21b2b11387255d70cb834472c9bb1b194e1d7fbe4d2d`.
Original v1 frozen evidence and the v2 repair fixture remain unchanged.

Native public GETs qualified Mint Markets, Indian Express Business/India/Explained,
Al Jazeera and The Hindu Opinion. These replace proven retired/empty feeds or add
actual explanatory coverage, using the real publisher identities. A Google
Reuters search remains labelled Google News; it does not authenticate a wire
origin. Muscat Daily returned403. Google reachability on this native host does
not certify Cloudflare-origin reachability. No paid browser/embedding service was
enabled and no free-tier ceiling was increased.

## Reproducible results and practical limits

Pinned fresh capture:516stories/13source groups/20distinct feed requests,
observed `2026-11-19T05:02:20.172Z`. SHA-256:
`4bd1789c4d0133cb1eeb7a36a884665ce3027636b6933fb36f9d6082d7c1d34e`.
The local `public/newsdata/insight_latest.json` contains these exact acquired bytes;
publication dates were not restamped. Its collector validation is WARN with no
structural/freshness errors. Publisher groups are not proof of independent wire
origins.

On the same pinned input, the prior candidate admitted143eligible stories and
showed1multi-angle parent. The repaired source replay admitted280 and showed5,
with1.7average angles. Its unchanged real-snapshot ratchet is WARN and its core
grade remainsD. The final routed browser, which applies actual runtime settings,
shows279eligible stories,10parents and4multi-angle parents at both1366/390widths.
Do not equate the replay with routed runtime parity or claim current C quality.
The strict historical793-row replay remainsC/PASS under its original clock and
unchanged thresholds. Historical C does not certify live editorial depth.

| Check | Result |
| --- | --- |
| Main app suite, archived benchmark separate |1837passed,0failed,8skipped |
| Publisher regressions |73passed,18subtests passed |
| Strict original793-story benchmark |PASS, C; unchanged240s budget |
| Worker type check and isolated regressions |PASS;43tests |
| Source ESLint and production build |PASS; entry `assets/index-Bdl31J3s.js` |
| Built browser retention |3transitions passed; pending → visible week → exact expiry |
| Built browser Insight |10cards at1366/390;0page exceptions |
| Existing localhost4173 |4served files byte-match verified4174build |

The initial browser harness used a nonexistent `main` selector; a later attempt
overlapped compilation. Those attempts are not application-success evidence. The
final browser run started after build completion, asserted the exact entry hash,
and passed. Initial Worker fan-out regression expected30direct lanes; replacing
Google World with Al Jazeera correctly raises that to31; all41lanes remain.

Private native evidence is retained under
`D:/CodeD/NWv-7/.audit-integration/feed-insight-20261119/` and
`D:/CodeD/NWv-7/.audit-integration/upahead-retention-20261119/`.
The516-row input is pinned by timestamp and hash. Earlier486-row replay results
are intermediate receipts; their mutable collection alias was superseded, so the
pinned516-row before/after comparison is the final reproducible comparison.

## Deployment boundary and remaining work

Read-only D1 checks read7rows and wrote0. The active compact database remains
`e326bd27-c306-4d1d-84d7-07b2ba186421`. Its payload ledger was6,910,805bytes;
this is retained JSON accounting, not physical SQLite size. Latest epochs are
committed at41/41 on registryv1, but an older registryv1 epoch is still STAGED
at0/41. Today's recorded reservation counters show2epochs,1,200queue operations,
100,000D1reads and19,000D1writes, with0blocked starts. These are application
estimates, not whole-account billing telemetry.

Before deploying registryv3, reconcile that unfinished epoch and verify the
current boundary/quota again. Do not mutate the current pointer or repeat the
completed old-database retirement. Current editorial depth, Cloudflare Google
reachability, authenticated wire-origin evidence, remaining A07/A10 cases and
C09 unknown-venue policy remain open. The current D/degraded label is preserved.
