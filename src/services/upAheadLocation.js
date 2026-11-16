// Acquisition countries/regions are not physical venue cities.
const REGIONS = new Set(['in', 'india', 'tn', 'tamil nadu', 'om', 'oman', 'global', 'online', 'national', 'worldwide']);
const ALIASES = { tiruchirappalli: 'trichy', tiruchirapalli: 'trichy', madras: 'chennai',
  seeb: 'muscat', 'al seeb': 'muscat', ghubrah: 'muscat', 'al ghubrah': 'muscat', mawaleh: 'muscat' };
const normalize = value => {
  const key = String(value || '').toLowerCase().trim();
  return ALIASES[key] || key;
};
const REGION_CITIES = {
  in: ['chennai', 'trichy'], india: ['chennai', 'trichy'],
  tn: ['chennai', 'trichy'], 'tamil nadu': ['chennai', 'trichy'],
  om: ['muscat'], oman: ['muscat'],
};

export function upAheadCityLocation(item) {
  const candidates = [item?.city, item?.locationCanonical, item?.region];
  return candidates.map(normalize).find(value => value && !REGIONS.has(value)) || '';
}

export function matchesUpAheadLocationText(item, locations) {
  const text = `${item?.title || ''} ${item?.description || item?.summary || ''}`.toLowerCase();
  return locations.some(location => {
    const city = normalize(location);
    return [city, ...Object.keys(ALIASES).filter(alias => ALIASES[alias] === city)]
      .some(name => name.length >= 4 && text.includes(name));
  });
}

export function matchesUpAheadLocation(item, locations = [], { allowUnknown = true } = {}) {
  const configured = locations.map(normalize).filter(Boolean);
  if (!configured.length) return true;
  const city = upAheadCityLocation(item);
  if (city) return configured.some(location => city === location);
  if (matchesUpAheadLocationText(item, configured)) return true;
  const region = normalize(item?.region || item?.locationCanonical);
  if (REGION_CITIES[region]) return configured.some(location => REGION_CITIES[region].includes(location));
  return allowUnknown;
}
