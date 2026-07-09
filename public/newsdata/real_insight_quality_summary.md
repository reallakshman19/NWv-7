# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.5`
- Base report share: `0.058823529411764705`
- Multi-angle parents: `2`
- Weak parents: `8`
- Story count: `637`
- Source groups: `9`
- Content hash: `361bd272688e5a9d`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | New U.S. attacks on Iran were absolutely necessary, NATO chief says | 2 | market_reaction, official_response | NO | 0.6052599999999999 |
| 2 | 'Lust for murder': German doctor who killed 15 patients gets life term; suspected in 76 more deaths | 2 | base_report, fact_update | NO | 0.59211 |
| 3 | Nuvama, Cushman & Wakefield-backed realty fund raises Rs 4,000 cr | 2 | fact_update | YES | 0.7666133864516651 |
| 4 | Woman suspected of Monaco bomb attack found dead in Ukraine | 2 | fact_update | YES | 0.6741467197849984 |
| 5 | Trump says ceasefire is 'over' after US and Iran trade strikes | 2 | official_response | YES | 0.5952599999999999 |
| 6 | India news LIVE updates, 8 July 2026: Baruipur rape-murder accused shot dead in encounter, Mumbai airport near-miss as two Air India flights face off on runway, US hits 80 Iranian targets after Hormuz attacks - The Indian Express | 2 | fact_update | YES | 0.6135800531183317 |
| 7 | Trump's Board of Peace planning pilot humanitarian zone in Gaza, official says | 2 | official_response | YES | 0.5195933333333334 |
| 8 | Eternal, ICICI Bank & 8 stocks with up to 27% upside. Do you own them? | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | Cochin Shipyard shares dip 2% as govt’s OFS opens for retail investors today | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Broadcom shares jump over 2% after Apple announces $30 billion chip deal | 1 | fact_update | YES | 0.7096244948116492 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.2`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.5`
- Base report share: `0.059`
- Multi-angle parents: `2`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.2`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.8`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.059` / `<= 0.55`
- Multi-angle parent count: `2` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
