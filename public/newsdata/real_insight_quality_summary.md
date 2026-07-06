# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.8`
- Base report share: `0.3888888888888889`
- Multi-angle parents: `5`
- Weak parents: `5`
- Story count: `478`
- Source groups: `9`
- Content hash: `217b7e623292e40d`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | IMD issues red alert for Mumbai, Raigad over next three hours amid heavy rainfall | 2 | fact_update, base_report | NO | 0.61351 |
| 2 | Ninth edition of The Hindu Home Expo commences at LuLu Mall | 2 | fact_update, base_report | NO | 0.6265800531183316 |
| 3 | How Washington DC marked America 250 | 2 | base_report, market_reaction | NO | 0.6052599999999999 |
| 4 | British military says cargo ship reports being under attack in Red Sea off coast of Yemen | 3 | official_response, fact_update | NO | 0.5745916683316485 |
| 5 | ‘Very dangerous’ Super Typhoon barrels towards US Pacific islands with 280 kmph winds | 2 | regional_followup, official_response | NO | 0.5665933333333333 |
| 6 | 'We are heroic people with heroic spirit': Donald Trump marks America's 250th Independence Day | 2 | base_report | YES | 0.6165800531183316 |
| 7 | Performer calls for Trump's death at funeral for Iran's late supreme leader | 2 | base_report | YES | 0.5636732802150018 |
| 8 | Vedanta, TCS among 5 stocks with the highest dividend yield. Check details | 1 | market_reaction | YES | 0.7226911614783158 |
| 9 | Pre-market action: Here's the trade setup for today's session | 1 | market_reaction | YES | 0.7096244948116492 |
| 10 | 11 largecap stocks with upside potential of up to 50%. Do you own any? | 1 | market_reaction | YES | 0.7096244948116492 |

## Warnings

- Real snapshot still produces low Insight grade.

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `D`
- Score: `52`
- Parents: `10`
- Average angles: `1.5`
- Average temporal tiers: `1.4`
- Average evolution roles: `1.8`
- Base report share: `0.389`
- Multi-angle parents: `5`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Real snapshot grade floor** — actual `D`, required `A/B/C`. Fix: Do not accept D/F real snapshot output. Improve child selection, parent rerank, or data intake.
- **Average temporal tier count** — actual `1.4`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.5` / `>= 1.4`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.389` / `<= 0.55`
- Multi-angle parent count: `5` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.5` / `<= 0.5`
