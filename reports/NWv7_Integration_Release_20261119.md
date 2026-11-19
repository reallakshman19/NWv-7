# NWv-7 consolidated repair candidate — 19 November 2026

This candidate consolidates the audited ranking, identity, location, date,
provider, settings, Insight, Up Ahead and Planner corrections with the recent
Digest, Newspaper, retailer and navigation repairs. It is based on main
`9315eeafcb3c20d375ba53b486da78ab22a8791e`, preserving main's unrelated data
refreshes. The earlier corrective drafts #165–#168 are incorporated as source
overlays in the tested cumulative candidate; they are not additional merge
dependencies.

## Source integrity

The source export has 268 verified postimages (195 modified, 73 added), pinned
to the PR #164 baseline `3ded1e1f44d5c44466906d2c3e324a09bebd3a25`.
Patch SHA-256: `2b901f3c68a1afbe099de532b1bc2005b13de087d4073f0102fde203fb3a7d92`.
All 263 non-refresh postimages were copied byte-for-byte. Five generated
Newspaper/Up Ahead files began with newer main data and were genuinely
recollected using the repaired publishers. Retail data was also genuinely
recollected. No source timestamps were restamped to make old data current.
The final Git tree is independently matched to the uploaded GitHub tree.

The active compact Cloudflare D1 binding is protected. This release performs
no Worker deployment, database rebinding, migrations, deletion, queue dispatch,
paid Browser Run acquisition, or account-tier change. The already-completed
retirement is not repeated.

## Resulting behavior

- Main ranking and section routing use the audited source/location evidence,
  deduplication and date handling. The source identity and corroboration
  boundaries retain their explicit limits.
- Insight receives the repaired full bounded intake and occurrence identity,
  publisher and temporal accounting. Lazy-route transport recovery distinguishes
  a changed deployment from ordinary render errors.
- Digest has publisher tabs, up to ten stories per source, real publication
  clocks and source snippets. Published-only composition is labelled Snapshot;
  ordinary permitted acquisition is labelled Live.
- Newspaper rejects old/undated editions and retains each actual publisher.
  Current publisher collection produced 72 headlines: Hindu 30, Indian Express
  22, Dinamani 10, Daily Thanthi 10, at 2026-11-19T03:48:02.216931Z.
- Up Ahead appends/deduplicates/retains active source-dated occurrences and
  reports local coverage/failures separately. The new native collection has
  80 records; the browser displays 37 Events, 17 Alerts and three Civics items.
- Retail collection has 63 validated price observations and six current dated
  in-store flyers (HyperMax three, LuLu three). Flyers identify the listing
  provider and store scope; they are not branch-stock certifications. Genuine
  unavailable sources and partial coverage are displayed honestly.
- Planner no longer imports a public app-provided plan during synchronization.
  Exactly recognized retired copies are durably archived locally before cleanup,
  with restore/download controls. Personal reminders, edits and explicit saves
  remain. The retired catalog has 276 fingerprints; original SHA-256 is
  `7dc819c8d31f0c7f6e7da9bfe5d9b6962df2936a7f946cc1b4a71c4f8d47e4eb`.
- Settings immediately follows Buzz in navigation.

## Verification

| Check | Result |
| --- | --- |
| Main Vitest, 282 files | 1,818 passed, zero failed, eight skipped |
| Source ESLint | PASS |
| Production Vite build with production authority URLs | PASS |
| Publisher regressions | 42 passed, 18 subtests passed |
| Native Up Ahead validator, require acquisition | PASS; one failed source / sports empty warning |
| Native retail price/flyer/scope/digest validator | PASS |
| Isolated desktop 1366px and mobile 390px journeys | PASS |
| Disposable native retired-plan replay | 276 archived, personal reminder retained, zero public-plan fetches |
| Existing in-app browser release preview | Digest times/snippets, Newspaper and six offline flyers verified |

The first Windows-checkout app run had one PR-template compatibility failure
from CRLF conversion; restoring that unchanged template to its exact Git blob
bytes passed all 14 focused cases, then the entire suite passed. No product
gate or assertion was relaxed. The unchanged archived long-running Insight
snapshot benchmark was explicitly excluded from this app-suite run; its prior
separate historical replay and limitations remain recorded in the integration
handover. Eight pre-existing skipped tests are not counted as passes.

Browser tests use the actual built release and current native publications.
Canonical Sections recovery is a byte-identical replay of pinned-main data;
other offsite requests are blocked in those isolated tests. Real desktop
in-app browser observations are separate. Neither certifies fresh production
Insight quality, remote retention, or an external concurrent Planner server.

## Remaining limitations and follow-up

Production Insight last captured grade D is not closed by a passing historical
replay. Remaining failed feed lanes need free-source repair and native Worker
qualification at a clean registry epoch boundary. A02 authenticated wire-origin,
remaining A07 ID/cache/timestamp hypotheses, A10 travel/provenance paths, C09
ordinary unknown-venue timezone policy and Market background proxy retries
remain open. No fabricated publisher corroboration, weaker age/quality gates,
or invented holiday/retailer/alert data is introduced to hide these limits.

This is the implementing Coder's verification, not a claim of independent
review or production acceptance. Hosted CI and deployed browser/provenance
results must be reconciled against the actual publication commit separately.
