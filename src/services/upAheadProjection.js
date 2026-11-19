import { isActualWeatherAlertText, isActualOfferText, isUpAheadDataFresh } from './upAheadService.js';
import { isUpAheadItemActive, upAheadDateKey, upAheadEventBounds, upAheadEventDayKey } from './upAheadLifecycle.js';
import { toLocalDateKey } from '../utils/dateKey.js';
import { upAheadOccurrenceKey, sameUpAheadDisplayOccurrence } from './upAheadLifecycle.js';
import { getUpAheadEvidence } from './upAheadEvidence.js';
import { getUpAheadBriefing } from './upAheadBriefing.js';
import { matchesUpAheadLocation } from './upAheadLocation.js';
import { classifyRetailOffer, matchesLocalAlert, getAlertProvenance, isLocalHoliday, isActionableCivicNotice } from './upAheadLocalPolicy.js';

const DEFAULT_UPAHEAD_SETTINGS = {
  categories: {
    movies: true,
    events: true,
    festivals: true,
    alerts: true,
    sports: true,
    shopping: true,
    civic: true,
    weather_alerts: true,
    airlines: true,
  },
  locations: ['Chennai', 'Muscat'],
};

const CIVIC_MAX_ITEMS          = 20;                        // cap civic notices shown

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asSections(data) {
  return data?.sections && typeof data.sections === 'object'
    ? data.sections
    : {};
}

function publishedMs(item) {
  return getEventDateMs(item?.publishedAt || item?.eventStartAt || item?.date || item?.timestamp);
}

export function formatUpAheadItemDate(item) {
  const date = upAheadDateKey(item);
  const { end } = upAheadEventBounds(item);
  const endDay = end ? upAheadEventDayKey(end - 1, item) : null;
  return formatConciseDate(date || item?.date || item?.releaseDate, item?.publishedAt || item?.timestamp, item?.eventEndAt, endDay);
}

function buildCardArticle(item) {
  return {
    ...item,
    time: formatUpAheadItemDate(item),
    summary: item?.description || item?.summary || '',
    source: item?.source || item?.platform || item?.category || 'Up Ahead',
    imageUrl: item?.posterUrl || item?.imageUrl || null,
  };
}

function formatConciseDate(dateStr, publishedAt, eventEndAt, endDay) {
  if (!dateStr) {
    if (publishedAt) {
      const ms = typeof publishedAt === 'number'
        ? (publishedAt < 10_000_000_000 ? publishedAt * 1000 : publishedAt)
        : Date.parse(publishedAt);
      if (ms > 0) {
        const diffH = (Date.now() - ms) / 3600000;
        if (diffH < 1) return 'Just now';
        if (diffH < 24) return `${Math.floor(diffH)}h ago`;
        if (diffH < 48) return 'Yesterday';
        return `${Math.floor(diffH / 24)}d ago`;
      }
    }
    return 'Coming Soon';
  }

  const dayKey = toLocalDateKey(dateStr);
  if (!dayKey) return dateStr;
  const d = new Date(`${dayKey}T00:00:00Z`);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const dayNum = d.getUTCDate().toString().padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

  const label = `${dayName}, ${dayNum} ${month}`;
  const endMs = getEventDateMs(eventEndAt);
  const endKey = endDay || (endMs ? new Date(endMs - 1).toISOString().slice(0, 10) : null);
  if (endKey > dayKey) return `${label} – ${formatConciseDate(endKey)}`;
  return label;
}

