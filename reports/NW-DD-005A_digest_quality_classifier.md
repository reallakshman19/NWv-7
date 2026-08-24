# NW-DD-005A — Current-day Digest Integrity and Editorial Quality classifier

## Mission

Derive deterministic current-day Daily Digest quality classes from publisher-owned evidence and feed them into the DD-005 selector without AI ranking, scalar scoring, UI exposure, production Cron activation, GitHub Actions changes, or persistence of publisher article bodies/headlines.

Baseline: `main` at `f10776e0b20221b8fc76d0e97c364d117711317d`.

## Authority boundary

```text
publisher adapter
  -> transient quality evidence items
  -> deterministic topic classifier
  -> discrete significance / breadth / diversity classes
  -> selector
  -> derived audit metrics only
  -> D1 candidate trace
```

Raw evidence items are discarded before snapshot construction and are not written to D1.

## Qualified evidence surfaces

- Akashvani: publisher-curated `THE HEADLINES` block from the already-authorized Morning News page.
- Indian Express: direct `indianexpress.com/article/...` story-link text plus qualifying headings from the already-authorized Daily Briefing article page.
- The Hindu: current RSS path proves product/date but not a source-qualified full digest item set, so quality remains neutral and `UNAVAILABLE`; no mirror/search fallback is used.

## Deterministic taxonomy

Each transient item is assigned by ordered lexical rules to one of: `COURTS`, `PUBLIC_SAFETY`, `DEFENCE_SECURITY`, `ECONOMY`, `GOVERNANCE`, `INTERNATIONAL`, `SCIENCE_TECH`, `HEALTH_SOCIAL`, `ENVIRONMENT`, `SPORTS_CULTURE`, `OTHER`.

No model call, embedding, summarizer, scalar score or external classifier is used.

## Quality classes

Evidence is `SUFFICIENT` only with at least four unique usable items. Limited/unavailable evidence receives neutral `ADEQUATE / ADEQUATE / MODERATE` so parser limitations cannot demote a publisher.

For sufficient evidence:

```text
significance:
  HIGH     -> >=4 core items across >=3 core topics
  ADEQUATE -> >=2 core items across >=2 core topics
  LOW      -> otherwise

breadth:
  BROAD    -> >=6 items and >=5 topics
  ADEQUATE -> >=4 items and >=3 topics
  NARROW   -> otherwise

diversity:
  DIVERSE      -> >=6 items, >=4 topics, dominant topic <=40%
  MODERATE     -> >=4 items, >=3 topics, dominant topic <=60%
  CONCENTRATED -> otherwise
```

## Persisted audit evidence

Migration `0002_daily_digest_quality.sql` adds only derived candidate fields:

- `quality_evidence_version`
- `quality_evidence_state`
- `quality_integrity_class`
- `quality_item_count`
- `quality_topic_count`
- `quality_core_topic_count`
- `quality_dominant_topic_share_bps`
- `quality_topic_counts_json`

No raw headline/body/content column is introduced.

## Selector integration

Policy advances from `daily-digest-policy/v0.2` to `daily-digest-policy/v0.3`. Candidate evaluation derives quality classes automatically from adapter evidence before the existing lexicographic selector. Diagnostic `qualityOverrides` remain test/debug-only inputs and do not erase evidence-state audit fields.

## Validation performed without GitHub Actions

```text
PASS: node --check on authored local DD-005A JS
PASS: six-topic public-affairs fixture -> HIGH / BROAD / DIVERSE
PASS: sports-only fixture -> LOW / NARROW / CONCENTRATED
PASS: unavailable evidence -> neutral ADEQUATE / ADEQUATE / MODERATE
PASS: Akashvani evidence extractor excludes full bulletin after THE NEWS
PASS: Indian Express extractor rejects external/utility links
```

Repository dependency-backed Vitest/lint/build/certification, Wrangler migration/runtime execution and live deployed publisher acquisition remain `NOT_RUN` unless separately executed. GitHub Actions were not created or dispatched as a substitute.

## Explicit non-goals

- no `.github/workflows/*` change
- no production Cron activation
- no UI/Main integration
- no global-source promotion
- no The Hindu body scraper
- no search-engine/mirror fallback
- no headline/article-body persistence
- no AI editorial ranking
- no scalar quality score
- no Top Stories or Daily Brief policy change
