# NWv-7 Market revamp: a working buddy guide

19 November 2026. **Planning only. Market coding is stopped.**

The aim is one useful Market page for checking India indices, following shares,
tracking mutual funds, and converting OMR/INR. Those tasks should feel connected,
use the same data rules, and work independently when one source fails.

This guide gives the implementation decisions as well as the tasks. A Low
reasoning agent should not have to invent a data model, financial calculation,
fallback policy, or file structure while working through it.

## 1. What I inspected, and what remains unverified

I rendered and visually inspected **all 11 pages** of the Owner's image-only
`market tab.pdf`, together with the three supplied dark-theme screenshots. The
PDF has no extractable text. Its original SHA-256 is
`0956726af1f4cfd0e2f83e578d22794948f8f2b2c7616a9669f5cf470a990c06`.

The open built-in-browser target was `http://127.0.0.1:4173/#/markets`.
Both the tab access and browser troubleshooting calls reported access unavailable
for this chat. **I did not inspect or interact with that live tab.** The supplied
PDF and screenshots are page evidence; the code inspection is a separate source.
Keyboard behavior, current browser storage, and the exact build loaded by that
tab remain unverified. Do not report this as a completed live-browser audit.

The PDF shows an older rendering contract than the pending local candidate:
it says `Updated`, includes seed prices, and summarizes the page as `Official`.
The local candidate suppresses seed prices and says `Feed timestamp`. An open
SPA can retain its old JavaScript after its server is rebuilt. That is a plausible
explanation, not proof of the PDF tab's build identity. Future verification must
check the served **and loaded** build, rather than just the port or URL.

Current implementation source:

`D:/CodeD/NWv-7/.audit-integration/release-20261119`

Committed base: `dab31fa6e1b8aae7eeae931c9ce99ea2efc8d5a5`, draft PR170.
The local Market candidate is unfinished; seven newly added reproductions fail.
The separate Daily Digest repair passed its focused checks and isolated browser
checks. This revamp should preserve it.

## 2. Compare the supplied page with the intended experience

| Step / evidence | Current health and concrete finding | Revamp decision |
|---|---|---|
| 1. Get oriented: PDF p1, p10-11 | Critical trust conflict: `Official`, `0m ago`, and an A grade appear alongside six seed feeds and a seed-fallback warning. | Source provenance belongs to each dataset/row. Refresh time cannot make a price current. Replace the floating grade with a useful data-status control. |
| 2. Read indices: PDF p1, p3-4, p6 | Primary indices repeat in header cards and Market pulse; BANK NIFTY appears again in sectorals. | One index collection with stable IDs; one board with India/Global and broad/sector filters. |
| 3. Convert currency: screenshot1, PDF p2 and p7 | The working OMR/INR calculator is separate from another currency board containing seed USD/EUR/GBP quotes. | One Currency workspace, one rate source, one converter. OMR/INR is the default pair. |
| 4. Follow equity: screenshot2, PDF p2, p5-6 | A saved symbol is an external shortcut; real-looking mover prices elsewhere have no quote times in the capture. | Saved shares should show qualified in-app quote rows when covered. Keep official links as secondary verification. |
| 5. Check funds: screenshot2, PDF p3, p7-8 | Search and the NAV board are separated. The board says Charts, shows down arrows next to missing changes, and labels large-and-mid-cap funds MID CAP. | One Funds workspace: saved schemes, search, NAV date, accurate category, and optional comparison. Unknown change has no arrow. |
| 6. Check new issues: PDF p8-10 | IPO has no verified schedule; NFOs are announcements with missing closure dates. | IPO/FPO lives under Equity; NFO lives under Funds. Distinguish source failure, verified zero rows, announcement, upcoming and open. |
| 7. Use SIP: screenshot3, PDF p3 | A useful calculator occupies a large section between unrelated data. Inputs are visually much smaller than their labels in the dark screenshot. | Put SIP under Funds, collapsed by default. Keep the existing calculation convention explicit. |
| 8. Diagnose problems: PDF p10-11 | Source-health information is far below the misleading header; sticky navigation repeats on printed pages. | Show a short relevant status beside each workspace; put full diagnostics behind Data status. Add a clean print layout. |

The four core tasks should each have a clear entry, useful data or a specific
reason it is unavailable, a local Retry action, and a visible source/as-of date.
The existing dark theme, user font preference, and main app navigation can stay.

## 3. The product shape I recommend

Use the existing Market route, with **four workspaces**:

**Indices / Equity / Funds / Currency**.

Default to Indices. Keep the active workspace in the route query, for example
`#/markets?view=funds`, so refresh and browser Back work. Do not add four new
top-level app pages or another router. One shell owns navigation and status;
each workspace owns its own visible task and requests.

