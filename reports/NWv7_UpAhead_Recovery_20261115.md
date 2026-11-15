# Up Ahead recovery — 15 November 2026

The audited publisher and tab defects are repaired in the candidate. The production build was checked in the built-in browser with real RSS data. Release status and exact commit/check URLs belong in the repair PR and private session checkpoint.

## Changes

- Restored `UpAhead Refresh`: five bounded acquisitions per day, seven days of source lookback, per-request timeouts, an explicit publication gate, and seven-day artifact retention. The existing Pages `workflow_run` integration already recognizes this workflow name. It runs on standard runners in this public repository; it adds no Cloudflare request, storage, Worker or paid service.
- The exact official Pages deployment reads the current main-branch snapshot, with the deployed file as fallback. Forced refresh checks current publication without clearing the retained list. Other hosts retain their own relative snapshot authority.
- The gate recomputes expiry and visibility at the current clock, rejects stale/future-dated or unusable output, and reports empty/failed categories. The saved July production file now fails with zero active rows instead of passing with 34 visible rows.
- Date extraction now handles full/abbreviated month dates, ISO and Indian numeric dates, ordinals, relative days/weekends and multi-day ranges. Relative expressions use the article's publication time. Ranges retain the last advertised day; scores such as `6-2` are not dates.
- Grouped search alternatives replace queries that required every event keyword or allowed unrelated international shopping results. Seven confirmed broken endpoints were retired. Sources must supply real publication timestamps within seven days. Per-category acquisition evidence distinguishes successful zero matches from failed queries.
- Publisher and browser merges preserve each category route for an article. Expired alert identities cannot retire that article's active event route. Timeline/Planner projection prefers the active event's dates while keeping one occurrence.
- The page and dataset share one projection. Suggested includes general and weather alerts; the Alerts badge matches its body. Acquisition countries no longer become venue cities. Civic notices can match explicit title geography; foreign venue cities are filtered. Generic sale seasons no longer combine unrelated merchants/products.
- The actual page retains provider errors, validation and diagnostics. Calendar/stale fallback is labelled as limited; empty categories show acquisition status. Coverage counts use projected cards. Today includes date-only and ongoing items; Planner counts each eligible occurrence once and offers ongoing events on today's agenda. Manual save feedback no longer reads a cleared React event inside a timer. Range labels show the final day.

## Verification

- The initial counterexamples failed before correction: thirteen Python subcases and all six original JS audit cases. A later category-expiry counterexample also failed before its correction.
- Publisher suite: **20 tests plus 10 subtests passed**, including the existing rolling lifecycle controls.
- Focused app verification: **73 tests in 15 suites passed**; the final label/range/category-expiry follow-up passed **26 tests in five suites**.
- Global lint, targeted lint, production build and the three affected static certifications passed locally.
- Full Windows attempts encountered the four previously recorded template-CRLF, path and child-process portability failures and were interrupted without a completed full-suite result. Linux CI remains the release authority; no full local PASS is claimed.
- The built-in browser exercised all seven tabs, both offer subtabs and Force Refresh. It showed 10 release cards, five combined alert/civic cards, one civic notice, and **12 Planner suggestions**, including ongoing ranges on today's agenda. No real Planner save was performed.
- A dated nine-category regression fixture exercises retained six-day-old source articles, every tab, Planner, revision, append, deduplication and expiry. The fixture remains under `src/services/fixtures`; it is never installed as public publisher data.

## Actual source coverage and limits

The qualified real snapshot was acquired at `1794708894327` (15 November 2026), SHA-256 `87d7372908508068821b5a0038702637ef8121dbd7c8ab4a66aa7ccb210a8087`. All **26 configured RSS sources responded successfully**. Of 169 acquired candidates, 15 remain active: 10 release guides, four weather alerts and one civic notice. Twelve are eligible by the publisher's Planner lifecycle.

Validation is **WARN**, not complete coverage: Events, general Alerts, Shopping, Airlines, Sports and Festivals have no active items in this sample. The event sample is mostly undated, past or outside the seven-day horizon. The page correctly presents verified zero matches and does not revive expired notices or fill tabs with synthetic events. Feed coverage, catalogue identity for recurring URLs, and the separate Cloudflare retention rollout remain operational limitations.

The publisher operates within the existing GitHub path. Cloudflare requests/writes/deployments for this repair are zero. GitHub documents [standard public-runner usage](https://docs.github.com/en/actions/concepts/billing-and-usage) and the [GITHUB_TOKEN push recursion guard](https://docs.github.com/en/actions/concepts/security/github_token); the existing workflow-completion deployment route addresses that guard.

Private evidence beside the task checkpoint: `NWv7-upahead-local-browser-20261115.json`, `NWv7-upahead-local-repaired-20261115.jpg`, `NWv7-upahead-old-publication-rejected-20261115.json`, staged acquisition output, and pre-fix test logs. Personal Planner records are excluded from the release.

## Live cache upgrade follow-up

After PR162 merged and the real publisher/deploy passed, the existing live browser cache exposed an additional recovery defect: real records retained a previous `festival_calendar` audit marker and two calendar estimates. That made a fresh publication appear Limited. The follow-up selects publication metadata from genuine publisher content, removes calendar estimates when that content recovers, and prevents an empty failed refresh from advancing the publication clock. Two populated-cache counterexamples failed before this correction and pass afterward. Existing real items still retain append/revision/expiry behavior; personal Planner records are untouched.
