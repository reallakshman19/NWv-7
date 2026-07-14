# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `D`
- Parents: `10`
- Average angles: `1.4`
- Average temporal tiers: `1.3`
- Average evolution roles: `1.6`
- Base report share: `0.125`
- Multi-angle parents: `4`
- Weak parents: `6`
- Story count: `720`
- Source groups: `9`
- Content hash: `be6bf62fb2f938a6`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | ‘Boat flipped in three minutes,’ recounts Vietnam crash survivor upon arrival in Chennai | 2 | official_response, regional_followup | NO | 0.6943967197849983 |
| 2 | TVS Emerald inks Joint Development Agreement for four-acre land parcel in Noombal | 2 | base_report, fact_update | NO | 0.693213386451665 |
| 3 | E Jean Carroll receives $5.6 million in sexual abuse case after years-long legal battle with Trump | 2 | fact_update, official_response | NO | 0.6243266666666667 |
| 4 | India beat England in historic first women's test at Lord's - Reuters | 2 | regional_followup, base_report | NO | 0.5563433333333333 |
| 5 | MEA summons Iranian deputy envoy, after Indian national killed in attack on ship | 3 | fact_update | YES | 0.5805916683316485 |
| 6 | Anand Rathi Share Q1 results: Profit rises 71% to Rs 39 crore before one-time charge | 1 | fact_update | YES | 0.7226911614783158 |
| 7 | Equirus, Money Grow Asset, Amaltas, 7 others deliver up to 14% returns in June | 1 | regional_followup | YES | 0.7226911614783158 |
| 8 | Rekha Jhunjhunwala sells 1 crore Canara Bank shares in Q1. What's behind the move? | 1 | fact_update | YES | 0.7226911614783158 |
| 9 | Cupid shares jump 5%, multibagger stock turns Rs 1 lakh investment into Rs 87 lakh in just 3 years | 1 | market_reaction | YES | 0.7226911614783158 |
| 10 | Biocon shares jump 6% as Mylan likely exits drugmaker after Rs 3,481 crore stake sale | 1 | fact_update | YES | 0.7226911614783158 |

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
- Average evolution roles: `1.6`
- Base report share: `0.125`
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
- Average evolution role count: `1.6` / `>= 1.6`
- Base report share: `0.125` / `<= 0.55`
- Multi-angle parent count: `4` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
