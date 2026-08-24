# Daily Digest API foundation

NW-DD-001 establishes the shared authority boundary for `daily-digest-snapshot/v1` without live publisher discovery or UI integration.

## Scope

- independent Daily Digest registry/state contracts
- deterministic role-slot selector
- D1 schema and atomic snapshot persistence
- public read-only `GET /api/datasets/dailyDigest`
- inert `scheduled()` handler for local proof

The package does **not** fetch publishers, create a production snapshot, expose a browser write endpoint, or activate a Cron Trigger.

## Local configuration

Copy the example before local use:

```bash
cp wrangler.toml.example wrangler.toml
```

Replace the all-zero D1 identifier only in local/uncommitted or deployment configuration. Do not commit real Cloudflare account/database identifiers.

Apply migrations against the local D1 simulation:

```bash
npx wrangler d1 migrations apply daily-digest --local --config wrangler.toml
```

Run the Worker locally:

```bash
npx wrangler dev --local --test-scheduled --config wrangler.toml
```

Read the latest snapshot:

```bash
curl -i http://127.0.0.1:<port>/api/datasets/dailyDigest
```

Read a date explicitly:

```bash
curl -i "http://127.0.0.1:<port>/api/datasets/dailyDigest?date=2026-08-24"
```

Until source adapters are authorized, the scheduled handler returns foundation evidence only and writes no snapshot.

## Production boundary

A later mission must qualify source adapters, the 10:15 IST pilot freeze, real D1 binding, and Cron activation. No GitHub Actions workflow or schedule is required for this package.
