# Up Ahead audit — 14 November 2026

Status: live failures reproduced; publisher, UI and Planner causes confirmed. This audit made no product edits, Planner changes, commits or deployments.

## Live observations

Tested the official GitHub Pages app in its built-in browser, Hybrid mode, locations Chennai and Muscat. Clicked all seven tabs, both offer subtabs, diagnostics and Force Refresh.

| Tab | Observed result |
| --- | --- |
| Suggested | Two fallback calendar entries: Oman National Day and Christmas |
| Offers — Online / Offline | Both unavailable, zero cards |
| Release | Zero cards |
| Events | Zero cards |
| Alerts | Zero cards |
| Festivals | The same two fallback calendar entries |
| Civics | Zero notices |

Diagnostics reported score 36 and only 1/9 categories covered. Force Refresh did not recover the missing categories.

The public deployed file and current GitHub main file both contain the identical **21 July 2026** snapshot: fetchedAt `1784635659058`, 34 rows (27 alerts, seven shopping), SHA-256 `a6065bd3967c9082aa10cc9a066a91b6e31fd0a77c9a1d4ee22305b32649ffba`. Replaying the actual client lifecycle on 14 November leaves **zero active rows**. Neither payload supplies releases, events, civic notices or weather alerts.

## Confirmed findings, ordered by recovery priority

1. **P1 — The publisher is absent from production scheduling.** Current main contains only `ci.yml`, `deploy.yml`, `sections_shadow_check.yml` and `sections_snapshot_recovery.yml`. The collector claims five daily runs through `upahead_refresh.yml`, but that file is absent. The browser reads only its deployed `data/up_ahead.json`; static-host policy blocks browser-wide RSS. Refresh therefore retrieves the same expired snapshot. See `scripts/fetch_upahead_events.py:4`, `src/services/upAheadService.js:468` and `src/data/datasets/upAheadProviderPolicy.js`.

2. **P1 — The validation gate approves data the browser cannot use.** Calling the actual `validate_snapshot` with the July payload and November clock returns PASS, 34 visible items, no warnings. Client lifecycle returns zero active items. The validator trusts persisted `lifecycle.isVisible` rather than recomputing age/expiry; its `now_ms` only timestamps the report. See `scripts/validate_upahead_prefetch_output.py:37`, `:79` and `:102`.

3. **P1 — Common future dates are lost during publication.** Actual collector/parser and lifecycle replay drops `November 15`, `15 Nov`, `2026-11-15`, `tomorrow`, and `November 15 to 17, 2026` at the November 14 reference time. Controls `15 November 2026` and `this Sunday` publish. Even a fully spelled multi-day range records its start without an end and can expire too soon. Restoring a workflow alone will still leave Events and Releases underpopulated. See `scripts/fetch_upahead_events.py:201`, `:237` and `scripts/enrich_upahead_contract.py`.

4. **P1 — Provider errors are hidden by the actual page path.** The page uses `useUpAheadPageViewModel`, discards envelope error/validation/diagnostics, and hardcodes `envelope = null` and `error = null`. Empty messages therefore conceal provider failure. The fallback still presents as Snapshot; the briefing can say “No urgent action” without current coverage. See `src/pages/UpAheadPage.jsx:441` and `src/viewModels/useUpAheadPageViewModel.js:92`, `:545`.

5. **P1 — Category overwrite can remove valid event coverage.** Collector IDs are URL-derived. Publisher merge uses last-write-wins by ID, so the same workshop collected through Events then Alerts survives only as Alerts. That routing affects its original tab and Suggested. A synthetic replay using the actual publisher merge demonstrates the overwrite. See `scripts/fetch_upahead_events.py:413` and `scripts/enrich_upahead_contract.py:200`.

