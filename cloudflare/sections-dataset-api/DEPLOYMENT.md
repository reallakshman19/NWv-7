# Sections shadow deployment boundary

PR #495 does not authorize deployment or browser cutover. This file records the later operator boundary only.

## Create an isolated D1 database

Use a database dedicated to Sections shadow; never bind Daily Digest or Up Ahead storage.

Expected binding:

```toml
[[d1_databases]]
binding = "DB"
database_name = "nw-sections-shadow"
database_id = "<operator-supplied-id>"
preview_database_id = "<operator-supplied-preview-id>"
migrations_dir = "migrations"
```

Apply `migrations/0001_sections_shadow.sql` to the intended local/preview database before any smoke test.

## Safety gates

Before a future deployment, independently verify:

```text
SECTIONS_SHADOW_MODE=SHADOW_ONLY
SECTIONS_LIVE_ACQUISITION_ENABLED=false unless PR-C explicitly authorizes otherwise
no production browser VITE variable points to this Worker
no route/DNS cutover is included
DB is the dedicated Sections database
```

Read endpoints must return only pointer-selected COMMITTED snapshots. A missing/invalid pointer must fail closed as `committed_snapshot_not_found`; it must not fall back to the newest STAGED rows.

## Capacity note

As checked on 2026-08-26, Cloudflare Free Workers allow 50 external subrequests per invocation and redirects consume that budget. Paid plans currently default much higher. PR-B does not use that headroom to justify a monolithic 41-feed collector; acquisition design remains a PR-C qualification item.
