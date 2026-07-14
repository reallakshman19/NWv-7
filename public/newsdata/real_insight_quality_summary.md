# Real Insight Snapshot Quality

- Status: **PASS**
- Reason: -
- Grade: `C`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.8`
- Base report share: `0.15`
- Multi-angle parents: `6`
- Weak parents: `4`
- Story count: `809`
- Source groups: `10`
- Content hash: `fe0d4cb9f43cafcf`

## Top parents

| # | Headline | Children | Angles | Weak | Score |
|---:|---|---:|---|---|---:|
| 1 | ‘Boat flipped in three minutes,’ recounts Vietnam crash survivor upon arrival in Chennai | 2 | official_response, regional_followup | NO | 0.6943967197849983 |
| 2 | TVS Emerald inks Joint Development Agreement for four-acre land parcel in Noombal | 2 | base_report, fact_update | NO | 0.693213386451665 |
| 3 | 12 districts in A.P. get new DMHOs | 2 | base_report, fact_update | NO | 0.6807467197849983 |
| 4 | E Jean Carroll receives $5.6 million in sexual abuse case after years-long legal battle with Trump | 2 | fact_update, official_response | NO | 0.6243266666666667 |
| 5 | Bodies of 15 Indian tourists killed in Vietnam boat accident flown home | 2 | fact_update, regional_followup | NO | 0.6252128795983323 |
| 6 | India beat England in historic first women's test at Lord's - Reuters | 2 | regional_followup, base_report | NO | 0.5563433333333333 |
| 7 | Puravankara Q1 sales bookings up 28% to Rs 1,439 cr on higher volumes, price growth | 2 | fact_update | YES | 0.7566133864516651 |
| 8 | MEA summons Iranian deputy envoy, after Indian national killed in attack on ship | 3 | fact_update | YES | 0.6805487346782662 |
| 9 | Supreme Court stays Madras High Court order banning cow slaughter in Tamil Nadu | 2 | official_response | YES | 0.6613967197849984 |
| 10 | Anand Rathi Share Q1 results: Profit rises 71% to Rs 39 crore before one-time charge | 1 | fact_update | YES | 0.7226911614783158 |

## Real Snapshot Ratchet Gate

- Status: **FAIL**
- Gate version: `real-insight-snapshot-ratchet-v1`
- Grade: `C`
- Score: `76`
- Parents: `10`
- Average angles: `1.6`
- Average temporal tiers: `1.6`
- Average evolution roles: `1.8`
- Base report share: `0.15`
- Multi-angle parents: `6`
- Top parent angles: `2`
- Top parent children: `2`

### Failed gates

- **Average temporal tier count** — actual `1.6`, required `>= 1.8`. Fix: C+E output should cover multiple event-time tiers, not only source buckets.

### Passed gates

- Real snapshot grade floor: `C` / `A/B/C`
- Parent cluster count: `10` / `>= 3`
- Average visible angle count: `1.6` / `>= 1.4`
- Average evolution role count: `1.8` / `>= 1.6`
- Base report share: `0.15` / `<= 0.55`
- Multi-angle parent count: `6` / `>= 1`
- Top parent angle count: `2` / `>= 2`
- Top parent child depth: `2` / `>= 2`
- Weak parent ratio: `0.4` / `<= 0.5`
