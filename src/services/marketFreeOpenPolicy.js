/**
 * Public deployment is free/open-source-only. No paid market vendor, relay,
 * redistributed NSE/BSE price snapshot, or AMFI bulk NAV is authorized.
 *
 * OPEN_ONLY does not license third-party data. The browser may show direct
 * official provider links and user-requested free/open API lookups, subject
 * to each source's own terms. No static quote publication is performed.
 */
export const MARKET_FREE_OPEN_ONLY = true;
export const MARKET_OPEN_SOURCE_MODE = 'free-open-only';
export const OPEN_SOURCE_REFERENCE_LINKS = Object.freeze({
  nseIndices: 'https://www.nseindia.com/market-data/live-market-indices',
  bseIndices: 'https://www.bseindia.com/indices/IndexArchiveData.html',
  nseEquities: 'https://www.nseindia.com/market-data/live-equity-market',
  nseIPO: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
  bseIPO: 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx',
  amfiNAV: 'https://www.amfiindia.com/net-asset-value/nav-download',
  frankfurter: 'https://frankfurter.dev/',
  mfapi: 'https://www.mfapi.in/docs/',
});
export function freeOpenMarketPayload() {
  return {
    sourceMode: MARKET_OPEN_SOURCE_MODE, schemaVersion: MARKET_OPEN_SOURCE_MODE,
    fetchedAt: null, generatedAt: null,
    indices: [], globalIndices: [], sectorals: [], equities: [],
    commodities: [], currencies: [], mutualFunds: [],
    movers: {gainers:[],losers:[]}, equityCoverage: {
      universeSize:16, quotedCount:0, unavailableSymbols:null, coverageStatus:'not-published',
      sourceAcquiredCount:0, retainedCount:0,
    },
    ipo:{live:[],upcoming:[],recent:[]}, ipoLastCheckedAt:null,
    nfo:[], fiidii:{fii:{},dii:{},date:''},
    sourceHealth:{
      indices:{status:'unavailable',provider:'Exchange source',message:'Free/open feed with public redistribution rights not verified'},
      equities:{status:'unavailable',provider:'Exchange source',message:'Free/open feed with public redistribution rights not verified'},
      ipo:{status:'unknown',provider:'Official issue calendars',message:'Visit official issue pages'},
    },
    errors:{},
  };
}
