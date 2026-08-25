# NW-DD-007 — Production activation readiness

## Mission

Prepare Daily Digest for real Cloudflare production activation after DD-005A and DD-006 merged to `main`, without GitHub Actions deployment automation, committed Cloudflare secrets/IDs, source-policy changes, or browser write authority.

Baseline after reconciliation: `main` at `50e0b6a74b9772501d6dc004c04934505335cdeb`.

## Implemented

- production-only Wrangler example with D1 binding placeholder
- writer flag enabled only in the production example
- qualified Cron Trigger: `45 4 * * *` (04:45 UTC = 10:15 IST)
- source-safe HTTPS activation config verifier
- source-safe local production config preparer
- account-specific Daily Digest Wrangler configs explicitly gitignored
- deployed API smoke verifier for explicit current IST date
- manual production deployment / D1 migration / rollback runbook
- static activation guard

## Authority boundary

The normal `wrangler.toml.example` remains writer-disabled and has no active trigger. The new `wrangler.production.toml.example` is an operator template only and contains no real database/account IDs.

The Worker still exposes only GET/OPTIONS publicly. Scheduled writes remain protected by `DAILY_DIGEST_PILOT_WRITE_ENABLED === "true"`.

The local production config preparer accepts the D1 UUID only from the operator shell/CLI, validates the generated config, writes `cloudflare/daily-digest-api/wrangler.production.toml`, requests mode `0600`, and does not print the UUID. The generated file is gitignored.

## Current Cloudflare source guidance

- Cron Triggers execute in UTC.
- Wrangler-managed Cron Triggers are configured in the Wrangler configuration.
- D1 remote migrations use `wrangler d1 migrations apply <database> --remote`; failed migration handling remains governed by Cloudflare/Wrangler behavior.

## Real resource status

The production Cloudflare D1 resource named `daily-digest` has now been created manually in the authorized Cloudflare account.

At the observed pre-migration state it contained zero application tables. No real D1 UUID is committed in the repository or written into this report.

This changes the gate from `D1_RESOURCE_NOT_CREATED` to `D1_RESOURCE_EXISTS_SCHEMA_NOT_APPLIED`.

## External production actions still required

The connected Cloudflare app still does not expose callable account-mutation tools in this execution session, so these actions were not simulated:

1. create the local ignored production config from the real D1 UUID;
2. run Wrangler authentication in the operator environment;
3. apply migrations `0001`–`0003` remotely;
4. verify the four Daily Digest tables exist remotely;
5. deploy the Worker;
6. activate the 04:45 UTC Cron through Wrangler deployment;
7. set `VITE_API_BASE_URL` to the deployed Worker base URL outside source control;
8. obtain first real scheduled snapshot evidence;
9. verify two-client snapshot identity;
10. obtain same-slot post-freeze failover evidence in a controlled environment or natural production failure.

## Validation

PASS by repository/source review:

- production example contains writer enablement and exact qualified Cron;
- production example contains placeholder D1 ID only;
- `.gitignore` excludes both local Daily Digest Wrangler configs;
- deployment runbook includes mandatory local preflight, remote migration, deploy, frontend activation and rollback;
- smoke verifier requests explicit current IST date;
- existing Worker still fails closed when writer flag is absent/false;
- no browser write route introduced;
- no `.github/workflows/*` change planned or required.

PASS by isolated Node execution using a synthetic D1 UUID:

- `verify_daily_digest_activation_config.mjs` syntax check;
- `prepare_daily_digest_production_config.mjs` syntax check;
- committed production template rejected because its D1 ID is still a placeholder;
- generated production config accepted with a UUID-shaped synthetic D1 ID;
- production HTTPS Worker base URL accepted and endpoint normalized correctly;
- generated local config requested filesystem mode `0600`;
- helper output did not print the configured UUID.

PASS by isolated SQLite execution of the exact repository migrations:

- `0001_daily_digest.sql` applied cleanly to a fresh database;
- `0002_daily_digest_quality.sql` applied cleanly after `0001`;
- `0003_daily_digest_card_metadata.sql` applied cleanly after `0002`;
- final schema contains exactly four `daily_digest_*` application tables;
- `daily_digest_candidates` contains 30 columns;
- final ten appended candidate columns are the eight derived quality-audit fields plus `title` and `canonical_url`.

PASS after current-main reconciliation:

- intervening `main` commits touched ranking/sections files only;
- DD-007 had no path overlap with those commits;
- branch was rebuilt as one clean commit on current `main`;
- final DD-007 compare contains exactly nine activation files.

Explicit NOT_RUN:

- authenticated Wrangler login in the user's Cloudflare account
- remote D1 migration execution
- remote table verification
- Wrangler production deployment
- live Cron activation
- deployed API smoke
- two-browser consistency proof
- production failover proof
- repository dependency-backed lint/build/certification

## Stop condition

Do not claim `PRODUCTION_ACTIVE` until remote D1 migration, Worker deployment, Cron attachment, same-day scheduled write, and public read evidence all exist from the real Cloudflare account.
