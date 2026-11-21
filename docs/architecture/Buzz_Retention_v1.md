# Buzz rolling retention v1 — candidate, not deployed

## Custody and authority

- **Input:** `public/newsdata/sections_latest.json` from the existing GitHub
  Sections RSS collector, not a replacement for that collector.
- **Dedicated output:** `public/newsdata/buzz_retained_latest.json`, a rolling
  source-dated copy of eligible Entertainment, Technology and Social stories.
- **Receipt:** `public/newsdata/buzz_retention_report.json`, SHA-256 receipt,
  source age, accepted counts, capped-out counts and withdrawal records.
- **Cloudflare:** PR #183 provides a distinct unmerged Cloudflare evidence
  mirror. This candidate **does not** read the Worker or promote Cloudflare
  shadow to production authority. Combining sources requires an explicit
  audited source-selection contract, not blind mixing.
- **Use:** Buzz Hub only. Top Stories/Sections/Insight are not assigned
  authority from the Buzz rolling copy. Original publisher `publishedAt`
  is unchanged during retention, source outages and re-verification.

## Display lifecycle

1. Freshness: publisher publication + **36h**.
2. Rolling display: publisher-dated article may stay eligible if its exact
   canonical URL is encountered again in a **new** collector snapshot.
   `lastVerifiedAt` changes only when the publisher feed genuinely
   re-observes the article, never merely because the workflow retries.
3. After an observation, display through the later of the 36h initial
   window or `lastVerifiedAt + 36h`.
4. Hard expiry is publisher publication + **168h** for Entertainment and
   Technology, **72h** for Social. Explicit publisher `expiryAt` or
   withdrawal can only shorten that window.
5. Source disappearance is not a withdrawal. Retain an eligible copy up to
   its computed deadline; report cached evidence as retained, never fresh.
6. Retraction/cancellation generates a seven-day bounded tombstone so
   a delayed source replay cannot resurrect the withdrawn story without
   explicit publisher reinstatement evidence.
7. Duplicate canonical URLs are deduped within each Buzz section.
   Unclassified-but-verified Entertainment is displayed under **Latest**,
   not falsely labelled Tamil/Hindi/Hollywood/OTT. Regional classification
   continues to require genuine subject evidence.

## Storage hard limits

- **400 active story items** across Entertainment, Social, Technology.
- **3,000,000 bytes for the complete formatted rolling JSON** (including
  metadata and tombstones), with overflow decisions disclosed.
- Soft admission quotas: Entertainment 160; Social 120; Technology 120.
  Unused quota is redistributed, subject to the global hard cap.
- The report itself is capped to 150,000 bytes; withdrawal tombstones
  are capped at 500, retained for at most seven days.
- The browser **marks** a rolling snapshot stale after 12h, without
  discarding individually verified stories that remain within their
  source-derived `displayUntil`. It still rejects invalid/future clocks,
  bad contracts, oversized responses, withdrawals, and expired stories.
  LocalStorage caches are pruned per story, never by an 8h blanket TTL.
  The live page reads the Pages-origin release, never unpinned raw GitHub
  `main`; data-only publication is not a Pages deployment.
- Automatic caps do **not** apply to user-owned Planner entries.

A maximum display age is **not** a promise that every story will last
seven days: without re-verification, an article expires at the normal
36-hour window. The current Sections collector also applies a 36-hour
source admission limit, so maximum retention requires repeated authentic
observations before that cut-off or a separately approved older-story
verification lane.

## Publication and verification

`.github/workflows/buzz_rolling_retention.yml` is independent from
the Sections recovery workflow. PRs run no write job. After approved
merge, scheduled/main dispatch reads the current GitHub source,
preserves eligible prior records, validates SHA-256, timestamp custody,
retention metadata and byte quotas, then commits only the qualified
rolling JSON and its receipt. When there is no qualifying active content,
publication fails closed rather than overwriting the last file with
empty data. GitHub Pages build/deployment is **not** triggered here.

Acceptance must include:

- Real committed Sections corpus → exact source-clock fixed-time rehearsal.
- Overnight no-feed continuity without refreshing publication timestamps.
- Explicit expiry/withdrawal/tombstone, low-confidence timestamp and
  replay negative controls.
- Repeated feed verification with hard 7-day cap and 72h Social cap.
- 400-item and 3MB stress; no silent data loss; digest/byte proof.
- Direct browser checks for all four named Entertainment regions, the
  honest Latest fallback, Social, Tech, real refreshes and missing provider.
- End-to-end deployed-origin evidence after explicit merge/deployment
  authorization; local/CI tests alone cannot certify production cards.

**Current state:** draft PR #186. No merge, Pages deploy, Workers
mutation or committed production rolling dataset is claimed.
