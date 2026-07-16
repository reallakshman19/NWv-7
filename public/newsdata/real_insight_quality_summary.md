# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.1`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.4`
- Base report share: `0.1875`
- Multi-angle parents: `1`
- Weak parents: `9`
- Story count: `727`
- Source groups: `9`
- Content hash: `6377c36ea6ad7335`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Duration of US visa stay changes - what it means for foreign students, exchange visitors and journalists | 2 | base_report, expert_analysis | NO | 0.6210273179616861 |
| 2 | Swiggy Instamart and HPCL launch q-comm cylinder delivery | 2 | base_report | YES | 0.7012467197849983 |
| 3 | NEET UG 2026 results: Punjab’s Aryan Gupta, Haryana’s Panshul Bansal top; 11.21 lakh qualify | 2 | fact_update | YES | 0.6425766666666668 |
| 4 | Indian court orders Maruti to replace car in first E20 fuel damage ruling - Reuters | 2 | official_response | YES | 0.5693433333333333 |
| 5 | US to revive rule of no green cards for those who use public benefits | 2 | reaction_public | YES | 0.5340933333333333 |
| 6 | Parliament approves Serhii Koretskyi amid cabinet shuffle | 2 | official_response | YES | 0.5275933333333334 |
| 7 | BHEL shares jump 4% after Maharatna PSU posts net profit of Rs 377 crore in Q1, revenue jumps 40% | 1 | fact_update | YES | 0.7235911614783158 |
| 8 | SBI Funds Management gets highest applications for any IPO this year, sees Rs 2.98 lakh crore investor rush | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | Jio Financial Q1 Results: Profit skyrockets 155% YoY to Rs 830 crore | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Polycab Q1 Results: Profit surges 33% YoY to Rs 797 crore, revenue jumps 39% | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.1`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.4`
- Base report share: `0.188`
- Multi-angle parents: `1`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.1`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.4`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.9`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.188` / `<= 0.55`
- Multi-angle parent count: `1` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
