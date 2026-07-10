# NW-RANK-006 — Audit debug registry contract for Top Stories shadow payload

## Mission
Discover whether the repository has, or should introduce, an isolated audit/debug surface contract for owner-only diagnostic payloads. If no safe existing registry exists, add only a minimal non-runtime registry contract in shadow mode.

## What changed
- Added `src/services/auditDebug/auditDebugRegistry.js` as a pure, deterministic audit/debug provider registry contract.
- Added `src/services/auditDebug/auditDebugRegistry.cert.test.js` to certify registry behavior.
- Added `src/services/topStories/topStoriesAuditDebugRegistration.js` as a Top Stories shadow-audit provider registration module.
- Added `src/services/topStories/topStoriesAuditDebugRegistration.cert.test.js` to certify provider metadata, payload generation, determinism, isolation, and no ranker behavior change.
- Added `docs/NW-RANK-006_audit_debug_surface_registry_contract.md` documenting discovery result, registry/provider contracts, and future UI/export conditions.

## Discovery result
Repository search found audit documentation and diagnostic concepts, but no confirmed isolated owner-only audit/debug provider registry suitable for a narrow additive registration.

Result:

```text
No existing safe registry confirmed.
Minimal pure registry contract added under src/services/auditDebug/.
No UI hook added.
No app/runtime surface changed.
```

## Registry contract
Named exports:

```js
createAuditDebugRegistry()
registerAuditDebugProvider(registry, provider)
listAuditDebugProviders(registry)
getAuditDebugProvider(registry, id)
buildAuditDebugPayload(registry, id, options)
```

Registry behavior:

```text
starts empty
returns new registry objects on registration
sorts providers deterministically by id
rejects duplicate provider ids
rejects providers without buildPayload function
returns structured provider-not-found failure
never mutates registry or provider inputs
```

## Top Stories provider contract
Named exports:

```js
createTopStoriesAuditDebugProvider()
registerTopStoriesAuditDebugProvider(registry)
```

Provider metadata:

```text
id: top-stories.audit.shadow
mode: shadow-audit
```

Payload source:

```js
getTopStoriesAuditComparisonPayload(options)
```

from the NW-RANK-005 adapter.

## Tests / validation
Required validation commands:

```bash
npx vitest run src/services/auditDebug/auditDebugRegistry.cert.test.js
npx vitest run src/services/topStories/topStoriesAuditDebugRegistration.cert.test.js
npx vitest run src/services/topStories/topStoriesAuditAdapter.cert.test.js
npx vitest run src/services/topStories/topStoriesAuditHarness.cert.test.js
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
- User-facing UI changed: no
- App routing / tab UI changed: no

## Stop conditions encountered
None.

## UI/export decision
No UI/export hook was added because no isolated debug/audit registry or owner-only surface was confirmed before this mission. The newly added registry is a pure contract that can be consumed by a future explicit audit/debug surface without changing Top Stories runtime behavior.
