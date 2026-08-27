# NW Cloudflare Sections shadow — qualification activation

Date: 2026-08-26
Deployment state: `S1_GITHUB_PRIMARY_CF_SHADOW`
Qualification status: `NOT_QUALIFIED`

## Activation outcome

The bounded Browser Run transport passed a controlled confirmation and the
hourly Cloudflare qualification trigger is active. GitHub/static remains the
only production browser-serving authority. The Cloudflare Worker has no public
write route. A later explicit owner direction added an opt-in Cloudflare
Preview read with automatic GitHub fallback; it does not alter qualification.

| Evidence | Hardened confirmation | First automatic epoch |
| --- | ---: | ---: |
| Terminal lanes | 41/41 | 41/41 |
| Verified candidates | 273 | 277 |
| Healthy shadow lanes | 31 | 31 |
| Displayed overlap | 8/9 | 8/9 |
| Safety violations | 0 | 0 |
| Browser time | 6.639 seconds | 6.395 seconds |
| Classification | `ACQUISITION_DRIFT` | `ACQUISITION_DRIFT` |

Both epochs were atomically committed with verified immutable D1 evidence.
Neither produced unknown, infrastructure, ranking, stale-admission, policy, or
publisher-corroboration drift.

## Active operating loop

- Cloudflare runs one shadow epoch hourly.
- A D1 quota ledger reserves 20 seconds per epoch and stops at 480 seconds per
  UTC day, below the provider's 600-second Free allowance.
- An independent local repository observer captures reference evidence and
  writes reference-side parity reports after each Cloudflare run.
- Readiness is recalculated without promoting the deployment state.
- Default Cloudflare serving and Cloudflare production authority remain disabled.

The first Cron event was delivered 56 seconds after its nominal hour. Its
evidence was preserved and compared manually. The Worker now normalizes future
hourly logical slots to the UTC hour boundary, making scheduled retries and the
observer deterministic even when event delivery is delayed.

## Current qualification state

The evidence set contains 6/200 comparable epochs across two calendar days.
Aggregate canonical-reference coverage, shadow precision, and Top-10 overlap
are each 85.19%. Evidence verification is 100%, and all safety counters remain
zero. These early quality rates are observations, not a waiver of the frozen
95% coverage/precision and 90% overlap thresholds.

Qualification remains `NOT_QUALIFIED` until the complete time, volume,
weekend, daypart, quality, safety, and reliability gates pass. No automatic
promotion exists.
