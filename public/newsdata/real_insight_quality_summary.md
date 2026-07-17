# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.1`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.3`
- Base report share: `0.06666666666666667`
- Multi-angle parents: `1`
- Weak parents: `9`
- Story count: `649`
- Source groups: `9`
- Content hash: `01216006208ec604`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Duration of US visa stay changes - what it means for foreign students, exchange visitors and journalists | 2 | base_report, expert_analysis | NO | 0.6210273179616861 |
| 2 | NEET UG 2026 results: Punjab’s Aryan Gupta, Haryana’s Panshul Bansal top; 11.21 lakh qualify | 2 | fact_update | YES | 0.6425766666666668 |
| 3 | Parliament approves Serhii Koretskyi amid cabinet shuffle | 2 | official_response | YES | 0.5955800531183317 |
| 4 | Indian court orders Maruti to replace car in first E20 fuel damage ruling - Reuters | 2 | official_response | YES | 0.5693433333333333 |
| 5 | US to revive rule of no green cards for those who use public benefits | 2 | reaction_public | YES | 0.5340933333333333 |
| 6 | BHEL shares jump 4% after Maharatna PSU posts net profit of Rs 377 crore in Q1, revenue jumps 40% | 1 | fact_update | YES | 0.7235911614783158 |
| 7 | Relaxo Footwears jumps 14%, snaps 3-day losing streak. What should investors do now? | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | Polycab India shares fall 4% despite strong Q1 earnings, profit jumps 33% YoY | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | CEAT shares crash 9% after Q1 net profit tumbles 96% YoY to Rs 4 crore. What lies ahead? | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | WeWork India Management shares slide 5%; Q1 loss narrows, revenue jumps 27% YoY | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.1`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.3`
- Base report share: `0.067`
- Multi-angle parents: `1`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.1`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.3`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.9`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.067` / `<= 0.55`
- Multi-angle parent count: `1` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
