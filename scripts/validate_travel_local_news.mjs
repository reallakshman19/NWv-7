/**
 * Fail-closed quality gate before committing travel-local JSON to main.
 * Empty feeds are valid only after successful, verifiable RSS checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TRAVEL_LOCATION_REGISTRY, getTravelLocationProfile } from '../src/services/travelLocationProfile.js';
import { hasCityEvidence } from '../src/services/storyLocationPriority.js';
import {
  TRAVEL_NEWS_RETENTION_HOURS,
  TRAVEL_NEWS_MAX_ITEMS,
  isFreshTravelPayload,
  isFreshTravelStory,
} from '../src/services/travelNewsFreshness.js';

const now = Date.now();
const errors = [];
const results = [];

for (const city of Object.keys(TRAVEL_LOCATION_REGISTRY)) {
  const file = path.join('public', 'data', 'travel-local-' + city + '.json');
  const profile = getTravelLocationProfile({ travelLocation: { city } });
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(city + ': unreadable JSON: ' + error.message);
    continue;
  }

  const articles = Array.isArray(payload.stories) ? payload.stories : [];
  const validReceipt = isFreshTravelPayload(payload, { now, maxAgeHours: 1 });
  const seen = new Set();
  if (!validReceipt) errors.push(city + ': collector receipt is missing or older than one hour');
  if (payload.locationKey !== city || payload.display !== profile.display) {
    errors.push(city + ': wrong city identity');
  }
  if (payload.sourceMode !== 'github-rss-prefetch') {
    errors.push(city + ': wrong source authority');
  }
  if (payload.retentionHours !== TRAVEL_NEWS_RETENTION_HOURS) {
    errors.push(city + ': retention window mismatch');
  }
  if (payload.storyCount !== articles.length || articles.length > TRAVEL_NEWS_MAX_ITEMS) {
    errors.push(city + ': invalid count or cap');
  }
  if (!Number.isInteger(payload.successfulQueries) || payload.successfulQueries < 1) {
    errors.push(city + ': no successful RSS query; cannot publish refreshed receipt');
  }

  for (const article of articles) {
    const id = String(article.url || article.id || '').trim();
    if (!/^https?:\/\//i.test(id) || seen.has(id)) {
      errors.push(city + ': invalid or duplicate source URL ' + id);
    }
    seen.add(id);
    if (!isFreshTravelStory(article, { now })) {
      errors.push(city + ': undated/future/expired story ' + String(article.title).slice(0, 70));
    }
    if (!hasCityEvidence(article, profile)) {
      errors.push(city + ': city match is not backed by story content ' + String(article.title).slice(0, 70));
    }
    if (article.city || article.country) {
      errors.push(city + ': RSS query has manufactured event geography');
    }
  }
  results.push({ city, storyCount: articles.length, successfulQueries: payload.successfulQueries, fetchErrors: (payload.fetchErrors || []).length });
}

console.log(JSON.stringify({ status: errors.length ? 'FAIL' : 'PASS', checked: 'travel local freshness publication', results, errors }, null, 2));
if (errors.length) process.exit(1);
