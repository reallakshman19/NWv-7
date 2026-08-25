# NW-RANK-SRC-001 — Canonical publisher-family identity

## Status

Implemented from verified `main` commit
`2adf656cbd8f676a349d6af4b43c19a76e908282`.

## Production finding

Top Stories currently normalizes publisher labels only by punctuation and case.
Equivalent labels such as `TOI` and `Times of India`, or `google_news` and
`google_news_oman`, therefore remain different sources.

That creates three ranking defects:

- aliases in `allSources` can count as independent corroboration;
- Google News acquisition-lane variants can evade the per-source diversity cap;
- source-quality lookup differs between Live display labels and Hybrid
  `sourceGroup` identifiers.

## Frozen scope

- Add one pure canonical publisher-family identity module for Top Stories.
- Use it for source counts, independent-evidence signals, aggregator detection,
  source-quality lookup, top-feed publisher diversity, and slot diversity caps.
- Preserve the existing editorial quality tiers; this batch changes identity,
  not publisher policy.
- Preserve raw display-source labels for UI and diagnostics.
- Do not change workflows, generated snapshots, fetch modes, or source feeds.

## Acceptance

- `TOI` plus `Times of India` counts as one publisher family.
- `TOI` plus `Reuters` counts as two publisher families.
- Google News lane variants do not corroborate each other.
- Google News lane variants share one Top Stories diversity budget.
- Existing source-quality tiers resolve consistently across display-name and
  `sourceGroup` forms.
- Focused certs, full unit suite, lint, and production build pass locally.

## Validation

All validation was run locally. GitHub Actions was intentionally not used.

- Focused Top Stories regression: 4 files, 58 tests passed.
- Golden-audit and timezone-baseline regression: 4 files, 42 tests passed.
- Full unit suite with deterministic `TZ=UTC`: 227 files passed;
  1,327 tests passed and 8 skipped.
- ESLint: passed.
- Vite production build: passed; 372 modules transformed.

The first unqualified full-suite run exposed a pre-existing host-timezone-sensitive
Up Ahead assertion (`2026-05-28` displayed as May 27 outside UTC). The same test
passes under the repository's deterministic UTC baseline; no unrelated Up Ahead
source was changed in this batch.

## Pull request

Pending.
