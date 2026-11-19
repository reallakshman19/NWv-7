# NWv-7 Market — Slice 8A integrated release candidate

**Authority:** draft candidate only; no merge, deployment, Pages/Cloudflare mutation or third-party redistribution approval.

## Ancestry

Integrated branch release/market-slice8a-integrated-20261119 starts from #175 head 2d9f0efc644570095443287ad3487fea92c1da98, itself descending from #174 head 1ea75fb1946f18cf2b78caed53a381e852923ec2 and #173 head b070700dfb8a48170f2c8ff2d3cb1700a181e8a0. All descend from accepted checkpoint merge e435bdc590f32abe75fa6ced80002d275e7b9c7f. The original three PRs remain draft and unmerged. Do not separately merge them if this consolidated PR is selected.

## IPO source fidelity

Live dry run [GitHub Actions 44569374051](https://github.com/reallakshman19/NWv-7/actions/runs/44569374051) observed 22 successful Yahoo charts, 2 AMFI source responses and **BSE IPO HTTP 403**. Failure is not evidence that there are no active IPOs.

The new IPO policy requires a specific recent source receipt (24h maximum) and distinguishes:
- **unavailable:** a failed/errored source; no claimed zero issues; official verification link
- **verified-empty:** explicit empty source receipt and no matching issues
- **available:** explicit snapshot source receipt and complete dated issue entries
- **stale:** source receipt more than 24h old
- **unverified:** missing, invalid or contradictory source receipt

Data reconciliation takes the IPO calendar, check time and health receipt only from the selected market publication, rather than inheriting prior IPO success into a newer indices/equity publication. Quotes and their per-instrument clocks are not altered.

Deterministic Node policy tests, React workspace tests, service reconciliation tests and fixture-only real Chromium tests cover failed, verified empty and populated states. No real quote or IPO data is embedded in tests.

## Qualification gates

The integrated branch workflow runs Market policies, 25-request cap and publisher regressions, focused Market React tests, full Vitest, ESLint, Vite production build, desktop/mobile Chromium, screenshots and branch-only commit status. It does not deploy.

The checkpoint public/data/market_snapshot.json remains dated 2026-11-18T12:22:59.592515Z and lacks an equities collection. The separate live dry-run candidate was transient and NOT approved for publication. The read-only publication checker continues to report a technical HOLD on this old public snapshot. Application test green does not change this.

## Release decision sequence

1. Verify integrated exact-head CI, browser screens and IPO source state.
2. Document applicable permission or licensed alternative for publishing Yahoo/exchange and AMFI derived values. BSE 403 must not be bypassed through proxies.
3. Prepare a separately authorized licensed-source public candidate, with source clocks, coverage, SHA-256 hashes, approval record and rollback.
4. Secure explicit Owner approval of exact commit, asset hashes and deployment destination.
5. Merge/deploy only after approval; compare deployed hashes, source clocks, saved-data recovery and failure isolation; rollback on discrepancies.

**Release remains HOLD.** This document is not merge, deploy or licensing authority.
