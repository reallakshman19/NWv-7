import { TRACKED_NSE_METADATA } from '../equity/equityMetadata.js';
import { OPEN_SOURCE_REFERENCE_LINKS } from '../../../services/marketFreeOpenPolicy.js';

/** Descriptive research groups, not official constituent lists or sector performance. */
export const SECTOR_RESEARCH_CATALOG = Object.freeze([
  ['banking','NIFTY Bank','BANKNIFTY',/Banking|Financial Services/i],
  ['it','NIFTY IT','NIFTYIT',/Information Technology/i],
  ['auto','NIFTY Auto','NIFTYAUTO',/Automobile/i],
  ['pharma','NIFTY Pharma','NIFTYPHARMA',/Pharmaceuticals|Healthcare/i],
  ['fmcg','NIFTY FMCG','NIFTYFMCG',/Consumer Goods/i],
  ['metal','NIFTY Metal','NIFTYMETAL',/Metal/i]
].map(([id,name,symbol,classification]) => Object.freeze({
  id,name,instrumentId:'INDEX:NSE:'+symbol,classification
})));

export function selectSectorResearch(sectorId) {
  const sector = SECTOR_RESEARCH_CATALOG.find(item => item.id === sectorId);
  if (!sector) return null;
  return Object.freeze({
    id:sector.id, displayName:sector.name, instrumentId:sector.instrumentId,
    scope:'DESCRIPTIVE_TRACKED_METADATA',
    trackedSymbols:Object.freeze(Object.values(TRACKED_NSE_METADATA)
      .filter(item => sector.classification.test(item.sector)).map(item => 'NSE:'+item.symbol)),
    state:'SOURCE_RESTRICTED', observation:null, changePercent:null,
    reasonCode:'NO_APPROVED_SECTOR_OBSERVATION', referenceUrl:OPEN_SOURCE_REFERENCE_LINKS.nseIndices
  });
}

/** No approved breadth dataset exists in the registry. Tracked symbols and
 * partial quotes must never be interpreted as exchange-wide breadth.
 * No input or caller-supplied status can unlock counts under current policy.
 */
export function selectMarketBreadth() {
  return Object.freeze({
    state:'UNAVAILABLE', scope:'EXCHANGE_WIDE', reasonCode:'NO_QUALIFIED_BREADTH_DATASET',
    providerAsOf:null, advances:null, declines:null, unchanged:null, total:null
  });
}
