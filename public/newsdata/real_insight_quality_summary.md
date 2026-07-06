# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.9`
- Base report share: `0.2727272727272727`
- Multi-angle parents: `6`
- Weak parents: `4`
- Story count: `631`
- Source groups: `9`
- Content hash: `2b8b4097cf7f3180`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Dr. Reddys trading volume highlights market engagement | 2 | fact_update, market_reaction | NO | 0.6814967197849984 |
| 2 | IMD issues red alert for Mumbai, Raigad over next three hours amid heavy rainfall | 2 | fact_update, base_report | NO | 0.6774967197849983 |
| 3 | British military says cargo ship reports being under attack in Red Sea off coast of Yemen | 3 | official_response, fact_update | NO | 0.6425487346782661 |
| 4 | Maharashtra Council adjourned; 13 killed in rain-related incidents, says Minister | 3 | fact_update, official_response | NO | 0.5899573212916499 |
| 5 | After a century, forgotten Punjabi soldiers finally recognised for WWI sacrifice | 2 | base_report, fact_update | NO | 0.6052599999999999 |
| 6 | ‘Very dangerous’ Super Typhoon barrels towards US Pacific islands with 280 kmph winds | 2 | regional_followup, official_response | NO | 0.6225800531183316 |
| 7 | Performer calls for Trump's death at funeral for Iran's late supreme leader | 2 | base_report | YES | 0.6636467197849983 |
| 8 | Iran's supreme leader absent as senior officials attend ayatollah's funeral | 2 | official_response | YES | 0.6522467197849984 |
| 9 | Axis Bank Volume Snapshot | 2 | fact_update | YES | 0.6172599999999999 |
| 10 | 'We are heroic people with heroic spirit': Donald Trump marks America's 250th Independence Day | 2 | base_report | YES | 0.6165800531183316 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.5`
- Average evolution roles: `1.9`
- Base report share: `0.273`
- Multi-angle parents: `6`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.5`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Average evolution role count: `1.9` / `>= 1.6`
- Base report share: `0.273` / `<= 0.55`
- Multi-angle parent count: `6` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.4` / `<= 0.5`
