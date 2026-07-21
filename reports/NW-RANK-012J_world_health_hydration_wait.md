# NW-RANK-012J — World hydration readiness before health assertion

## Result

The deployed World-health verifier now waits for positive World story hydration and a concrete health-badge status before evaluating the existing diagnostics contract.

No application runtime, section-health calculation, ranking, source, UI, workflow, package, or generated-data behavior changed.

## Production failure evidence

After PR #472 merged, Pages run `29814412313` completed build, deploy, and provenance verification successfully, but the World-health status failed.

The uploaded evidence reported:

```text
badgeStatus: unknown
badgeLabel: ⚪Unknown
sectionId: null
storyCount: null
sourceGroupCount: null
error: World section health badge is not concrete: unknown
```

The World section was present, so this was not the earlier urgent-segment suppression defect. The verifier read the badge before the asynchronous section data and health resolver finished hydrating.

## Correct readiness sequence

The verifier now uses this order:

```text
deterministic non-urgent UTC clock
→ deployed navigation
→ #world-news visible
→ positive #world-news .news-count
→ concrete badge data-status (ok|warning|critical)
→ open diagnostics
→ assert World evidence
```

### Hydration authority

The verifier waits up to 90 seconds for the rendered World count to contain a positive integer. It does not use a fixed delay as the primary readiness signal.

### Badge authority

After positive hydration, it waits conditionally for the badge `data-status` to become one of:

```text
ok
warning
critical
```

The existing concrete-status check remains and now reports that failure occurred after hydration when applicable.

## Evidence additions

The report preserves all prior fields and adds:

```text
finalUrl
hydrationMs
worldCountText
consoleErrors
pageErrors
```

Browser console errors and uncaught page errors are captured before navigation, bounded to 50 entries per list. Failure evidence and screenshot continue to be written before non-zero exit.

## Preserved deterministic clock contract

Unchanged:

```text
verificationTimezone: UTC
verificationSegmentExpectation: non-urgent
clockMode: playwright-set-fixed-time
```

`page.clock.setFixedTime(verificationClock)` still executes before the first `page.goto`. The actual Node execution timestamp remains distinct from the browser verification clock.

## Preserved substantive assertions

The verifier still requires:

- visible World section;
- concrete health badge;
- visible diagnostics dialog;
- diagnostics not marked unavailable;
- `sectionId === world`;
- positive story count;
- positive source-group count;
- top-source evidence.

No assertion was weakened into a generic page-load or screenshot-only success.

## Exact changed files

```text
scripts/verify_world_health_deployment.mjs
src/services/topStories/topStoriesWorldHealthDeploymentVerifier.cert.test.js
reports/NW-RANK-012J_world_health_hydration_wait.md
```

## Validation

Required checks:

```bash
npx vitest run --config vitest.config.js src/services/topStories/topStoriesWorldHealthDeploymentVerifier.cert.test.js
npm run lint
npm run build
npm run test:certify
```

Required exact-head workflows:

```text
Data Freshness Contracts
CI Validation Gate
Audit Regression
NWv-7 Certification
```

Post-merge acceptance additionally requires:

```text
deployment/pages-provenance SUCCESS
deployment/world-health     SUCCESS
```

## Historical draft

PR #424 described the same hydration race but predates the later deterministic-clock verifier. It must not be merged. This mission integrates hydration readiness into the current source authority instead of reviving the stale branch.

## Boundary

Issue #470 remains queued until this repair merges and the post-merge deployment status is verified. G3 remains blocked.
