# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.7`
- Base report share: `0.29411764705882354`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `439`
- Source groups: `9`
- Content hash: `15debe1e9ca0d55a`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Dr. Reddys trading volume highlights market engagement | 2 | fact_update, market_reaction | NO | 0.6814967197849984 |
| 2 | IMD issues red alert for Mumbai, Raigad over next three hours amid heavy rainfall | 2 | fact_update, base_report | NO | 0.6774967197849983 |
| 3 | British military says cargo ship reports being under attack in Red Sea off coast of Yemen | 3 | official_response, fact_update | NO | 0.5745916683316485 |
| 4 | ‘Very dangerous’ Super Typhoon barrels towards US Pacific islands with 280 kmph winds | 2 | regional_followup, official_response | NO | 0.5665933333333333 |
| 5 | 'We are heroic people with heroic spirit': Donald Trump marks America's 250th Independence Day | 2 | base_report | YES | 0.6165800531183316 |
| 6 | Performer calls for Trump's death at funeral for Iran's late supreme leader | 2 | base_report | YES | 0.5956600000000001 |
| 7 | Senco Gold shares soar 6% as Q1 business update highlights 60% revenue growth | 1 | fact_update | YES | 0.7226911614783158 |
| 8 | Shakti Pumps shares surge 8% on Rs 354 crore solar pump order from MSEDCL | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | HDFC Bank shares gain 2% after Q1 biz update; advances rise 15.4% YoY, deposits grow 14.7% | 1 | fact_update | YES | 0.7226911614783158 |
| 10 | Kotak Mahindra Bank shares in focus after Q1 advances jump 15% to Rs 5.12 lakh crore, deposits up 12% | 1 | fact_update | YES | 0.7226911614783158 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `42`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.7`
- Base report share: `0.294`
- Multi-angle parents: `4`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.3`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.
- **Weak parent ratio** — actual `0.6`, required `<= 0.5`. Fix: Too many weak trees remain. Repair or demote weak trees after diversity repair.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.4` / `>= 1.4`
- Average evolution role count: `1.7` / `>= 1.6`
- Base report share: `0.294` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
