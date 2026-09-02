# NW-CF-HYBRID-002 — Sections shadow liveness and fallback-health repair

## Trigger

Production mobile evidence on 2026-09-02 showed:

```text
Cloudflare unavailable · showing GitHub
India       No news available     🟢 OK
Tamil Nadu  No news available     🟢 OK
Muscat      No news available     🟢 OK
```

This is a real redundancy/diagnostics defect, not a presentation-only problem.

## Grounded baseline

Implementation base:

```text
df6809e375828ebbac384ca11fad9fb578a7c3c3
```

Current authority remains:

```text
S1_GITHUB_PRIMARY_CF_SHADOW
```

No Top Stories ranking weight, threshold, classifier, source tier, source registry, UI section ordering, or serving-authority promotion is authorized.

## RCA

### 1. Browser Run was a hard prerequisite for hourly shadow liveness

`startLiveEpoch()` enables Browser Run when `SHADOW_BROWSER_FALLBACK_ENABLED=true` and reserves browser capacity before staging the epoch.

Therefore Browser Run quota/binding failure can prevent the entire hourly epoch from starting even though ordinary Worker acquisition remains available.

This dependency direction is unsafe for a shadow liveness path. Browser-assisted Google News acquisition is a qualification/quality enhancement; it must not be required for the shadow pointer to continue advancing.

### 2. GitHub fallback is not currently a hot producer

The checked-in `public/newsdata/sections_latest.json` is historical. Falling from Cloudflare to GitHub therefore does not guarantee current stories.

This PR does not resurrect GitHub producer workflows. It keeps authority unchanged and makes the active Cloudflare hourly path independent of Browser Run.

### 3. Stored health could disagree with actually served stories

`resolveSectionHealthSummary()` previously returned any stored `ok|warning|critical` summary before looking at the rendered story population. A stale stored `OK` could therefore coexist with zero visible stories.

## Repair

### Worker deployment configuration

Change:

```text
SHADOW_BROWSER_FALLBACK_ENABLED=true
```

to:

```text
SHADOW_BROWSER_FALLBACK_ENABLED=false
```

while preserving:

```text
cron                         0 * * * *
SHADOW_SCHEDULE_ENABLED      true
SHADOW_LIVE_ACQUISITION      true
SHADOW_PREVIEW_READ_ENABLED  true
SHADOW_MODE                  S1_GITHUB_PRIMARY_CF_SHADOW
```

With Browser Run disabled, `startLiveEpoch()` enqueues all 41 registry lanes through ordinary acquisition. Google News lanes may terminate with explicit HTTP/source dispositions, but they no longer block the complete epoch from being staged/finalized solely because Browser Run capacity is unavailable.

This is a P0 liveness hotfix, not the final fail-soft Browser Run architecture. A successor may make Browser Run opportunistic per epoch rather than config-disabled.

### Health truthfulness

When the served section has zero visible stories:

```text
status = critical
storyCount = 0
reason += served_section_empty
```

If stored concrete health said OK/warning/critical, preserve its diagnostic fields but add:

```text
stored_health_disagrees_with_served_data
```

and use:

```text
evidenceSource = served-stories+stored-health
```

An empty served section can no longer render a green OK badge.

### Fallback diagnostics

The explicit Preview control now renders the concrete fallback reason, including normalized labels for:

```text
preview_snapshot_unusable   -> preview snapshot stale/incomplete
snapshot-budget-exceeded    -> preview request timed out
HTTP 503                    -> preview service unavailable
```

Cloudflare remains opt-in Preview and GitHub remains the automatic fallback.

## Files

```text
cloudflare/sections-shadow/wrangler.jsonc
src/services/runtimeSectionHealthFallback.js
src/services/runtimeSectionHealthFallback.cert.test.js
src/components/SectionsDataSourceToggle.jsx
src/services/sectionsFailoverLiveness.cert.test.js
reports/NW-CF-HYBRID-002_liveness_fallback_repair.md
```

## Required validation

Run locally before merge/deploy:

```text
npx vitest run --config vitest.config.js src/services/runtimeSectionHealthFallback.cert.test.js src/services/sectionsFailoverLiveness.cert.test.js src/components/SectionsDataSourceToggle.cert.test.jsx
npm run lint
npm run build
cd cloudflare/sections-shadow && npm run check
```

GitHub Actions is not required for this mission.

## Production activation proof after merge

The repository change alone does not mutate the deployed Worker. After owner merge, redeploy the existing Sections shadow Worker using its current ignored real Cloudflare config.

Required evidence after deployment:

```text
GET /health
  shadowScheduleEnabled=true
  liveAcquisitionEnabled=true
  browserFallbackEnabled=false

GET /preview/sections/latest
  HTTP 200
  fetchedAt/current committed epoch < 2 h old

D1/current pointer
  advances on a natural hourly trigger
  SHADOW_COMMITTED only
  41/41 terminal lane accounting
```

Then verify the browser:

```text
Cloudflare Preview active · committed data only
India/Tamil Nadu/Muscat contain current stories when upstream evidence exists
zero-story section cannot display 🟢 OK
```

## PASS / NOT_RUN at PR creation

```text
Source RCA                                      PASS
Authority/ranking/source-policy preservation   PASS by diff design
Browser Run removed as hard config dependency  PASS by source contract
Served-empty health fail-closed                 PASS by focused cert design
Exact fallback reason surfaced                 PASS by source contract
Vitest                                         NOT_RUN in connector session
lint                                            NOT_RUN in connector session
build                                           NOT_RUN in connector session
Worker npm run check                            NOT_RUN in connector session
real Cloudflare redeploy                        NOT_RUN
natural hourly pointer advancement              NOT_RUN
```

## Stop conditions

Do not broaden this PR to:

```text
ranking/source-policy changes
GitHub producer workflow restoration
Cloudflare PRIMARY promotion
new public write routes
D1 schema migration
source-feed removal
manual snapshot fabrication
```

If ordinary 41-lane acquisition still cannot produce a committed epoch after deployment, preserve the last committed pointer and inspect Worker/Queue/D1 evidence before changing freshness thresholds or source policy.
