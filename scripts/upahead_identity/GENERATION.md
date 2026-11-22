# UpAhead v2 shadow generation — issue #200

**This is an offline SHADOW prototype, not the production UpAhead publisher.** It does not write `public/data/up_ahead.json`, invoke `fetch_upahead_events.py`, change Cloudflare routing, migrate Planner data, verify organizer authority, or authorize publishing. A matching SHA-256 proves integrity with respect to a claimed digest, **not** independent authority of the source or curation.

## Inputs and custody boundary

- An observations JSON **array** of source observations, independently pinned using the SHA-256 of its exact raw bytes.
- An **optional** externally prepared binding registry `{ "schemaVersion": "upahead-bindings/v2-shadow", "bindings": { "src:v2:...": { "authorityRole": "organizer", "authorityNamespace": "...", "authorityOccurrenceId": "...", "evidenceRefs": ["https://..."], "adjudicatedBy": "..." } } }`, also SHA-256-pinned. Never extract an authority binding from an untrusted article's own `verified` or `occurrenceId` flag. The binding registry and pin still require separate authenticated human/source custody.
- A known 40-character source commit, explicit source observation and publisher millisecond clocks (no clock inferred from JSON rebuild), and a selected shadow-output directory.
- An explicit `--expected-current` generation ID when a current generation already exists. Omit only for the first generation. This fences stale writers and requires a deliberate decision when the pointer changes.

## Offline invocation

```
python scripts/build_upahead_v2_shadow.py \
  --observations /private/frozen-observations.json \
  --observations-sha256 sha256:<verified-original-64-hex> \
  --bindings /private/externally-adjudicated-bindings.json \
  --bindings-sha256 sha256:<separately-verified-64-hex> \
  --source-commit <exact-40-hex-main-or-candidate-commit> \
  --observed-at-ms <source-observation-time-ms> \
  --published-at-ms <explicit-publication-time-ms> \
  --output /private/upahead-v2-shadow \
  --dry-run
```

Removing `--dry-run` writes to an offline shadow directory, **not** the app's public dataset. Repeating a write requires `--expected-current gen:v2:<40-hex>` to match the current pointer; switching to a newer generation is the only atomic publication operation.

## Immutable artifact layout

```
<shadow-output>/current.json                          # single atomic pointer
<shadow-output>/generations/gen:v2:<hash>/manifest.json
<shadow-output>/generations/gen:v2:<hash>/payload.json
<shadow-output>/generations/gen:v2:<hash>/ledger.json
```

All three content files are written and fsync'd before switching `current.json`. No old generation is deleted in this slice. Interrupted staging leaves the previous pointer in place. A corrupt pointer, missing artifact, wrong digest, duplicate canonical ID, stale-writer generation mismatch, unexpected concurrent lock or contradictory trusted occurrence **fails closed**. Recovery requires inspecting original artifacts and the writer lock before restarting; never blindly delete the lock.

The ledger includes previously resolved IDs and alias history. `UNVERIFIED`/`REVIEW` source observations are quarantined rather than displayed as verified; explicit cancellations become durable tombstones, and expiry is never extended by refresh. Pending admission requires a verified event date within 180 days and an explicit expiry. No new default fallback expiry is manufactured. This slice does not implement the full published 7-day admission/cap policy, nor does it migrate user Planner records.

## Cross-language parity

The Python canonical payload digest is checked against the exact Cloudflare `contentDigest()` and `verifyGeneration()` implementation in `identityV2Shadow.js`. It deliberately rejects floating-point public payload metadata and non-ASCII JSON *keys* until a separately specified cross-runtime serialization contract exists; ordinary Unicode text in *values* is supported. Raw ledger metadata may contain floats because the ledger bytes are SHA-256-pinned separately and not consumed as JavaScript's canonical public payload.

```
python -m unittest discover -s scripts -p 'test_upahead_*_v2_shadow.py' -v
node --test scripts/test_upahead_generation_v2_parity.mjs
npm run test:upahead-edge-api
```

No fixture-generated `VALID` response proves that a real organizer, issuer, retailer, release platform, GitHub publication, or deployed Cloudflare Worker is trustworthy. Before v2 becomes serving authority, implement audited curator custody, category-specific source contracts, complete retention/cap enforcement, exact-source ledger artifacts, service provider/Planner migrations, real Worker activation and independent end-to-end proof.
