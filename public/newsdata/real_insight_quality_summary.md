# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.7`
- Base report share: `0.1`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `581`
- Source groups: `9`
- Content hash: `ef71ce82ede58dfa`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | New U.S. attacks on Iran were absolutely necessary, NATO chief says | 2 | market_reaction, official_response | NO | 0.6732467197849983 |
| 2 | 'Lust for murder': German doctor who killed 15 patients gets life term; suspected in 76 more deaths | 2 | base_report, fact_update | NO | 0.61211 |
| 3 | Trump | 2 | official_response, base_report | NO | 0.58191 |
| 4 | 2 girls attacked with weapon at Germany school, teenager arrested | 2 | official_response, investigative_detail | NO | 0.58111 |
| 5 | Nuvama, Cushman & Wakefield-backed realty fund raises Rs 4,000 cr | 2 | fact_update | YES | 0.7666133864516651 |
| 6 | Trump says ceasefire is 'over' after US and Iran trade strikes | 2 | official_response | YES | 0.6632467197849983 |
| 7 | PM Modi invites Australian businesses to invest in India, seeks early conclusion of CECA | 2 | official_response | YES | 0.59551 |
| 8 | India estimates 300 GW power demand next year, backs local clean-energy manufacturing | 2 | regional_followup | YES | 0.5952732802150018 |
| 9 | India news LIVE updates, 8 July 2026: Baruipur rape-murder accused shot dead in encounter, Mumbai airport near-miss as two Air India flights face off on runway, US hits 80 Iranian targets after Hormuz attacks - The Indian Express | 2 | fact_update | YES | 0.6135800531183317 |
| 10 | Trump's Board of Peace planning pilot humanitarian zone in Gaza, official says | 2 | official_response | YES | 0.5395933333333333 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `42`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.7`
- Base report share: `0.1`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.1` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
