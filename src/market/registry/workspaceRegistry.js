/** R2.1 future navigation contract. NOT activated in the existing MarketPage until WP-01. */
const items = [
  ['overview','Overview','primary','Market overview'],
  ['indices','Indices & sectors','primary','Index and sector boards'],
  ['equity','Equity','primary','Equity research and watchlist'],
  ['portfolio','Portfolio','more','Personal portfolio'],
  ['funds','Mutual funds','primary','Mutual-fund analysis'],
  ['ipo-events','IPO & events','more','Public issue and economic events'],
  ['currency-macro','Currency & macro','more','Currency and macro indicators'],
  ['lab','Investment lab','more','Investment calculators'],
  ['health','Data health','more','Source availability and provenance']
];
export const R21_MARKET_WORKSPACES = Object.freeze(items.map(([id,label,mobileGroup,ariaLabel]) =>
  Object.freeze({id,label,mobileGroup,ariaLabel})));
export const R21_MARKET_WORKSPACE_IDS = Object.freeze(R21_MARKET_WORKSPACES.map(item=>item.id));
export const R21_DEFAULT_WORKSPACE = 'overview';
const ALIASES = Object.freeze({currency:'currency-macro',markets:'overview'});
export function normalizeR21MarketView(view) {
  if (typeof view !== 'string') return R21_DEFAULT_WORKSPACE;
  const id=Object.hasOwn(ALIASES,view) ? ALIASES[view] : view;
  return R21_MARKET_WORKSPACE_IDS.includes(id) ? id : R21_DEFAULT_WORKSPACE;
}
export function getR21MarketViewFromHash(hash = '') {
  const string=String(hash);
  const index=string.indexOf('?');
  if (index<0) return R21_DEFAULT_WORKSPACE;
  const params=new URLSearchParams(string.slice(index+1).split('#')[0]);
  return normalizeR21MarketView(params.get('view'));
}
export function withR21MarketViewHash(hash='#/markets',view='overview') {
  const id=normalizeR21MarketView(view);
  const raw=String(hash);
  const question=raw.indexOf('?');
  const route=question>=0?raw.slice(0,question):raw;
  const query=question>=0?raw.slice(question+1):'';
  const params=new URLSearchParams(query);
  params.set('view',id);
  return (route||'#/markets')+'?'+params.toString();
}
