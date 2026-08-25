# NW-RANK-SRC-001 — Canonical publisher-family identity

## Status

Implementation in progress from verified `main` commit
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

Pending.

## Pull request

Pending.
