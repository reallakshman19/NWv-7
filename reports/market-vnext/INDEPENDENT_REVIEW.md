# PR218 — source-grounded review and corrective work report

## Current recovery state

- WORK_INTENT: REVIEW followed by authorized repair; CRITICALITY: STANDARD software and financial-calculation correctness.
- Repository: reallakshman19/NWv-7; native task and evidence: https://github.com/reallakshman19/NWv-7/pull/218.
- Owner direction: independent review using Common OnBoard IR, fix, then merge. No source permission expansion is authorized.
- Candidate reviewed: a2e33e74a1479aac38d94340314a3fd02835a154; original baseline: 3f3c31223d30283083bb35a412cecf5be439f504.
- Grounding GE-IR218-01: main acead2494f23903fc039a29acdd4cadbf94139aa; drift is one weather snapshot commit, outside market code. Initial PR: draft, mergeable, no review threads. No AGENTS.md, master index or active claim records exist in the fetched tree.
- REPORT_BASIS_HEAD: reviewed candidate plus the corrective file ledger below; the containing commit is the new candidate. Live checks and subsequent native PR returns are authoritative for its final disposition.
- HANDOVER_READINESS: READY for CI follow-through; TAKEOVER_AUTHORITY: WRITE_ALLOWED by owner; APPENDIX_A_STATUS: NOT_REQUIRED for this standard software repair.
- Last checkpoint: 31778388268802927a4d849085e837d915cd1c81. WP00, live provider acquisition and strengthened responsive proof passed. Six new screenshots were inspected; tablet card/heading/control compression is resolved. Responsive artifact SHA256: 046eeb2f567633835655121e2310fb4e8c2708e59e18580659fb38452cfa18cf. One existing sibling-fixture receipt URL is corrected in this follow-up; no production code changed after that browser proof.
- Current stage: VALIDATE. Exact next action: retrieve CI and responsive/provider jobs on the corrective commit, inspect all six screenshots, reconcile this report in the same PR, then perform the authorized merge only if the bounded code checks pass.

## Independence and source basis

The reviewer did not author the incoming candidate, but had already read the owner's Batch 3 selection, PR description and CI status. This is an exposed source-grounded review, not a blind Stage 1. The frozen baseline is https://github.com/reallakshman19/NWv-7/pull/218#issuecomment-7141436238. The Stage 2 findings and contributor-role disclosure are https://github.com/reallakshman19/NWv-7/pull/218#issuecomment-7141634445. Repairs in this report are SELF-ASSESSED; no independent approval of those contributions is claimed.

The original authority is baseline docs/market/FREE_OPEN_ONLY_RELEASE.md, docs/market/R21_WP00_FOUNDATION.md, sourceRegistry.js, sourceReceipt.js and the original client/storage/math paths. The full original MP01–15 concept was not supplied. No whole-programme completion or legal/source-rights certification is inferred. 170 candidate source files were retrieved through GitHub and independently matched to their original Git blob SHAs before editing. Full local npm installation was blocked by the package network policy; GitHub CI must supply the full dependency-backed checks.

## Findings and bounded repairs

| ID | Severity | Original expectation and observed falsifier | Repair / verification |
| --- | --- | --- | --- |
| ISS-01 | Major | A 1Y return uses a shared on-or-before anchor within seven days. Shared 2025-11-21 NAV 100 to 2026-11-24 NAV 110 returned null after the comparison cut away the anchor. | Preserve the common return anchor. Also retain the documented simple-return convention for 1Y when holiday lookback extends elapsed days beyond 366. The independently calculated result is 10%, not a silently annualized 9.92%. A start more than seven days early remains unavailable. |
| ISS-02 | Major | Two store instances loaded before either write can let the second overwrite the first. Initial read denial or whitespace V2 also allowed later overwrite. | Compare persisted bytes before writes; stale edits stay in session memory with a conflict message. Preserve unknown/empty corrupt V2 bytes. This is optimistic stale-write protection, not atomic cross-tab locking; a simultaneous read/write race remains a limitation. |
| ISS-03 | Major boundary gap | The new projector relabelled scheme 654321 as requested scheme 123456. A receipt for another scheme likewise passed the envelope. Existing provider clients validate upstream identity, so this does not prove a real provider mix-up. | Validate actual returned scheme/pair before projection; bind receipt endpoint and currency to the instrument. Preserve the same-scheme bounded fallback and existing client return shapes. |
| ISS-04 | Moderate | A signal-ignoring acquisition stayed pending after caller cancellation. | Race acquisition with cancellation, remove the listener and reject promptly. A late payload cannot be published. |
| ISS-05 | Major usability | The hash-verified 768px screenshot shows squeezed two-column cards inside a 480px workspace, clipped controls and broken-word headings while the old document-overflow test passed. | Use actual container width for one-column cards, wrap summary headers and strengthen browser proof with minimum card width and internal control overflow. No workflow changes. |
| ISS-06 | CI blocker | Three existing workpack scope allowlists rejected the already-added responsive workflow; the vNext report directory was also omitted. | Permit exactly that workflow and immediate vNext Markdown reports through a shared predicate. Negative checks still reject unrelated workflows, traversals and executable/data reports. Existing policy-change triggers remain intact. |

