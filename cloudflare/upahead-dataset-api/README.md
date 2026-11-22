# Up Ahead Dataset API Worker

This package contains a small Cloudflare Worker that serves the Up Ahead dataset API endpoint expected by the NW frontend:

```text
GET /api/datasets/upAhead
```

The Worker fetches a published static Up Ahead snapshot from `UP_AHEAD_DATASET_URL` and returns it with CORS and no-cache headers. It does not use R2, KV, Durable Objects, or any multi-dataset provider abstraction in this work pack.

For the manual activation sequence, verification checklist, and rollback path, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Local setup

1. Copy the example Wrangler config locally:

```bash
cp wrangler.toml.example wrangler.toml
```

2. Set the upstream source URL in `wrangler.toml`:

```toml
[vars]
UP_AHEAD_DATASET_URL = "https://<github-pages-host>/data/up_ahead.json"
```

3. Validate locally with Wrangler:

```bash
npx wrangler dev
```

4. Deploy after local validation:

```bash
npx wrangler deploy
```

## Frontend configuration

After deployment, configure the GitHub Pages build variable:

```text
Repository Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
Name: VITE_API_BASE_URL
Value: https://<deployed-worker-host>
```

Do not include `/api/datasets/upAhead` in `VITE_API_BASE_URL`; the DP-004 client appends that endpoint path.

## Endpoint behavior

```text
GET /api/datasets/upAhead      -> 200 JSON
OPTIONS /api/datasets/upAhead  -> 204 CORS response
POST/PUT/DELETE                -> 405 JSON
other paths                    -> 404 JSON
```

Fallback payload when `UP_AHEAD_DATASET_URL` is unset, unavailable, non-OK, or invalid JSON:

```json
{
  "timeline": [],
  "sections": {},
  "weekly_plan": [],
  "lastUpdated": null,
  "auditSummary": { "fallback": "missing_or_invalid_up_ahead_dataset" },
  "dropReport": []
}
```


## UpAhead v2 identity shadow verification — issue #200

The Worker now contains an **optional metadata-only** route `GET /api/datasets/upAhead/v2/verify`. It is not a data-serving endpoint and does not change `GET /api/datasets/upAhead`.

It returns 404 unless explicitly configured with:
- `UP_AHEAD_V2_SHADOW_ENABLED = "true"`
- `UP_AHEAD_V2_SHADOW_MANIFEST_URL = "https://<same-origin-host>/v2/<immutable-generation>/manifest.json"`
- `UP_AHEAD_V2_SHADOW_PAYLOAD_URL = "https://<same-origin-host>/v2/<immutable-generation>/payload.json"`
- Optional `UP_AHEAD_V2_SHADOW_TIMEOUT_MS = "3500"` (maximum 10000)

Use only operator-approved HTTPS endpoints. Never commit deployed URLs, tokens or secret config. The service validates the manifest/payload pair; it is **not a signature or authoritative provenance verification**. The response exposes status, generation, semantic digest and counts; it does not expose URLs or source observations.

States and status codes: `VALID` HTTP 200 (including verified empty), `INVALID` HTTP 422, `STALE_VALID` HTTP 503, `UPSTREAM_UNAVAILABLE` HTTP 503, `NOT_CONFIGURED` HTTP 503 when route enabled but URLs absent. A disabled route returns 404. `OPTIONS` supports the existing CORS contract; `POST` returns 405.

Verify locally with `node --test cloudflare/upahead-dataset-api/src/edgeV2Probe.test.mjs`; the normal `npm run test:upahead-edge-api` command includes this test. This is **shadow-only** functionality: do not activate live v2 serving or represent a successful probe as proof of organizer authority, production Worker availability, or frontend parity.


## Non-goals

- No R2 implementation.
- No KV implementation.
- No real Cloudflare account, route, or zone provisioning in source.
- No GitHub Actions deployment automation.
- No multi-dataset provider abstraction.
- No frontend runtime/client/provider changes.
