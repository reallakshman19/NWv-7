# Ranking audit — 14 November 2026

The live Main page displayed two Top Stories and promoted a routine elephant-death report in India. Tamil Nadu mixed statewide emergencies with neighbourhood features. World appeared below the regional sections.

## Confirmed causes and corrections

1. Top Stories received already limited regional widgets and omitted the publisher top feed. It now reuses the complete fresh authority epoch, with the same source choices, blocked keywords, filtering modes and age settings.
2. Event classification missed fatal collisions, aviation ground stops, severe air quality and diplomatic/governance events. New contextual rules recognize these while excluding airport traffic statistics and actor condolences from those event classes.
3. All acquired rows carried `region: in`, including World and Oman. Geographic diversity now uses explicit event geography or normalized editorial sections rather than acquisition market.
4. Regional severity rewarded `dead` without considering public consequence. Contextual priorities now distinguish policy, public health, safety, systemic economy, civic hazards and routine features. Incidental animal mortality loses the severity boost; conservation emergencies and human danger retain priority. Geographic matching uses word boundaries.
5. The final Tamil Nadu projection and travel preference sorting put exact Chennai proximity above statewide significance. Public consequence now precedes neighbourhood/travel proximity among relevant regional stories. Main also consumes the canonical Top Stories order rather than re-sorting it by travel proximity.
6. Passing originals alongside clustered representatives could reintroduce event duplicates. An expired, previously scored widget could also suppress a fresh update. Only retained representatives enter Top Stories, and its own timestamp/age eligibility runs before clustering.

World follows Top Stories on desktop, mobile and navigation. Top Stories admission thresholds, twelve-hour fallback window and publisher caps remain unchanged.

## Frozen real-data verification

Snapshot metadata hash `3d4716fd15f2`; 285 source rows; replay clock 14 November 2026 at 17:01 UTC. The integration replay exercises the actual snapshot selector, user filters, regional scoring, clustering, Top Stories ranker and final regional projection.

- Top Stories: 13 selected, with ten initially displayed. The live baseline displayed two.
- India: leading results cover the Assam collision toll, poverty distribution, India–US trade, aviation impact and Manipur security. The elephant report leaves the first five; its score-only full-pool rank is 18.
- Tamil Nadu: cyclone warnings and the food-stock-limit decision precede routine features. Actionable local civic hazards remain eligible.
- Distinct review prompted additional source-filter, stale-representative, public-health/security and animal-related human-casualty regressions. No blocking source finding remained.

This is a rules-based ranking repair. Publisher supply and freshness still determine available coverage. The replay is local evidence; current live deployment evidence belongs to the PR.
