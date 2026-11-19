# Worker feed qualification and Insight intake correction — 19 November 2026

PR #170 follow-up, authored and verified by the current Coder. This is author
verification, not independent acceptance. No production merge, Worker deployment,
D1 mutation, migration or queue dispatch was performed by this continuation.

The Worker source failures and the Insight quality failure had different causes.
Cloudflare could not acquire eleven configured lanes. Insight acquired sufficient
evidence but discarded related reports at a second, 300-story intake limit.
Both have concrete corrections and reproducible evidence below.

## Worker acquisition and rollout boundary

A temporary remote-development Worker executed the actual bounded RSS acquisition
code on Cloudflare. It had no database, queue, browser, cron, secrets or production
route. On registry v3, all ten Google News lanes returned HTTP 503; Muscat Daily
returned HTTP 200 with non-RSS HTML. The other thirty lanes supplied current items.
Native-host HTTP success had therefore been insufficient qualification.

Registry **section-source-policy-v4-direct-publishers** replaces those failing
endpoints with directly qualified publisher feeds. It retains **41 lanes across
ten sections**, with **17 configured source groups and 22 Tier-A lanes**. Digest:
`7436c30294908cbe49f10e3cb03d00c981de9d381b1c572e21eab030f87af774`.
The original frozen v1 authority and the v2/v3 fixtures are preserved.

The final Cloudflare run, completed **2026-11-19T06:25:17.899Z**, returned **41/41
HTTP 200, valid RSS and current items**. The parser retained genuine publication
dates and its existing 36-hour window, 500 KB response and twenty-item limits.
Every section has current input. These are lane counts, not unique-story counts.
The three Oman Observer feeds retain one source group; they do not earn three
publisher identities. Configured groups do not authenticate independent wire
origins. Empty, wrong-city and 404 candidates were rejected before selection.

The registry uses Indian Express, the actual TOI Trichy endpoint, The Arabian
Stories Oman, Oman Observer local feeds, DW, BBC Business and Ars Technica.
Trichy has three lanes; World has five. Publisher domain checks were extended
for the new outlets without changing the canonical identity algorithm or the
original frozen benchmark expectations. Browser fallback remains disabled. Even
an explicitly enabled browser flag spends no browser reservation when the
registry has no Google lanes.

The production read found **ten unfinished registry-v1 epochs**, not just the
single epoch shown by the earlier latest-five query. It also found a fresh,
committed 41/41 epoch and a **9,420,800-byte physical database**. The retained-JSON
ledger was 7,118,335 bytes. These two measurements are different.

Delayed acquisition/finalization messages previously lacked a registry check.
They now validate the immutable registry version/digest, slot and attempt before
source acquisition or evidence processing. Non-staged acquisition is rejected
before network access. Scheduling recovers only matching-registry epochs;
registry-mismatched delayed messages are acknowledged without retry spending.
Old diagnostic epochs and the current pointer are not rewritten by this repair.
The existing preview reader projects the committed epoch's evidence rather than
requiring it to match the next deployment's registry.

The application budgets, three-hour cron, seven-day diagnostic retention,
36-hour raw retention and protected compact D1 binding remain unchanged. At the
read boundary, reservation estimates were 3 epochs, 1,800 queue operations,
150,000 D1 reads and 28,500 D1 writes. Whole-account quota telemetry is UNKNOWN.
The reviewable deployment configuration passed Wrangler dry-run with the compact
binding and unchanged variables. No new migration is needed. The remote probe
process was stopped after qualification; no paid fallback was enabled.

## Insight acquisition, admission and cache

Health backoff had two additional defects: one publisher endpoint could suppress
a different endpoint, and a zero-item result without `lastSuccess` could remain
suppressed indefinitely. Backoff now matches the observed feed URL, uses genuine
collector/merged-health clocks, expires after its existing six hours, and cannot
be extended by missing, invalid or future clocks. Five counterexamples failed
before the correction and pass afterward. The validator also reads the separate
Insight health file; a regression prevents unrelated Sections failure history
from leaking into the Insight quality report. New free DW, Ars Technica and Oman
coverage retains genuine publisher identity, authority and content domain.