6. **P2 — Suggested and Alerts counts omit valid alerts.** Suggested combines releases, festivals, events, offers and civics but excludes general/weather alerts. Both alert-only mock cases produce Alerts=1 and Suggested=0. The Alerts badge counts only weather+civic despite its body including general alerts. See `src/viewModels/useUpAheadPageViewModel.js:374` and `src/pages/UpAheadPage.jsx:551`.

7. **P2 — Location filters disagree across tabs.** A country/acquisition `region: in` makes an online offer look local, then it matches neither Chennai nor Muscat and disappears from both offer tabs. Civics drops a notice explicitly mentioning Chennai when location metadata is absent. Conversely, an event in London survives Chennai/Muscat settings. See page VM `:57`, `:424`, `:432` and `:460`.

8. **P2 — Offer grouping hides unrelated deals.** Generic Black Friday grouping collapses an Amazon laptop offer and a Nordstrom clothing offer into one card. Merchant, product and validity must distinguish separate deals. See page VM `:316–360`.

9. **P2 — Planner excludes an ongoing valid multi-day event.** A mock event starting yesterday and ending tomorrow is active and visible in Up Ahead, but yields zero Planner suggestions because only its start-day is compared with today. See `src/services/upAheadPlannerSuggestions.js:31`.

10. **P2 — Diagnostics and save feedback need correction.** Raw section counts can claim coverage even when all projected tabs are empty. Planner-ready totals add overlapping plan/today/72-hour lists, and date-only events starting at midnight disappear from Today's count. The +Plan button also retains React `event.currentTarget` inside a two-second timer; React clears that property after dispatch, so its visual reset can throw after a save. See `src/services/upAheadEvidence.js:43`, `src/services/upAheadBriefing.js:144`, `:207`, and `src/pages/UpAheadPage.jsx:205`, `:290`.

## What still works

The core rolling store retains active dated items, merges revisions, appends new items, deduplicates and removes expired items. Four isolated lifecycle/Planner tests passed. Six-day-old articles for active future items survived across all nine categories and yielded nine Planner suggestions. An explicit expired offer was removed. The primary production outage is upstream supply; relaxing expiry would resurrect obsolete items.

The root audit also ran eight existing focused suites: 28 tests passed. Peer checks passed nine publisher lifecycle tests and eleven existing lifecycle/Planner tests. Seven additional UI cases were replayed through the real ViewModel internals. These green checks do not certify current publication or realistic cross-tab behavior.

## Recovery order

1. Restore bounded publisher acquisition and publication, with fresh output for the configured categories. Keep Cloudflare free-tier constraints; this GitHub-hosted path does not need a new paid service.
2. Make the release gate recompute expiry, enforce snapshot freshness, and fail on an unusable publication. Match browser and publisher lifecycle expectations.
3. Correct date/range extraction and preserve meaningful category information during merge.
4. Correct projected categories, geography, offer identities, error states and Planner ongoing-event handling.
5. Verify real source-dated records through every live tab, Force Refresh, append/dedup/expiry and Planner consumption before claiming recovery.

## Private reproduction evidence

Saved beside the existing session checkpoint under the authorized visualization folder:

- `NWv7-upahead-deployed-20261114.json` and `NWv7-upahead-github-20261114.json`: actual public bytes.
- `NWv7-upahead-live-tabs-20261114.json`: browser observations for all tabs.
- `NWv7-upahead-live-audit-20261114.jpg`: live failure screenshot.
- `NWv7-upahead-data-audit-replay-20261114.json` and `.py`: actual parser, validator and publisher-merge replays.
- `NWv7-upahead-ui-audit-20261114.json`: seven actual ViewModel projection cases.
- `NWv7-upahead-audit-validation/replay-results.json`: rolling lifecycle, nine categories, deployed expiry and ongoing-event Planner case.

Limit: no full fresh-feed acquisition, live Planner save or recovery deployment was performed. Unavailable sources and missing categories still require end-to-end verification during repair. Recurring occurrences that share a URL/ID remain a separate reschedule/identity design ambiguity.
