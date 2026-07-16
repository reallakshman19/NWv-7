# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.6`
- Base report share: `0.2222222222222222`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `677`
- Source groups: `9`
- Content hash: `3809d7417b8e4fc0`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | NASA astronaut Anil Menon, two others reach International Space Station | 2 | base_report, fact_update | NO | 0.6994967197849983 |
| 2 | Revised US Russia sanctions bill lowers proposed tariffs on China, India | 2 | base_report, correction | NO | 0.6793933333333335 |
| 3 | Kota C-section victims demand kidney transplant in 48 hours, write to President | 2 | fact_update, reaction_public | NO | 0.6934967197849984 |
| 4 | Files relating to India’s largest nuclear power plant Kudankulam exposed in data breach - Reuters | 2 | official_response, investigative_detail | NO | 0.6292600000000002 |
| 5 | Swiggy Instamart and HPCL launch q-comm cylinder delivery | 2 | base_report | YES | 0.7012467197849983 |
| 6 | Marine engineer missing following attack on ship off Oman coast is dead, says family | 2 | fact_update | YES | 0.6961467197849984 |
| 7 | Nepal court jails two former Ministers, 14 others | 2 | investigative_detail | YES | 0.6055800531183317 |
| 8 | Parliament approves Serhii Koretskyi amid cabinet shuffle | 2 | official_response | YES | 0.5075933333333333 |
| 9 | Issue 16% subscribed on day one so far, GMP suggests 12% listing pop | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | ICICI Lombard General Insurance shares tumble 15% after Q1 profit takes a hit | 1 | market_reaction | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `42`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.6`
- Base report share: `0.222`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.222` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
