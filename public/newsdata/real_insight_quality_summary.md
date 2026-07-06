# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.8`
- Base report share: `0.2631578947368421`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `516`
- Source groups: `9`
- Content hash: `f63052cd03fbc3ba`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Dr. Reddys trading volume highlights market engagement | 2 | fact_update, market_reaction | NO | 0.6814967197849984 |
| 2 | IMD issues red alert for Mumbai, Raigad over next three hours amid heavy rainfall | 2 | fact_update, base_report | NO | 0.6774967197849983 |
| 3 | British military says cargo ship reports being under attack in Red Sea off coast of Yemen | 3 | official_response, fact_update | NO | 0.5745916683316485 |
| 4 | Maharashtra Council adjourned; 13 killed in rain-related incidents, says Minister | 2 | fact_update, official_response | NO | 0.5955800531183317 |
| 5 | ‘Very dangerous’ Super Typhoon barrels towards US Pacific islands with 280 kmph winds | 2 | regional_followup, official_response | NO | 0.5665933333333333 |
| 6 | Axis Bank Volume Snapshot | 2 | fact_update | YES | 0.6172599999999999 |
| 7 | 'We are heroic people with heroic spirit': Donald Trump marks America's 250th Independence Day | 2 | base_report | YES | 0.6165800531183316 |
| 8 | Performer calls for Trump's death at funeral for Iran's late supreme leader | 2 | base_report | YES | 0.5956600000000001 |
| 9 | Senco Gold shares soar 6% as Q1 business update highlights 60% revenue growth | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Shakti Pumps shares surge 8% on Rs 354 crore solar pump order from MSEDCL | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `52`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.8`
- Base report share: `0.263`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.3`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.263` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
