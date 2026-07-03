# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.0625`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `592`
- Source groups: `9`
- Content hash: `4ee8a04031017093`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Seven killed as boulder collapses at stone quarry on outskirts of Bengaluru, death toll likely to rise | 2 | regional_followup, fact_update | NO | 0.6814967197849984 |
| 2 | India's Skyroot Aerospace readies country's first private orbital rocket launch - Reuters | 2 | fact_update, investigative_detail | NO | 0.63026 |
| 3 | Monsoon Session of Parliament of India Set to Begin July 20 – High-Stakes Agenda Ahead - News18 | 2 | regional_followup, fact_update | NO | 0.6385800531183317 |
| 4 | Vatican excommunicates followers of global Catholic sect | 2 | base_report, fact_update | NO | 0.6072600000000001 |
| 5 | Iran's Supreme Leader Mojtaba Khamenei absent from wife's funeral: Report | 2 | market_reaction, official_response | NO | 0.6265800531183316 |
| 6 | Iran warns of ‘forceful response’ if oil tankers deviate from approved routes in Strait of Hormuz | 2 | official_response | YES | 0.60101 |
| 7 | PB Fintech shares slide up to 8% after Temasek arm likely sells over 2% stake via block deal | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | Union Bank of India shares drop 5% post Q1 business update, global business decline marginally on quarterly basis | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | Bajaj Housing Finance shares rally 5% as Q1 AUM climbs 24% YoY | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | PC Jeweller shares rally 5% after Q1 update; firm eyes debt-free status this quarter | 1 | market_reaction | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `28`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.063`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Base report share: `0.063` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
