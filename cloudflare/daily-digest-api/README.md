# Daily Digest API

Daily Digest provides the shared `daily-digest-snapshot/v1` authority used by the Main-page read-only Daily Digest section.

## Runtime boundary

- qualified publisher adapters run only in the Worker scheduled path
- deterministic role/quality selection freezes one shared daily snapshot
- D1 persists snapshot, selections, candidate audit evidence and failover events
- public browser access is read-only through `GET /api/datasets/dailyDigest`
- no browser publisher discovery or write route exists

## Safe local configuration

Copy the writer-disabled example:

```bash
cp wrangler.toml.example wrangler.toml
```

The repository ignores the local Daily Digest Wrangler configs so account-specific binding IDs are not accidentally committed.

Apply local migrations and test scheduled handling with:

```bash
npx wrangler d1 migrations apply daily-digest --local --config wrangler.toml
npx wrangler dev --local --test-scheduled --config wrangler.toml
```

Read a date explicitly:

```bash
curl -i "http://127.0.0.1:<port>/api/datasets/dailyDigest?date=2026-08-25"
```

## Production activation

Production activation is documented in `DEPLOYMENT.md` and uses `wrangler.production.toml.example` as an operator template. The production template enables the scheduled writer and defines the qualified `45 4 * * *` UTC Cron Trigger while retaining a placeholder D1 UUID.

Prepare the local production config from the repository root without manually editing TOML:

```bash
DAILY_DIGEST_D1_DATABASE_ID=<your-d1-uuid> \
  node scripts/prepare_daily_digest_production_config.mjs
```

Then run the mandatory source-safe preflight before any remote command:

```bash
node scripts/verify_daily_digest_activation_config.mjs \
  --config cloudflare/daily-digest-api/wrangler.production.toml
```

The helper does not print the D1 UUID and the generated config is gitignored. No GitHub Actions deployment workflow is required.