The final native capture contains **552 stories from fifteen source groups**, at
**2026-11-19T06:32:29.581Z**, from 22 distinct feed requests. A genuinely empty feed
remained under bounded backoff. No acquisition failed. Capture SHA-256:
`2a10deffd1e6a410203ff505775e1f4fb3fbe29d537f71af37b2efc203ce301d`.
The local review checkout publishes these exact acquired bytes. Publication
timestamps were not restamped. Acquisition validation is **PASS at the original
capture clock**; the report explicitly records that scope. A later strict
publication check correctly found two rows crossing the 36-hour boundary. That
does not authorize restamping the capture; runtime age filters remove them as
time advances. Editorial acceptance is evaluated separately.

On this exact input, the old 300-story admission path produced 275 eligible
stories, **one multi-angle parent, grade D and signal 19**. Diagnostic full-input
execution established that the evidence existed before clustering. The repaired
production path admits the publisher's existing **1,000-story maximum**, with
the same bounded scan, publication slots and source balancing. It produces
**477 eligible stories, ten parents, nine multi-angle parents and grade C** on
the same capture. No quality threshold or benchmark timeout was weakened.
The publisher still bounds output to 1,000 stories/3 MB; this is a code limit,
not a newly exposed Settings control. A separate 300-row Sections fallback is
unchanged and is not certified as equivalent to the richer primary capture.

The Insight result/cache contract is now
`insight-output-contract-v6-complete-bounded-intake`. A prior v5 cache can contain
only the discarded subset; repairing its tree cannot recover missing reports.
The view model evicts that cache and refetches, preserving Planner/recovery keys.
Normal dataset bootstrap need not persist a new result cache.

## Verification and limits

| Check | Result |
| --- | --- |
| Main application suite | 1,847 passed, 0 failed, 8 existing skips |
| Isolated Worker suite | 54 passed; existing timeouts and frozen expectations unchanged |
| Focused publisher/source-health regressions | 38 passed |
| Original 793-record strict benchmark | PASS, C; original clock and 240-second budget |
| Current 552-record strict benchmark | PASS, B under its existing benchmark configuration |
| Normal application configuration | C; 477 source stories and 9 multi-angle parents |
| ESLint, TypeScript, Vite and Worker dry-run | PASS |
| Built Chromium at 1366/390 | 10 cards, 477 source stories, 9 multi-angle parents, signal 54, no page exceptions |
| Retention browser cases | pending → visible week → exact expiry, all three passed |
| Cache/recovery browser checks | old v5 cache evicted; isolated recovery sentinel preserved |

Built entry: **assets/index-qz2aWSF4.js**. The visible browser quality title is
“Thin but usable signal,” which is C. The strict benchmark has its own unchanged
configuration; its B result is not the application grade. Cold browser checks
took approximately 21/22 seconds including loading and analysis. A 390-pixel
Chromium viewport is not a physical-device performance measurement.

Interim failures remain in the private evidence: a trial identity-version bump
invalidated the frozen digest, simultaneous workloads exceeded default Worker
test timeouts, and the first browser harness incorrectly required a cache write
on dataset bootstrap. The final run preserves the old identity algorithm/frozen
expectations, runs the Worker suite without contention, and checks actual cache
eviction/rendering behavior. No assertion, quality floor or timeout was relaxed.
An initial private collection used the older workspace mirror's working directory;
it was excluded. The final harness anchors and records the real release checkout
and policy digest before import.

Public bounded evidence is in
[NWv7_Worker_Source_Qualification_20261119.json](evidence/NWv7_Worker_Source_Qualification_20261119.json).
Complete native logs/captures remain under
`D:/CodeD/NWv-7/.audit-integration/worker-qualification-20261119/` and
`D:/CodeD/NWv-7/.audit-integration/feed-insight-20261119/`.

Independent review and an actual production v4 epoch remain unperformed. After
review, rollout must preserve the compact binding/current pointer, recheck quota,
and validate a complete v4 epoch, freshness and retention before operational
acceptance. A rollback must also respect queued epoch registry custody; do not
blindly restore an older binary without the guard. Authenticated wire-origin
evidence, C09 unknown-venue date policy, remaining A07/A10 cases and full cross-page
Live equivalence are still outside this certification. A single successful
capture does not guarantee every future editorial pool will achieve C.
