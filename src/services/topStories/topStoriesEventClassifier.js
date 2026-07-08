export const TOP_STORY_EVENT_TYPES = Object.freeze({
  WAR_CONFLICT: 'war_conflict',
  PUBLIC_SAFETY: 'public_safety',
  DISASTER: 'disaster',
  GOVERNANCE: 'governance',
  COURT_LEGAL: 'court_legal',
  ECONOMY_SYSTEMIC: 'economy_systemic',
  CIVIC_ALERT: 'civic_alert',
  LOCAL_ALERT: 'local_alert',
  ROUTINE_BUSINESS: 'routine_business',
  SPORTS: 'sports',
  ENTERTAINMENT_PROMO: 'entertainment_promo',
  UNKNOWN: 'unknown',
});

const EVENT_PATTERNS = Object.freeze([
  [TOP_STORY_EVENT_TYPES.WAR_CONFLICT, /\b(war|invasion|airstrike|missile|drone attack|ceasefire|gaza|ukraine|nato|border clash)\b/i],
  [TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY, /\b(killed|dead|injured|shooting|blast|explosion|attack|hostage|evacuat|derail|collapse)\b/i],
  [TOP_STORY_EVENT_TYPES.DISASTER, /\b(earthquake|tsunami|cyclone|flood|wildfire|landfall|storm surge|landslide|disaster)\b/i],
  [TOP_STORY_EVENT_TYPES.GOVERNANCE, /\b(election|parliament|minister|cabinet|policy|summit|treaty|resigns|impeach|government)\b/i],
  [TOP_STORY_EVENT_TYPES.COURT_LEGAL, /\b(court|supreme court|verdict|trial|convict|sentence|lawsuit|judge|legal)\b/i],
  [TOP_STORY_EVENT_TYPES.ECONOMY_SYSTEMIC, /\b(inflation|rates?|market crash|selloff|recession|budget|rupee|oil prices?|banking|tariff)\b/i],
  [TOP_STORY_EVENT_TYPES.CIVIC_ALERT, /\b(alert|warning|closure|outage|strike|protest|traffic|school closed|public notice)\b/i],
  [TOP_STORY_EVENT_TYPES.LOCAL_ALERT, /\b(muscat|oman|chennai|trichy|tamil nadu|district|municipal|local)\b/i],
  [TOP_STORY_EVENT_TYPES.ROUTINE_BUSINESS, /\b(results|earnings|quarter|profit|ipo|startup|funding|launch)\b/i],
  [TOP_STORY_EVENT_TYPES.SPORTS, /\b(cricket|football|tennis|ipl|world cup|match|score|final)\b/i],
]);

const PROMO_RE = /\b(god of war|call of duty|gameplay|trailer|teaser|box office|ott release|web series|season premiere|movie)\b/i;

export function normalizeTopStoryText(story = {}) {
  return [
    story.title,
    story.headline,
    story.summary,
    story.description,
    story.category,
    story.section,
  ].filter(Boolean).join(' ');
}

export function isEntertainmentPromo(text = '') {
  return PROMO_RE.test(String(text));
}

export function classifyTopStoryEvent(story = {}) {
  const text = normalizeTopStoryText(story);
  if (isEntertainmentPromo(text)) {
    return makeEvent(TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO, 0.92, ['promo_guard']);
  }

  for (const [eventType, pattern] of EVENT_PATTERNS) {
    if (pattern.test(text)) return makeEvent(eventType, 0.74, [eventType]);
  }

  return makeEvent(TOP_STORY_EVENT_TYPES.UNKNOWN, 0.35, ['fallback_unknown']);
}

export function getPublicInterestScore(eventType) {
  const scores = {
    [TOP_STORY_EVENT_TYPES.WAR_CONFLICT]: 1,
    [TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY]: 0.96,
    [TOP_STORY_EVENT_TYPES.DISASTER]: 0.94,
    [TOP_STORY_EVENT_TYPES.GOVERNANCE]: 0.76,
    [TOP_STORY_EVENT_TYPES.COURT_LEGAL]: 0.72,
    [TOP_STORY_EVENT_TYPES.ECONOMY_SYSTEMIC]: 0.7,
    [TOP_STORY_EVENT_TYPES.CIVIC_ALERT]: 0.66,
    [TOP_STORY_EVENT_TYPES.LOCAL_ALERT]: 0.62,
    [TOP_STORY_EVENT_TYPES.UNKNOWN]: 0.35,
    [TOP_STORY_EVENT_TYPES.ROUTINE_BUSINESS]: 0.24,
    [TOP_STORY_EVENT_TYPES.SPORTS]: 0.16,
    [TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO]: 0.04,
  };
  return scores[eventType] ?? scores[TOP_STORY_EVENT_TYPES.UNKNOWN];
}

function makeEvent(eventType, confidence, evidence) {
  return { eventType, confidence, evidence };
}
