# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `2`
- Base report share: `0.3333333333333333`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `554`
- Source groups: `9`
- Content hash: `0aadf010fb9cd5fe`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | New Zealand announces 57% tariff-free exports to India ahead of Modi visit | 2 | official_response, base_report | NO | 0.6945633864516649 |
| 2 | Bonnie Tyler, who topped the charts with epic 'Total Eclipse of the Heart', dies | 2 | fact_update, base_report | NO | 0.6627300531183317 |
| 3 | How undercover agents and informants helped the FBI unravel Lawrence Bishnoi’s gang / Explained | 2 | base_report, expert_analysis | NO | 0.6225800531183316 |
| 4 | India and Australia Deepen Defence Ties: What It Means for the Indo-Pacific / Above the Fold / 09.07.2026 | 3 | base_report, official_response | NO | 0.5637050531183315 |
| 5 | India, Australia to expand partnership in critical minerals, clean energy - The Economic Times | 2 | base_report, fact_update | NO | 0.5732433333333333 |
| 6 | PM Modi invites Australian businesses to invest in India, seeks early conclusion of CECA | 2 | official_response | YES | 0.6714967197849984 |
| 7 | Australia's largest pension fund invests 500 million Australian Dollars in India's infrastructure fund | 2 | fact_update | YES | 0.6705300531183316 |
| 8 | Trump says 11 jets downed during India-Pakistan hostilities last year | 2 | official_response | YES | 0.6165800531183316 |
| 9 | PM Modi meets Australia's Opposition leader, discusses bilateral ties | 2 | official_response | YES | 0.6243128795983323 |
| 10 | Eye on Indo-Pacific: India and Australia deepen ties across nuclear, maritime and mineral sectors | 2 | base_report | YES | 0.5545933333333333 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `2`
- Base report share: `0.333`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `2` / `>= 1.6`
- Base report share: `0.333` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
