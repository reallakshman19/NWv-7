# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.5`
- Base report share: `0.2`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `859`
- Source groups: `9`
- Content hash: `9dd7f6149a2df7b7`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | PM launches India’s first hydrogen-powered train | 5 | base_report, official_response, fact_update | NO | 0.6590143876382674 |
| 2 | US Senate Bill seeks 100% tariffs on India, China for buying Russian oil | 2 | fact_update, base_report | NO | 0.6296433333333333 |
| 3 | Duration of US visa stay changes - what it means for foreign students, exchange visitors and journalists | 2 | base_report, expert_analysis | NO | 0.6010239879583166 |
| 4 | NEET UG 2026 results: Punjab’s Aryan Gupta, Haryana’s Panshul Bansal top; 11.21 lakh qualify | 2 | fact_update | YES | 0.7065633864516649 |
| 5 | US to revive rule of no green cards for those who use public benefits | 2 | reaction_public | YES | 0.6220800531183317 |
| 6 | Parliament approves Serhii Koretskyi amid cabinet shuffle | 2 | official_response | YES | 0.5955800531183317 |
| 7 | Indian court orders Maruti to replace car in first E20 fuel damage ruling - Reuters | 2 | official_response | YES | 0.5013566135483352 |
| 8 | BHEL shares jump 4% after Maharatna PSU posts net profit of Rs 377 crore in Q1, revenue jumps 40% | 1 | fact_update | YES | 0.7235911614783158 |
| 9 | Zepto IPO anchor book nears closure; Norges, Motilal Oswal may take 40-45% | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Reliance Retail Q1 results: Quick-commerce spends drag PAT 14% YoY to Rs 2,806 crore; revenue rises 7% | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.5`
- Base report share: `0.2`
- Multi-angle parents: `3`
- Top parent angles: `3`
- Top parent children: `5`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Base report share: `0.2` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `3` / `>= 2`
- Top parent child depth: `5` / `>= 2`
