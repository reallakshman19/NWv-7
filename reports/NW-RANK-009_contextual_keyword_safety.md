# NW-RANK-009 — Context-gated keyword safety for Top Stories

## Trigger

A single-source Google News row titled `Tamil Nadu records voter turnout of 5.75 crore in single-phase election` appeared in Top Stories as a 9-hour-old item. Story Intelligence repeatedly displayed `high-impact keyword 'election' x2.5` even though final Top Stories authority is `_topStoryRank`, not the legacy RSS `impactScore`.

## Root causes repaired

1. Bare event words such as `election`, `budget`, `summit`, `treaty`, and `verdict` could classify a story without corroborating event context.
2. Legacy impact scoring applied direct text-keyword multipliers.
3. Missing feed timestamps could be replaced with fetch time, laundering old rows into fresh rows.
4. Top Stories slot thresholds existed in policy but were not enforced.
5. An 8–12 hour single-source Google News row could fill fallback slots without independent evidence.
6. `source` and `sourceGroup` aliases could be counted as separate consensus sources.
7. Story Intelligence rendered legacy `_scoreBreakdown` instead of the actual `_topStoryRank` and displayed repeated decisions.

## Implemented contract

- Event classification requires an anchor plus corroborating context.
- Bare anchors return `unknown` with `qualified: false`.
- High-impact words are explainability evidence only; they do not apply direct multipliers.
- Top Stories scores are normalized against configured weights and compared with primary, secondary, and fallback thresholds.
- Single-source Google News rows require corroboration or top-feed evidence in the 8–12 hour fallback band.
- Fetch-time timestamps are explicitly marked low confidence and rejected from Top Stories.
- Section snapshot collection no longer substitutes fetch time when a feed date is missing.
- Publisher aliases are not counted twice.
- Story Intelligence prefers `_topStoryRank` and deduplicates legacy decisions.

## Exact screenshot regression

The certification fixture uses:

```text
Title: Tamil Nadu records voter turnout in single-phase election
Age: 9 hours
Source: Google News TN
Source group: google_news
Source count: 1
```

Expected result:

```text
Top Stories output: excluded
Reason: fallback aggregator row lacks independent corroboration/top-feed evidence
```

A 9-hour governance story remains eligible when it has independent corroboration or trusted direct-source evidence.

## Changed files

```text
src/services/topStories/topStoriesEventClassifier.js
src/services/topStories/topStoriesPolicy.js
src/services/topStories/topStoriesSignals.js
src/services/topStories/topStoriesRanker.js
src/services/topStories/topStoriesKeywordSafety.cert.test.js
src/utils/impactScorer.js
src/utils/impactScorer.cert.test.js
src/utils/storyMeta.js
src/utils/storyMeta.breakdown.cert.test.js
scripts/prefetch_common.py
scripts/fetch_sections_stories.py
scripts/test_section_timestamp_provenance.py
reports/NW-RANK-009_contextual_keyword_safety.md
```

## Scope exclusions

No changes were made to:

```text
config/section_sources.json
public/newsdata/*
.github/workflows/*
package.json
package-lock.json
Buzz
Up Ahead
area relevance
weather
market
deployment/runtime configuration
```

## Local structural validation

- `node --check` passed for all changed JavaScript files.
- `python -m py_compile` passed for all changed Python files.
- A module-level executable fixture confirmed:
  - bare `Election update` is unqualified;
  - contextual election is governance;
  - the 9-hour single-source Google News election row is excluded;
  - corroborated election fallback remains eligible;
  - fetch-time fallback timestamps are rejected;
  - `source` plus `sourceGroup` counts as one source.

Full repository certification is delegated to the pull-request workflows.
