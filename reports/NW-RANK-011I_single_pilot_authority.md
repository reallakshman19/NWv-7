# NW-RANK-011I — Establish one scheduled pilot decision authority

## Trigger

Version 0.3 requires one fail-closed seven-day pilot decision path. The repository contained two recurring workflows:

- `top_stories_shadow_pilot_decision.yml`, which reads the immutable study configuration, fixed pilot start date, fixed seven-day window and evaluation time;
- `top_stories_shadow_pilot_rollup.yml`, which accepted arbitrary date ranges and published a second decision-shaped artifact.

The second workflow could be misread as an authoritative pilot conclusion even though it did not enforce the configured study window or the `pilotDecisionNotBefore` gate.

## Correction

- Kept `top_stories_shadow_pilot_decision.yml` as the sole scheduled pilot decision workflow.
- Converted `top_stories_shadow_pilot_rollup.yml` to manual-only diagnostic execution.
- Renamed the workflow and artifact identity to state that it is diagnostic.
- Marked every diagnostic rollup with:

```text
decisionAuthority = false
diagnosticOnly = true
governingWorkflow = top_stories_shadow_pilot_decision.yml
governingDecisionSchema = nw-top-stories-seven-day-pilot-decision/v1
productionChangeAuthorized = false
persistenceChangeAuthorized = false
automaticPolicyChangeAuthorized = false
```

- Updated Markdown and manifest outputs so the diagnostic result cannot be mistaken for the governing decision.
- Added certification that only the fixed-window workflow contains a recurring schedule.

## Scope

No ranking weights, thresholds, windows, event classification, identity resolution, source policy, Main UI, generated news data, deployment behavior, persistence or hysteresis changed.

## Validation

Focused certification covers:

- canonical active evidence remains non-overlapping;
- diagnostic authority flags are always fail-closed;
- byte-stable diagnostic output and manifest fields;
- arbitrary diagnostic date bounds remain available only through manual dispatch;
- exactly one scheduled pilot decision workflow remains.

Required repository checks:

```bash
npm run lint
npm run build
npm run test:certify
```
