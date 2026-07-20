# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.4`
- Base report share: `0.125`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `450`
- Source groups: `10`
- Content hash: `7f319d85a7df460a`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Sonam Wangchuk’s wife moves Delhi HC, seeks his transfer to private hospital | 4 | base_report, official_response, investigative_detail | NO | 0.6714954599824133 |
| 2 | US military launches new airstrikes to 'swiftly punish' Iran for deaths of US troops | 2 | official_response, base_report | NO | 0.6724967197849983 |
| 3 | Cockroach movement supporters march to Indian parliament - BreakingNews.ie | 2 | official_response, reaction_public | NO | 0.5723433333333332 |
| 4 | IMA suspends July 20 strike after Bombay HC stays Shiv Sena corporator's bail | 2 | official_response | YES | 0.6724967197849983 |
| 5 | History test! What last 12 billion-dollar IPO listing gains indicate about SBI MF's Rs 9,813 crore debut | 1 | fact_update | YES | 0.7226911614783158 |
| 6 | PC Jeweller shares jump 6%: What’s driving the rally after 220% gains in 3 years? | 1 | market_reaction | YES | 0.7226911614783158 |
| 7 | Yes Bank shares drop 4% after Q1 results. What are Nuvama, other brokerages saying? | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | Axis Bank shares fall 5% after Q1 earnings fail to cheer D-Street. What brokerages say | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | HDFC Bank shares fall 5% after Q1 results. Should you buy, sell or hold the stock? | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Q1 earnings begin on a strong note as banks fuel double-digit growth | 1 | market_reaction | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.4`
- Base report share: `0.125`
- Multi-angle parents: `3`
- Top parent angles: `3`
- Top parent children: `4`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.4`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Base report share: `0.125` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `3` / `>= 2`
- Top parent child depth: `4` / `>= 2`
