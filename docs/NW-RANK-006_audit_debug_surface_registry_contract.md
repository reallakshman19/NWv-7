# NW-RANK-006 — Audit/debug surface registry contract

## Discovery result
Repository search found audit documentation and diagnostic concepts, but no confirmed isolated owner-only audit/debug provider registry that could safely accept a Top Stories audit payload without touching user-facing runtime surfaces.

Because no safe existing registry was confirmed, NW-RANK-006 introduces a minimal pure registry contract under:

```text
src/services/auditDebug/auditDebugRegistry.js
```

The registry is not wired into app routing, tabs, ViewModel, datasets, Data Health, or generated public data.

## Why no user-facing UI is wired
The current mission is discovery and registry-contract hardening only. A UI/export hook would require an explicit isolated audit/debug surface. No such surface was confirmed during discovery.

Therefore:

```text
No app routing changed.
No tab UI changed.
No ViewModel changed.
No dataset runtime changed.
No user-facing component changed.
```

## Registry contract
The registry module exports named functions only:

```js
createAuditDebugRegistry()
registerAuditDebugProvider(registry, provider)
listAuditDebugProviders(registry)
getAuditDebugProvider(registry, id)
buildAuditDebugPayload(registry, id, options)
```

Rules:

```text
Pure functions only.
No global mutable singleton.
No browser APIs.
No network.
No fetch / XMLHttpRequest / WebSocket.
No filesystem writes.
No generated public data.
Deterministic provider order.
Duplicate provider IDs are rejected.
Providers without buildPayload are rejected.
Registry/provider inputs are not mutated.
Registration returns a new registry object.
```

## Provider contract
A provider has this shape:

```js
{
  id,
  title,
  description,
  mode,
  buildPayload
}
```

Provider requirements:

```text
id is a stable unique string.
title is owner/auditor readable.
description explains the payload.
mode identifies runtime mode, such as shadow-audit.
buildPayload(options) returns a deterministic audit payload.
```

## Top Stories registration contract
The Top Stories registration module exports:

```js
createTopStoriesAuditDebugProvider()
registerTopStoriesAuditDebugProvider(registry)
```

Provider metadata:

```text
id: top-stories.audit.shadow
mode: shadow-audit
```

The provider calls:

```js
getTopStoriesAuditComparisonPayload(options)
```

from the NW-RANK-005 audit adapter. It does not import ViewModel, datasets, RSS, app runtime, browser modules, or generated data.

## Future UI/export conditions
A future UI/export mission may consume this registry only if all conditions below are satisfied:

```text
There is an explicit isolated owner/auditor debug surface.
The surface is not part of normal user-facing Top Stories rendering.
The surface does not change rankTopStories behavior.
The surface does not trigger live RSS fetch.
The surface does not modify public/newsdata.
The surface does not require package/workflow churn unless separately approved.
The surface can call buildAuditDebugPayload() as a read-only audit action.
```

Until those conditions are met, this registry remains a pure shadow-mode contract.
