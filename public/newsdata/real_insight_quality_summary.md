# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.5`
- Base report share: `0.05555555555555555`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `589`
- Source groups: `9`
- Content hash: `f63050af5b38725e`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IIT-Madras, IIT-Kanpur launch practice oriented cybersecurity course | 2 | fact_update, base_report | NO | 0.6714967197849984 |
| 2 | France reports 2,025 excess deaths amid Europe’s record-breaking heatwave - The Indian Express | 2 | market_reaction, fact_update | NO | 0.6456467197849983 |
| 3 | Monsoon Session of Parliament of India Set to Begin July 20 – High-Stakes Agenda Ahead - News18 | 2 | regional_followup, fact_update | NO | 0.6385800531183317 |
| 4 | IT Ministry to summon Meta officials over report on child sexual abuse advertisements on Instagram | 2 | investigative_detail, official_response | NO | 0.59551 |
| 5 | Coal-fired power output in June rises to highest since November 2023 | 2 | fact_update | YES | 0.6742467197849984 |
| 6 | Overnight lines to pay respects to Khamenei | 2 | fact_update | YES | 0.6495800531183316 |
| 7 | New Zealand PM Luxon | 2 | official_response | YES | 0.6272599999999999 |
| 8 | Bihar Guv. Hasnain and MoS Margherita attend Ali Khamenei's funeral ceremony in Tehran | 2 | official_response | YES | 0.49535661354833516 |
| 9 | 10 crore mutual fund investors, Rs 150 lakh crore AUM: Inside AMFI's massive 2030 roadmap | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Yes Bank Q1 business update: Advances rise 18% to Rs 2.85 lakh crore, deposits up 14% | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.5`
- Base report share: `0.056`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Base report share: `0.056` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
