# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.23529411764705882`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `664`
- Source groups: `9`
- Content hash: `2bd8373385b2f059`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Three held for bid to bribe TVK MLA to vote against Speaker in no-confidence motion | 2 | base_report, investigative_detail | NO | 0.6814967197849984 |
| 2 | Seven killed as boulder collapses at stone quarry on outskirts of Bengaluru, death toll likely to rise | 2 | regional_followup, fact_update | NO | 0.58551 |
| 3 | India's Skyroot Aerospace readies country's first private orbital rocket launch - Reuters | 2 | fact_update, investigative_detail | NO | 0.5742732802150019 |
| 4 | Vatican excommunicates followers of global Catholic sect | 2 | base_report, fact_update | NO | 0.5392732802150018 |
| 5 | Ritabrata Banerjee-led Trinamool faction to meet Election Commission | 2 | official_response | YES | 0.6792467197849983 |
| 6 | 'Don't want to look like America': 5 reasons why Europe is against ACs despite melting summers | 2 | base_report | YES | 0.6098300531183317 |
| 7 | Pakistan PM Shehbaz Sharif to attend Iran supreme leader Ali Khamenei's funeral | 2 | official_response | YES | 0.5073566135483351 |
| 8 | Tamilnad Mercantile Bank shares surge 5% after strong Q1FY27 business update | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | Infosys, TCS and other IT stocks jump up to 5% on dip buying. Is the worst over? | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Andhra Pradesh’s tax revenue rises 16% to nearly ₹5,000 cr in June 2026 | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.235`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Base report share: `0.235` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
