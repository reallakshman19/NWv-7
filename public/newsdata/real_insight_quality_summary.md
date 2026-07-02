# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.5`
- Base report share: `0.1875`
- Multi-angle parents: `3`
- Weak parents: `7`
- Story count: `614`
- Source groups: `10`
- Content hash: `65e29bde2ecf1eb7`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Three held for bid to bribe TVK MLA to vote against Speaker in no-confidence motion | 2 | base_report, investigative_detail | NO | 0.6814967197849984 |
| 2 | ATF price cut by ₹5/litre to ₹110 on softer global oil prices | 2 | fact_update, official_response | NO | 0.6714967197849984 |
| 3 | Seven killed as boulder collapses at stone quarry on outskirts of Bengaluru, death toll likely to rise | 2 | regional_followup, fact_update | NO | 0.60551 |
| 4 | TVS extends lead as India’s electric two-wheeler registrations surge 74% in June | 2 | market_reaction | YES | 0.7535467197849983 |
| 5 | Ritabrata Banerjee-led Trinamool faction to meet Election Commission | 2 | official_response | YES | 0.6792467197849983 |
| 6 | 'Don't want to look like America': 5 reasons why Europe is against ACs despite melting summers | 2 | base_report | YES | 0.6098300531183317 |
| 7 | Tamilnad Mercantile Bank shares surge 5% after strong Q1FY27 business update | 1 | market_reaction | YES | 0.7226911614783158 |
| 8 | Infosys, TCS and other IT stocks jump up to 5% on dip buying. Is the worst over? | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | Shutterstock shares crash 29% after Getty Images calls off $3.7 billion merger | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Why Paisalo Digital shares hit 20% upper circuit on Wednesday | 1 | market_reaction | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `0`
- Parents: `10`
- Average angles: `1.3`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.5`
- Base report share: `0.188`
- Multi-angle parents: `3`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average visible angle count** — actual `1.3`, required `>= 1.4`. Fix: Angle-diverse child selection is not strong enough on real data.
- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.7`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Base report share: `0.188` / `<= 0.55`
- Multi-angle parent count: `3` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
