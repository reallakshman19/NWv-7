# NW-DP-029 — Up Ahead production activation smoke evidence

## Mission
Capture safe production activation smoke evidence for the Up Ahead edge dataset API after the repo-side edge/API/readiness/operator chain has landed.

Controlling issue: #382 — `NW-DP-029: Up Ahead production activation smoke evidence`

Dependency:

```text
NW-DP-028 merged as 5f2e7b294bb96e8c3782e401d741f913c7fd43ec
```

## External prerequisite handling
The required externally supplied deployed Worker/API base URL was **not supplied** in this activation session.

Required external input:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host>
```

Safe handling applied:

```text
Real deployed host committed: no
Committed environment values added: no
Host value redacted in report: yes
Configured readiness executed: no — blocked by missing external URL
Live smoke executed: no — blocked by missing external URL
Data Health card verified against deployed endpoint: no — blocked by missing external URL
```

## Commands run
No local/npm commands were executed in this connector-only patching session.

Required commands remain:

```bash
npm run test:upahead-edge-readiness
VITE_API_BASE_URL=https://<redacted-deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config
VITE_API_BASE_URL=https://<redacted-deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke
```

## Results

| Validation item | Result | Evidence status |
|---|---:|---|
| No-network readiness | Not executed in this session | Pending operator/local run |
| Config-required readiness | Blocked | `VITE_API_BASE_URL` not supplied |
| Live smoke | Blocked | `VITE_API_BASE_URL` not supplied |
| Data Health `Up Ahead Edge Activation` card | Blocked | Requires app opened with configured API base URL |

## Redacted production evidence

| Evidence field | Value |
|---|---|
| Dataset API mode status | Not captured |
| Worker/API base URL status | Not supplied / redacted |
| Latest edge source | Not captured |
| Latest edge reason | Not captured |
| Latest edge freshness | Not captured |
| Latest edge age seconds | Not captured |
| Last diagnostics timestamp | Not captured |
| No-network readiness result | Not executed |
| Configured readiness result | Blocked by missing external URL |
| Live smoke result | Blocked by missing external URL |

## Data Health card evidence
The `Up Ahead Edge Activation` Data Health card was not verified in this session.

Reason:

```text
The app must be opened with VITE_API_BASE_URL=https://<redacted-deployed-worker-host> supplied externally.
No deployed Worker/API base URL was provided to this session.
```

## Scope compliance
- Runtime app implementation changed: no
- Worker source changed: no
- Dataset loader/client/provider changed: no
- Runtime source-selection changed: no
- Services/server scripts changed: no
- Workflows changed: no
- Generated data changed: no
- Package files changed: no
- Committed environment values added: no
- Real deployed host committed: no

## Stop conditions encountered
Stop condition encountered:

```text
VITE_API_BASE_URL was not supplied.
```

No deployed endpoint reachability, smoke result, or Data Health card verification is claimed in this report.

## Next operator action
Supply the deployed Worker/API base URL externally at runtime and rerun the mission commands without committing the host value:

```bash
npm run test:upahead-edge-readiness
VITE_API_BASE_URL=https://<deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config
VITE_API_BASE_URL=https://<deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke
```

Then open the app with the same externally supplied API base URL and record the redacted `Up Ahead Edge Activation` card evidence.