There is no fifth Overview in the first release. That would duplicate the board
and create another place for stale summaries. We can add one later if real use
shows a need.

### Mobile shell and Indices

```text
+------------------------------------------+
| Markets                    [Data status] |
| India session: After hours / Estimated    |
| Quotes: [source as-of]    [Refresh data]  |
+--------------------+---------------------+
| Indices [selected] | Equity              |
| Funds              | Currency            |
+--------------------+---------------------+
| [India v] [All indices v] [Find index...] |
|                                          |
| NIFTY 50                    [star]       |
| [index points]     [change] [change %]   |
| Daily close - [date/time IST]            |
| [Source]                    [Details]    |
|------------------------------------------|
| SENSEX                      [star]       |
| [index points]     [change] [change %]   |
| Daily close - [date/time IST]            |
|------------------------------------------|
| BANK NIFTY ...                           |
|                                          |
| Tracked indices: 3 up / 1 down / 1 flat  |
| 1 has no comparable change               |
+------------------------------------------+
| Existing main app navigation             |
+------------------------------------------+
```

The numbers above are placeholders for a wireframe, not proposed demo data.
The header is compact. Avoid the present ticker + three-card rail + repeated
hero combination. At large font sizes the four tabs form two rows; no hidden
last tab or forced page-wide horizontal scroll.

### Desktop

```text
+-----------------------------------------------------------------------+
| Markets   India: [session]   Quotes as of [time]  [Status] [Refresh]     |
| [Indices]      [Equity]      [Funds]      [Currency]                     |
+--------------------------------------------------+--------------------+
| Workspace filters + search                       | Selected item      |
| Name         Value      Change      Quote date   | Source / as-of     |
| NIFTY 50     [...]      [...]       [...]        | Actual history     |
| SENSEX       [...]      [...]       [...]        | or no chart        |
| ...                                              | [Official source]  |
+--------------------------------------------------+--------------------+
```

An item detail panel is optional; a normal expanded row is adequate initially.
Do not introduce a new chart library. Reuse MarketSparkline only when real,
ordered history is present. No empty chart box, fabricated series, or Charts
heading over a list without a chart.

### Equity

```text
+------------------------------------------+
| [My shares] [Tracked universe] [IPO/FPO] |
| [Search covered symbol or company...]   |
| Coverage: existing tracked shares        |
|                                          |
| INFY                [qualified INR price]|
| [change, if known]  As of [source time]  |
| [Saved] [Details] [Verify on NSE]        |
|------------------------------------------|
| MY-OTHER-SYMBOL                          |
| No quote in the current free coverage    |
| [Remove] [Official quote]                |
+------------------------------------------+
```

Do not promise exchange-wide search/quotes from the present free feed. The
first useful version can populate the existing collector universe. Preserve
saved symbols outside it and explain coverage rather than inventing a price
or dropping the user's list.

### Funds

```text
+------------------------------------------+
| [My funds] [Find a fund] [NFOs]          |
| [Search scheme / fund house...] [Search]|
|                                          |
| Exact scheme name                        |
| Direct / Regular - Growth / IDCW         |
| NAV INR [value]    NAV date [date]        |
| [accurate source category or Unknown]    |
| [Save] [Details] [AMFI verification]     |
|                                          |
| > Compare saved funds (later)            |
| > SIP scenario                           |
+------------------------------------------+
```

Search, saved schemes and the existing NAV collection all resolve the same
scheme IDs. Do not create another unrelated fund list. Keep Direct/Regular and
Growth/IDCW variants distinct. A scheme name is not a stable ID.

### Currency

```text
+------------------------------------------+
| Currency conversion       [Data status] |
|                                          |
| From OMR [v]     [amount...............] |
|                [Swap]                    |
| To   INR [v]     [calculated result....] |
|                                          |
| 1 OMR = [full-precision-derived rate] INR |
| Daily reference as of [provider time]    |
| [Refresh rate]   [Provider attribution]  |
|                                          |
| > Optional fee / spread estimate         |
+------------------------------------------+
```

Start with OMR/INR; add USD/EUR/GBP later from the same permitted browser-held
rate response if useful. No separate legacy currency cards. Index points stay
points: do not apply a currency selector to NIFTY/SENSEX index levels.

## 4. The foundation: make one truthful data contract

Do this before moving the UI. Otherwise the new tabs will inherit the old bugs.

Keep the existing React/Vite/JavaScript stack. Add JSDoc types and small pure
functions rather than a new state-management framework or repository-wide TS
migration. Normalize provider-specific rows at the boundary.

Suggested internal shape, expressed as TypeScript notation for clarity:

