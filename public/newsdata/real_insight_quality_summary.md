# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.2`
- Average evolution roles: `1.6`
- Base report share: `0.4375`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `540`
- Source groups: `9`
- Content hash: `a0f7fc9e3b22eaf6`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | How Washington DC marked America 250 | 2 | base_report, market_reaction | NO | 0.6732467197849983 |
| 2 | Monsoon session of Parliament from July 20 | 2 | official_response, fact_update | NO | 0.6624967197849982 |
| 3 | IMD issues red alert for Mumbai, Raigad over next three hours amid heavy rainfall | 2 | fact_update, base_report | NO | 0.61351 |
| 4 | Ninth edition of The Hindu Home Expo commences at LuLu Mall | 2 | fact_update, base_report | NO | 0.6265800531183316 |
| 5 | Performer calls for Trump's death at funeral for Iran's late supreme leader | 2 | base_report | YES | 0.5636732802150018 |
| 6 | 'We are heroic people with heroic spirit': Donald Trump marks America's 250th Independence Day | 2 | base_report | YES | 0.5285933333333332 |
| 7 | 10 crore mutual fund investors, Rs 150 lakh crore AUM: Inside AMFI's massive 2030 roadmap | 1 | fact_update | YES | 0.7226911614783158 |
| 8 | Yes Bank Q1 business update: Advances rise 18% to Rs 2.85 lakh crore, deposits up 14% | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | SBI Funds Management seeks Rs 2,000 crore in pre-IPO round | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | On Bond Street, falling yields spur a Rs 17,000-crore fundraise | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `42`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.2`
- Average evolution roles: `1.6`
- Base report share: `0.438`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.2`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.438` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
