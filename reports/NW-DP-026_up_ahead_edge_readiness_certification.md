# NW-DP-026 — Up Ahead Edge Readiness Certification Wiring

## Mission statement

NW-DP-026 wires the Up Ahead edge readiness static guard into the maintained edge/API/Data Health runner so NW-DP-025 readiness command coverage is protected by the normal certification path without running the full readiness command recursively.

## Files changed

- `scripts/run_up_ahead_edge_api_tests.mjs`
- `scripts/test_up_ahead_edge_certification_static.mjs`
- `reports/NW-DP-026_up_ahead_edge_readiness_certification.md`

## Current gap

NW-DP-025 added:

```text
scripts/check_up_ahead_edge_readiness.mjs
scripts/test_up_ahead_edge_readiness_static.mjs
npm run test:upahead-edge-readiness
```

The maintained edge pack already ran through:

```text
scripts/run_up_ahead_edge_api_tests.mjs
```

but it did not yet include the readiness static guard.

## Runner wiring

Updated:

```text
scripts/run_up_ahead_edge_api_tests.mjs
```

The edge runner now includes this final guard command:

```bash
node scripts/test_up_ahead_edge_readiness_static.mjs
```

Existing edge pack commands remain present and ordered before it:

```text
Worker contract executable/static checks
CORS/freshness/source/payload static guards
smoke static guard
dataset diagnostics static guard
dataset API client/provider cert tests
Data Health detail/summary/export static guards
DataHealthPanel cert test
```

## Recursion avoidance

The runner does not call:

```bash
npm run test:upahead-edge-readiness
```

That package script would invoke the readiness command, which in turn invokes the edge runner. Calling it from inside the edge runner would create recursive execution.

Instead, the runner calls only the static guard:

```bash
node scripts/test_up_ahead_edge_readiness_static.mjs
```

This protects the readiness command source contract without recursively running the full readiness command.

## Static guard update

Updated:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
```

The guard now verifies:

```text
runner includes scripts/test_up_ahead_edge_readiness_static.mjs
runner does not include npm run test:upahead-edge-readiness
readiness static guard file exists
NW-DP-026 report exists
existing edge command coverage remains present
existing certification-manifest wiring remains unchanged
```

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
npm run test:upahead-edge-api
npm run test:upahead-edge-readiness
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Compatibility behavior

- Existing edge pack checks remain present and ordered.
- Existing package scripts remain unchanged.
- Existing certification-manifest behavior remains unchanged.
- Existing readiness command behavior remains unchanged.
- No implementation files are modified.

## Non-goals

- No Worker source changes.
- No Wrangler example changes.
- No workflow changes.
- No runtime capability source changes.
- No dataset loader/client/provider changes.
- No service changes.
- No server script changes.
- No generated data changes.
- No UI/component/view-model implementation changes.
- No package script changes.
- No certification manifest changes.
- No readiness command behavior changes.
