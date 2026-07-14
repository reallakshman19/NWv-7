# NW-RANK-010 — Top Stories admission integrity and zero-based corroboration

## Trigger

Deployed screenshots showed generic product and human-interest stories in Top Stories even when Story Intelligence reported:

```text
event=unknown
qualified=false
```

The affected examples included a single-source Google News iPhone preview and a BBC human-interest feature.

## Root causes repaired

1. `eventQualified=false` was stored as metadata but did not participate in slot admission.
2. A single source received non-zero consensus because the first source was counted as corroboration.
3. A direct top-feed row could use its own top-feed membership as supporting evidence.
4. `unknown` received a public-interest prior of `0.35`, which materially subsidized generic stories.
5. The second slot-fill pass bypassed source, section, and geography diversity limits to reach the requested count.

## Implemented contract

### Admission

An unqualified story is rejected from primary, secondary, and fallback bands unless it has independent evidence:

```text
sourceCount >= 2
or
topFeedCorroborationHits >= 1
```

Context-qualified critical events remain eligible without consensus when they meet the existing cold-start-critical contract.

### Consensus

Consensus is now zero-based:

```text
one source, one cluster, no independent top-feed evidence -> 0.00 consensus
```

Corroboration starts only after the first independent publisher/source family. Extra cluster volume from one source does not create consensus.

### Top-feed evidence

The existing `topFeedHits` field is retained as a bounded membership/evidence-volume metric for compatibility and display.

Independent evidence is carried separately:

```text
topFeedPresent
topFeedCorroborationHits
topFeedCorroboratingSourceCount
```

A single top-feed row can be present and have legacy `topFeedHits`, but it has:

```text
topFeedCorroborationHits = 0
topFeedConsensusScore = 0
```

### Unknown prior

The `unknown` public-interest prior was reduced from `0.35` to `0.08`. Unknown remains representable but is no longer a substantial importance subsidy.

### Slot filling

Slot filling now uses one diversity-enforced pass. It no longer adds a second pass that bypasses source, section, geography, or cluster limits.

The ranker may return fewer than the requested number of stories when qualified, diverse candidates are insufficient.

## Screenshot regressions

The certification suite now proves exclusion of:

```text
With two months left for the Apple iPhone 18 Pro drop...
Hours each day in an iron lung kept her breathing...
```

when they are single-source, unqualified, and lack independent evidence.

The suite also proves that:

- one source receives zero consensus;
- one direct top-feed row does not corroborate itself;
- source-diverse top-feed evidence produces bounded corroboration;
- qualified public-safety and local civic alerts remain eligible;
- cold-start-critical public-safety/disaster stories remain eligible without consensus;
- diversity limits may deliberately under-fill the rail.

## Changed files

```text
src/services/topStories/topStoriesEventClassifier.js
src/services/topStories/topStoriesSignals.js
src/services/topStories/topStoriesTopFeedSignals.js
src/services/topStories/topStoriesRanker.js
src/services/topStories/topStoriesRanker.cert.test.js
src/services/topStories/topStoriesTopFeedSignals.cert.test.js
reports/NW-RANK-010_admission_integrity.md
```

## Scope exclusions

No changes were made to:

```text
React UI or Story Intelligence rendering
section-health diagnostics
RSS source policy
public/newsdata/*
.github/workflows/*
package files
area relevance
Buzz
Up Ahead
weather
market
deployment/runtime configuration
```
