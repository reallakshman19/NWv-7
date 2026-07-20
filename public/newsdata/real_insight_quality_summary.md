# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.4`
- Base report share: `0.05555555555555555`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `585`
- Source groups: `9`
- Content hash: `83d7ee880f861e77`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Sonam Wangchuk’s wife moves Delhi HC, seeks his transfer to private hospital | 3 | official_response, investigative_detail | NO | 0.6280128768472054 |
| 2 | UK’s latest PM / Infographics | 2 | fact_update, official_response | NO | 0.5715232802150019 |
| 3 | Samsung's 'Back to School' Sale Brings Discounts on Galaxy S26 Series, Galaxy Book 6 Pro, Galaxy Tab S11 Ultra and More | 2 | base_report, fact_update | NO | 0.5580933333333333 |
| 4 | Meghna Infracon Infrastructure expects Rs 300cr revenue from new commercial project | 2 | fact_update | YES | 0.7086266666666667 |
| 5 | IMA suspends July 20 strike after Bombay HC stays Shiv Sena corporator's bail | 2 | official_response | YES | 0.6724967197849983 |
| 6 | Rupee weakens to two-month low as oil climbs; state-run banks cushion | 2 | market_reaction | YES | 0.60626 |
| 7 | Police fire tear gas at India’s Cockroach movement supporters - BreakingNews.ie | 2 | official_response | YES | 0.5689933333333332 |
| 8 | Som Distilleries shares jump 14% as ace investor Prashant Jain buys 25 lakh shares in Q1. What is he seeing? | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | UltraTech Cement Q1 Results: Cons profit jumps 17% YoY to Rs 2,599 crore; revenue rises 16% | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | History test! What last 12 billion-dollar IPO listing gains indicate about SBI MF's Rs 9,813 crore debut | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.4`
- Base report share: `0.056`
- Multi-angle parents: `3`
- Top parent angles: `2`
- Top parent children: `3`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.3`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.4`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.056` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `3` / `>= 2`
