import sources from '../config/upAheadLocalSources.json';
import { matchesUpAheadLocation, matchesUpAheadLocationText, upAheadCityLocation } from './upAheadLocation.js';

const normalize = value => String(value || '').toLowerCase().trim();
const itemText = item => `${item?.title || ''} ${item?.description || item?.summary || ''}`;
const hasWord = (text, word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

function host(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export function getLocalSourceDirectory(locations = ['Chennai', 'Muscat'], channel = null) {
  const selected = locations.map(normalize);
  return {
    retailers: sources.retailers.filter(row => row.cities.some(city => selected.includes(normalize(city)))
      && (!channel || row.channels.includes(channel))),
    alerts: sources.alerts.filter(row => selected.includes(normalize(row.city))),
  };
}

// Search scope and country-level metadata alone cannot prove an alert affects a city.
export function matchesLocalAlert(item, locations) {
  // locationCanonical may come from the search pack; publisher city is explicit.
  if (item?.city) return matchesUpAheadLocation(item, locations, { allowUnknown: false });
  if (matchesUpAheadLocationText(item, locations)) return true;
  if (Array.isArray(item?.affectedLocations) && item.affectedLocations.some(cityName =>
    locations.some(location => normalize(cityName) === normalize(location)))) return true;
  return item?.affectedScope === 'countrywide'
    && matchesUpAheadLocation(item, locations, { allowUnknown: false });
}

export function getAlertProvenance(item) {
  const sourceHost = host(item?.sourceUrl || item?.link || item?.url);
  const official = sources.alerts.some(row => {
    const domain = host(row.url);
    return sourceHost === domain || sourceHost.endsWith(`.${domain}`);
  });
  return official ? 'Official notice' : 'News report · verify with authority';
}

// Retained public records are subject to the same current admission rules.
// Neither court notices nor long-term water-supply projects are civic actions.
export function isActionableCivicNotice(item) {
  const text = itemText(item);
  const utility = /\bwater supply\b.{0,60}\b(interrupt\w*|suspend\w*|cut|disrupt\w*|halt\w*|reduc\w*|restor\w*|notice|advisory)\b|\b(interrupt\w*|suspend\w*|cut|disrupt\w*|halt\w*|reduc\w*|restor\w*|notice|advisory)\b.{0,60}\bwater supply\b/i;
  return utility.test(text) || /\b(power (cut|shutdown)|shutdown|water interruption|traffic (diversion|restriction|ban)|truck (traffic|movement).{0,40}(restrict\w*|suspend\w*|ban)|road (closure|closed)|service disruption|(property|municipal|water) tax|(public|civic|municipal) (notice|advisory)|(apply|application|registration|payment).{0,35}deadline|deadline.{0,35}(apply|application|registration|payment))\b/i.test(text);
}

export function isLocalHoliday(item, locations = ['Chennai', 'Muscat']) {
  if (item?.calendarDataset) return true;
  // News discovery also returns elections and generic state closure roundups.
  // A festival search tag is not evidence of a holiday in either destination.
  return /\b(holidays?|festivals?|diwali|deepavali|pongal|eid|christmas|national day|republic day|independence day)\b/i.test(itemText(item))
    && matchesLocalAlert(item, locations);
}

export function classifyRetailOffer(item, locations = ['Chennai', 'Muscat']) {
  const text = itemText(item);
  const urls = `${item?.sourceUrl || ''} ${item?.link || item?.url || ''}`.toLowerCase();
  const sourceHost = host(item?.sourceUrl || item?.link || item?.url);
  const city = upAheadCityLocation(item);
  const region = normalize(item?.offerMarket || item?.region || item?.locationCanonical);
  // Explicit foreign-market stories must not acquire India/Oman applicability from a query.
  if (/\b(usa|united states|united kingdom|uae|dubai|abu dhabi|saudi arabia|riyadh|qatar|doha|bahrain|kuwait)\b/i.test(text)) return null;
  const market = ['india', 'in', 'tn', 'tamil nadu'].includes(region) || /\b(india|indian|chennai|madras)\b/i.test(text)
    || /amazon\.in|aboutamazon\.in|luluhypermarket\.in/.test(urls) || /\bflipkart\b/i.test(text)
    ? 'india'
    : ['oman', 'om'].includes(region) || /\b(oman|muscat|seeb|ghubrah|mawaleh)\b/i.test(text)
      || /hypermax\.com\.om|oman\.sharafdg\.com|\/en-om(?:\/|$)/.test(urls) ? 'oman' : null;
  if (!market) return null;
  const retailer = sources.retailers.find(row => row.market === market
    && row.cities.some(value => locations.some(location => normalize(value) === normalize(location)))
    && (row.aliases.some(alias => hasWord(text, alias))
      || row.domains.some(domain => sourceHost === domain || sourceHost.endsWith(`.${domain}`))));
  if (!retailer) return null;
  if (city && !retailer.cities.some(value => normalize(value) === city)) return null;
  const explicitChannel = normalize(item?.offerChannel);
  const onlineOnly = /\b(online.only|online exclusive|app.only|website.only)\b/i.test(text);
  const offlineOnly = /\b(in.store.only|instore.only|stores.only)\b/i.test(text);
  const locallyApplicable = matchesLocalAlert(item, retailer.cities)
    || market === 'oman' && /\b(across oman|all oman stores|all stores in oman)\b/i.test(text);
  const online = retailer.channels.includes('online') && !offlineOnly && explicitChannel !== 'offline'
    && (explicitChannel === 'online' || explicitChannel === 'both'
      || retailer.id === 'amazon-in' || retailer.id === 'flipkart-in'
      || /\b(online|website|app|delivery)\b/i.test(text));
  const offline = retailer.channels.includes('offline') && !onlineOnly && locallyApplicable
    && explicitChannel !== 'online';
  return online || offline ? { retailer, market, online, offline } : null;
}
