# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.7`
- Base report share: `0.10526315789473684`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `627`
- Source groups: `9`
- Content hash: `ecf38942ee71a04e`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Maharashtra Council adjourned; 13 killed in rain-related incidents, says Minister | 3 | fact_update, official_response | NO | 0.6419143876382674 |
| 2 | Dr. Reddys trading volume highlights market engagement | 2 | fact_update, market_reaction | NO | 0.6814967197849984 |
| 3 | Super Typhoon Bavi strikes US Pacific islands with pummeling winds | 2 | base_report, official_response | NO | 0.6292600000000002 |
| 4 | Report | 2 | market_reaction, investigative_detail | NO | 0.6172599999999999 |
| 5 | After a century, forgotten Punjabi soldiers finally recognised for WWI sacrifice | 2 | base_report, fact_update | NO | 0.6052599999999999 |
| 6 | Six killed in Mumbai as rains wreak havoc, disrupt travel | 2 | fact_update | YES | 0.6172599999999999 |
| 7 | Axis Bank Volume Snapshot | 2 | fact_update | YES | 0.6172599999999999 |
| 8 | PM Modi arrives in Indonesia to further strengthen India's Act East Policy | 2 | official_response | YES | 0.550326159813334 |
| 9 | Prestige Estates buys 50% stake in Advent Convention and Hotels International for Rs 504 crore | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | EasyJet shares rally 10% on potential $7.3 billion acquisition by Castlelake | 1 | fact_update | YES | 0.7226911614783158 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.7`
- Base report share: `0.105`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `3`

### Failed gates

- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.105` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `3` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
