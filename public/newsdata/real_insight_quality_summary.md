# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.6`
- Base report share: `0.05263157894736842`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `605`
- Source groups: `10`
- Content hash: `fc323e735480c543`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IIT-Madras, IIT-Kanpur launch practice oriented cybersecurity course | 2 | fact_update, base_report | NO | 0.6714967197849984 |
| 2 | France reports 2,025 excess deaths amid Europe’s record-breaking heatwave - The Indian Express | 2 | market_reaction, fact_update | NO | 0.6456467197849983 |
| 3 | Monsoon Session of Parliament of India Set to Begin July 20 – High-Stakes Agenda Ahead - News18 | 2 | regional_followup, fact_update | NO | 0.6385800531183317 |
| 4 | Indian dignitaries pay tribute to late Iran supreme leader Ayatollah Khamenei ahead of funeral - The Times of India | 2 | market_reaction, fact_update | NO | 0.6265800531183316 |
| 5 | IT Ministry to summon Meta officials over report on child sexual abuse advertisements on Instagram | 2 | investigative_detail, official_response | NO | 0.59551 |
| 6 | Coal-fired power output in June rises to highest since November 2023 | 2 | fact_update | YES | 0.6742467197849984 |
| 7 | New Zealand PM Luxon | 2 | official_response | YES | 0.6272599999999999 |
| 8 | Overnight lines to pay respects to Khamenei | 2 | fact_update | YES | 0.5175933333333333 |
| 9 | Bihar Guv. Hasnain and MoS Margherita attend Ali Khamenei's funeral ceremony in Tehran | 2 | official_response | YES | 0.49535661354833516 |
| 10 | SBI Funds Management seeks Rs 2,000 crore in pre-IPO round | 1 | market_reaction | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `52`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.6`
- Base report share: `0.053`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.053` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
