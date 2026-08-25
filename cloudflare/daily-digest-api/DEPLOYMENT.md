# Daily Digest production activation runbook

## Purpose

Activate the Daily Digest Worker, D1 authority, and 10:15 IST freeze without committing real Cloudflare account/database identifiers or adding GitHub Actions deployment automation.

Production schedule:

```text
10:15 Asia/Kolkata = 04:45 UTC
cron = 45 4 * * *
```

Cloudflare Cron Triggers execute in UTC.

## Prerequisites

- authenticated Cloudflare account with Workers and D1 access
- Wrangler v4+
- production D1 database named `daily-digest`
- migrations `0001`, `0002`, and `0003` present

The deployed Worker URL is obtained after deployment and is not a prerequisite.

## Prepare production config

From the repository root, set the D1 UUID only in the operator shell and let the repository helper create the local config:

```bash
DAILY_DIGEST_D1_DATABASE_ID=<your-d1-uuid> \
  node scripts/prepare_daily_digest_production_config.mjs
```

The helper:

- validates that the value is UUID-shaped;
- creates `cloudflare/daily-digest-api/wrangler.production.toml` from the committed template;
- validates the D1 binding, database name, writer flag and Cron before writing;
- writes the local file with restrictive permissions where supported;
- does not print the D1 UUID.

The repository ignores both local Daily Digest Wrangler files. Verify before remote use:

```bash
git check-ignore -v cloudflare/daily-digest-api/wrangler.production.toml
```

Expected: a matching `.gitignore` rule.

If the local config already exists, the preparation helper refuses to overwrite it. Use `--force` only when intentionally replacing it:

```bash
DAILY_DIGEST_D1_DATABASE_ID=<your-d1-uuid> \
  node scripts/prepare_daily_digest_production_config.mjs --force
```

## Mandatory local activation preflight

Before any remote migration or deployment, verify the local production config:

```bash
node scripts/verify_daily_digest_activation_config.mjs \
  --config cloudflare/daily-digest-api/wrangler.production.toml
```

The preflight fails if any of the following are wrong:

- D1 `DB` binding missing;
- database name is not `daily-digest`;
- D1 database ID is missing, still a placeholder, or not UUID-shaped;
- `DAILY_DIGEST_PILOT_WRITE_ENABLED` is not `true`;
- production Cron is not exactly `45 4 * * *`.

Then verify Wrangler authentication/config parsing:

```bash
npx wrangler --version
npx wrangler whoami
npx wrangler check --config cloudflare/daily-digest-api/wrangler.production.toml
```

Do not proceed to `--remote` commands unless both the repository preflight and Wrangler config check pass.

## D1 migration gate

Review remote migration state:

```bash
npx wrangler d1 migrations list daily-digest --remote \
  --config cloudflare/daily-digest-api/wrangler.production.toml
```

Apply all unapplied migrations before deploying the writer:

```bash
npx wrangler d1 migrations apply daily-digest --remote \
  --config cloudflare/daily-digest-api/wrangler.production.toml
```

Expected schema includes the four base Daily Digest tables, derived quality columns from `0002`, and `title` / `canonical_url` from `0003`.

After migration, use the Cloudflare D1 dashboard or Wrangler D1 query tooling to confirm that the database has these tables:

```text
daily_digest_snapshots
daily_digest_selections
daily_digest_candidates
daily_digest_selection_events
```

Do not create or alter these tables manually in the Cloudflare console.

## Deploy Worker and Cron

Production configuration deliberately sets:

```text
DAILY_DIGEST_PILOT_WRITE_ENABLED=true
cron=45 4 * * *
```

Deploy:

```bash
npx wrangler deploy \
  --config cloudflare/daily-digest-api/wrangler.production.toml
```

For a Wrangler-managed Worker, the Cron Trigger must remain managed by the Wrangler configuration. Do not add a duplicate dashboard-managed schedule.

Record the deployed Worker base URL from Wrangler output without committing it to source.

## Post-deploy API verification

Set the deployed Worker base URL only in the operator shell:

```bash
export DAILY_DIGEST_API_BASE_URL=https://<worker-host>
```

Verify both the local production config and deployed base URL together:

```bash
node scripts/verify_daily_digest_activation_config.mjs \
  --config cloudflare/daily-digest-api/wrangler.production.toml \
  --url "$DAILY_DIGEST_API_BASE_URL"
```

Before today's freeze exists, an explicit same-day GET may correctly return 404 `snapshot_not_found`.

After a valid snapshot exists for today:

```bash
node scripts/smoke_daily_digest_edge_api.mjs "$DAILY_DIGEST_API_BASE_URL"
```

The smoke check requires:

- HTTPS;
- explicit current Asia/Kolkata digest date;
- HTTP 200;
- matching `digestDate`;
- 2–4 valid selected cards;
- selected cards with direct HTTPS publisher URLs;
- OPTIONS success.

## Scheduled writer verification

Before production activation, test scheduled dispatch against a non-production/local D1 copy using:

```bash
npx wrangler dev --test-scheduled \
  --config cloudflare/daily-digest-api/wrangler.production.toml
```

Then invoke the scheduled test route with the qualified cron expression. Do not use the local test result as production evidence.

For production evidence, verify after the first 04:45 UTC trigger:

1. exactly one snapshot exists for the current digest date;
2. `snapshot_revision = 1` on initial freeze;
3. `frozen_at` is at or after the qualified 10:15 IST boundary;
4. current selected cards match the GET endpoint;
5. repeated reads from two browser sessions return the same snapshot ID/revision/cards.

## Frontend activation

Set the static frontend build variable outside source control:

```text
VITE_API_BASE_URL=https://<worker-host>
```

Do not include `/api/datasets/dailyDigest`; the browser client appends the dataset path.

After rebuilding the static frontend, confirm Main requests:

```text
GET https://<worker-host>/api/datasets/dailyDigest?date=<today-IST>
```

and renders Daily Digest only when today's frozen snapshot exists.

## Post-freeze failover proof

DD-007 does not authorize editorial reranking after freeze. Any later replacement must:

- remain within the same slot;
- preserve `initial_canonical_id`;
- update only `effective_canonical_id`;
- increment `snapshot_revision`;
- append one `HEALTH_FAILOVER` selection event;
- leave unaffected slots unchanged.

Do not force a production source failure merely to create this evidence. Use a controlled non-production D1/Worker verification unless a real production health failure naturally occurs.

## Rollback

Fastest safe writer rollback:

1. edit the local production config;
2. set `DAILY_DIGEST_PILOT_WRITE_ENABLED = "false"`;
3. set `crons = []` under `[triggers]`;
4. inspect the intended rollback values explicitly;
5. redeploy with Wrangler;
6. retain existing D1 snapshots read-only;
7. leave the frontend API base URL configured if read-only historical access is still desired.

The production activation preflight intentionally expects the enabled state and therefore is not the rollback validator. Commenting out `crons` is not a reliable disable mechanism; explicitly deploy an empty cron list when disabling a Wrangler-managed trigger.

## Repository boundary

This runbook commits no real D1 ID, account ID, token, Worker URL, route, or secret. Account-specific local Wrangler configs are gitignored. No GitHub Actions workflow or scheduled Actions job is required.
