# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.1111111111111111`
- Multi-angle parents: `6`
- Weak parents: `4`
- Story count: `681`
- Source groups: `10`
- Content hash: `620fee0d7f33723a`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IT Ministry to summon Meta officials over report on child sexual abuse advertisements on Instagram | 2 | investigative_detail, official_response | NO | 0.6714967197849984 |
| 2 | Govt lens on e-rickshaw remote shutdown issue; two apps removed from app stores | 2 | official_response, reaction_public | NO | 0.6504967197849982 |
| 3 | France reports 2,025 excess deaths amid Europe’s record-breaking heatwave - The Indian Express | 2 | market_reaction, fact_update | NO | 0.6456467197849983 |
| 4 | Ninth edition of The Hindu Home Expo commences at LuLu Mall | 2 | fact_update, base_report | NO | 0.6265800531183316 |
| 5 | Prime Minister Modi to visit Indonesia, Australia, New Zealand for bilateral talks | 2 | base_report, official_response | NO | 0.5952732802150018 |
| 6 | Monsoon session of Parliament from July 20 | 2 | official_response, fact_update | NO | 0.5865100000000001 |
| 7 | Overnight lines to pay respects to Khamenei | 2 | fact_update | YES | 0.6055800531183317 |
| 8 | Bihar Guv. Hasnain and MoS Margherita attend Ali Khamenei's funeral ceremony in Tehran | 2 | official_response | YES | 0.5513433333333333 |
| 9 | 10 crore mutual fund investors, Rs 150 lakh crore AUM: Inside AMFI's massive 2030 roadmap | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Yes Bank Q1 business update: Advances rise 18% to Rs 2.85 lakh crore, deposits up 14% | 1 | fact_update | YES | 0.7226911614783158 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `52`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.5`
- Base report share: `0.111`
- Multi-angle parents: `6`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Average evolution role count** — actual `1.5`, required `>= 1.6`. Fix: C+E output should include distinct event evolution roles.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Base report share: `0.111` / `<= 0.55`
- Multi-angle parent count: `6` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.4` / `<= 0.5`