```ts
type AsOf =
  | { kind: 'instant'; at: string } // ISO instant with explicit offset
  | { kind: 'date'; date: string; zone: 'Asia/Kolkata' };

type MarketQuote = {
  id: string;                 // e.g. index:NSE:NIFTY50, equity:NSE:INFY
  kind: 'index' | 'equity';
  name: string;
  symbol: string;
  region: 'IN' | 'US' | 'JP' | 'HK' | 'GB';
  value: number;              // never a formatted numeric string internally
  unit: 'points' | 'currency';
  currency: string | null;    // null for index points
  change: number | null;
  changePercent: number | null;
  asOf: AsOf;
  source: {
    id: string;
    url: string;
    authority: 'official' | 'third-party';
    cadence: 'daily' | 'delayed' | 'reference';
  };
};

type DatasetState<T> = {
  data: T | null;
  request: 'idle' | 'loading' | 'ready' | 'error';
  freshness: 'current' | 'stale' | 'expired' | 'unknown';
  delivery: 'publication' | 'provider' | 'cache';
  checkedAt: number | null;   // real successful revalidation only
  publishedAt: number | null;
  lastAttemptAt: number | null;
  error: { code: string; message: string } | null;
};
```

Fund rows have `schemeCode`, exact variant metadata, NAV and an **as-of date**.
FX has a pair/base, numeric rate and the provider's update instant. Use related
types, not a giant object with fifty optional fields. Keep request state,
freshness, delivery and authority separate: cached official NAV is still
official in provenance but cached in delivery, and it may also be stale.

### Three different clocks

1. **Quote/NAV/rate time:** when the source value applies.
2. **Publication time:** when this application's producer published its file.
3. **Checked time:** when a real, valid network revalidation completed.

A local cache read must not advance any of those. A failed request updates only
the attempt/error. Displaying a page may have a separate observation time; never
use that time to rank or date its quotes.

Daily NAV is a date, not an invented midnight quote timestamp. Match an entire
supported date format, validate its calendar day, and carry its timezone. An
instant needs an explicit offset. Reject future instants beyond the existing
five-minute skew allowance; do not rescue invalid times with Date.now().

### Stable identities and deduplication

Use one alias registry for provider adapters, the board, search and watchlists.
For example, BANK NIFTY / NIFTY BANK / ^NSEBANK resolve to one ID. Region and
exchange are part of identity; display names alone are insufficient. An index
and a share cannot collide. A Direct Growth fund and Regular Growth fund must
not deduplicate together.

## 5. The difficult part: partial refresh without data regression

The current service compares a maximum index timestamp for the entire payload.
That lets a later US quote promote older India data. Equal-clock partial data
can also replace a fuller snapshot. An in-memory previous result bypasses the
24-hour eligibility rule. The Provider can reintroduce it again on an exception.

**Recommended final policy: merge by instrument, never replace a whole board
based on its newest member.** This permits a genuinely newer partial result
without losing the other valid rows.

```text
previous = filter previously held rows through retention rules
incoming = normalize and validate the actual response
next = copy(previous)                 # do not mutate cached objects

for each incoming row:
    key = canonical instrument ID
    old = previous[key]
    if no eligible old row:
        next[key] = incoming row
    else if incoming source-as-of > old source-as-of:
        next[key] = incoming row
    else if incoming source-as-of == old source-as-of:
        if values agree: retain value; record successful revalidation
        else: retain old; record equal-time value conflict
    else:
        retain old; record out-of-order row

expire rows whose permitted retention has ended
derive per-dataset coverage/freshness from next and request outcome
commit next only if this request still owns the active generation
```

Same-time conflicting values can be corrected later only by a documented
provider revision rule, not by whichever request finishes last. Provider time
must have a consistent meaning before comparing different providers; an
intraday tick and a daily closing bar are not interchangeable observations.
Initially use the same quote provider/cadence for a given instrument. Adding
another provider requires an explicit precedence/semantic compatibility rule.

Example: incoming NIFTY advances, incoming SENSEX is older, and S&P advances.
Update NIFTY and S&P. Keep the eligible SENSEX. Report that some India rows
were retained. Do not mark all India rows fresh because S&P advanced.

### What to do with the seven red reproductions

They currently assert a conservative whole-payload rejection in some cases.
Keep their inputs and failure log, but refine their expected outputs to the
per-row contract before repair. Specifically, a newer partial NIFTY response
should update NIFTY **and retain SENSEX**; it need not reject NIFTY too.
Likewise mixed India ages should advance only the qualifying row. Do not simply
change assertions to match current broken behavior.

