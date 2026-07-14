# NW-MAIN-006 — World section-health diagnostics mapping

## Trigger

The deployed Main page rendered World stories while the World health badge showed `Unknown` and the popover reported `diagnostics unavailable`.

## Root cause

`mainDataset` embeds the Sections dataset envelope at:

```text
mainEnvelope.data.raw.sections
```

The health bridge previously inspected only the envelope passed directly to it for:

```text
data.summaries
data.sections
```

When the Main envelope was supplied, neither field existed at the outer level. The bridge therefore returned no summaries, and the Main ViewModel could not populate the `world` or `world-news` aliases.

## Repair

`sectionHealthSummary` now resolves a Sections-shaped envelope from either:

- a direct Sections envelope;
- `data.raw.sections` inside a Main envelope;
- compatible `sectionsEnvelope` / `sectionsDataset` wrapper keys.

Embedded source-health data is consumed from the resolved Sections envelope when no explicit source-health input is supplied.

## Contract

- Existing direct Sections-envelope callers remain compatible.
- Main-wrapped Sections summaries generate the same health objects as direct inputs.
- World aliases are projected by the existing Main ViewModel alias map.
- Missing Sections diagnostics still return no summary; the UI remains explicitly `Unknown` rather than fabricating `OK`.
- Story count, source-group count, top sources, warnings/failures, stale reasons, and timestamps remain part of the summary contract.

## Certification

Focused tests cover:

- nested `data.raw.sections` resolution;
- World status and embedded source diagnostics;
- `world` / `world-news` identity;
- Top Stories, India, Tamil Nadu, Local, and Muscat aliases;
- direct Sections-envelope compatibility;
- absent diagnostics returning an empty map;
- input immutability.

## Scope exclusions

No ranking, source-policy, generated-data, workflow, package, area-relevance, Buzz, Up Ahead, weather, market, or deployment/runtime changes.
