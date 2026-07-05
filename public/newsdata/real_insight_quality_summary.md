# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.1`
- Average evolution roles: `1.4`
- Base report share: `0.21428571428571427`
- Multi-angle parents: `2`
- Weak parents: `8`
- Story count: `474`
- Source groups: `9`
- Content hash: `1d11196d36e0c393`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IMD issues red alert for Mumbai, Raigad over next three hours amid heavy rainfall | 2 | fact_update, base_report | NO | 0.61351 |
| 2 | Monsoon session of Parliament from July 20 | 2 | official_response, fact_update | NO | 0.5865100000000001 |
| 3 | Taylor Swift, Travis Kelce are married in elaborate Madison Square Garden ceremony | 2 | fact_update | YES | 0.6385800531183317 |
| 4 | Performer calls for Trump's death at funeral for Iran's late supreme leader | 2 | base_report | YES | 0.5636732802150018 |
| 5 | 10 crore mutual fund investors, Rs 150 lakh crore AUM: Inside AMFI's massive 2030 roadmap | 1 | fact_update | YES | 0.7226911614783158 |
| 6 | Yes Bank Q1 business update: Advances rise 18% to Rs 2.85 lakh crore, deposits up 14% | 1 | fact_update | YES | 0.7226911614783158 |
| 7 | SBI Funds Management seeks Rs 2,000 crore in pre-IPO round | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | On Bond Street, falling yields spur a Rs 17,000-crore fundraise | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | Inspira seals Rs 1,800-crore private credit for Burger King buy in India | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | HDFC Bank Q1 business update: Gross advances rise 15% to Rs 30.61 lakh crore | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.1`
- Average evolution roles: `1.4`
- Base report share: `0.214`
- Multi-angle parents: `2`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.2`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.1`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.4`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.8`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.214` / `<= 0.55`
- Multi-angle parent count: `2` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
