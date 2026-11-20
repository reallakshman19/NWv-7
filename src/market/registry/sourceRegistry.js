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
    ['LINK','BROWSER_FETCH','LOCAL_CALCULATE'],'https://frankfurter.dev/','Underlying central-bank terms still apply'),
  'world-bank':entry('world-bank','World Bank','LICENSED_OPEN_DATA','NO_PUBLICATION',
    ['LINK','BROWSER_FETCH','LOCAL_CALCULATE'],'https://data.worldbank.org/','Indicator-specific license review pending'),
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