| Preserved case | Correct result under the revamp |
|---|---|
| Newer global quote with older India quote | Global may update; India may not regress. |
| Newer publication with equal-clock partial India coverage | Missing valid India rows remain; publication time does not date prices. |
| One newer and one older India quote | Advance the newer instrument; retain the older instrument's previous value. |
| Equal-clock partial provider response | Preserve fuller valid coverage; don't overwrite a conflict at the same time. |
| Newer partial provider response | Apply valid new row while preserving the other eligible rows. |
| Service previousData is 25 hours old under current policy | Expired data cannot become normal fallback. |
| Provider has been open 25 hours and revalidation throws | Apply the same eligibility rule; don't resurrect expired state in catch. |

### Session-aware freshness, without an indefinite cache

First repair the current 24-hour in-memory hole consistently in service and
Provider. Then introduce the new policy explicitly, with fixtures:

| Dataset | Proposed policy |
|---|---|
| Index/equity acquisition | Revalidate current publication on first use when the local acquisition is over 30 minutes old. Never call this quote time. |
| Index/equity source quote | A known last completed session may remain a labelled previous close over weekends/holidays. During the next regular session it becomes previous-session data, not current trading data. Use the producer's existing five-calendar-day hard ceiling while qualifying calendar rules. |
| Unverifiable calendar/session | Say session estimated / last quote dated. Do not claim a fully verified holiday calendar. Unknown age never qualifies. |
| FX | Browser cache for one day; existing >36h stale marker and three-day hard expiry remain initially. |
| NAV | Display the actual NAV date. Existing >7-day historical marker remains; saved historical detail may remain accessible but cannot be described as current NAV. |
| IPO/NFO | Revalidate publication independently; source failure is separate from a qualified empty list. Close an offer at the end of its source-local closing day, absent an explicit source cutoff. |

Local cache validity and market-session quote validity are different checks.
Successful revalidation of Friday's genuine close on Sunday can update checked
time, while the price remains explicitly Friday's close. Do not repeatedly
re-cache an unvalidated response to extend its life. Add clock-driven expiry
recomputation on focus/visibility change and the next relevant time boundary;
do not leave an open tab's freshness frozen until a click.

The maintained 2026 calendar currently has only six dates; 2027 is absent.
Use a qualified NSE trading calendar, including special sessions, before
claiming verified Open/Closed. Chennai public holidays are not an exchange
calendar. Keep Owner custom dates, with clear precedence and provenance.

## 6. Requests and fallbacks: one failure should stay local

Render the shell and active workspace immediately. An India index request must
not block the Currency converter or Fund search. The current full-page loader
waits on market boot before those tools mount; remove that coupling.

Use these bounded paths:

```text
Indices / tracked Equity
    current qualified publication -> eligible retained rows -> unavailable

Currency
    eligible browser rate cache -> rate provider -> bounded stale cache -> error

Fund search / selected NAV
    keyed cache -> explicit source request -> bounded prior result -> error

IPO / NFO
    current qualified publication -> labelled retained schedule -> source error
```

The Market publication should have the same build-independent freshness
principle as repaired news: a stale file bundled with an app build is not the
only current authority. Revalidate the known repository publication on supported
local/official deployments, with a timeout and byte bound. Do not accept a
200 HTML SPA fallback as JSON. Preserve the original publication/source clocks.

Keep the existing live-provider path behind explicit developer use while
qualifying it. Normal page visits must not invoke the current query1/query2,
chart/quote and three public CORS-proxy cascade per instrument. A working proxy
does not establish data correctness or source permission.

Recommended request mechanics:

- One in-flight request per dataset/key. Double refresh shares its promise.
- Active workspace refresh operates on that workspace, with clear wording.
  Shared publication acquisition can be coalesced across Indices and Equity.
- Use one absolute deadline, including JSON/body read; proposed 12 seconds for
  a manual quote/publication refresh, not 8 seconds per attempt plus another
  12 seconds. Abort active transports at the deadline and stop further attempts.
- Retain eligible visible rows while refreshing. A cold-load error is local to
  its panel and has Retry. A failed retry must not clear a valid converter result
  or a valid saved fund's NAV, or reset its source date.
- Classify outcomes as unchanged, updated, partial, failed. A valid unchanged
  last close is successful revalidation; a timeout with old data is failed.
- Treat 429 as a cooldown; no automatic repeated button-triggered retry loop.
- Use request-generation ownership to prevent late results updating new state.
  Abort previous searches/selections on replacement and on unmount.

For fund selection, keep the selected scheme ID independently from its loaded
NAV. The current selector uses fund?.code, so it resets while a request is
pending. A clear state model avoids that and the A-finishes-after-B race:

