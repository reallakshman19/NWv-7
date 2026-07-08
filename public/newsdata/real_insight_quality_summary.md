# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.8`
- Average evolution roles: `1.9`
- Base report share: `0.3333333333333333`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `665`
- Source groups: `9`
- Content hash: `468ef49cd86ddb33`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Nato showcases big arms deals as Trump sulks | 2 | base_report, official_response | NO | 0.6769967197849983 |
| 2 | US official says latest attacks on Iran "4-5 times bigger" than last strikes: Report | 2 | base_report, official_response | NO | 0.61751 |
| 3 | India, Indonesia expand defence ties; New Delhi to supply BrahMos missiles | 3 | base_report, official_response | NO | 0.5517727761127958 |
| 4 | New U.S. attacks on Iran were absolutely necessary, NATO chief says | 2 | market_reaction, official_response | NO | 0.5492732802150018 |
| 5 | PM Modi conferred with Indonesia's highest honour ‘Bintang Adipurna' in Jakarta | 2 | official_response | YES | 0.6814967197849984 |
| 6 | Why Pakistan-based Hafiz Saeed is wanted in India? / Explained | 2 | base_report | YES | 0.6365800531183317 |
| 7 | Woman suspected of Monaco bomb attack found dead in Ukraine | 2 | fact_update | YES | 0.60616 |
| 8 | India news LIVE updates, 8 July 2026: Baruipur rape-murder accused shot dead in encounter, Mumbai airport near-miss as two Air India flights face off on runway, US hits 80 Iranian targets after Hormuz attacks - The Indian Express | 2 | fact_update | YES | 0.6135800531183317 |
| 9 | US accuses Iran of attacking 2 commercial ships; mulls action | 2 | base_report | YES | 0.6098300531183317 |
| 10 | Trump says ceasefire is 'over' after US and Iran trade strikes | 2 | official_response | YES | 0.5392732802150018 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `66`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.8`
- Average evolution roles: `1.9`
- Base report share: `0.333`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Average temporal tier count: `1.8` / `>= 1.8`
- Average evolution role count: `1.9` / `>= 1.6`
- Base report share: `0.333` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
