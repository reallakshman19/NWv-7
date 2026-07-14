# NW-MAIN-007 — Runtime story health fallback

## Production finding

The post-deployment browser gate introduced by NW-DEPLOY-001 opened the actual GitHub Pages Main page and found every section badge in the `unknown` state even though section stories were visible.

## Root cause

Main can render NewsContext/projected story arrays before or without a usable dataset health envelope. `NewsSection` previously accepted only the supplied `healthSummary`, so a missing summary always became `Unknown` even when the component had concrete story and source evidence.

## Correction

`NewsSection` now resolves health in this order:

1. Preserve a supplied authoritative `ok`, `warning`, or `critical` summary.
2. When the supplied summary is missing or non-concrete and rendered stories exist, derive a conservative runtime summary.
3. When neither diagnostics nor stories exist, retain `Unknown`.

A runtime-derived summary is always `warning`; it never fabricates `ok`. It includes:

- normalized section identity;
- visible story count;
- distinct source-group count;
- top-source counts;
- latest available fetch timestamp;
- explicit `runtime_story_evidence_only` and `source_health_unavailable` reasons;
- `single_source_section` when applicable.

## Production acceptance

After merge, the existing `deployment/world-health` Playwright gate must verify that the deployed World badge is concrete, the diagnostics popover opens, `sectionId=world`, story/source counts are positive, and top-source evidence is recorded.