```js
const requestId = ++latestRequest.current;
abortPreviousSelection();
setSelectedSchemeCode(code);
const result = await fetchNavFor(code, signal);
if (requestId !== latestRequest.current || signal.aborted) return;
setNavByCode(previous => ({ ...previous, [code]: result }));
```

This is policy pseudocode, not a patch to paste without cleanup/error handling.
The same identity-plus-generation check belongs in catch/finally, so an older
request cannot clear the newer request's loading or error state.

## 7. Free sources and the smallest useful improvements

### Indices and Equity: reuse already acquired data

The Python producer already fetches **six India indices and sixteen shares**,
but exports shares mainly as top-five gainers/losers. Expose the full qualified
stock list as an additive `equities` collection. This is a high-value first
improvement: more useful watchlist rows with **no extra upstream requests**.

The browser fallback has a different fifteen-share list; unify these definitions
so coverage, search and source receipts agree. Derive movers locally from the
qualified same-session universe. Always label it Tracked shares, with the
actual coverage count, never exchange-wide Top India gainers.

Keep the six broad/sector index rows in one store. Derive filters and pinned
display from them. Do not fetch BANK NIFTY twice for two widgets. Global data
must be independently usable even when India is unavailable; the current
service's India-row usability requirement prevents that despite UI guards.

