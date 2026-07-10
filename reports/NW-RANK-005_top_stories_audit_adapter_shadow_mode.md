# NW-RANK-005 — Top Stories audit adapter shadow mode

## Mission
Expose the existing Top Stories owner audit snapshot through a safe shadow-mode adapter so owner/auditor review can access the golden/actual comparison payload without changing runtime ranking, live data, Data Health, workflows, generated newsdata, or user-facing Top Stories behavior.

## What changed
- Added `src/services/topStories/topStoriesAuditAdapter.js` with pure named exports:
  - `getTopStoriesAuditPayload(options)`
  - `getTopStoriesGoldenAuditPayload(options)`
  - `getTopStoriesAuditComparisonPayload(options)`
  - `serializeTopStoriesAuditPayload(payload)`
- Added `src/services/topStories/topStoriesAuditAdapter.cert.test.js` to certify deterministic payloads, golden comparison, stable serialization, immutability, no network primitives, and no forbidden runtime/browser imports.

## Adapter contract
`getTopStoriesAuditComparisonPayload(options)` returns:

```js
{
  ok,
  generatedAt,
  mode,
  actual,
  expected,
  comparison,
  summary
}
```

Contract details:

```text
mode = "shadow-audit"
generatedAt defaults to the deterministic fixture timestamp
actual comes from buildTopStoriesAuditSnapshot()
expected comes from buildTopStoriesGoldenReviewSnapshot()
comparison comes from compareTopStoriesAuditSnapshots()
summary is small and auditor-readable
```

The adapter reads the merged NW-RANK-004 audit harness only. It does not call live RSS, mutate fixture data, write files, generate public data, or register a runtime UI surface.

## Serialization contract
`serializeTopStoriesAuditPayload(payload)` returns a stable JSON string by recursively sorting object keys and removing function / undefined values.

Rules:

```text
No mutation of the payload.
No functions in serialized output.
No undefined values in serialized output.
Arrays preserve their original order.
Object keys are sorted recursively.
```

## Tests / validation
Required validation commands:

```bash
npx vitest run src/services/topStories/topStoriesAuditAdapter.cert.test.js
npx vitest run src/services/topStories/topStoriesAuditHarness.cert.test.js
npx vitest run src/services/topStories/topStoriesExplainability.cert.test.js
npx vitest run src/services/topStories/topStoriesRanker.cert.test.js
node src/viewModels/useMainTabViewModel.recency.cert.test.mjs
npm run lint
npm run test:unit
```

Connector-session status:

```text
Not locally executed in this connector-only patching session.
GitHub PR checks are the merge-gate source of truth.
```

## Scope compliance
- Runtime ranker authority changed: no
- Score formula changed: no
- Browser live RSS fetch introduced: no
- Generated public/newsdata changed: no
- Package files changed: no
- Workflow files changed: no
- Buzz / Up Ahead / Data Health touched: no
- ViewModel or dataset runtime changed: no
- UI surface changed: no
- New Top Stories ranker introduced: no

## Stop conditions encountered
None.

## UI hookup decision
Repository search did not find an isolated debug/audit registry suitable for a narrow additive registration. Therefore no UI hook was added in NW-RANK-005.

UI/export exposure is intentionally deferred until there is an explicit, isolated audit/debug surface that can consume this pure adapter without changing app runtime behavior.

## Auditor note
This mission is module + test + report only. The adapter is a shadow-mode read layer over the existing audit harness and golden snapshot. It does not alter `rankTopStories`, Top Stories scoring, slot selection, event classification, top-feed signal scoring, live data loading, ViewModel behavior, dataset behavior, workflows, package files, generated data, Buzz, Up Ahead, or Data Health.
