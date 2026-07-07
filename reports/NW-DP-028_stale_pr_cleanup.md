# NW-DP-028 — Stale PR Cleanup and Supersession Closeout

## Mission statement

NW-DP-028 cleans up stale/superseded open PRs after the NW-DP edge/API/operator-visibility chain landed, so the repository has one clear delivery state and no duplicate DP branches competing with `main`.

## Dependency status

NW-DP-027 was listed as merged in the issue dependency:

```text
758a884116bc6cdecfa9111cd39eaf77e488cea9
```

## Scope

Allowed file changed:

```text
reports/NW-DP-028_stale_pr_cleanup.md
```

No app implementation, Worker source, dataset loader/client/provider, runtime source-selection, service, server, workflow, generated data, certification runner, or deployment automation files were modified.

## Cleanup actions

| PR | Title | Classification | Action taken | Future recommendation |
|---:|---|---|---|---|
| #341 | NW-DP-009: add Up Ahead edge API smoke verification harness | Superseded | Commented and closed | Use the merged NW-DP edge/API/readiness/operator chain. Open a new Work Pack only for net-new smoke/readiness enhancements. |
| #286 | Main: Demote stale stories from Top Stories | Still relevant but needs new Work Pack | Commented and closed | Open a fresh focused Main/Top Stories stale-story demotion Work Pack against current `main`; do not revive the stale draft diff. |
| #282 | Agent/ranking phase f validator | Abandoned / not planned | Commented and closed | Open a new ranking-validator Work Pack only if still required; current PR had zero changed files. |
| #280 | Agent/ranking phase d insight ranker | Abandoned / not planned | Commented and closed | Open a new insight-ranking Work Pack only if still required; current PR had zero changed files. |
| #262 | Merge pull request #253 from ranking Phase I certification wiring | Superseded / safe to close | Commented and closed | Open a new ranking-certification wiring Work Pack only if still required; current PR had zero changed files. |
| #261 | Merge pull request #250 from ranking Phase H workflow policy | Superseded / safe to close | Commented and closed | Open a new ranking-workflow policy Work Pack only if still required; current PR had zero changed files. |

## PR #341 audit

PR #341 intended to add:

```text
scripts/smoke_up_ahead_edge_api.mjs
scripts/test_up_ahead_edge_smoke_static.mjs
cloudflare/upahead-dataset-api/DEPLOYMENT.md reference
reports/NW-DP-009_up_ahead_edge_smoke_verification.md
```

This capability is superseded by the merged NW-DP chain, including:

```text
smoke harness and static smoke guard
source diagnostics/freshness/CORS/payload/static guards
maintained edge/API/Data Health runner
readiness command
readiness static guard wired into the edge runner
operator-facing Up Ahead Edge Activation status panel
```

Directly merging #341 would reintroduce stale duplicate work and compete with current `main`.

## Ranking PR audit

The old ranking PRs were reviewed for current delivery state rather than merged directly.

- #282, #280, #262, and #261 had zero changed files against current `main`; there was no current reviewable diff to merge.
- #286 targeted a real visible concern, but it was an old draft with a broad stale Main view-model diff and outdated base. It should be replaced by a new Work Pack if the stale-story issue is still active.

## Validation run

Planned validation commands for a report-only PR:

```bash
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR should remain draft until GitHub Actions and/or local validation confirms the commands above.

## Repository state after cleanup

The targeted stale backlog PRs were no longer left ambiguously pending:

```text
#341 — closed as superseded
#286 — closed; future Work Pack required if still relevant
#282 — closed as abandoned/not planned
#280 — closed as abandoned/not planned
#262 — closed as superseded/safe to close
#261 — closed as superseded/safe to close
```

## Notes

During cleanup, an accidental temporary issue `#380` was created and immediately closed as not planned. No work is tracked there.

## Non-goals

- No app implementation changes.
- No Worker source changes.
- No dataset loader/client/provider changes.
- No runtime source-selection changes.
- No service changes.
- No server script changes.
- No workflow changes.
- No generated data changes.
- No certification runner changes.
- No deployment automation changes.
- No stale PR was merged directly.
