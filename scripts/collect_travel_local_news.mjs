/**
 * City-specific Google News RSS collector.
 * Invoked by scheduled GitHub Actions with TRAVEL_LOCATION_KEY.
 * Do not replace an existing receipt when every source request fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildTravelNewsQueries } from '../src/services/travelNewsQueries.js';
import { getTravelLocationProfile, TRAVEL_LOCATION_REGISTRY } from '../src/services/travelLocationProfile.js';
import { hasCityEvidence } from '../src/services/storyLocationPriority.js';
import { parseTravelRssItems } from '../src/services/travelRssParser.js';
import {
  TRAVEL_NEWS_RETENTION_HOURS,
  TRAVEL_NEWS_MAX_ITEMS,
  isFreshTravelStory,
  getTravelStoryPublishedMs,
} from '../src/services/travelNewsFreshness.js';

const locationKey = String(process.env.TRAVEL_LOCATION_KEY || '').toLowerCase();
if (!TRAVEL_LOCATION_REGISTRY[locationKey]) {
  throw new Error('TRAVEL_LOCATION_KEY must be one of: ' + Object.keys(TRAVEL_LOCATION_REGISTRY).join(', '));
}
const profile = getTravelLocationProfile({ travelLocation: { city: locationKey } });
const now = Date.now();
const cityName = profile.display.toLowerCase();
// Use only city-scoped RSS searches. Country-wide headlines are NOT city evidence.
const queries = buildTravelNewsQueries(profile)
  .filter(query => query.query.toLowerCase().includes(cityName))
  .slice(0, 5);

async function fetchWithRetry(url, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'NWv7-TravelLocal-NewsCollector/2.0' },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error('RSS returned HTTP ' + response.status);
      const xml = await response.text();
      if (xml.length > 4_000_000) throw new Error('RSS exceeds size limit');
      return parseTravelRssItems(xml);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

const stories = [];
const seen = new Set();
const fetchErrors = [];
let successfulQueries = 0;
let rejectedUndatedOrExpired = 0;
let rejectedWrongCity = 0;

for (const query of queries) {
  try {
    const items = await fetchWithRetry(query.url);
    successfulQueries += 1;
    for (const item of items) {
      if (!isFreshTravelStory(item, { now })) {
        rejectedUndatedOrExpired += 1;
        continue;
      }
      if (!hasCityEvidence(item, profile)) {
        rejectedWrongCity += 1;
        continue;
      }
      const key = (item.url || item.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      stories.push({
        ...item,
        publishedAt: new Date(getTravelStoryPublishedMs(item)).toISOString(),
      });
    }
  } catch (error) {
    fetchErrors.push(query.label + ': ' + (error?.message || String(error)));
    console.warn('[travel-news]', profile.key, fetchErrors[fetchErrors.length - 1]);
  }
}

if (successfulQueries === 0) {
  throw new Error('No valid RSS response for ' + profile.key + '; retaining last published payload');
}

stories.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
const current = stories.slice(0, TRAVEL_NEWS_MAX_ITEMS);
const payload = {
  schemaVersion: 2,
  type: 'travel-location-news-payload',
  locationKey: profile.key,
  display: profile.display,
  countryCode: profile.countryCode,
  countryLabel: profile.countryLabel,
  generatedAt: new Date(now).toISOString(),
  sourceMode: 'github-rss-prefetch',
  sourceAuthority: 'Google News RSS, publisher identified per story',
  retentionHours: TRAVEL_NEWS_RETENTION_HOURS,
  retentionCutoffAt: new Date(now - TRAVEL_NEWS_RETENTION_HOURS * 3600000).toISOString(),
  queryCount: queries.length,
  successfulQueries,
  fetchErrors,
  rejectedUndatedOrExpired,
  rejectedWrongCity,
  storyCount: current.length,
  stories: current,
};
const dir = path.join(process.cwd(), 'public', 'data');
fs.mkdirSync(dir, { recursive: true });
const output = path.join(dir, 'travel-local-' + profile.key + '.json');
fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  status: 'PASS',
  sourceMode: 'github-rss-prefetch',
  locationKey: profile.key,
  queryCount: queries.length,
  successfulQueries,
  storyCount: current.length,
  rejectedUndatedOrExpired,
  rejectedWrongCity,
  fetchErrors,
  output,
}, null, 2));
