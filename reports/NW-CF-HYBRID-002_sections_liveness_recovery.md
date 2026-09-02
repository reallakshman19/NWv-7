# NW-CF-HYBRID-002 — Sections shadow liveness and truthful health recovery

## Mission

Repair the production failure observed on 2026-09-02 where Cloudflare Preview fell back to GitHub and Main rendered no India, Tamil Nadu, or Muscat stories while the corresponding health badges still showed green `OK`.

This is a liveness/diagnostics repair only. It does not promote Cloudflare, change Top Stories ranking, change source policy, add a GitHub workflow, or make Browser Run a production serving authority.

## Grounded baseline

Implementation base:

```text
df6809e375828ebbac384ca11fad9fb578a7c3c3
```

That is current `main` at takeover and is the merge of PR #496.

Observed browser evidence:

```text
Cloudflare unavailable · showing GitHub
India       -> no news available + green OK
Tamil Nadu  -> no news available + green OK
Muscat      -> no news available + green OK
```

Current checked-in GitHub `public/newsdata/sections_latest.json` remains historical/stale and is not a qualified hot fallback producer.

## RCA 1 — Browser Run was coupled to scheduled dataset liveness

Tracked deployment configuration had:

```text
SHADOW_SCHEDULE_ENABLED=true
SHADOW_LIVE_ACQUISITION_ENABLED=true
SHADOW_BROWSER_FALLBACK_ENABLED=true
cron=0 * * * *
```

`startLiveEpoch()` treats enabled Browser Run as part of the 41-lane epoch contract. Browser capacity/binding/session failures can therefore prevent the scheduled live epoch from reaching complete terminal-lane custody and leave the previous committed pointer aging indefinitely.

That is the wrong authority boundary. Browser Run exists to improve/qualify Google News acquisition; it must not be required for the Cloudflare shadow to remain live.

The direct collector already has deterministic terminal failure dispositions for Google News HTTP errors/timeouts. With Browser Run disabled, all 41 registered lanes are still attempted directly; Google failures remain explicit terminal evidence while healthy publisher lanes can complete and advance an atomic epoch.

## Fix 1 — decouple hourly liveness from Browser Run

Change only the deployed shadow variable:

```text
SHADOW_BROWSER_FALLBACK_ENABLED=false
```

Preserve:

```text
SHADOW_SCHEDULE_ENABLED=true
SHADOW_LIVE_ACQUISITION_ENABLED=true
SHADOW_PREVIEW_READ_ENABLED=true
cron=0 * * * *
```

The Browser binding and Browser acquisition implementation remain in the package for controlled qualification. This change only removes Browser Run from the ordinary hourly liveness path.

A focused Worker-runtime configuration test asserts this contract so a future configuration edit cannot silently reintroduce Browser Run as an hourly dependency.

## RCA 2 — authoritative health could contradict rendered data

`NewsSection` resolves the health badge through `runtimeSectionHealthFallback.js`.

Before this repair, any concrete source-health summary (`ok`, `warning`, or `critical`) won immediately, even when the actual `news` array supplied to that section was empty. Therefore a stale envelope could report:

```text
health status = ok
health story count > 0
rendered stories = 0
```

and the UI still rendered green `OK`.

## Fix 2 — rendered emptiness is a health contradiction

The resolver now reconciles concrete health with the actual rendered story population.

Rules:

```text
concrete critical + empty rendered section
  -> preserve critical

concrete ok/warning + empty rendered section
  -> warning
  -> storyCount = 0
  -> reason: rendered_section_empty

health summary claimed storyCount > 0 while rendered section is empty
  -> add reason: health_story_count_mismatch

no health evidence + no rendered stories
  -> remain unknown/null; do not fabricate source failure evidence
```

The repair intentionally does not label an empty section `critical` unless existing authoritative evidence already proves critical failure.

## Files changed

```text
cloudflare/sections-shadow/wrangler.jsonc
cloudflare/sections-shadow/test/liveness-config.test.ts
src/services/runtimeSectionHealthFallback.js
src/services/runtimeSectionHealthFallback.cert.test.js
reports/NW-CF-HYBRID-002_sections_liveness_recovery.md
```

No `.github/workflows/**` file changes.

## Validation

### PASS — source/diff reconciliation

```text
base       = df6809e375828ebbac384ca11fad9fb578a7c3c3
behind     = 0
product changes before report = 4 files
ranking files changed          = 0
source registry changed        = 0
GitHub workflows changed       = 0
```

### PASS — targeted runtime-health oracle

A dependency-free Node execution of the exact new reconciliation logic proved:

```text
ok + storyCount 8 + rendered []
  -> warning
  -> storyCount 0
  -> rendered_section_empty
  -> health_story_count_mismatch

critical + rendered []
  -> same authoritative critical object
```

JavaScript syntax check passed under Node 22.

### PASS — static deployment contract

The tracked Wrangler configuration now has:

```text
schedule enabled       = true
live acquisition       = true
Browser fallback       = false
Preview read           = true
```

### NOT_RUN

The connector session does not have the authenticated Cloudflare account mutation surface or a complete local repository dependency tree. Therefore these remain NOT_RUN until operator execution:

```text
cloudflare/sections-shadow npm run check
root focused Vitest certification
root lint/build
remote Worker deployment
post-deploy /health check
first post-deploy hourly epoch
remote D1 current-pointer verification
mobile browser confirmation
```

Do not report production recovery until the Worker is redeployed and a fresh committed epoch is observed.

## Required post-merge/operator proof

After deployment, verify in this order:

```text
1. GET /health
   -> schedule true
   -> live acquisition true
   -> browser fallback false

2. wait for / trigger one authorized live epoch
   -> 41 terminal lanes
   -> SHADOW_COMMITTED
   -> current pointer advances

3. GET /preview/sections/latest
   -> HTTP 200
   -> fetchedAt/current epoch within expected hourly window
   -> India/TN/Muscat arrays inspected

4. browser Cloudflare Preview
   -> no fallback banner while endpoint healthy
   -> empty rendered section cannot show green OK
```

If Google News returns 503 under direct Worker fetch, that is expected degraded source evidence and must not prevent the epoch from committing.

## Authority after repair

Still exactly:

```text
GitHub/static = production serving authority
Cloudflare    = explicit Preview / shadow
Browser Run   = controlled qualification aid, not hourly liveness dependency
```

No Cloudflare primary promotion is authorized by this repair.
