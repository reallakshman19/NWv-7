# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.3`
- Base report share: `0`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `661`
- Source groups: `9`
- Content hash: `812c9a03fafa092e`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IT Ministry to summon Meta officials over report on child sexual abuse advertisements on Instagram | 2 | investigative_detail, official_response | NO | 0.6714967197849984 |
| 2 | Monsoon session of Parliament from July 20 | 3 | fact_update, official_response | NO | 0.6250623727449995 |
| 3 | Govt lens on e-rickshaw remote shutdown issue; two apps removed from app stores | 2 | official_response, reaction_public | NO | 0.6504967197849982 |
| 4 | France reports 2,025 excess deaths amid Europe’s record-breaking heatwave - The Indian Express | 2 | market_reaction, fact_update | NO | 0.6456467197849983 |
| 5 | Overnight lines to pay respects to Khamenei | 2 | fact_update | YES | 0.6055800531183317 |
| 6 | 10 crore mutual fund investors, Rs 150 lakh crore AUM: Inside AMFI's massive 2030 roadmap | 1 | fact_update | YES | 0.7226911614783158 |
| 7 | Yes Bank Q1 business update: Advances rise 18% to Rs 2.85 lakh crore, deposits up 14% | 1 | fact_update | YES | 0.7226911614783158 |
| 8 | SBI Funds Management seeks Rs 2,000 crore in pre-IPO round | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | On Bond Street, falling yields spur a Rs 17,000-crore fundraise | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Inspira seals Rs 1,800-crore private credit for Burger King buy in India | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `18`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.3`
- Base report share: `0`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.3`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Base report share: `0` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
