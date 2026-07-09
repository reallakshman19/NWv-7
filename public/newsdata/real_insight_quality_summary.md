# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.7`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.9`
- Base report share: `0.2857142857142857`
- Multi-angle parents: `7`
- Weak parents: `3`
- Story count: `699`
- Source groups: `9`
- Content hash: `75fd9a83b3356587`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | New Zealand announces 57% tariff-free exports to India ahead of Modi visit | 2 | official_response, base_report | NO | 0.6265766666666668 |
| 2 | 'Lust for murder': German doctor who killed 15 patients gets life term; suspected in 76 more deaths | 2 | base_report, fact_update | NO | 0.61211 |
| 3 | Trump | 2 | official_response, base_report | NO | 0.60191 |
| 4 | 2 girls attacked with weapon at Germany school, teenager arrested | 2 | official_response, investigative_detail | NO | 0.60111 |
| 5 | India and Australia Deepen Defence Ties: What It Means for the Indo-Pacific / Above the Fold / 09.07.2026 | 3 | base_report, official_response | NO | 0.5637050531183315 |
| 6 | India, Australia to expand partnership in critical minerals, clean energy - The Economic Times | 2 | base_report, fact_update | NO | 0.5732433333333333 |
| 7 | How undercover agents and informants helped the FBI unravel Lawrence Bishnoi’s gang / Explained | 2 | base_report, expert_analysis | NO | 0.5545933333333333 |
| 8 | India estimates 300 GW power demand next year, backs local clean-energy manufacturing | 2 | regional_followup | YES | 0.6952467197849983 |
| 9 | Australia's largest pension fund invests 500 million Australian Dollars in India's infrastructure fund | 2 | fact_update | YES | 0.6705300531183316 |
| 10 | Trump says ceasefire is 'over' after US and Iran trade strikes | 2 | official_response | YES | 0.6632467197849983 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.7`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.9`
- Base report share: `0.286`
- Multi-angle parents: `7`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.7` / `>= 1.4`
- Average evolution role count: `1.9` / `>= 1.6`
- Base report share: `0.286` / `<= 0.55`
- Multi-angle parent count: `7` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.3` / `<= 0.5`
