# NW-RANK-012I — Story Intelligence copy and group-position diagnostics

## Result

Story Intelligence now records each card's position within its current section/group and provides a copy-all control that copies the complete diagnostic text.

This mission changes diagnostics only. It does not change ranking, classification, source evidence, thresholds, settings, filtering, travel priority, display depth, or generated data.

## Fitbit Top Stories RCA

The observed Fitbit item was a borderline admission under the current Top Stories contract:

```text
eventType              routine_business
eventQualified         true
slotBand               primary
admissionReason        admitted
normalizedScore        0.51
primary threshold      0.50
freshnessScore         0.91
consensusScore         0.36
sourceCount            2
corroborating sources  1
penalties              0
```

Approximate score reconstruction:

```text
0.91 × 42 freshness          = 38.22
0.24 × 34 public interest    =  8.16
0.36 × 14 consensus          =  5.04
0.72 ×  8 source quality     =  5.76
0.82 ×  6 location relevance =  4.92
--------------------------------------
raw weighted score            ≈ 62.10
maximum positive weights       = 122
normalized score               ≈ 0.509
```

The item crossed the primary threshold by roughly `0.009` because:

1. the broad routine-business classifier can context-qualify a product-launch story;
2. the declared two-source count creates one corroborating-source unit and non-zero consensus;
3. the very recent timestamp supplies high freshness;
4. Google News receives the configured medium source-quality score;
5. “India” supplies strong location relevance;
6. no penalty applied.

This explains the current result. No hard-coded Fitbit/product/source exclusion, score change, or ranking correction is included here.

## Group-position contract

Every Story Intelligence payload opened from a card now includes:

```text
Group: <section title>
Position in Group: <one-based position> of <full group count>
```

The position is derived directly from the card's `idx + 1` in the current `news` array. The total uses `news.length`, not the currently visible slice. Expanding or collapsing the group therefore does not alter position semantics.

For the screenshot example, the expected diagnostic is:

```text
Group: Top Stories
Position in Group: 1 of 6
```

Invalid or incomplete position metadata does not fabricate a position line.

## Copy-all behavior

The modal header now has a copy icon beside the close control.

The control:

- copies the complete raw `infoText`, including source URL, story title, group position, Top Stories diagnostics, and area-relevance evidence;
- uses `navigator.clipboard.writeText` when available;
- falls back to a temporary read-only textarea and `document.execCommand('copy')` when needed;
- removes the temporary textarea in a `finally` block;
- stops click propagation so copying does not close the modal or open the story;
- reports success with `✓` and failure with `!`;
- resets feedback when another Story Intelligence payload opens;
- retains a separate close button.

Accessibility contract:

```text
aria-label="Copy story intelligence"
title="Copy all details"
```

## Exact changed files

```text
src/components/NewsSection.jsx
src/utils/storyMeta.js
src/services/topStories/topStoriesStoryIntelligencePopup.cert.test.js
reports/NW-RANK-012I_story_intelligence_copy_position.md
```

No stylesheet change was required; the new control reuses the existing modal button styling.

## Validation

Required checks:

```bash
npx vitest run --config vitest.config.js src/services/topStories/topStoriesStoryIntelligencePopup.cert.test.js
npm run lint
npm run build
npm run test:certify
```

The four required exact-head workflows remain the merge gates:

```text
Data Freshness Contracts
CI Validation Gate
Audit Regression
NWv-7 Certification
```

## Boundaries

Unchanged:

- Top Stories weights and thresholds;
- routine-business event classification;
- declared source-count and corroboration semantics;
- candidate admission and selection;
- ranking order and display depth;
- Main projection and section acquisition;
- read/view filtering and settings;
- travel-location priority;
- generated/public data;
- deployment workflows.

Issue #470 remains queued until this mission merges and `main` is re-audited. G3 remains blocked.
