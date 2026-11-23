/**
 * Registry describes permitted UI workflows, NOT legal authorization for
 * acquiring/re-publishing native NSE/BSE prices.
 * A provider becoming reachable must never change these policies.
 */
export const MARKET_SOURCE_ACTIONS = Object.freeze(['LINK','EMBED','BROWSER_FETCH','LOCAL_CALCULATE','PUBLIC_SNAPSHOT']);
const entry = (id, publisher, accessMode, rights, actions, url, notes) =>
  Object.freeze({id,publisher,accessMode,rights,actions:Object.freeze(actions),url,notes});
export const MARKET_SOURCES = Object.freeze({
  'tradingview-bse':entry('tradingview-bse','TradingView','PROVIDER_EMBED','DISPLAY_PROVIDER_ONLY',
    ['LINK','EMBED'],'https://www.tradingview.com/widget/','Opt-in BSE display; no extraction'),
  'nse-indices':entry('nse-indices','NSE','OFFICIAL_LINK','LINK_ONLY',
    ['LINK'],'https://www.nseindia.com/market-data/live-market-indices','No native price redistribution'),
  'nse-equities':entry('nse-equities','NSE','OFFICIAL_LINK','LINK_ONLY',
    ['LINK'],'https://www.nseindia.com/market-data/live-equity-market','No native price redistribution'),
  'nse-ipo':entry('nse-ipo','NSE','OFFICIAL_LINK','LINK_ONLY',
    ['LINK'],'https://www.nseindia.com/market-data/all-upcoming-issues-ipo','No fake verified-empty status'),
  'bse-ipo':entry('bse-ipo','BSE','OFFICIAL_LINK','LINK_ONLY',
    ['LINK'],'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx','No fake verified-empty status'),
  'amfi-nfo':entry('amfi-nfo','AMFI','OFFICIAL_LINK','LINK_ONLY',
    ['LINK'],'https://www.amfiindia.com/','Do not republish AMFI bulk NAV/NFO data'),
  'mfapi':entry('mfapi','MFapi','DIRECT_ON_DEMAND','BROWSER_DIRECT_CONDITIONAL',
    ['LINK','BROWSER_FETCH','LOCAL_CALCULATE'],'https://www.mfapi.in/docs/','Scheme-specific browser request; original NAV date'),
  'frankfurter':entry('frankfurter','Frankfurter','DIRECT_ON_DEMAND','BROWSER_DIRECT_CONDITIONAL',
    ['LINK','BROWSER_FETCH','LOCAL_CALCULATE'],'https://frankfurter.dev/','Automatic USD/INR is ECB-derived; other pairs require a user request'),
  'world-bank':entry('world-bank','World Bank','LICENSED_OPEN_DATA','NO_PUBLICATION',
    ['LINK','BROWSER_FETCH','LOCAL_CALCULATE'],'https://data.worldbank.org/','Indicator-specific license review pending'),
  'pib-economy-news':entry('pib-economy-news','Press Information Bureau','LICENSED_OPEN_DATA','OPEN_LICENSE_CONFIRMED',
    ['LINK','BROWSER_FETCH'],'https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=20','Attributed releases are validated by the economy feed contract'),
  'nwv7-market-news':entry('nwv7-market-news','NWv7 editorial','USER_LOCAL','LOCAL_ONLY',
    ['LOCAL_CALCULATE'],'https://reallakshman19.github.io/NWv-7/','Reuse qualified existing news only'),
  'personal-local':entry('personal-local','User device','USER_LOCAL','LOCAL_ONLY',
    ['LOCAL_CALCULATE'],null,'Never upload local holdings or transaction details')
});
export function getMarketSource(id) {
  return Object.hasOwn(MARKET_SOURCES,id) ? MARKET_SOURCES[id] : null;
}
export function mayPerformSourceAction(id, action) {
  if (!MARKET_SOURCE_ACTIONS.includes(action)) return false;
  const source=getMarketSource(id);
  // Public native price snapshots are closed until a separate owner/license decision.
  return Boolean(source && action!=='PUBLIC_SNAPSHOT' && source.actions.includes(action));
}

/** Exact allowed source hostnames, not arbitrary subdomains or proxy fallbacks. */
export const MARKET_SOURCE_HOSTS = Object.freeze({
  'tradingview-bse':Object.freeze(['www.tradingview.com','s3.tradingview.com']),
  'nse-indices':Object.freeze(['www.nseindia.com']),
  'nse-equities':Object.freeze(['www.nseindia.com']),
  'nse-ipo':Object.freeze(['www.nseindia.com']),
  'bse-ipo':Object.freeze(['www.bseindia.com']),
  'amfi-nfo':Object.freeze(['www.amfiindia.com']),
  'mfapi':Object.freeze(['www.mfapi.in','api.mfapi.in']),
  'frankfurter':Object.freeze(['frankfurter.dev','api.frankfurter.dev']),
  'world-bank':Object.freeze(['data.worldbank.org','api.worldbank.org']),
  'pib-economy-news':Object.freeze(['www.pib.gov.in','pib.gov.in']),
  'nwv7-market-news':Object.freeze(['reallakshman19.github.io']),
  'personal-local':Object.freeze([])
});
export function isAllowedMarketSourceUrl(sourceId, rawUrl) {
  if (typeof rawUrl !== 'string' || !getMarketSource(sourceId)) return false;
  try {
    const parsed=new URL(rawUrl);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      (MARKET_SOURCE_HOSTS[sourceId] || []).includes(parsed.hostname);
  } catch {
    return false;
  }
}
