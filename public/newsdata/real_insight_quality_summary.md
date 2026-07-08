# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.7`
- Base report share: `0.16666666666666666`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `691`
- Source groups: `9`
- Content hash: `1c25b4f55f924cb0`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Nato showcases big arms deals as Trump sulks | 2 | base_report, official_response | NO | 0.6769967197849983 |
| 2 | 'Lust for murder': German doctor who killed 15 patients gets life term; suspected in 76 more deaths | 2 | base_report, fact_update | NO | 0.59211 |
| 3 | India, Indonesia expand defence ties; New Delhi to supply BrahMos missiles | 2 | base_report, official_response | NO | 0.5723433333333332 |
| 4 | New U.S. attacks on Iran were absolutely necessary, NATO chief says | 2 | market_reaction, official_response | NO | 0.5492732802150018 |
| 5 | Nuvama, Cushman & Wakefield-backed realty fund raises Rs 4,000 cr | 2 | fact_update | YES | 0.7666133864516651 |
| 6 | Woman suspected of Monaco bomb attack found dead in Ukraine | 2 | fact_update | YES | 0.60616 |
| 7 | India news LIVE updates, 8 July 2026: Baruipur rape-murder accused shot dead in encounter, Mumbai airport near-miss as two Air India flights face off on runway, US hits 80 Iranian targets after Hormuz attacks - The Indian Express | 2 | fact_update | YES | 0.6135800531183317 |
| 8 | Trump says ceasefire is 'over' after US and Iran trade strikes | 2 | official_response | YES | 0.5392732802150018 |
| 9 | Eternal, ICICI Bank & 8 stocks with up to 27% upside. Do you own them? | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Cochin Shipyard shares dip 2% as govt’s OFS opens for retail investors today | 1 | market_reaction | YES | 0.7226911614783158 |

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
- Base report share: `0.167`
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
- Base report share: `0.167` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
