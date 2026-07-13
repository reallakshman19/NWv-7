# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.7`
- Base report share: `0.25`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `528`
- Source groups: `10`
- Content hash: `c46d182bca0c1c6a`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Why US, EU and 13 nations are backing 2016 South China Sea ruling against Beijing's claims | 3 | fact_update, official_response | NO | 0.6732477209716007 |
| 2 | Swiggy shares slide over 2% after FSSAI issues 9 notices over consumer complaints | 2 | base_report, market_reaction | NO | 0.7065633864516649 |
| 3 | Toll up at 9 as last body recovered; official dubs incident 'act of God' - The Hindu | 2 | fact_update, official_response | NO | 0.6504967197849982 |
| 4 | Ex-MP H. Hanumanthappa passes away | 2 | base_report, official_response | NO | 0.6274820680115993 |
| 5 | Yastika century, seamers put India on the brink of historic win at Lord's | 2 | fact_update, base_report | NO | 0.5530933333333333 |
| 6 | US Senator and close Trump ally Lindsey Graham dies after 'brief and sudden illness' | 2 | base_report | YES | 0.6721766666666669 |
| 7 | US strikes Iran after Strait of Hormuz ship attack; Tehran hits Gulf states | 2 | regional_followup | YES | 0.6814967197849984 |
| 8 | At least two killed in Toronto street festival shooting | 2 | fact_update | YES | 0.6292600000000002 |
| 9 | Supreme Court stays Madras HC order directing ban on cow slaughter in Tamil Nadu | 2 | official_response | YES | 0.59341 |
| 10 | FIIs pour over $1 billion into Indian stocks, biggest weekly buying since June 2025 | 1 | fact_update | YES | 0.7226911614783158 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.7`
- Base report share: `0.25`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `3`

### Failed gates

- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.25` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `3` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
