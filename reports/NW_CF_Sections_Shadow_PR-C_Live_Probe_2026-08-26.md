# NW Cloudflare Sections shadow — live acquisition probe

Date: 2026-08-26
Deployment state: `S1_GITHUB_PRIMARY_CF_SHADOW`
Promotion status: `NOT_QUALIFIED`

## Outcome

The Cloudflare shadow can independently acquire all 41 registered lanes,
normalize and rank the resulting evidence with the repository authority, store
the epoch in the dedicated D1 database, and atomically commit the current
shadow pointer. GitHub/static remains the only browser-serving authority.

A standard Worker-fetch run committed correctly but Google News returned HTTP
503 from Cloudflare egress. That run produced 22 healthy lanes and 8/9 displayed
Top Stories overlap. Staggering, concurrency control, a browser-compatible
request identity, and one bounded retry proved that the response was not a
burst/retry defect: all 11 `google_news*` lanes still terminated as HTTP 503 on
their second attempt.

A disabled-by-default Browser Run adapter was then tested for those 11 lanes.
It uses one guarded browser session, produces an individual disposition for
every feed, retains only bounded normalized evidence, and records both reserved
and observed browser time in D1. The controlled probe completed with:

| Measure | Result |
| --- | ---: |
| Terminal lanes | 41/41 |
| Verified committed candidates | 270 |
| Reference healthy lanes | 29 |
| Shadow healthy lanes | 31 |
| Lane disposition/item-count matches | 35/41 |
| Displayed Top Stories overlap | 9/9 |
| Canonical-reference coverage | 100% |
| Shadow precision | 100% |
| Top-10 overlap rate | 100% |
| Stale admissions | 0 |
| Policy violations | 0 |
| False publisher corroborations | 0 |
| Browser time observed | 12.759 seconds |
| Browser time reserved | 20 seconds |

The first divergent boundary remains `ACQUISITION_DRIFT`, as expected for two
independent live collectors. It is not `UNKNOWN_DRIFT` and does not indicate a
ranking-policy divergence.

After this probe, the browser-to-Worker transfer was further hardened: it now
extracts no more than 20 entries and only the bounded title, summary, URL, and
publication-time fields per lane instead of transferring a complete response
body. Worker-runtime tests, type checks, dependency audit, deployment dry run,
and startup analysis pass for that revision. One controlled live confirmation
of the hardened transfer was then completed successfully:

| Hardened confirmation measure | Result |
| --- | ---: |
| Terminal lanes | 41/41 |
| Verified committed candidates | 273 |
| Shadow healthy lanes | 31 |
| Displayed Top Stories overlap | 8/9 |
| Stale admissions | 0 |
| Policy violations | 0 |
| False publisher corroborations | 0 |
| Additional browser time observed | 6.639 seconds |
| Browser time reserved | 20 seconds |

The hardened confirmation also classified the first divergent boundary as
`ACQUISITION_DRIFT`; its evidence was atomically committed and digest-verified.

## Free-plan assessment

The prototype remains within Free-tier limits for the measured run. The
application hard-caps Browser Run reservation at 480,000 ms per UTC day, below
Cloudflare's 600,000 ms Free allowance, and reserves 20,000 ms per browser
epoch. That allows at most 24 browser-assisted epochs per day. At that cadence,
200 comparable epochs require at least nine calendar days; this still satisfies
the “at least seven days and at least 200 epochs” qualification rule.

The two controlled observations used 19.398 browser seconds in total against
40 seconds reserved. The hourly qualification schedule is now active. The
20-second reservation and eight-minute daily stop remain fail-closed while the
multi-day evidence window tests daypart and weekend behavior.

Official limits used for this decision:

- <https://developers.cloudflare.com/browser-run/limits/>
- <https://developers.cloudflare.com/browser-run/pricing/>
- <https://developers.cloudflare.com/workers/platform/limits/>

## Safeguards proven

- no partial epoch can move the current pointer;
- immutable D1 evidence is verified before sealing;
- changed retries are rejected;
- transient standard-fetch responses receive one bounded retry;
- Browser Run has an independent D1 quota ledger and domain guardrail;
- the deployed Browser Run transport never requests an unbounded response body
  from the browser process;
- browser sessions close before D1 lane staging;
- the readiness gate does not auto-promote;
- the hourly schedule and guarded fallback are enabled only for qualification;
- browser reads, UI toggle, promotion, and production traffic remain disabled.

## Next gate

The hourly qualification schedule and independent repository observer are
active. Persist every parity report and evaluate them with:

```text
npm run sections:qualification -- --input-dir reports/sections-shadow-qualification --output <readiness.json>
```

The UI preview must remain absent until that command reports `QUALIFIED` and a
separate product change is authorized.
