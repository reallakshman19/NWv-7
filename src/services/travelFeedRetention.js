/**
 * Reconcile authentic RSS observations with the previously published, vetted
 * city snapshot. An upstream provider omission is NOT evidence of story expiry.
 * Explicit cap policy: newest 30 eligible distinct articles win; under cap,
 * stories persist until 36 hours since original publication.
 */
import {
  isFreshTravelStory, isFreshTravelPayload, getTravelStoryPublishedMs,
  TRAVEL_NEWS_MAX_ITEMS,
} from './travelNewsFreshness.js';
import { hasCityEvidence } from './storyLocationPriority.js';
import { dedupeTravelStories } from './travelStoryIdentity.js';

function validCandidate(story, profile, now) {
  const url = String(story?.url || story?.link || '');
  return /^https?:\/\//i.test(url) &&
    Boolean(String(story?.source || '').trim()) &&
    isFreshTravelStory(story, { now }) &&
    hasCityEvidence(story, profile);
}

function trustedPrevious(previous, profile, now) {
  return Boolean(previous &&
    previous.schemaVersion === 2 &&
    previous.locationKey === profile.key &&
    previous.sourceMode === 'github-rss-prefetch' &&
    previous.sourceAuthority === 'Google News RSS, publisher identified per story' &&
    Number.isInteger(previous.successfulQueries) &&
    previous.successfulQueries > 0 &&
    Array.isArray(previous.stories) &&
    // Only replay a previously published receipt from within the retention
    // horizon; never trust stale July fixtures or unknown source metadata.
    isFreshTravelPayload(previous, { now, maxAgeHours: 48 }));
}

export function reconcileTravelFeed({ previous = null, fetched = [], profile, now = Date.now(),
    maxItems = TRAVEL_NEWS_MAX_ITEMS } = {}) {
  if (!profile?.key) throw new Error('Travel feed profile required');
  const fresh = (Array.isArray(fetched) ? fetched : [])
    .filter(story => validCandidate(story, profile, now))
    .map(story => ({
      ...story,
      publishedAt: new Date(getTravelStoryPublishedMs(story)).toISOString(),
      firstSeenAt: story.firstSeenAt || new Date(now).toISOString(),
    }));

  const carried = trustedPrevious(previous, profile, now)
    ? previous.stories
      .filter(story => validCandidate(story, profile, now))
      .map(story => ({
        ...story,
        publishedAt: new Date(getTravelStoryPublishedMs(story)).toISOString(),
        firstSeenAt: story.firstSeenAt || previous.generatedAt,
      }))
    : [];

  const eligible = dedupeTravelStories([...fresh, ...carried]);
  const cap = Number.isInteger(maxItems) && maxItems >= 1 ? maxItems : TRAVEL_NEWS_MAX_ITEMS;
  const stories = eligible.slice(0, cap);
  const seenFromFetch = new Set(fresh.map(s => String(s.url).toLowerCase()));
  return {
    stories,
    newlyObserved: stories.filter(s => seenFromFetch.has(String(s.url).toLowerCase())).length,
    retainedFromPrevious: stories.filter(s => !seenFromFetch.has(String(s.url).toLowerCase())).length,
    capEvictions: Math.max(0, eligible.length - stories.length),
    duplicatesRemoved: fresh.length + carried.length - eligible.length,
    previousTrusted: trustedPrevious(previous, profile, now),
  };
}
