# Sections Cloudflare → GitHub evidence mirror (candidate, not deployed)

## Purpose and custody boundary

This is a **separate data-only mirror** of the Cloudflare Sections Worker read-only
`/preview/sections/latest` projection. It follows the independently scheduled
GitHub JSON approach used by `public/data/up_ahead.json`, without altering the
existing independent GitHub RSS producer at
`public/newsdata/sections_latest.json`.

- `public/newsdata/sections_cloudflare_latest.json` — exact accepted Worker
  response bytes (created by the scheduled mirror job after merge).
- `public/newsdata/sections_cloudflare_manifest.json` — SHA-256 of those
  bytes; source URL, Cloudflare epoch, committed time, pointer generation,
  decision output digest, publisher story counts, mirror observation time.
- `public/newsdata/sections_latest.json` — independent GitHub RSS snapshot.
  **Do not overwrite it with Cloudflare data**.
- `public/data/up_ahead.json` — unrelated Up Ahead lifecycle dataset.
  **Do not alter it**.

The mirror does **not** promote Cloudflare shadow to production Sections
authority. The declared `S1_GITHUB_PRIMARY_CF_SHADOW` policy and issue #121
remain in force. The currently deployed Cloudflare-default config is a
separate identified discrepancy, not authorization to reassign authority.

## Acquisition and failure rules

`.github/workflows/sections_cloudflare_mirror.yml` executes only after
the local contract tests pass. A `pull_request` runs tests but does not
write data. After an independently approved merge, the workflow may run on
schedule or manual dispatch and only commits on `main` if all conditions pass.

1. GET the exact public Worker preview (no token, no write endpoint).
2. Require schema v2, non-stale/future timestamps, proven committed evidence,
   a valid 64-character decision digest consistent with the content-hash
   prefix, positive pointer generation, and at least one publisher-dated
   eligible article.
3. Compare with the previous GitHub mirror: disallow generation rollback,
   changed bytes within the same committed generation, and prior file/hash
   tampering.
4. Store original bytes without reserialization. Atomically replace the
   local snapshot and digest manifest; commit **both together**.
5. On any error, exit nonzero and leave GitHub's previous mirror intact.
   Never rewrite `fetchedAt`, `publishedAt`, or the Cloudflare epoch.

An acquisition failure does not constitute a zero-story update and cannot
replace the previous snapshot. A retained mirror is historical evidence;
it is **not automatically eligible as fresh news** when expired.

## Not in this workpack

- No application runtime change, authority flip, Pages deployment, Worker
  mutation, or data publication before independent review and authorization.
- No replacement of the GitHub publisher collector. Two sources stay
  independently attributable.
- No claim of true per-story expiry support. Cloudflare's existing preview
  is bounded to publisher-timestamp age, not complete lifecycle metadata.
  A future `sections_retained_latest.json` or equivalent rolling store
  must track `freshUntil`, `displayUntil`, `archiveUntil`,
  supersession and withdrawal with verified evidence, as previously
  requested. Such a store must **not modify the exact Cloudflare mirror**.
- Do not wire `raw.githubusercontent.com` as an unverified production feed.
  A served release/pointer and real browser verification are separate gates.

## Acceptance gates

- Positive: committed current epoch copied byte-for-byte; SHA-256 and
  metadata verified, no modified publisher timestamps, same epoch is no-op.
- Negative: stale, future, uncommitted, fake digest, bad schema, empty, replayed,
  lower pointer generation, in-place mutation and tampered previous mirror
  all fail without mutating published data.
- Operational: schedule produces verified paired JSON files without a Pages
  release, with an independent retrieval/check of published source bytes.
- Product: Buzz Hub cards must be verified in a real Pages-origin browser
  against selected source/epoch. GitHub mirror success alone does not prove
  the UI no longer shows empty categories.

**Status:** implementation candidate only. No merge, deployment, source
promotion or successful real Worker acquisition is claimed by this document.
