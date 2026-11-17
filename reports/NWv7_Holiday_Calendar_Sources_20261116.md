# Chennai and Muscat holiday calendar, 2026–2027

Checked 16 November 2026. This is a bundled, one-time data set. It needs no API key, paid service, Cloudflare resource or recurring calendar fetch. Dates expire at midnight after their final day in the destination city's timezone. Announced upcoming holidays appear as Planner suggestions within its normal seven-day window; adding to the saved agenda remains manual.

## Sources and coverage

- **Chennai2026:** all24 rows of Tamil Nadu Government Gazette, G.O.Ms.No.708,11November2025, [official PDF](https://stationeryprinting.tn.gov.in/extraordinary/2025/721_Ex_II_1_2025.pdf).
- **Chennai2027:** all24 rows of Tamil Nadu Government Gazette, G.O.Ms.No.613,6October2026, [official PDF](https://stationeryprinting.tn.gov.in/extraordinary/2026/437_Ex_II_1_2026.pdf).
- The April1 annual closing applies to banks only. Other state holiday records describe government/bank scope; they do not promise private-employer leave. The two August15,2027 observances share one card while retaining both names.
- **Muscat2026:** seven holiday records. Non-Eid dates follow the [Government calendar](https://gov.om/en/important-dates-and-holidays) and [Ministry of Information-hosted annual announcement](https://www.omaninfo.om/images/library/file/Book699363.pdf). The observed National Day break is **25–26November**, replacing the incorrect legacy18November estimate. Eid break ranges use the actual Ministry of Labour announcements reported by [Muscat Daily,11March](https://www.muscatdaily.com/2026/03/11/oman-announces-eid-al-fitr-public-holiday-dates-for-2026/) and [Oman Observer,18May](https://www.omanobserver.om/article/1189816/oman/community/eid-al-adha-holidays-announced-in-oman).
- **Muscat2027:** eight provisional occasion records. Lunar estimates are from [Time and Date](https://www.timeanddate.com/holidays/oman/2027); the accession anniversary is grounded in the [Government history](https://www.omaninfo.om/en/pages/210/show/877). The [official holiday framework](https://www.omaninfo.om/en/pages/161/show/939) allows observed dates to change. These records explicitly say provisional and **are excluded from automatic Planner suggestions**. They do not invent an announced leave period; Eid entries are occasion estimates, not a claimed complete break. Two Isra and Mi'raj occurrences fall in2027.

## Runtime and cache behavior

`getHolidayCalendarItems` creates source-linked cards with stable identities, explicit destination timezone boundaries, year labels, and announced/provisional status. The bundled calendar is added alongside current publisher data on static/live fetch and on settings-aware cache reads. It survives a provider outage and a real-publication recovery. Only obsolete `Festival calendar` estimates are removed; current curated records remain. Calendar availability never advances a news publication timestamp or turns an acquisition failure into news-fetch success.

No fixtures or synthetic news were added to public snapshot files. Calendar revisions require a deliberate source-reviewed data update, especially when Oman publishes2027 observed leave dates or later governments amend lunar dates. Regular weekly non-working days and school/employer-specific closures are outside this data set.

## Verification

Focused Vitest suite covers all48 Chennai source rows, both Oman years, the corrected2026 National Day break, same-day observance grouping, destination-midnight expiry, provisional Planner exclusion, bank-only labels, city filtering, offline availability, repeated refresh deduplication, retention alongside fresh publication, news timestamp authority and source/retail policy metadata preservation. Existing freshness assertion was corrected to allow an ongoing holiday range rather than rejecting it because its start date precedes today.
