# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.7`
- Base report share: `0.42105263157894735`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `591`
- Source groups: `10`
- Content hash: `61aef82f26c85763`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Nato showcases big arms deals as Trump sulks | 2 | base_report, official_response | NO | 0.7209967197849984 |
| 2 | US official says latest attacks on Iran "4-5 times bigger" than last strikes: Report | 2 | base_report, official_response | NO | 0.61751 |
| 3 | Trump says there will either be a deal with Iran or U.S. will ‘finish the job’ | 2 | base_report, official_response | NO | 0.6265800531183316 |
| 4 | India, Indonesia expand defence ties; New Delhi to supply BrahMos missiles | 3 | base_report, official_response | NO | 0.5517727761127958 |
| 5 | Why Pakistan-based Hafiz Saeed is wanted in India? / Explained | 2 | base_report | YES | 0.6365800531183317 |
| 6 | PM Modi conferred with Indonesia's highest honour ‘Bintang Adipurna' in Jakarta | 2 | official_response | YES | 0.61351 |
| 7 | Woman suspected of Monaco bomb attack found dead in Ukraine | 2 | fact_update | YES | 0.60616 |
| 8 | US accuses Iran of attacking 2 commercial ships; mulls action | 2 | base_report | YES | 0.6098300531183317 |
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
- Average temporal tiers: `1.7`
- Average evolution roles: `1.7`
- Base report share: `0.421`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.421` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
