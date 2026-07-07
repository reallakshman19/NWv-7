# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.8`
- Base report share: `0.3`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `662`
- Source groups: `10`
- Content hash: `2cc63bd3c38b18ee`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Maharashtra Council adjourned; 13 killed in rain-related incidents, says Minister | 3 | fact_update, official_response | NO | 0.6419143876382674 |
| 2 | After a century, forgotten Punjabi soldiers finally recognised for WWI sacrifice | 2 | base_report, fact_update | NO | 0.6732467197849983 |
| 3 | Trump says there will either be a deal with Iran or U.S. will ‘finish the job’ | 2 | base_report, official_response | NO | 0.5385933333333333 |
| 4 | China test fires missile into Pacific, sparks alarm | 2 | base_report | YES | 0.6694800531183316 |
| 5 | US accuses Iran of attacking 2 commercial ships; mulls action | 2 | base_report | YES | 0.6538300531183316 |
| 6 | Russian strikes kill at least 26 in Kyiv region on eve of NATO summit | 2 | fact_update | YES | 0.6185933333333333 |
| 7 | Six killed in Mumbai as rains wreak havoc, disrupt travel | 2 | fact_update | YES | 0.6172599999999999 |
| 8 | Axis Bank Volume Snapshot | 2 | fact_update | YES | 0.6172599999999999 |
| 9 | PM Modi arrives in Indonesia to further strengthen India's Act East Policy | 2 | official_response | YES | 0.6183128795983324 |
| 10 | RITES shares soar 9% after bagging a $36 million locomotive supply order from South Africa | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.8`
- Base report share: `0.3`
- Multi-angle parents: `3`
- Top parent angles: `2`
- Top parent children: `3`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.3`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.3` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `3` / `>= 2`
