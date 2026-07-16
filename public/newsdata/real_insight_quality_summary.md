# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.5`
- Base report share: `0.23529411764705882`
- Multi-angle parents: `2`
- Weak parents: `8`
- Story count: `793`
- Source groups: `10`
- Content hash: `d9d9653bddf705a6`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Kota C-section victims demand kidney transplant in 48 hours, write to President | 2 | fact_update, reaction_public | NO | 0.6934967197849984 |
| 2 | Files relating to India’s largest nuclear power plant Kudankulam exposed in data breach - Reuters | 2 | official_response, investigative_detail | NO | 0.6292600000000002 |
| 3 | Swiggy Instamart and HPCL launch q-comm cylinder delivery | 2 | base_report | YES | 0.7012467197849983 |
| 4 | Marine engineer missing following attack on ship off Oman coast is dead, says family | 2 | fact_update | YES | 0.6961467197849984 |
| 5 | Nepal court jails two former Ministers, 14 others | 2 | investigative_detail | YES | 0.6055800531183317 |
| 6 | U.S. to change visa regulations for foreign students, journalists | 2 | base_report | YES | 0.5681232802150018 |
| 7 | Parliament approves Serhii Koretskyi amid cabinet shuffle | 2 | official_response | YES | 0.5275933333333334 |
| 8 | BHEL shares jump 4% after Maharatna PSU posts net profit of Rs 377 crore in Q1, revenue jumps 40% | 1 | fact_update | YES | 0.7235911614783158 |
| 9 | SBI Funds Management gets highest applications for any IPO this year, sees Rs 2.98 lakh crore investor rush | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Jio Financial Q1 Results: Profit skyrockets 155% YoY to Rs 830 crore | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.5`
- Base report share: `0.235`
- Multi-angle parents: `2`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.2`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.8`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.235` / `<= 0.55`
- Multi-angle parent count: `2` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
