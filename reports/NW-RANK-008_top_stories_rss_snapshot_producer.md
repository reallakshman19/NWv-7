# NW-RANK-008 — Dedicated Top Stories RSS snapshot producer

## Mission
Add a dedicated server/workflow/local-CLI-side Top Stories RSS snapshot producer that can build `topFeedItems` / `topFeedSnapshot` rows for the existing Top Stories top-feed signal seam.

## Current seam used
The implementation does not change runtime ranking or browser behavior. It targets the already-existing seam:

```text
Dedicated RSS source config
→ Python producer parses server/workflow/local feed content
→ deterministic topFeedItems JSON payload
→ existing topStoriesTopFeedSignals.js can normalize rows later
→ rankTopStories remains final authority when payload is supplied by a later activation path
```

Repo seam confirmed in issue #398:

```text
rankTopStories() already accepts topFeedItems.
sectionsDataset already accepts options.topFeedItems / options.topFeedSnapshot.
topStoriesTopFeedSignals.js already normalizes top-feed snapshot rows.
```

## Source config contract
Added:

```text
config/top_stories_rss_sources.json
```

The config defines exactly three enabled public RSS source entries in deterministic order:

```text
bbc-news-top-stories
npr-news-top-stories
guardian-world-top-stories
```

Each source defines:

```text
id
source
sourceGroup
url
enabled
```

The source URLs are public, non-secret, non-environment-specific RSS URLs. No committed environment values were added.

## Producer output contract
Added:

```text
scripts/top_stories_rss_snapshot_producer.py
```

The producer emits JSON to stdout by default:

```json
{
  "schemaVersion": 1,
  "generatedAt": 0,
  "sourceCount": 3,
  "rowCount": 0,
  "sources": [],
  "topFeedItems": []
}
```

Each `topFeedItems` row is compatible with the existing Top Stories top-feed snapshot contract:

```text
id
canonicalId
title
url
link
source
sourceGroup
publishedAt
observedAt
topFeedRank
topFeedSource
clusterKey
```

The script supports:

```text
--config
--output
--dry-run
--now-ms
--max-per-source
--max-total
--freshness-hours
```

`--output` is optional for local/manual use and does not write generated runtime data by default. This PR intentionally does not add generated `public/newsdata` output or workflow activation.

## Freshness / retention policy
Default retention is bounded to fresh rows only:

```text
freshnessHours = 24
maxPerSource = 12
maxTotal = 36
future tolerance = 5 minutes
```

Rows are rejected when:

```text
required title/identity/published timestamp is missing
published timestamp is older than the freshness window
published timestamp is unexpectedly far in the future
source-local duplicate identity is already accepted
```

## Dedupe / identity policy
Identity is deterministic and source-local for duplicate removal:

```text
normalized URL without query/hash
→ guid/id if no URL
→ normalized title fallback
```

Canonical row IDs use a stable SHA-256 prefix:

```text
topfeed:<16 hex chars>
```

Duplicate rows within the same feed collapse deterministically. Cross-source mentions are retained as separate evidence rows so the existing top-feed signal normalizer can preserve source diversity and bounded consensus.

## Diagnostics behavior
Source-level diagnostics are captured per feed:

```text
id
ok
items
staleRejected
duplicatesRejected
malformedRejected
error
```

Malformed feed errors are captured in the affected source diagnostic record and do not crash the whole producer run.

## Tests / validation
Added:

```text
scripts/top_stories_rss_snapshot_producer_test.py
```

The tests cover:

```text
exactly three enabled sources
stable unique source IDs
RSS fixture parsing without network
Atom fixture parsing without network
required top-feed fields
deterministic topFeedRank
duplicate collapse
stale row rejection
malformed feed diagnostics
stable output schema
deterministic serialization with fixed now_ms
no generated runtime data write in tests
no browser/runtime module imports
```

Required validation commands:

```bash
python scripts/top_stories_rss_snapshot_producer_test.py
python scripts/top_stories_rss_snapshot_producer.py --help
python scripts/top_stories_rss_snapshot_producer.py --dry-run --now-ms 0
npx vitest run src/services/topStories/topStoriesTopFeedSignals.cert.test.js
npx vitest run src/services/topStories/topStoriesRanker.cert.test.js
node src/viewModels/useMainTabViewModel.recency.cert.test.mjs
npm run lint
npm run test:unit
```

Connector-session status:

```text
Local Python/npm/vitest commands were not executed in this connector-only patching path. GitHub checks are the merge-gate source of truth.
```

## Scope compliance
- Runtime ranker changed: no
- Score formula changed: no
- Browser live RSS fetch introduced: no
- Dataset/ViewModel runtime changed: no
- Generated `public/newsdata` changed: no
- Workflow files changed: no
- Package files changed: no
- Buzz / Up Ahead / Data Health touched: no
- UI/app routing changed: no

## Stop conditions encountered
None.

## Activation note
This PR is producer-only. It intentionally does not add workflow activation, browser runtime fetch, ViewModel wiring, dataset runtime wiring, generated public snapshot files, or UI exposure. A later activation PR can decide where this producer output is generated and how the resulting payload is supplied to the existing `topFeedItems` seam.
