# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.8`
- Average evolution roles: `1.7`
- Base report share: `0.09523809523809523`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `440`
- Source groups: `9`
- Content hash: `c6e316df29ba73f1`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Trump administration subpoenas New York Times journalists over Air Force One reporting | 2 | base_report, investigative_detail | NO | 0.6601766666666666 |
| 2 | US Democrat Ro Khanna says he was detained by armed Israeli settlers | 3 | official_response, base_report | NO | 0.5995606512950195 |
| 3 | PM Modi tours New Zealand sports innovation showcase | 2 | fact_update, official_response | NO | 0.6002928264800007 |
| 4 | Indian tourists among 15 killed as speedboat capsizes in Vietnam | 4 | fact_update | YES | 0.6445256529600014 |
| 5 | Aditya Birla Group to invest additional ₹12,000 crore in Odisha alumina refinery expansion | 2 | fact_update | YES | 0.6064066135483351 |
| 6 | At least 15 Indians dead after boat capsizes in Vietnam | 2 | fact_update | YES | 0.6207300531183317 |
| 7 | China evacuates over 1 million as Typhoon Bavi brings winds and rain | 2 | fact_update | YES | 0.5457266666666667 |
| 8 | At least two killed in Toronto street festival shooting | 2 | fact_update | YES | 0.5492732802150018 |
| 9 | SIF AUM jumps 29% to Rs 17,858 crore in June; inflows surge 171% MoM | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | DMart Q1 results: Cons PAT up 11% to Rs 860 crore, revenue rises to Rs 18,795 crore | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `42`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.8`
- Average evolution roles: `1.7`
- Base report share: `0.095`
- Multi-angle parents: `3`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.3`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average temporal tier count: `1.8` / `>= 1.8`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.095` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