## Validation ledger

| Check | Status | Observation / oracle | Candidate and limitation |
| --- | --- | --- | --- |
| New non-UI negative controls before repairs | FAIL as expected | LOCAL_EXECUTION / independently derived dates, identity and cancellation expectations | Incoming candidate: 6 of 8 checks failed, 2 positive/boundary controls passed. One failure is the newly introduced scope-predicate expectation. |
| Store negative controls before repairs | FAIL as expected | LOCAL_EXECUTION / disposable storage fixtures | Incoming candidate: 3/3 failed. Unit loader isolates uncalled React hook and quote-link helper; it throws if either is invoked. |
| New focused regression after repairs | PASS | LOCAL_EXECUTION / independent arithmetic and contrary fixtures | 11/11 pass; the 8 pure comparisons/reference/scope checks also pass without the unit loader. Full React/runtime checks remain CI work. |
| Existing path-trigger controls | PASS | LOCAL_EXECUTION / independent prohibited-path fixtures | 5/5, unchanged isolation triggers. |
| Incoming head full smoke gate | PASS | REMOTE_EXECUTION / inspected CI | Lint, unit and build passed on a2e33e7. Overall CI failed its later three scope checks, so not a whole-CI PASS. |
| Incoming responsive artifact | CONTRADICTED for usability | ARTIFACT_INSPECTION / screenshots and strengthened contrary check | Run 45462364211, SHA256 c0bbbfa85a043e1cd678d78f981c1af69769675f2fa3237c3f78eccc485c024a. Page-overflow assertions passed, tablet usability did not. |
| Incoming live provider report | PASS, bounded | ARTIFACT_INSPECTION of REMOTE_EXECUTION | Run 45462364272, artifact SHA256 1e33ffd1609d7a94c8ba6225f9c83ba7b88c67ce03ed89cc0e610794f0167dec. USD/INR and OMR/INR provider date 2026-11-24; MFapi 125497 date 2026-11-23. No values published. No four-index proof. |
| First corrective CI on 3177838 | FAIL | REMOTE_EXECUTION / inspected logs | 2317 unit tests passed, 7 skipped; one sibling-isolation fixture still reused the first scheme receipt URL. Corrected that fixture without changing its expected result or the wrong-receipt rejection. Build/later gates were not reached by main CI. |
| First corrective browser/contract checks | PASS | REMOTE_EXECUTION and ARTIFACT_INSPECTION | WP00 run 45468099081, provider run 45468098714 and responsive run 45468098949 pass; all six screenshots inspected. |
| Follow-up head full CI and browser proof | NOT_RUN at checkpoint | NOT_OBSERVED | Follow through on the exact containing commit; do not upgrade previous-head evidence to exact-head PASS. |

## Authority, risks and integration limits

Source permissions, source clocks, nine route IDs, local storage keys, public quote publication policy and consent remain unchanged. No other active provider branches (#209, #210, #217) are merged or used as dependencies. Their overlapping provider paths require fresh reconciliation if those branches change later; no exclusive claim registry was found.

Native NSE/equity/sector/breadth prices and four functioning headline values remain restricted/unproven. Full repository seams and historical refresh integration remain partial. No source-rights, full MP15, or production acceptance PASS is claimed. Merging this bounded code cannot certify those unavailable features. Main's existing Pages workflow deploys main pushes; any actual deployment requires its own observed result and truthful witness. Do not edit deployment workflows to evade a failed gate.

## Corrective file ledger

- scripts/market_r21_path_guard.mjs and test_market_r21_wp04_portfolio.mjs, test_market_r21_wp05_funds.mjs, test_market_r21_wp10_integration.mjs: bounded assurance-path support.
- scripts/test_market_r21_wp_vnext_review.mjs: 11 discriminating regressions, automatically included by the existing wp*.mjs CI glob.
- scripts/market_vnext_responsive.mjs: internal clipping and card-width assertions.
- src/market/features/funds/fundComparison.js and fundMath.js: shared lookback anchor and fixed-horizon return convention.
- src/market/features/equity/watchlistStore.js: stale/unknown-byte preservation.
- src/market/services/referenceAcquisition.js and contracts/priceObservation.js: cancellation, actual payload identity and receipt binding. priceRefreshCoordinator.cert.test.js now constructs a sibling fixture with its own scheme receipt URL; the independent wrong-receipt rejection remains unchanged.
- src/market/features/overview/MarketDeskOverview.css: container sizing and summary wrapping.
- reports/market-vnext/INDEPENDENT_REVIEW.md and RELEASE_GATE.md: current evidence, limits and continuation.

Original 39 PR paths remain attributable to the PR description. The corrective ledger adds seven paths (46 total expected); reconcile against live GitHub before closure. No private records, quote values, backup artifacts, dependency files or workflow modifications are part of this corrective patch.
