# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.5`
- Base report share: `0.17647058823529413`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `454`
- Source groups: `10`
- Content hash: `55a281d5f5686856`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Sonam Wangchuk’s wife moves Delhi HC, seeks his transfer to private hospital | 4 | base_report, official_response, investigative_detail | NO | 0.691508740197415 |
| 2 | Safdarjung Hospital | 2 | base_report, reaction_public | NO | 0.6874967197849983 |
| 3 | US military launches new airstrikes to 'swiftly punish' Iran for deaths of US troops | 2 | official_response, base_report | NO | 0.6724967197849983 |
| 4 | Iran's Supreme Leader says U.S. breaches show Trump's signature is 'worthless' | 2 | market_reaction, official_response | NO | 0.5585933333333333 |
| 5 | IMA suspends July 20 strike after Bombay HC stays Shiv Sena corporator's bail | 2 | official_response | YES | 0.59651 |
| 6 | Q1 earnings begin on a strong note as banks fuel double-digit growth | 1 | market_reaction | YES | 0.7226911614783158 |
| 7 | Axis Bank weighs raising stake in its insurance venture to 30% | 1 | fact_update | YES | 0.7226911614783158 |
| 8 | Axis Bank Standalone Profit Soars 23% in Q1 | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | ICICI Bank net profit jumps 16% YoY to Rs 14,805 crore | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Carnelian Capital plans PE foray with Rs 2,000 crore fund | 1 | fact_update | YES | 0.7096244948116492 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.5`
- Base report share: `0.176`
- Multi-angle parents: `4`
- Top parent angles: `3`
- Top parent children: `4`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Base report share: `0.176` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `3` / `>= 2`
- Top parent child depth: `4` / `>= 2`
