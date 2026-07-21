# NW-RANK-012G — World-health segment determinism

## Mission result

The deployed World-health verifier now uses a deterministic, same-day,
non-urgent UTC browser clock before navigation. Application runtime behavior is
unchanged.

## Confirmed failure

After NW-RANK-012F merged, Pages run `29797422876` produced:

```text
build                                    PASS
deploy                                   PASS
Verify deployed Pages source provenance PASS
Verify deployed World section health    FAIL
```

The World-health evidence report failed while waiting for `#world-news`. Its
screenshot showed a successfully loaded Main page with Breaking and Quick
Weather content.

The failure occurred because the live verification clock selected the
`urgent_only` segment while breaking news was present. Main intentionally hides
Top Stories and all normal regional sections in that state. The verifier treated
an intentionally absent World section as a deployment failure.

This was a verifier false negative, not a Pages build, deployment, provenance,
or source-data failure.

## Deterministic clock policy

The verifier resolves one browser verification time on the same UTC calendar
date:

```text
before 06:00 UTC -> 06:30 UTC
06:00–19:59 UTC  -> retain actual time
20:00 or later   -> 19:30 UTC
```

The Chromium context explicitly uses:

```text
timezoneId: UTC
serviceWorkers: block
```

Before the first navigation, the verifier calls Playwright
`page.clock.setFixedTime(verificationClock)`. This fixes `Date.now()` and
`new Date()` for the browser while allowing normal timers to continue.

No application clock, query override, source file, segment rule, or breaking
state is modified.

## Evidence contract

The existing report fields remain and the verifier adds:

```text
actualCheckedAt
verificationClock
verificationTimezone
verificationSegmentExpectation
clockMode
```

The real Node-side execution time remains distinct from the browser verification
clock. Evidence and failure screenshots are still written before a non-zero
exit.

## Preserved World-health assertions

The repair does not weaken the gate. It still requires:

- visible `#world-news`;
- a concrete section-health badge status;
- an opened diagnostics dialog;
- diagnostics other than `unknown — diagnostics unavailable`;
- `sectionId === world`;
- positive story and source-group counts;
- recorded top-source evidence.

## Scope preservation

Unchanged:

- `MainPage` urgent-mode rendering;
- `SegmentContext` and `segmentScheduler`;
- breaking-news detection and display;
- section-health calculation and fallback;
- Top Stories ranking and projection;
- settings, travel, read/view filtering, and source acquisition;
- Pages workflow sequencing and provenance verification;
- generated data and package dependencies.

## Validation posture

The focused certification proves boundary times, same-day resolution,
non-urgent output, invalid-input failure, clock-before-navigation ordering,
explicit UTC context, preserved World assertions, and import-safe CLI behavior.

Required repository gates remain:

```text
focused Vitest
npm run lint
npm run build
npm run test:certify
Data Freshness Contracts
CI Validation Gate
Audit Regression
NWv-7 Certification
```

The restored `deployment/world-health` result is verified after merge by the
actual Pages workflow.

## G3 posture

This repair makes an existing deployed browser health gate deterministic. It
does not compare browser-visible Top Stories order with an independently replayed
ranking result.

G3 remains blocked. No production ranking or policy change is authorized.
