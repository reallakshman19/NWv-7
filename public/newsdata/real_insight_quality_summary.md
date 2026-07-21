# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.6`
- Base report share: `0.05555555555555555`
- Multi-angle parents: `2`
- Weak parents: `8`
- Story count: `608`
- Source groups: `9`
- Content hash: `cc94abe905e17daa`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Hamas names Khalil al-Hayya as new overall leader | 2 | base_report, fact_update | NO | 0.6112599999999999 |
| 2 | UK’s latest PM / Infographics | 2 | fact_update, official_response | NO | 0.60351 |
| 3 | Meghna Infracon Infrastructure expects Rs 300cr revenue from new commercial project | 2 | fact_update | YES | 0.760613386451665 |
| 4 | Rupee weakens to two-month low as oil climbs; state-run banks cushion | 2 | market_reaction | YES | 0.6742467197849984 |
| 5 | Seafarer from Kasaragod killed in attack on cargo ship off Ukraine | 3 | fact_update | YES | 0.5885805572205374 |
| 6 | India’s youth-led 'cockroach movement' clashes with police in New Delhi - Reuters | 2 | official_response | YES | 0.5723433333333332 |
| 7 | Police fire tear gas at India’s Cockroach movement supporters - BreakingNews.ie | 2 | official_response | YES | 0.5689933333333332 |
| 8 | Karur Vysya Bank net profit surges 45% to Rs 756 crore in Q1, asset quality sees slight slip | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | India's private banks draw thinner margins on tepid credit growth | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Indian Overseas Bank eyes $650 million foreign deposits by September | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.6`
- Base report share: `0.056`
- Multi-angle parents: `2`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.2`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.8`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.056` / `<= 0.55`
- Multi-angle parent count: `2` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
