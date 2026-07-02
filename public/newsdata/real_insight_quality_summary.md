# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.125`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `674`
- Source groups: `10`
- Content hash: `503319de52997ee6`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Seven killed as boulder collapses at stone quarry on outskirts of Bengaluru, death toll likely to rise | 2 | regional_followup, fact_update | NO | 0.6814967197849984 |
| 2 | Three held for bid to bribe TVK MLA to vote against Speaker in no-confidence motion | 2 | base_report, investigative_detail | NO | 0.6814967197849984 |
| 3 | India's Skyroot Aerospace readies country's first private orbital rocket launch - Reuters | 2 | fact_update, investigative_detail | NO | 0.63026 |
| 4 | Iran's Supreme Leader Mojtaba Khamenei absent from wife's funeral: Report | 2 | market_reaction, official_response | NO | 0.5385933333333333 |
| 5 | Vatican excommunicates followers of global Catholic sect | 2 | base_report, fact_update | NO | 0.5392732802150018 |
| 6 | Ritabrata Banerjee-led Trinamool faction to meet Election Commission | 2 | official_response | YES | 0.6792467197849983 |
| 7 | Tamilnad Mercantile Bank shares surge 5% after strong Q1FY27 business update | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | Infosys, TCS and other IT stocks jump up to 5% on dip buying. Is the worst over? | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | Andhra Pradesh’s tax revenue rises 16% to nearly ₹5,000 cr in June 2026 | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Shutterstock shares crash 29% after Getty Images calls off $3.7 billion merger | 1 | fact_update | YES | 0.7226911614783158 |

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
- Base report share: `0.125`
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
- Base report share: `0.125` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
