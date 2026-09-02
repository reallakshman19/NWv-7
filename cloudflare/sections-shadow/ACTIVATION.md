# NW-CF-ACT-001 — Sections shadow production activation

This runbook activates the existing `nw-sections-shadow` Worker against the
already-provisioned Cloudflare resources. It does **not** create D1 databases,
Queues, or any other Cloudflare resource.

## Preconditions

- Work from `cloudflare/sections-shadow`.
- The Cloudflare account must already contain exactly one D1 database named
  `nw-sections-shadow` plus the existing producer Queue, consumer Queue, and DLQ.
- Wrangler must already be authenticated in the current machine/workspace.
- Do not copy a D1 UUID into source or commit `wrangler.local.jsonc`.
- Do not run any GitHub Actions workflow for this activation.

## One-command activation

From this package directory:

```text
npm ci
npm run activate:production
```

The activation helper performs the following fail-closed sequence:

1. Validates the tracked S1 authority contract:
   - Worker `nw-sections-shadow`
   - Cron `0 * * * *`
   - `SHADOW_MODE=S1_GITHUB_PRIMARY_CF_SHADOW`
   - schedule enabled
   - live acquisition enabled
   - Browser fallback disabled
   - Preview reads enabled
   - Browser binding `SHADOW_BROWSER`
   - D1 binding/name `SHADOW_DB` / `nw-sections-shadow`
   - producer/consumer Queue `nw-sections-shadow`
   - DLQ `nw-sections-shadow-dlq`
2. Runs Wrangler with both automatic resource creation and experimental
   provisioning explicitly disabled.
3. Confirms Wrangler authentication.
4. Lists existing D1 databases and requires exactly one named
   `nw-sections-shadow`.
5. Creates ignored `wrangler.local.jsonc` with the existing D1 UUID without
   printing that UUID.
6. Confirms the local config is ignored by Git.
7. Lists remote D1 migrations and fails if any tracked `.sql` migration remains
   unapplied. It never applies migrations automatically.
8. Runs `npm run check`.
9. Deploys the Worker using the ignored local config with provisioning disabled.
10. Validates `/health` and `/preview/sections/latest`.

If `wrangler.local.jsonc` already exists, the command stops rather than silently
overwriting operator state. To intentionally reconstruct it from the existing D1:

```text
npm run activate:production -- --force
```

## Production acceptance contract

`/health` must prove all of the following:

```text
mode                              S1_GITHUB_PRIMARY_CF_SHADOW
servingAuthority                  github_static
cloudflareBrowserServingAuthority false
previewReadEnabled                true
shadowScheduleEnabled             true
liveAcquisitionEnabled            true
browserFallbackEnabled            false
sourceLaneCount                   41
writeSurface                      queue_only
```

`/preview/sections/latest` must prove:

```text
HTTP                              200
x-nw-data-source                  cloudflare-preview
schemaVersion                     2
preview.evidenceVerified          true
preview.servingAuthority          github_static
preview.epochId                   live-*
fetchedAt                         <= 150 minutes old
renderable story count            >= 1
```

A `live-*` epoch is required so a frozen replay cannot satisfy production
liveness by accident.

## Natural Cron proof

The first deployment smoke can fail if the last committed live epoch is older
than 150 minutes. If the deploy itself passed and the only failure is stale or
missing committed live evidence, do **not** trigger a GitHub workflow and do not
lower the age gate.

Wait for the next natural top-of-hour Cloudflare Cron execution, then run:

```text
npm run smoke:production
```

A PASS establishes that the deployed S1 configuration is producing a recent,
verified independent live epoch through the normal Cloudflare schedule.

## Prepare-only mode

To reconstruct and validate local deployment state without deploying:

```text
npm run activate:prepare
```

Use `--force` only when intentionally replacing an existing ignored local config:

```text
npm run activate:prepare -- --force
```

## Stop conditions

Stop without improvising if any of these occur:

- no existing D1 named `nw-sections-shadow`
- more than one D1 with that name
- any remote migration remains unapplied
- tracked authority/config identity differs from the expected S1 contract
- package certification fails
- Worker deployment fails
- `/health` differs from the expected S1 contract
- Preview is not `evidenceVerified=true`
- Preview epoch is not `live-*`
- Preview is older than 150 minutes
- Preview has zero renderable stories

Do not fix these conditions by creating replacement Cloudflare resources,
turning Browser fallback back on, relaxing freshness checks, or changing GitHub
workflows.
