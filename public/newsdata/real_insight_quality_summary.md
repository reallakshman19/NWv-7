# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.6`
- Base report share: `0.15`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `609`
- Source groups: `10`
- Content hash: `3baac4f96ab1e8bb`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Sonam Wangchuk’s wife moves Delhi HC, seeks his transfer to private hospital | 4 | base_report, official_response, investigative_detail | NO | 0.6614954599824133 |
| 2 | US military launches new airstrikes to 'swiftly punish' Iran for deaths of US troops | 2 | official_response, base_report | NO | 0.6724967197849983 |
| 3 | UK’s latest PM / Infographics | 2 | fact_update, official_response | NO | 0.5715232802150019 |
| 4 | Samsung's 'Back to School' Sale Brings Discounts on Galaxy S26 Series, Galaxy Book 6 Pro, Galaxy Tab S11 Ultra and More | 2 | base_report, fact_update | NO | 0.5580933333333333 |
| 5 | Meghna Infracon Infrastructure expects Rs 300cr revenue from new commercial project | 2 | fact_update | YES | 0.7086266666666667 |
| 6 | IMA suspends July 20 strike after Bombay HC stays Shiv Sena corporator's bail | 2 | official_response | YES | 0.6724967197849983 |
| 7 | Rupee weakens to two-month low as oil climbs; state-run banks cushion | 2 | market_reaction | YES | 0.60626 |
| 8 | Police fire tear gas at India’s Cockroach movement supporters - BreakingNews.ie | 2 | official_response | YES | 0.5689933333333332 |
| 9 | Som Distilleries shares jump 14% as ace investor Prashant Jain buys 25 lakh shares in Q1. What is he seeing? | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | UltraTech Cement Q1 Results: Cons profit jumps 17% YoY to Rs 2,599 crore; revenue rises 16% | 1 | fact_update | YES | 0.7226911614783158 |

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
- Average evolution roles: `1.6`
- Base report share: `0.15`
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
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.15` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `3` / `>= 2`
- Top parent child depth: `4` / `>= 2`
