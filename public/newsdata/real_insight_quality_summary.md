# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.5`
- Base report share: `0.11764705882352941`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `650`
- Source groups: `9`
- Content hash: `6ca08a9965140807`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Maharashtra Council adjourned; 13 killed in rain-related incidents, says Minister | 3 | fact_update, official_response | NO | 0.6419143876382674 |
| 2 | After a century, forgotten Punjabi soldiers finally recognised for WWI sacrifice | 2 | base_report, fact_update | NO | 0.6732467197849983 |
| 3 | Super Typhoon Bavi strikes US Pacific islands with pummeling winds | 2 | base_report, official_response | NO | 0.6292600000000002 |
| 4 | Six killed in Mumbai as rains wreak havoc, disrupt travel | 2 | fact_update | YES | 0.6172599999999999 |
| 5 | Axis Bank Volume Snapshot | 2 | fact_update | YES | 0.6172599999999999 |
| 6 | PM Modi arrives in Indonesia to further strengthen India's Act East Policy | 2 | official_response | YES | 0.550326159813334 |
| 7 | Asian stocks slip, Samsung slides after results | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | EQT moves to list BPO firm Straive, raise $400 million | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | Prestige Estates buys 50% stake in Advent Convention and Hotels International for Rs 504 crore | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | EasyJet shares rally 10% on potential $7.3 billion acquisition by Castlelake | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.5`
- Base report share: `0.118`
- Multi-angle parents: `3`
- Top parent angles: `2`
- Top parent children: `3`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.3`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.3`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.118` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `3` / `>= 2`
