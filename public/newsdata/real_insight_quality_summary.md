# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.6`
- Base report share: `0.16666666666666666`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `477`
- Source groups: `9`
- Content hash: `7bcf43ae78bbfc0b`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Sonam Wangchuk’s wife moves Delhi HC, seeks his transfer to private hospital | 4 | base_report, official_response, investigative_detail | NO | 0.691508740197415 |
| 2 | Safdarjung Hospital | 2 | base_report, reaction_public | NO | 0.6874967197849983 |
| 3 | US military launches new airstrikes to 'swiftly punish' Iran for deaths of US troops | 2 | official_response, base_report | NO | 0.6724967197849983 |
| 4 | Indian-origin woman jailed in UK for more than 2 years over Rs 2.8 crore Covid loan fraud | 2 | fact_update, investigative_detail | NO | 0.6502967197849984 |
| 5 | Iran's Supreme Leader says U.S. breaches show Trump's signature is 'worthless' | 2 | market_reaction, official_response | NO | 0.5585933333333333 |
| 6 | IMA suspends July 20 strike after Bombay HC stays Shiv Sena corporator's bail | 2 | official_response | YES | 0.59651 |
| 7 | Axis Bank Standalone Profit Soars 23% in Q1 | 1 | fact_update | YES | 0.7226911614783158 |
| 8 | ICICI Bank net profit jumps 16% YoY to Rs 14,805 crore | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | Lohia Corp IPO opens on July 23: Here’s all you need to know | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | JK Cement Q1 profit drops 15.3% YoY to Rs 274.62 crore | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `52`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.6`
- Base report share: `0.167`
- Multi-angle parents: `5`
- Top parent angles: `3`
- Top parent children: `4`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.167` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `3` / `>= 2`
- Top parent child depth: `4` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
