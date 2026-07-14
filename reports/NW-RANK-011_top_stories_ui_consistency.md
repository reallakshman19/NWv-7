# NW-RANK-011 — Top Stories diagnostics and card-rating consistency

## Trigger

Deployed screenshots exposed inconsistent explainability for items displayed in the same Top Stories rail:

- a Google News row with both `_topStoryRank` and legacy `_scoreBreakdown` displayed ranking diagnostics;
- a BBC/top-feed row with only `_topStoryRank` displayed only source and story metadata;
- card stars continued to use legacy `impactScore`, although final Top Stories admission and ordering use `_topStoryRank.normalizedScore`.

## Root causes

1. `NewsSection.jsx` enabled ranking diagnostics only when `_scoreBreakdown` existed.
2. `buildStoryInfoText()` could render `_topStoryRank`, but the component did not enable that path for `_topStoryRank`-only rows.
3. Top Stories stars used the generic section `impactScore` thresholds.
4. Missing authoritative rank metadata was silently hidden rather than reported as a contract-integrity failure.
5. The Top Stories header help text described obsolete sentiment-based ranking behavior.

## Implemented contract

### Story Intelligence

For Top Stories cards:

- `_topStoryRank` is the authoritative diagnostics contract.
- `_topStoryRank` takes precedence when both rank objects exist.
- diagnostics include normalized score, raw score, event, qualification, slot band, admission reason, timestamp confidence, age, freshness, public interest, consensus, feed membership, independent feed corroboration, independent evidence, penalties, and the ranker explanation.
- when `_topStoryRank` is missing, the modal displays an explicit integrity warning.
- a legacy `_scoreBreakdown`, when present in that failure state, is labelled as reference-only.

Non-Top-Stories sections retain the existing legacy breakdown behavior.

### Card rating

For Top Stories cards, stars are derived only from `_topStoryRank.normalizedScore`:

```text
>= 0.80 → 5 stars
>= 0.65 → 4 stars
>= 0.50 → 3 stars
>= 0.33 → 2 stars
>  0.00 → 1 star
missing  → 0 stars and an unavailable label
```

Non-Top-Stories cards retain the legacy `impactScore` thresholds.

The accessible label identifies whether the rating is driven by the Top Stories score or legacy impact score.

## Changed files

```text
src/components/NewsSection.jsx
src/components/NewsSection.cert.test.jsx
src/utils/storyMeta.js
src/utils/storyMeta.breakdown.cert.test.js
reports/NW-RANK-011_top_stories_ui_consistency.md
```

## Certification coverage

- `_topStoryRank`-only BBC-style row renders full diagnostics.
- `_topStoryRank` overrides conflicting legacy score data.
- Top Stories stars follow normalized score despite a conflicting `impactScore`.
- missing `_topStoryRank` shows an integrity warning and zero-star unavailable state.
- legacy score is marked reference-only in a missing-rank Top Stories row.
- non-Top-Stories cards retain legacy impact-star behavior.
- area-relevance modal behavior remains covered.

## Scope exclusions

No changes were made to:

```text
Top Stories ranking or thresholds
RSS source policy
section-health diagnostics
public/newsdata/*
.github/workflows/*
package files
area relevance scoring
Buzz
Up Ahead
weather
market
deployment/runtime configuration
```
