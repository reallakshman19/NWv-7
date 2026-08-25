# NW-DD-007A — Windows CLI entrypoint correction

## Mission

Correct the DD-007 operator scripts so direct `node <script>` execution works on Windows PowerShell as well as POSIX shells.

Baseline: `main` after merged PR #487 (`a498f256c309e8a3f40f5afd9065c369c8e5f38f`).

## Observed failure

On Windows PowerShell, direct execution of:

```text
node .\scripts\prepare_daily_digest_production_config.mjs
```

returned immediately with no PASS/FAIL output.

Root cause: the scripts used:

```js
import.meta.url === `file://${process.argv[1]}`
```

That string construction is POSIX-shaped and does not normalize Windows filesystem paths to file URLs, so the direct-execution guard evaluated false.

## Correction

The three DD-007 operator CLIs now compare the normalized filesystem path represented by `import.meta.url` with the platform-resolved `process.argv[1]`:

```js
fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
```

Affected scripts:

- `scripts/prepare_daily_digest_production_config.mjs`
- `scripts/verify_daily_digest_activation_config.mjs`
- `scripts/smoke_daily_digest_edge_api.mjs`

No production policy, D1 schema, Worker writer behavior, Cron schedule, UI, or GitHub Actions workflow changes are included.

## PowerShell contract

Environment variable assignment remains PowerShell-native:

```powershell
$env:DAILY_DIGEST_D1_DATABASE_ID="<real D1 UUID>"
node .\scripts\prepare_daily_digest_production_config.mjs
```

Wrangler should be invoked as `npx.cmd` on systems where PowerShell execution policy blocks `npx.ps1`.

## Validation

PASS by source review:

- direct-execution guards no longer construct `file://` URLs manually;
- all three CLIs use `fileURLToPath` plus platform `path.resolve`;
- imported-module behavior remains guarded;
- no D1 UUID/account identifier is committed;
- no workflow files are changed.

NOT_RUN:

- Windows PowerShell execution inside this agent environment (Windows runtime unavailable);
- authenticated remote Cloudflare migration/deployment;
- deployed API smoke.

The user-provided Windows console output is the falsifying evidence for the previous entrypoint implementation. Remote activation remains gated on rerunning the corrected helper in the user's Windows checkout.
