export const TOP_STORIES_FIXTURE_NOW = Date.UTC(2026, 6, 9, 8, 0, 0);

const hour = 60 * 60 * 1000;
const publishedHoursAgo = hours => TOP_STORIES_FIXTURE_NOW - hours * hour;

const cycloneReports = Object.freeze([
  ['source-diverse-top-feed', 'AP News', 'https://apnews.com/article/cyclone-fixture'],
  ['cyclone-reuters', 'Reuters', 'https://www.reuters.com/world/cyclone-fixture'],
  ['cyclone-bbc', 'BBC', 'https://www.bbc.com/news/cyclone-fixture'],
  ['cyclone-hindu', 'The Hindu', 'https://www.thehindu.com/news/cyclone-fixture'],
].map(([id, source, url]) => Object.freeze({
  id,
  source,
  url,
  title: 'Government cyclone alert confirmed by multiple agencies',
  section: 'world',
  publishedAt: publishedHoursAgo(1),
  timestampConfidence: 'high',
})));

export const TOP_STORIES_REGRESSION_STORIES = Object.freeze([
  Object.freeze({
    id: 'fresh-hard-alert',
    title: 'Flood evacuation alert issued for Muscat residents',
    section: 'world',
    source: 'Reuters',
    sourceGroup: 'reuters',
    publishedAt: publishedHoursAgo(1),
    timestampConfidence: 'high',
    sourceCount: 2,
  }),
  Object.freeze({
    id: 'secondary-hard-news',
    title: 'Court orders public safety review after civic incident',
    section: 'india',
    source: 'The Hindu',
    sourceGroup: 'the-hindu',
    publishedAt: publishedHoursAgo(6),
    timestampConfidence: 'high',
  }),
  Object.freeze({
    id: 'fallback-hard-news',
    title: 'Government warning remains active after overnight storm',
    section: 'world',
    region: 'world',
    source: 'BBC',
    sourceGroup: 'bbc',
    publishedAt: publishedHoursAgo(10),
    timestampConfidence: 'high',
  }),
  Object.freeze({
    id: 'stale-expired-story',
    title: 'Old live updates from previous public safety incident',
    section: 'world',
    source: 'Archive Wire',
    sourceGroup: 'archive-wire',
    publishedAt: publishedHoursAgo(18),
    timestampConfidence: 'high',
  }),
  Object.freeze({
    id: 'low-confidence-story',
    title: 'Unverified blast report with fallback timestamp',
    section: 'world',
    source: 'Unknown Feed',
    sourceGroup: 'unknown-feed',
    publishedAt: publishedHoursAgo(1),
    timestampConfidence: 'low',
  }),
  Object.freeze({
    id: 'god-of-war-promo',
    title: 'God of War gameplay trailer revealed for fans',
    section: 'entertainment',
    source: 'Gaming Desk',
    sourceGroup: 'gaming-desk',
    publishedAt: publishedHoursAgo(0.5),
    timestampConfidence: 'high',
  }),
  Object.freeze({
    id: 'clustered-duplicate-a',
    title: 'Cyclone alert issued for coastal districts',
    section: 'local',
    source: 'Muscat Daily',
    sourceGroup: 'muscat-daily',
    publishedAt: publishedHoursAgo(1),
    timestampConfidence: 'high',
    clusterId: 'cyclone-alert-cluster',
    sourceCount: 3,
  }),
  Object.freeze({
    id: 'clustered-duplicate-b',
    title: 'Cyclone alert update for coastal districts',
    section: 'local',
    source: 'Times of Oman',
    sourceGroup: 'times-of-oman',
    publishedAt: publishedHoursAgo(1.1),
    timestampConfidence: 'high',
    clusterId: 'cyclone-alert-cluster',
    sourceCount: 2,
  }),
  Object.freeze({
    ...cycloneReports[0],
    newsEvidenceRows: cycloneReports,
  }),
  Object.freeze({
    id: 'same-source-top-feed-spam',
    title: 'Routine business product launch promoted repeatedly',
    section: 'business',
    source: 'Business Promo Feed',
    sourceGroup: 'business-promo-feed',
    publishedAt: publishedHoursAgo(1),
    timestampConfidence: 'high',
  }),
  Object.freeze({
    id: 'local-public-alert',
    title: 'Muscat public closure alert for school transport routes',
    section: 'local',
    source: 'Muscat Daily',
    sourceGroup: 'muscat-daily',
    publishedAt: publishedHoursAgo(1),
    timestampConfidence: 'high',
  }),
]);

export const TOP_STORIES_REGRESSION_TOP_FEED = Object.freeze([
  ...cycloneReports.map((report, index) => Object.freeze({
    ...report,
    topFeedSource: report.source,
    topFeedRank: index + 1,
  })),
  ...[1, 1, 1].map(topFeedRank => Object.freeze({
    ...TOP_STORIES_REGRESSION_STORIES.find(row => row.id === 'same-source-top-feed-spam'),
    topFeedSource: 'same-snapshot',
    topFeedRank,
  })),
]);

export const TOP_STORIES_REGRESSION_INPUT = Object.freeze({
  sectionItems: Object.freeze({ world: TOP_STORIES_REGRESSION_STORIES }),
  topFeedEvidence: TOP_STORIES_REGRESSION_TOP_FEED,
  nowMs: TOP_STORIES_FIXTURE_NOW,
});
