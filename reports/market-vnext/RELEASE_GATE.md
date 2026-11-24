# Market vNext — MP13–15 release evidence checklist

Status: **CORRECTIVE REVIEW IN VALIDATION**. The owner now explicitly requests review, fixes and merge. Bounded code integration requires current-head checks and responsive proof; restricted price sources and full programme/release certification remain unproven. See [independent review and corrective work report](INDEPENDENT_REVIEW.md). Repairs are self-assessed, not a distinct independent approval.

## Verified historical evidence

- MP01–08 automated CI passed on `68cabb371e176ae3ef037e62625895372e1a5fda`: https://github.com/reallakshman19/NWv-7/actions/runs/45458006330.
- MP09–12 CI on `2e8ef18f9effda97eaa0b3fb19b9d2b3f367a5a7` failed lint (non-component export in FundCompareModal.jsx): https://github.com/reallakshman19/NWv-7/actions/runs/45459150092. WP00 and provider browser proof passed on that head; main CI did not reach unit tests/build.
- Correction: pure fund comparison and chart range modules. Exact final-head CI must establish the correction; previous-head evidence cannot substitute.

## Final batch scope

- Existing NAV and FX latest-reference acquisition calls use a shared preflight, timeout and typed-observation qualification bridge. Existing provider identity/date validation, rate-limit cooldown, store-level coalescing and result shapes retained. History paths are not yet routed through this bridge.
- Existing nine workspace IDs and navigation retained. Overview shows source-aware headline states; index/provider board precedes FX and personal tools on mobile; wide layout uses a personal rail. In-page section shortcuts are collapsed by default.
- Responsive browser workflow: built preview, fresh synthetic browser profiles, external network requests blocked; widths 320, 360, 390, 430, 768, 1280. Navigation across nine workspaces at narrow/wide endpoints. Screenshots and JSON report are CI artifacts, not production witness.
- No new exchange/provider permissions, public quote assets, database migrations, production releases or changes to user records.

## Release gates

| Gate | Disposition at authorship |
| --- | --- |
| Exact-head lint, full tests, build, contract and regression checks | Pending |
| Real browser MFapi/Frankfurter acquisition | Pending exact-head proof |
| Six-width screenshots and route/overflow tests | Pending exact-head proof and visual inspection |
| No copied public market data | Pending exact-head publication-asset scan |
| Four headline index values rendered legitimately | BLOCKED: NSE display rights unverified, BSE visual proof outstanding |
| Native equity, breadth, IPO/sector observations | BLOCKED: no approved feed demonstrated |
| Full repository seams and cross-tab mutation conflicts | Incomplete |
| Independent Common OnBoard IR and owner acceptance | NOT_RUN |
| Deployed-site browser witness and rollback validation | NOT_RUN; no release authorized |

## Independent review instructions

Review the exact PR head, not prior commit success. Verify existing storage protection and import behavior using disposable fixtures; do not publish holdings or receipt payloads. Confirm provider action rights separately from transport availability; verify actual provider-owned displays by visual inspection with the correct index identity and provider date. Do not equate frame load, HTTP success or external links with four functioning index values. Check responsive artifacts at all six widths, long labels, mobile More navigation, and blocked provider behavior. Record PASS/FAIL/BLOCKED with evidence and reviewer identity. Do not approve release while mandatory source and deployed-site gates are unresolved.

## Rollback

No deployment or merge has occurred. Preserve main and existing storage; reject or revise the draft branch. Any later release requires a separately approved rollback target and witness.
