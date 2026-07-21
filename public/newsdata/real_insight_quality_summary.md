# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.7`
- Base report share: `0.05`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `764`
- Source groups: `9`
- Content hash: `625960f01b76e6e7`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | UK’s latest PM / Infographics | 2 | fact_update, official_response | NO | 0.6714967197849984 |
| 2 | India's Rahul, Priyanka Gandhi protest outside Modi's house - Reuters | 3 | regional_followup, reaction_public | NO | 0.5758462101805386 |
| 3 | Hamas names Khalil al-Hayya as new overall leader | 2 | base_report, fact_update | NO | 0.6112599999999999 |
| 4 | Meghna Infracon Infrastructure expects Rs 300cr revenue from new commercial project | 2 | fact_update | YES | 0.760613386451665 |
| 5 | Seafarer from Kasaragod killed in attack on cargo ship off Ukraine | 3 | fact_update | YES | 0.6565376235671551 |
| 6 | Rupee weakens to two-month low as oil climbs; state-run banks cushion | 2 | market_reaction | YES | 0.6742467197849984 |
| 7 | India’s youth-led 'cockroach movement' clashes with police in New Delhi - Reuters | 2 | official_response | YES | 0.6403300531183316 |
| 8 | Police fire tear gas at India’s Cockroach movement supporters - BreakingNews.ie | 2 | official_response | YES | 0.5689933333333332 |
| 9 | Bandhan Bank Q1 profit jumps 35% as provisions decline sharply | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Adani Total Gas Q1 Results: Profit falls 14% YoY to Rs 142 crore, revenue jumps 27% | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.7`
- Base report share: `0.05`
- Multi-angle parents: `3`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.3`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.05` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
