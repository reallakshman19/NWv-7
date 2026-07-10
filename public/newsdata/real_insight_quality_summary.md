# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.7`
- Average evolution roles: `1.7`
- Base report share: `0.2222222222222222`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `626`
- Source groups: `9`
- Content hash: `c18cf63ea30bdbc5`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Emirates to launch flagship airbus A380 on Dubai–Delhi route from October 25, expands premium economy in India | 2 | regional_followup, fact_update | NO | 0.6874967197849983 |
| 2 | India-Australia Roadmap for Sports Collaboration - orissadiary.com | 2 | official_response, base_report | NO | 0.6758967197849983 |
| 3 | PM Modi leaves for New Zealand after concluding Australia visit - The Hindu | 2 | base_report, official_response | NO | 0.6758967197849983 |
| 4 | China successfully tests sea-based rocket booster recovery system, says state media | 2 | reaction_public, official_response | NO | 0.61351 |
| 5 | Don’t politicise jobs to families of stampede victims: Vasan | 2 | official_response, reaction_public | NO | 0.60301 |
| 6 | 'One nation, one election' mechanism may be ready for rollout by 2029: Joint panel chief | 2 | fact_update | YES | 0.7266967197849983 |
| 7 | E20 petrol may cut mileage by up to 5% but offers cleaner combustion, energy security benefits: Ministry | 2 | official_response | YES | 0.6784133864516649 |
| 8 | Eye on Indo-Pacific: India and Australia deepen ties across nuclear, maritime and mineral sectors | 2 | base_report | YES | 0.6225800531183316 |
| 9 | 13 stocks surged up to 225% in just 3 months | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Kusumgar leads with 39% GMP; SBI Funds Management, Laser Power also attract strong interest | 1 | market_reaction | YES | 0.7226911614783158 |

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
- Average evolution roles: `1.7`
- Base report share: `0.222`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.7`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.222` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
