# Local alerts and offers — draft changes, 16 November 2026

The earlier producer could succeed while returning no usable offers: online collection searched Amazon/Flipkart/Myntra India and local collection searched generic malls/stores. It did not target the requested Oman retailers. Browser runtime had separate broad searches, ungrouped OR terms and several previously known broken RSS endpoints. Online projection excluded any row with city text, so an explicitly online Muscat offer could be misrouted into offline. Alert projection accepted country-level metadata and unknown locations, although a Chennai/Muscat search does not prove an article affects that city. Publisher cards also replaced the underlying publisher name with the discovery feed name.

## Implemented draft behavior

- One shared source directory defines Amazon India, Flipkart India, LuLu Chennai, LuLu Oman, HyperMax Oman, Sharaf DG Oman and eXtra Oman. Chennai store applicability is required; the Oman retailers are not presented as Chennai branches.
- Online India sources are Amazon/Flipkart; online Oman sources are LuLu/HyperMax. In-store sources are Chennai LuLu and Muscat LuLu/HyperMax/Sharaf DG/eXtra. Existing airline offers remain a separate permitted online category.
- Producer and browser discovery queries target these retailers, group alternatives, and use a seven-day lookback. No retailer site scraping, login, paid API, new service or Cloudflare resource is added.
- Projection requires retailer and market evidence, rejects explicit foreign-market stories and honours online-only/in-store-only terms. Query scope alone cannot turn an undated/unlocated article into a local offer.
- Alert cards require a named affected city, explicit publisher city/affected-location metadata, or an explicitly countrywide scope. Chennai and Muscat source links remain usable when no matching dated cards exist. Country-only weather metadata is insufficient.
- Google News RSS remains the automatic discovery source. Cards preserve the underlying publisher where RSS supplies it and distinguish official-domain notices from news reports. Official links are a separate directory; they are not represented as automatically polled official feeds or counted as alerts/deals/Planner suggestions.
- The page keeps tab navigation available when automatic datasets have zero visible items.

## Primary source references checked

Weather and utilities: [IMD Chennai](https://mausam.imd.gov.in/chennai/), [IMD Chennai urban warnings](https://mausam.imd.gov.in/chennaiums/), [TNEB Chennai shutdown notice](https://tneb.tnebnet.org/cpro/today.html), [Oman CAA Meteorology](https://met.caa.gov.om/), [Nama Water contact channels](https://nws.nama.om/Contact-Us/Contact-Channels), and [Nama Distribution](https://distribution.nama.om/).

Retailer destinations: [Amazon India deals](https://www.amazon.in/gp/goldbox), [Amazon India official campaign news](https://www.aboutamazon.in/amazon-great-indian-festival), [Flipkart offers](https://www.flipkart.com/offers-store), [LuLu India](https://www.luluhypermarket.in/), [LuLu Oman deals](https://gcc.luluhypermarket.com/en-om/deals/), [HyperMax Oman](https://www.hypermax.com.om/mafomn/en), [Sharaf DG Oman](https://oman.sharafdg.com/), and [eXtra Oman](https://www.extra.com/en-om).

The Amazon deals endpoint returned HTTP503 and the LuLu India root returned HTTP403 to the research fetcher. They are direct official destinations, not verified machine-readable feeds. Nama Water root timed out; its official contact page was retrievable through search. Dynamic retailer pages and branch-specific terms require checking the selected retailer area/store. No current price, stock, discount or warning status is inferred from these directory links.

## Coverage limits

News discovery can miss current store leaflets, social-only announcements, Arabic-only notices and bulletins without an RSS publication date. Successful RSS checks with zero matches do not establish that a city has no warnings or a retailer has no deals. The UI makes this gap explicit and offers official destinations. A future official adapter needs source-specific validity and area extraction before its content can become a dated Planner card.

Meaningful regression coverage covers market/channel separation, retailer matching, foreign stories, nonlocal alerts, countrywide declarations, actual publisher preservation, and source-directory rendering without synthetic Planner items. Full integration and publication status belong to the containing draft PR; this report does not claim deployment.
