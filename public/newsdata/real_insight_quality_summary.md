# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.9`
- Base report share: `0.045454545454545456`
- Multi-angle parents: `6`
- Weak parents: `4`
- Story count: `663`
- Source groups: `10`
- Content hash: `ff20e5d949c95c75`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | Maharashtra Council adjourned; 13 killed in rain-related incidents, says Minister | 3 | fact_update, official_response | NO | 0.6419143876382674 |
| 2 | Dr. Reddys trading volume highlights market engagement | 2 | fact_update, market_reaction | NO | 0.6814967197849984 |
| 3 | British military says cargo ship reports being under attack in Red Sea off coast of Yemen | 3 | official_response, fact_update | NO | 0.6425487346782661 |
| 4 | Report | 2 | market_reaction, investigative_detail | NO | 0.6172599999999999 |
| 5 | After a century, forgotten Punjabi soldiers finally recognised for WWI sacrifice | 2 | base_report, fact_update | NO | 0.6052599999999999 |
| 6 | ‘Very dangerous’ Super Typhoon barrels towards US Pacific islands with 280 kmph winds | 2 | regional_followup, official_response | NO | 0.6225800531183316 |
| 7 | Iran's supreme leader absent as senior officials attend ayatollah's funeral | 2 | official_response | YES | 0.6522467197849984 |
| 8 | Six killed in Mumbai as rains wreak havoc, disrupt travel | 2 | fact_update | YES | 0.6172599999999999 |
| 9 | Axis Bank Volume Snapshot | 2 | fact_update | YES | 0.6172599999999999 |
| 10 | PM Modi arrives in Indonesia to further strengthen India's Act East Policy | 2 | official_response | YES | 0.4943394400283358 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.9`
- Base report share: `0.045`
- Multi-angle parents: `6`
- Top parent angles: `2`
- Top parent children: `3`

### Failed gates

- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Average evolution role count: `1.9` / `>= 1.6`
- Base report share: `0.045` / `<= 0.55`
- Multi-angle parent count: `6` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `3` / `>= 2`
- Weak parent ratio: `0.4` / `<= 0.5`