function getEventDateMs(value) {
  if (!value) return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Curated sale-campaign signatures. Online offers about the SAME campaign
// (e.g. the dozen "Amazon Prime Day 2026" write-ups from different outlets)
// are grouped into one card so the Offers tab isn't flooded with duplicates.
const OFFER_CAMPAIGNS = [
  { key: 'amazon-prime-day', re: /\bprime day\b/i },
  { key: 'flipkart-big-billion-days', re: /\bbig billion days\b/i },
  { key: 'amazon-great-indian', re: /\bgreat indian (festival|sale)\b/i },
  { key: 'myntra-eoss', re: /\b(end of season sale|eoss)\b/i },
  { key: 'target-circle-week', re: /\bcircle (week|deal days)\b/i },
  { key: 'black-friday', re: /\bblack friday\b/i },
  { key: 'cyber-monday', re: /\bcyber monday\b/i },
  { key: 'festive-sale', re: /\b(diwali|festive) sale\b/i },
  { key: 'independence-day-sale', re: /\bindependence day sale\b/i },
  { key: 'republic-day-sale', re: /\brepublic day sale\b/i },
];

function offerCampaignKey(item) {
  const text = `${item?.title || ''} ${item?.description || ''}`;
  const validity = `${item?.eventStartAt || item?.date || ''}:${item?.eventEndAt || item?.expiryAt || ''}`;
  // A named product or generic sale season is not one universal campaign.
  // Keep those offers separate unless their full title and validity match.
  const productSpecific = /\b(laptop|camera|iphone|ipad|galaxy|clothing|shoes|television|headphones)\b/i.test(text);
  for (const campaign of OFFER_CAMPAIGNS) {
    if (!campaign.re.test(text)) continue;
    const branded = /^(amazon|flipkart|myntra|target)-/.test(campaign.key);
    const identity = item?.productId || item?.offerId || (productSpecific || !branded
      ? String(item?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      : 'campaign-announcement');
    return `${campaign.key}:${identity}:${validity}`;
  }
  return null;
}

// Group online offers by sale campaign. Offers that don't match a known
// campaign are kept as-is. Each group keeps the newest item as the
// representative and exposes sourceCount + grouped members for the UI.
function groupOnlineOffers(offers = []) {
  const groups = new Map();
  const singles = [];

  for (const offer of offers) {
    const key = offerCampaignKey(offer);
    if (!key) {
      singles.push(offer);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(offer);
  }

  const grouped = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      grouped.push(members[0]);
      continue;
    }
    const sorted = [...members].sort((a, b) => publishedMs(b) - publishedMs(a));
    const representative = sorted[0];
    const sources = [...new Set(members.map(m => m.source).filter(Boolean))];
    grouped.push({
      ...representative,
      sourceCount: Math.max(Number(representative.sourceCount || 1), sources.length || members.length),
      sources,
      groupedOffers: sorted,
      groupedCount: members.length,
    });
  }

  return [...grouped, ...singles];
}

// Sort key for the Suggested feed: prefer a real upcoming event/release date,
// otherwise fall back to publish recency.
function getSuggestedSortMs(item) {
  const eventMs = getEventDateMs(item?.date || item?.releaseDate || item?.eventStartAt);
  if (eventMs > 0) return eventMs;
  return publishedMs(item);
}

// The "Suggested" tab is the automatic, cross-category feed (the planner is
// manual-only). Combine the auto-derived categories — releases, events,
// festivals, offers, civic — rank them (soonest upcoming first, then most
// recent), dedupe, and cap.
function buildSuggestedItems({ movieCards, festivalCards, eventItems, onlineOffers, offlineOffers, civicAlerts, generalAlerts, weatherAlerts } = {}) {
  const now = Date.now();
  // The full bundled holiday calendar belongs in Holidays. Suggested is this week.
  const nearHolidays = asArray(festivalCards).filter(item => {
    const start = getEventDateMs(item.date || item.eventStartAt || item.releaseDate);
    const end = getEventDateMs(item.eventEndAt || item.expiryAt);
    return start > 0 && start <= now + 7 * 86_400_000 && (start >= now || end > now);
  });
  const tagged = [
    ...asArray(movieCards).map(item => ({ ...item, _suggestKind: 'release' })),
    ...nearHolidays.map(item => ({ ...item, _suggestKind: 'festival' })),
    ...asArray(eventItems).map(item => ({ ...item, _suggestKind: 'event' })),
    ...asArray(onlineOffers).map(item => ({ ...item, _suggestKind: 'offer', isOffer: true })),
    ...asArray(offlineOffers).map(item => ({ ...item, _suggestKind: 'offer', isOffer: true })),
    ...asArray(civicAlerts).map(item => ({ ...item, _suggestKind: 'civic' })),
    ...asArray(generalAlerts).map(item => ({ ...item, _suggestKind: 'alert' })),
    ...asArray(weatherAlerts).map(item => ({ ...item, _suggestKind: 'alert' })),
  ];

  const seen = new Set();
  const deduped = [];
  for (const item of tagged) {
    const key = upAheadOccurrenceKey(item);
    if (!key || deduped.some(existing => sameUpAheadDisplayOccurrence(existing,item))) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped
    .sort((a, b) => {
      const aMs = getSuggestedSortMs(a);
      const bMs = getSuggestedSortMs(b);
      const aUpcoming = aMs >= now;
      const bUpcoming = bMs >= now;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1; // upcoming before past
      if (aUpcoming) return aMs - bMs;                        // soonest upcoming first
      return bMs - aMs;                                       // most recent first
    })
    .slice(0, 24);
}

function getVisibleUpAheadProjection({ data, settings }) {
  const upAheadSettings = settings?.upAhead || DEFAULT_UPAHEAD_SETTINGS;
  const now = Date.now();
  const sections = Object.fromEntries(Object.entries(asSections(data)).map(([key, items]) => [
    key,
    upAheadSettings.categories?.[key] === false
      ? []
      : asArray(items).filter(item => isUpAheadItemActive({ category: key, ...item }, now)),
  ]));
  const weatherAlerts = asArray(sections.weather_alerts).filter(item =>
    isActualWeatherAlertText(`${item?.title || ''} ${item?.description || ''}`, upAheadSettings)
  );
  const locations = upAheadSettings.locations || DEFAULT_UPAHEAD_SETTINGS.locations;
  const local = item => matchesUpAheadLocation(item, locations);
  const alertCard = item => ({ ...item, alertProvenance: getAlertProvenance(item) });
  const generalAlerts = asArray(sections.alerts).filter(item => matchesLocalAlert(item, locations)).map(alertCard);
  const localWeatherAlerts = weatherAlerts.filter(item => matchesLocalAlert(item, locations)).map(alertCard);

  // This feeds both the Civics tab and the civic portion of the Alerts badge.
  const civicItems = asArray(sections.civic)
    .filter(isActionableCivicNotice)
    .filter(item => matchesLocalAlert(item, locations))
    .map(alertCard)
    .sort((a, b) => publishedMs(b) - publishedMs(a))
    .slice(0, CIVIC_MAX_ITEMS);
  const civicAlerts = civicItems;
  const combinedAlerts = [...new Map([...localWeatherAlerts, ...generalAlerts, ...civicItems]
    .map(item => [item.id || item.link || item.url || item.title, item])).values()];

  const retailOffers = asArray(sections.shopping)
    .filter(item => isActualOfferText(`${item?.title || ''} ${item?.description || ''}`, upAheadSettings))
    .map(item => ({ item, scope: classifyRetailOffer(item, locations) }))
    .filter(row => row.scope);
  const onlineOfferCandidates = [
    ...retailOffers.filter(row => row.scope.online).map(({ item, scope }) => ({
      ...item, retailerId: scope.retailer.id, offerMarket: scope.market,
    })),
    ...asArray(sections.airlines).filter(item =>
      isActualOfferText(`${item?.title || ''} ${item?.description || ''}`, upAheadSettings)),
  ];

  // Group near-duplicate online offers (e.g. the many "Amazon Prime Day 2026"
  // write-ups from different outlets) into a single representative carrying a
  // sourceCount, so the Offers tab shows one card per deal instead of a dozen.
  const onlineOffers = groupOnlineOffers(onlineOfferCandidates)
    .sort((a, b) => publishedMs(b) - publishedMs(a));

  // The local shopping feeds are already filtered for offer intent.
  // Google News RSS items carry no explicit location metadata, so fall back to
  // text scanning when city/locationCanonical/region fields are all absent.
  const offlineOffers = retailOffers.filter(row => row.scope.offline)
    .map(({ item, scope }) => ({ ...item, retailerId: scope.retailer.id, offerMarket: scope.market }))
    .sort((a, b) => publishedMs(b) - publishedMs(a))
    .slice(0, CIVIC_MAX_ITEMS);

  const offerItems = [...onlineOffers, ...offlineOffers]; // combined, for backward-compat

  const movieCards = asArray(sections.movies).filter(local).map(buildCardArticle);
  const festivalCards = asArray(sections.festivals).filter(local)
    .filter(item => isLocalHoliday(item, locations)).map(buildCardArticle);
  const eventItems = [
    ...asArray(sections.events),
    ...asArray(sections.sports),
  ].filter(local);

  const suggestedItems = buildSuggestedItems({
    movieCards,
    festivalCards,
    eventItems,
    onlineOffers,
    offlineOffers,
    civicAlerts,
    generalAlerts,
    weatherAlerts: localWeatherAlerts,
  });

  const visible = {
    coverageAvailable: isUpAheadDataFresh(data),
    weatherAlerts: localWeatherAlerts,
    generalAlerts,
    civicAlerts,
    civicItems,
    combinedAlerts,
    offerItems,
    onlineOffers,
    offlineOffers,
    movieCards,
    festivalCards,
    eventItems,
    suggestedItems,
  };
  visible.projectedSections = {
    movies: movieCards, festivals: festivalCards,
    events: eventItems.filter(item => item.category !== 'sports'),
    sports: eventItems.filter(item => item.category === 'sports'),
    alerts: generalAlerts, weather_alerts: localWeatherAlerts, civic: civicItems,
    shopping: [...onlineOffers, ...offlineOffers].filter(item => item.category !== 'airlines'),
    airlines: onlineOffers.filter(item => item.category === 'airlines'),
  };

  return {
    ...visible,
    hasVisibleContent: [movieCards, festivalCards, eventItems, onlineOffers, offlineOffers, combinedAlerts]
      .some(items => items.length > 0),
    upAheadEvidence: getUpAheadEvidence({
      data,
      settings,
      visible,
    }),
    upAheadBriefing: getUpAheadBriefing({
      data,
      settings,
      visible,
    }),
  };
}


export { DEFAULT_UPAHEAD_SETTINGS, getVisibleUpAheadProjection, buildSuggestedItems, buildCardArticle, formatConciseDate, getEventDateMs };
