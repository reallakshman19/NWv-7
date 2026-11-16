# NWv-7 S1 — prepublication trigger and artifact negative matrix
Status: DRAFT / NONPUBLISHING / OWNER-AND-SECURITY-UNRATIFIED
Date: 2026-10-28
Authority: [#121](https://github.com/reallakshman19/NWv-7/issues/121), [#150](https://github.com/reallakshman19/NWv-7/issues/150), [#143](https://github.com/reallakshman19/NWv-7/issues/143). Do **not** merge or deploy this branch on this evidence alone.

## Scope and limits
This branch is based on independently unmerged draft #155 and adds a **nonpublishing** executable negative test matrix, selected-response anti-swap validation, and a second snapshot seal check between manifest generation and `upload-pages-artifact`. The branch has no production permissions or live Pages/CDN change. The staging browser is Chromium on a GitHub Pages **named** origin with a locally proxied *unshipped* build, not proof of public Pages serving.

The existing 12h snapshot limit and 36h ordinary story limit remain code reality. The proposed six-hour independently trusted-acquisition-time gate and continuous mounted-card expiry are NOT implemented, ratified, or verified by this test. Cloudflare is shadow-only under S1.

## Test matrix (negative evidence is not an administrative bypass audit)

| ID | Mode | Controlled adversarial case | Required observation | Current proof scope |
| --- | --- | --- | --- | --- |
| T01 | executed Bash | `push`, PR, schedule and repository_dispatch attempt direct deployment | resolve job exits nonzero; no legitimate Pages trigger | Isolated workflow step executed under read-only CI |
| T02 | executed Bash | operator `workflow_dispatch` invalid or missing SHA | refuse checkout before build | Isolated workflow step |
| T03 | executed Bash | manual SHA valid but main superseded | block before artifact and before Pages deployment | Local git remote stub |
| T04–T11 | executed Bash | each of CI Validation Gate, News Prefetch, Market Refresh, Weather Refresh, UpAhead Refresh, Daily News Brief, Breaking Refresh, Travel local news prefetch: rejected conclusion, foreign repository, wrong branch or invalid upstream SHA | exit nonzero, no publish | Each named upstream separately challenged using the actual YAML shell block |
| T12 | executed Bash | successful main upstream from named workflows | exact CI SHA, or latest-main data-producer checkout followed by recertification | Positive/guard control, NOT release authorization |
| T13 | executed Bash | unknown upstream release workflow name | fail closed | Local source script |
| T14 | executed Bash | data/source SHA advances after browser qualification | refuse before artifact upload | Local git remote stub |
| T15 | executed Bash | main advances before deploy-only retry | refuse before deploy-pages | Local git remote stub |
| T16 | Vitest | changed dist/newsdata JSON after browser, even when report claims success | seal returns refusal | Byte-level snapshot mutation fixture |
| T17 | Vitest | expired, missing or future browser proof | seal refuses reused acceptance | Local finite lease, **not** a trusted origin clock |
| T18 | Vitest | swapped/missing digest, malformed dist or stale generation | seal refuses | Byte/provenance/age fixtures |
| T19 | Vitest | first static same-path HTTP response forged, then later clean; inverse ordering | refuse every mixed body/hash response | All matching responses must equal frozen candidate |
| T20 | actual nonpublishing Chromium | S1 World positive and synthetic shadow/mismatched source negative | browser run reports true only for static-qualified candidate, false for shadow | A real local-candidate Chromium run, NOT live Pages |
| T21 | static ordering | fail-before-build/Pages job dependency plus S1 seal between manifest and Pages upload | browser and seal must precede upload; deploy job depends on build | Source/test assertion only |
| T22 | **NOT_RUN / OWNER SECURITY BLOCKER** | GitHub owner/admin bypass of required review, environment or workflow | no release without separately authenticated approval | Main currently unprotected; actual privileged negative tests not authorized |
| T23 | **NOT_RUN / SECURITY BLOCKER** | Pages zip/artifact swap *after* preupload seal or during deploy job | deploy must independently authenticate the exact sealed artifact | Build→deploy full artifact digest/attestation binding NOT implemented |
| T24 | **NOT_RUN / OWNER BLOCKER** | rerun or workflow_dispatch retains authorized main SHA but has no new independent release approval | reject reuse without a fresh approved change ticket/authorization | No reviewer-gated protected production environment |
| T25 | **NOT_RUN / SECURITY BLOCKER** | local runner/trusted clock spoofing, signed publisher CAS, Cloudflare shadow unauthorized cutover | fail closed under trusted source/time | Approved time/publisher provenance not available |
| T26 | **NOT_RUN / PROGRAM DEFERRED** | H01–H12 independent hosting bake-off | independent host qualification | Explicitly Owner-deferred, do not run |

## Evidence handling
Record complete exact PR SHA, actual GitHub Actions job and attempt IDs, test names/denied cases, Chromium source event list, selected response digest, frozen candidate digest, and unchanged public deployment version. The run may PASS these nonpublishing checks while T22–T26 remain failed/blocked as production prerequisites. **Do not equate CI success with production approval.**

## Release gate decisions required
The Owner and security reviewer must authorize and ratify main protection, independent non-author CODEOWNERS/required reviews, protected Pages environment with independently approved deployment, artifact identity/attestation carried from the browser-qualified builder into the privileged deploy job (including reruns), signed publisher/time trust, and a tested rollback/freeze path. An unprotected `workflow_dispatch` path is not an approved release exception merely because the source is unchanged.

Until these controls are enforced and every required real negative case is run, **all draft PRs #142, #154, #155 and this test-only follow-on remain UNMERGED; no Pages/Cloudflare production operation is authorized**.
