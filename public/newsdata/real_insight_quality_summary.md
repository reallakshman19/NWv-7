# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.8`
- Base report share: `0.14285714285714285`
- Multi-angle parents: `6`
- Weak parents: `4`
- Story count: `715`
- Source groups: `10`
- Content hash: `41622e8d292ab068`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IIT-Madras, IIT-Kanpur launch practice oriented cybersecurity course | 2 | fact_update, base_report | NO | 0.6714967197849984 |
| 2 | Vatican excommunicates followers of global Catholic sect | 2 | base_report, fact_update | NO | 0.6632467197849983 |
| 3 | France records 2,025 excess deaths at peak of heatwave as Europe braces for more extreme weather | 2 | market_reaction, base_report | NO | 0.6363266666666667 |
| 4 | Monsoon Session of Parliament of India Set to Begin July 20 – High-Stakes Agenda Ahead - News18 | 2 | regional_followup, fact_update | NO | 0.6385800531183317 |
| 5 | IT Ministry to summon Meta officials over report on child sexual abuse advertisements on Instagram | 2 | investigative_detail, official_response | NO | 0.59551 |
| 6 | Iran prepares for weeklong funeral of late Supreme Leader Ayatollah Ali Khamenei, killed in war | 3 | market_reaction, fact_update | NO | 0.5511239879583164 |
| 7 | Iran warns of ‘forceful response’ if oil tankers deviate from approved routes in Strait of Hormuz | 2 | official_response | YES | 0.6769967197849983 |
| 8 | Coal-fired power output in June rises to highest since November 2023 | 2 | fact_update | YES | 0.6742467197849984 |
| 9 | New Zealand PM Luxon | 2 | official_response | YES | 0.6272599999999999 |
| 10 | Bihar Guv. Hasnain and MoS Margherita attend Ali Khamenei's funeral ceremony in Tehran | 2 | official_response | YES | 0.5513433333333333 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.8`
- Base report share: `0.143`
- Multi-angle parents: `6`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.143` / `<= 0.55`
- Multi-angle parent count: `6` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.4` / `<= 0.5`
