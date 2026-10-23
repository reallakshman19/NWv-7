<!-- Every named "- Field:" below is required by the structural validator. If not applicable,
     give a specific explanation instead of leaving it blank. The checkboxes at the
     bottom are reviewer prompts, NOT machine-verified proof of execution. -->
# Problem and evidence
<!-- Link issue/audit finding, observed failure, affected users, and repro steps. -->
- Issue / audit finding:
- Reproduced on commit:
- Expected behavior:
- Observed behavior:
- Evidence (logs/screenshots/fixture):

# Root cause
<!-- Identify the actual runtime path and failed invariant; not just the symptom. -->
- Root cause:
- Relevant upstream/downstream contracts:
- Alternatives rejected and why:

# What changed
<!-- Map each claimed repair to concrete implementation and regression coverage. -->
| Claimed correction / invariant | Runtime code path | Regression test / fixture |
| --- | --- | --- |
| | | |

# Scope control
- In scope:
- Explicitly unchanged:
- Related PRs / branch dependencies:
- Data schema, freshness, source authority, cache, or policy changes (or `none`):

# Verification on the exact PR head
<!-- PASS requires a command actually executed against the HEAD SHA below. Never call a written test PASS. -->
- PR head SHA:
- CI run URL:
| Gate | Status (PASS / FAIL / NOT_RUN / BLOCKED) | Evidence / reason |
| --- | --- | --- |
| Lint | | |
| Unit & regression tests | | |
| Build | | |
| Domain certification (editorial / workflow / data platform, as applicable) | | |
| Integration / browser smoke | | |
| Staging or production validation | | |

# Operational acceptance
- Runtime/environment tested (Static / Live / Hybrid / Worker):
- Real data epoch / timestamp / source authority:
- Before/after observations:
- Warnings or degraded behavior remaining:
<!-- State yes/no, and include the release SHA if yes. -->
- Deployment performed?:
- Rollback commit or recovery plan:

# Review disposition
<!-- Approval must be from an independent, qualified reviewer, not the author. -->
- Reviewer(s):
- Unresolved risks and evidence gaps:
- Follow-up issue(s):
- Merge decision: `DO NOT MERGE` until required checks and independent review pass.

- [ ] Corrective code matches all claims in this description
- [ ] Tests reproduce the original defect before the fix and pass after it
- [ ] Required checks passed on the exact final PR head
- [ ] Changed code and its dependents were reviewed independently
- [ ] No unqualified production-success claim was made
- [ ] Branch/ruleset and deployment gates are satisfied