The existing Yahoo path is an unofficial best-effort dependency, not evidence
of a licensed real-time feed. Before expanding or republishing an equity
provider, establish its permitted use, actual timestamps and limits. NSE's
policy covers display and redistribution; an accessible website is not an
automatic free-data grant. [NSE data policy](https://www.nseindia.in/static/market-data/nse-data-policy).

If no permitted dependable quote source exists for an arbitrary saved symbol,
show the symbol with an explicit coverage state and official verification link.
Do not quietly substitute demo values, another exchange's security, or an
unqualified public proxy. This source limitation does not block shell, Funds,
Currency, or the normalized existing tracked universe work.

### Currency: keep the current valid integration, improve the workflow

The current open ExchangeRate-API endpoint supplies daily reference data,
requires attribution, permits caching, is rate limited and prohibits
redistribution. Keep the fetch and cache in the browser; do not add its response
to a public GitHub snapshot or Cloudflare relay. [Open endpoint documentation](https://www.exchangerate-api.com/docs/free).

Reuse `loadOmrRate`, `normalizeOmrRate` and `convertOmrInr`. Add a provider-budgeted
Retry, a swap action, an output field that is clearly read-only, and a pending
state that does not erase valid previous output. Use its next-update metadata
when available; ordinary global refresh must not defeat daily caching. Retry a
failed acquisition when no valid daily result was obtained; a successful daily
rate is not polled repeatedly by a button.

Keep the unrounded rate internally. OMR-to-INR multiplies, INR-to-OMR divides.
Round only display (INR2 decimals, OMR3). Empty input is empty, not zero; actual
zero is valid. Reject nonfinite/negative/over-bound amounts. A later optional
fee/spread estimate is a separate user assumption and cannot alter the provider
rate or imply an actual bank/remittance quote.

### Funds: unify the existing useful parts

MFapi documents free/no-key search, latest NAV and NAV history, with rate limits
and response caching. Keep searches explicit and fetch only selected/saved
schemes. [MFapi documentation](https://www.mfapi.in/docs/).

Reuse its current service functions, add query-keyed caching and bounded saved
scheme loading. Proposed first release: up to12 saved schemes, fetch at most3
concurrently on first Funds use, and reuse source-dated results that day. A
scheme failing must not blank the other eleven. Do not download every scheme
history on opening Market.

Repair category logic: `MutualFundCard` currently maps small-cap to mid-cap and
defaults unknown funds to flexi-cap. Prefer explicit scheme metadata; otherwise
use Unknown category or a disclosed inferred label. Large-and-mid-cap is not
the same category as mid-cap. Preserve exact plan and payout variant.

Repair change display: the current markup draws a down arrow unless direction
equals up, even when changePercent is absent. Unknown change should be `Change
unavailable`, without an arrow. Calculate a NAV change only from actual dated
observations of the same scheme. Don't assign every row the first fund's NAV date.

Combine search and the existing NAV list under Funds. A compare-up-to3 panel is
a useful second increment; fetch date-bounded history only when requested.
Align common observation dates, distinguish simple period return from CAGR,
and reject insufficient history rather than comparing different time windows.
Defer ranking funds as Best or High ROI.

### NFO / IPO and SIP

Keep `currentNfoRows`' useful distinction between announcements and complete
offer schedules. An announcement with a missing closing date is not Open.
Retain the AMFI-provided launch field; don't parse a maturity year in the name
as the subscription date. Show announcement/source dates separately when present.
Individual records need their genuine source URL where provided; the general
AMFI page is a fallback, not a fabricated scheme-specific link.

IPO/FPO and NFO are different products and belong in their respective Equity
and Funds tabs. Report unavailable BSE acquisition as a source failure, rather
than a verified statement that no IPOs exist. Do not add scraping retries to
get around a403. Improve an alternate source only after qualifying it.

Retain the current SIP convention in the first UI change: end-of-month payments,
monthly rate = user annual nominal rate/12. Make the convention visible in help;
do not silently switch to an effective annual-return formula. For payment P,
months n, monthly rate r:

```text
principal = P * n
value = P * ((1 + r)^n - 1) / r    when r > 0
value = principal                 when r == 0
```

Golden cases already covered: 5000/month for10 years at0% gives600000; for1 year
at12% under that convention gives approximately63412.52. Keep the scenario
independent of any selected fund's historical return. Validate whole-month term
semantics, finite output and safe numeric bounds. SIP remains usable offline.

## 8. File structure: refactor in small pieces

Keep all product work inside the existing release checkout. Suggested additions
are destinations, not instructions to create every file on the first pass:

```text
src/pages/MarketPage.jsx                    shell + 4 workspace navigation
src/components/MarketStickyHeader.jsx       short status/header only
src/components/MarketTicker.jsx             reuse normalized rows, or remove
                                           from Market if the board replaces it
src/components/market/
  IndicesPanel.jsx
  EquityPanel.jsx
  FundsPanel.jsx
  CurrencyPanel.jsx
  MarketQuoteRow.jsx                        common value/change/as-of display
  MarketDataStatus.jsx                      shared status / retry / provenance
  SipScenario.jsx                          extracted existing calculator
src/services/marketQuotePolicy.js           pure validation / identity / merge
src/services/indianMarketStableService.js    acquisition + publication adapters
src/services/indiaMarketTools.js            existing FX/NAV/SIP source functions
src/context/MarketContext.jsx               independent states + request ownership
src/viewModels/useMarketTabViewModel.js      selectors; no hidden acquisition
src/utils/marketSession.js                  clock/session interpretation
src/config/settings_market.js              explicit supported preferences
scripts/refresh_india_market.py             existing bounded publication
```

`IndiaMarketTools.jsx` currently combines FX, equity persistence, Fund search,
NAV selection and SIP. Extract a working section at a time, preserving functions
and tests. Delete the wrapper only after the new panels consume those parts.

One Market provider can expose independent states for quote publication,
currency, fund search/NAV and issue schedules; a new provider per component is
unnecessary. One quote store feeds header, list, watchlist and ticker. Helpers
format values only at render time. Shared selectors should filter by canonical
region/kind, not scattered name regexes.

Use repository CSS variables and the Owner's font setting. Avoid another
visual theme or new chart/state/data-fetch package. Prefer small labelled
forms and existing accessible controls. Styling cannot substitute for qualified
data, and a good-looking panel must not earn a data grade by being populated.

## 9. Settings, stored data and the misleading A grade

`cacheMinutes` and `layoutVariant` are declared defaults but have no actual
consumers beyond the config. The Settings page mechanically exposes `show*`
keys, rather than a documented feature map. Fix this intentionally:

- Use an explicit Market settings schema with readable labels and consumers.
- Keep existing visibility preferences through migration. Map primary and
  sectoral index visibility into the new Indices workspace rather than dropping
  them. Handle all-workspaces-hidden with an explanation and settings link.
- Add a default workspace and an independent Global filter only if they are
  actually wired. Preserve the font size. Don't expose a cache control that
  can override provider minimum refresh intervals or hard expiry.
- Either wire cacheMinutes as a bounded local revalidation preference, separate
  from quote validity, or retire it with an explicit migration. Retire unused
  layoutVariant after checking stored settings compatibility.
- Keep the existing symbol watchlist; normalize aliases/case, deduplicate and
  enforce its12-item bound. Save instrument IDs, not cached prices in the list.
- Preserve the previous local keys before a one-time idempotent migration. Bump
  the quote-cache schema when its semantics change; unqualified legacy Yahoo
  timestamps cannot be repaired by replacing them with now. Invalid row data
  can be discarded while saved instrument preferences remain intact.

The grade defect is in code, not just placement: `auditMarketTabQuality` treats
`source.ok !== false` as healthy, while normalized health rows use statuses and
often have no `ok`. It counts seed coverage and can pass missing freshness.
It also relies on legacy isSnapshot/isStale flags instead of the actual mode.

Use qualified row coverage, explicit status categories and actual source age.
Unknown status is Unknown. A failed or seed-only quote board cannot get A
because an unrelated NAV source is official. Prefer a header Data status button
with per-workspace states; if the grading API must remain for the app, repair
its inputs and tests as well. Put debugging counts in the details panel.

## 10. A practical work order for a Low reasoning agent

Work through these slices sequentially, with one writer. No new agents are
created by this document. For each slice, read the specified code, state the
expected input/output behavior, make the smallest change, run the listed tests,
and show the result before broadening scope.

| Slice | Make this concrete change | Main files | Proof before moving on |
|---|---|---|---|
| 0. Establish the contract | Preserve current fixtures; refine the7 red expectations to per-instrument retention; add the seeded/Official-grade and unknown-change examples from the PDF. | Service/context cert tests; new pure-policy tests; grading/fund tests. | Demonstrate old behavior fails for the intended reason. Don't weaken checks just to get green. |
| 1. Repair the data foundation | Canonical IDs, numeric/time validation, row-wise monotonic merge, eligibility in service AND Provider, honest statuses/grade, separate session/fetch clocks. | marketQuotePolicy, stable service, MarketContext, marketTrust, marketSession, pageAuditGrading. | Core regressions pass, plus mixed-region, equal-time conflict, expiry and late-request cases. |
| 2. Expose already acquired equity | Add the producer's complete qualified16-share collection; unify universe/aliases; preserve existing contract during additive migration. | Python producer/tests, adapter, shared source registry. | Same25 upstream maximum; source clocks survive; partial/invalid run cannot overwrite qualified publication. |
| 3. Build the four-workspace shell | Extract current tools into panels; show shell before boot; use one board/row component; keep query state and app navigation. | MarketPage, header/ticker, panel components, viewmodel, scoped CSS. | Currency/Funds usable when India fails; Global usable independently; no duplicated acquisition or horizontal overflow. |
| 4. Finish the useful workflows | In-app covered equity watchlist; saved Fund NAVs with race protection; single FX converter/retry; NFO/IPO states; collapsed SIP. | Extracted panels, indiaMarketTools and persistence helpers. | User journeys below work with real or explicitly named deterministic fixtures; no hidden demos. |
| 5. Migrate preferences and qualify | Idempotent settings/cache migration; source status details; print style; accessibility and real-source checks. | Settings config/UI, migration helpers, diagnostics, tests. | No lost saved items; source budgets/rights documented; combined tests/build; actual browser verification on the loaded candidate. |

Do not implement phase3 first because it is visually easier. The fake-freshness
and merge rules are the foundation the panels consume.

### What I want the implementation agent to bring back when it gets stuck

Bring one small example: the old row, the incoming row, their IDs/times, the
current helper result, and the exact expected result from this guide. Keep a
failed test. Do not respond to uncertainty by adding another fallback or a
default numeric value. For timing/race issues, bring the order of two requests
and which request owns state. This lets a stronger buddy help with the hard
decision without re-auditing the whole repository.

If a source lacks a documented field, preserve Unknown. If a provider contract
or new data-usage right is genuinely unclear, isolate that acquisition slice
and continue the independent shell/FX/Fund work. Do not create a project-wide
approval chain or silently choose paid infrastructure.

### Reusable working prompt

```text
Work in Coder mode on ONE Market revamp slice named by the Owner. Follow the
NWv7 Market Revamp Buddy Plan dated19 November2026. The plan does not itself
authorize resuming implementation, merge or deployment.

Actual checkout: D:/CodeD/NWv-7/.audit-integration/release-20261119.
Preserve PR170, existing Daily Digest fixes, unrelated local edits, saved
watchlists, the Planner recovery archive and active compact Cloudflare D1.

Before editing, list your allowed files and show the smallest failing example.
For a merge, date, category or fallback question, use the policy in the plan.
Use pure helpers for policy. Keep numeric values and dates unformatted until
rendering. Never add seed values, fabricated quote times, unbounded retries or
a new public CORS proxy to make an empty panel look populated.

Keep one writer; don't launch agents or change dependencies unnecessarily.
Validate at the source boundary; keep request, source, delivery and freshness
separate. Preserve older eligible instruments during partial acquisition and
reject their individual regressions. Unknown fields remain Unknown.

Run the focused contract tests for your slice. Report the actual input/output,
changed files, commands and results, unresolved source assumptions, and exact
remaining failure. If blocked on difficult code, present a minimal example and
the failed test for the buddy; continue independent work within your slice.

Do not claim live-browser verification from a PDF, test doubles or an unavailable
browser. Don't push a knowingly red candidate or merge/deploy without the
actual current authorization and review boundary being satisfied.
```

## 11. Acceptance journeys and adversarial checks

Verify the useful tasks, not just implementation-shaped unit tests.

1. **Indices:** select India then Global; pin an index; duplicate aliases produce
   one row; regional failures stay separate; a fresh US close cannot refresh an
   old NIFTY row. Check count semantics on up/down/flat/unknown.
2. **Equity:** save a covered symbol and see its real dated price in-app; reload
   and retain the saved choice; save an uncovered valid symbol and see honest
   coverage limits; remove only that personal item. Movers reflect their named
   tracked universe and one comparable session.
3. **Currency:** OMR to INR, swap, zero, blank, malformed/very large input, offline
   with an eligible cached rate, cold offline, expired cache,429 and successful
   retry. Typing or swapping makes no new network request. Output never uses a
   stale rate without its stale label and original as-of.
4. **Funds:** search exact variants; save one; select A then B with A responding
   last; reload saved schemes; one request fails while others succeed. Unknown
   category and change remain unknown. Category tests include small-cap,
   large-and-mid-cap, hybrid and unavailable metadata.
5. **Offers:** NFO with a known closing date expires at the correct India date
   boundary; an announcement remains an announcement. IPO provider failure and
   verified zero issues produce different copy. No maturity date becomes launch.
6. **SIP:** zero-rate and existing golden cases; input-boundary validation;
   missing fund/network data does not block an offline scenario.
7. **Recovery:** duplicate refresh clicks, refresh during boot, HTTP200 HTML,
   malformed/oversize/slow-stream JSON, storage failure, out-of-order response,
   aborted transport, old app bundle/new publication, provider clock regression,
   equal-time conflict, weekend/holiday and a tab left open beyond expiry.
8. **UI/accessibility:** 390px and1366px plus320px/200% text checks; keyboard tab
   order, active workspace semantics, focus visibility, meaningful labels,
   announced status changes, adequate control targets, and a print layout without
   repeated floating navigation. Keep controls' font inherited, with at least
   44px target height as a design target; verify rather than claim compliance.

Build verification should identify the candidate asset marker and the build
actually loaded by the tested page. A page still running an older bundle is
not evidence for or against the new build. Do not clear the Owner's browser
storage to obtain a clean result; use an isolated test profile plus explicit
legacy-cache fixtures, and inspect the real profile only through authorized UI.

Run the relevant Vitest files and Python publisher tests first, then full app
regression, lint and build after the final integration. Existing clock-sensitive
Insight replay and legacy dirty-file allowlists have separate documented limits;
record them honestly instead of weakening an unrelated gate. Market cannot be
called complete while its introduced contract tests are red.

## 12. Budget, delivery and what to postpone

The current producer schedule is17 runs/week at no more than25 source requests
per run: a425-request/week design maximum, not an observed billed total. Keep
that bound for the first revamp; exposing already acquired shares adds no
upstream requests. GitHub-hosted execution and whole-account quotas still need
checking for the actual account. No new Cloudflare collection, D1 table, paid
API, Browser Rendering job or scheduled job is required by this plan.

Keep FX direct/browser-cached with attribution. Fund requests are lazy, cached
and bounded. Initial workspace changes should not trigger other hidden panels'
requests. A source outage never enables a paid fallback automatically.

Postpone: exchange-wide scanning, real-time streaming, options/F&O, news or
sentiment recommendations, portfolio imports/broker login, tax/P&L engines,
auto buy/sell suggestions, new commodity/FII pipelines, and broad historical
backfills. They would add source, correctness and maintenance work before the
four requested tasks are reliable.

The first reviewable milestone is: **correct row retention and honest status,
one unified index board, covered equity prices, a single Currency converter,
and saved Fund NAVs in four responsive workspaces.** Source gaps stay visible;
they don't block independent useful tools or get filled with invented data.

## Evidence and recovery pointers

- [Owner-provided full-page PDF](NWv7_Market_Revamp_20261119/source-market-tab.pdf),
  rendered into [numbered pages](NWv7_Market_Revamp_20261119/pdf-pages/).
- [Currency screenshot](NWv7_Market_Revamp_20261119/01-current-currency.png),
  [Equity/Funds screenshot](NWv7_Market_Revamp_20261119/02-current-equity-funds.png),
  [SIP screenshot](NWv7_Market_Revamp_20261119/03-current-sip.png).
- Preserved local25-file checkpoint:
  `D:/CodeD/NWv-7/.audit-integration/market-revamp-checkpoint-20261119/manifest.json`.
- Seven red reproductions:
  `D:/CodeD/NWv-7/.audit-integration/digest-recovery-20261119/market-reproduction.log`.
- Daily Digest before/after/source receipts:
  `D:/CodeD/NWv-7/.audit-integration/digest-recovery-20261119/`.

No Market product implementation, merge or deployment is performed by this plan.
