# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.8`
- Base report share: `0.3`
- Multi-angle parents: `6`
- Weak parents: `4`
- Story count: `453`
- Source groups: `9`
- Content hash: `8a9407fdbefddc53`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | China issues red alert for rainstorms as Typhoon Bavi makes landfall | 2 | regional_followup, fact_update | NO | 0.6945633864516649 |
| 2 | EPFO invites applications from PF trusts for amnesty scheme | 2 | base_report, reaction_public | NO | 0.6814967197849984 |
| 3 | Toll up at 9 as last body recovered; official dubs incident 'act of God' - The Hindu | 2 | fact_update, official_response | NO | 0.6504967197849982 |
| 4 | US Democrat Ro Khanna says he was detained by armed Israeli settlers | 2 | base_report, official_response | NO | 0.6072599999999999 |
| 5 | Ex-MP H. Hanumanthappa passes away | 2 | base_report, official_response | NO | 0.5715250016649818 |
| 6 | Yastika century, seamers put India on the brink of historic win at Lord's | 2 | fact_update, base_report | NO | 0.5530933333333333 |
| 7 | 24-year-old woman killed, man injured in West London stabbing; Suspect, 44, arrested on suspicion of murder | 2 | fact_update | YES | 0.6834800531183316 |
| 8 | US Senator and close Trump ally Lindsey Graham dies after 'brief and sudden illness' | 2 | base_report | YES | 0.6721766666666669 |
| 9 | At least two killed in Toronto street festival shooting | 2 | fact_update | YES | 0.6292600000000002 |
| 10 | 14 nations, EU reaffirm 2016 ruling invalidating China's claims in South China Sea | 2 | official_response | YES | 0.5957600000000001 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.8`
- Base report share: `0.3`
- Multi-angle parents: `6`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.3` / `<= 0.55`
- Multi-angle parent count: `6` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.4` / `<= 0.5`
