# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.8`
- Base report share: `0.3`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `493`
- Source groups: `9`
- Content hash: `9f569e8d51bb794f`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Toll up at 9 as last body recovered; official dubs incident 'act of God' - The Hindu | 2 | fact_update, official_response | NO | 0.6504967197849982 |
| 2 | Ex-MP H. Hanumanthappa passes away | 2 | base_report, official_response | NO | 0.6274820680115993 |
| 3 | US Democrat Ro Khanna says he was detained by armed Israeli settlers | 2 | base_report, official_response | NO | 0.6072599999999999 |
| 4 | Yastika century, seamers put India on the brink of historic win at Lord's | 2 | fact_update, base_report | NO | 0.5530933333333333 |
| 5 | Women in action | 2 | base_report, background_context | NO | 0.504476159813334 |
| 6 | US Senator and close Trump ally Lindsey Graham dies after 'brief and sudden illness' | 2 | base_report | YES | 0.6721766666666669 |
| 7 | China evacuates nearly two million people as powerful typhoon makes landfall | 2 | fact_update | YES | 0.6303266666666667 |
| 8 | At least two killed in Toronto street festival shooting | 2 | fact_update | YES | 0.6292600000000002 |
| 9 | 14 nations, EU reaffirm 2016 ruling invalidating China's claims in South China Sea | 2 | official_response | YES | 0.5957600000000001 |
| 10 | US strikes Iran after Strait of Hormuz ship attack; Tehran hits Gulf states | 2 | regional_followup | YES | 0.5815232802150019 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.8`
- Base report share: `0.3`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.3` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
