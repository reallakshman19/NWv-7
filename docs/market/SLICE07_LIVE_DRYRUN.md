# NWv-7 Market — Slice 7: bounded live dry-run custody

**Role:** engineering source diagnostic, not data acquisition for release. **Authority:** no merge, deployment, public data export, Cloudflare mutation or provider-rights approval.

**Stacked baseline:** Slice 6 draft PR #174 head `1ea75fb1946f18cf2b78caed53a381e852923ec2`; Slice 5 PR #173 has independently passing deterministic/Chromium gates.

## Exact workflow

- File: `.github/workflows/market-live-dryrun.yml`. Uses `contents: read`, an isolated Ubuntu runner and `persist-credentials: false`.
- All branch commits run source-contract tests without accessing market providers. Only an explicitly marked commit containing `[market-live-dryrun]` or a separately authorized manual dispatch enables the 25-request live job.
- File: `scripts/market_live_dryrun.py`. Single allowed URL set of **22 Yahoo daily chart requests** (six India indices, 16 tracked NSE shares), **two AMFI** and **one BSE**. No retries, no unbounded endpoints, maximum four simultaneous chart requests and inherited eight-second per-request timeout/four-MB response limit.
- The candidate quote/NAV data is kept in process memory and an OS temporary directory for validation; the temporary directory is removed after the Node readiness checker completes. No candidate quote JSON is written to the repository or retained as a CI artifact.
- The only retained artifact, `reports/market-live-dryrun.json`, contains acquisition counts, sanitized per-source status and failure categories, original source timestamp ranges, identity/coverage counts, SHA-256 digest of the ephemeral candidate, publisher validation and independent readiness codes. No prices, individual NAV values, market changes, raw responses, full source URLs or error messages are retained. Original public market files must be unchanged.
- A diagnostic technical `PASS` means the ephemeral source observations passed structural/time validation at capture time. A technical `HOLD` is truthful evidence of blocked, stale or partial sources; do not replace values with a previous sample.
- **Release status is always HOLD**. Technical availability cannot establish contractual right to distribute the data or Owner authorization to merge/deploy.

## Source policy and outstanding evidence

Source access and third-party redistribution rights are separate. Yahoo Terms, third-party exchange providers and AMFI access terms must be reviewed for the intended public use. A successful live observation does **not** establish licensed web/public redistribution.

Primary reference sources:

- https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
- https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html
- https://www.amfiindia.com/terms-of-use
- https://www.bseindia.com/downloads1/SEBI_circular_Policy_Sharing_Data.pdf

No original live quote payload should be copied into a PR, Google Drive, ChatGPT artifact or public Pages until applicable redistribution permissions and Owner release approval are recorded.

## Evidence order

1. Deterministic publisher and source policy tests pass.
2. Explicit one-time probe returns request attempt/denial counts, provider health and source clocks.
3. Publisher validation and independent technical checker agree or discrepancies become named defects.
4. Carry the metadata-only receipt and exact commit SHA in the Slice 7 review.
5. Route source-specific remediation (provider availability, parser/schema changes, data licensing) without weakening clocks, spoofing coverage or silently falling back to a different provider.
6. **Only then** consider a separately authorized licensed-source integration and deployment.

This document is not a release authorization.
