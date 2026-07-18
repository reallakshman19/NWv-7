# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.7`
- Average evolution roles: `2`
- Base report share: `0.14285714285714285`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `671`
- Source groups: `10`
- Content hash: `fb8ef3dd6045cf9d`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | PM launches India’s first hydrogen-powered train | 4 | base_report, official_response, fact_update | NO | 0.7083373324356643 |
| 2 | US Senate Bill seeks 100% tariffs on India, China for buying Russian oil | 2 | fact_update, base_report | NO | 0.6976300531183317 |
| 3 | DCET results announced | 2 | official_response, fact_update | NO | 0.6697800531183317 |
| 4 | US prosecutor says Justice Department made call to drop Gautam Adani case | 2 | expert_analysis, fact_update | NO | 0.6005899468816684 |
| 5 | NEET UG 2026 results: Punjab’s Aryan Gupta, Haryana’s Panshul Bansal top; 11.21 lakh qualify | 2 | fact_update | YES | 0.7065633864516649 |
| 6 | Supreme Court to examine whether persons deleted from voter list in SIR can be denied welfare schemes | 2 | official_response | YES | 0.6692467197849983 |
| 7 | US to revive rule of no green cards for those who use public benefits | 2 | reaction_public | YES | 0.6220800531183317 |
| 8 | Sonam Wangchuk shifted to hospital; CJP founder Dipke under detention by Delhi Police | 2 | official_response | YES | 0.59551 |
| 9 | A 7.3-magnitude earthquake hits Mexico-Guatemala border; no damage reported so far | 2 | official_response | YES | 0.5935232802150019 |
| 10 | Zepto IPO anchor book nears closure; Norges, Motilal Oswal may take 40-45% | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `42`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.7`
- Average evolution roles: `2`
- Base report share: `0.143`
- Multi-angle parents: `4`
- Top parent angles: `3`
- Top parent children: `4`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `2` / `>= 1.6`
- Base report share: `0.143` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `3` / `>= 2`
- Top parent child depth: `4` / `>= 2`
