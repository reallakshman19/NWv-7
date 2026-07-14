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

const PROMO_RE = /\b(god of war|call of duty|gameplay|trailer|teaser|box office|ott release|web series|season premiere|movie)\b/i;

const EVENT_RULES = Object.freeze([
  rule(TOP_STORY_EVENT_TYPES.WAR_CONFLICT,
    /\b(war|invasion|airstrike|missile|drone attack|ceasefire|border clash)\b/i,
    /\b(killed|dead|injured|military|troops?|attack|strike|gaza|ukraine|iran|israel|nato|border|civilians?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY,
    /\b(killed|dead|injured|shooting|blast|explosion|hostage|evacuat|derail|collapse|attack)\b/i,
    /\b(people|residents?|passengers?|workers?|police|hospital|casualt|fire|building|train|bus|road|public)\b/i),
  rule(TOP_STORY_EVENT_TYPES.DISASTER,
    /\b(earthquake|tsunami|cyclone|flood|wildfire|landfall|storm surge|landslide|disaster)\b/i,
    /\b(alert|warning|evacuat|damage|rain|wind|coast|district|rescue|people|homes?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.GOVERNANCE,
    /\b(election|parliament|minister|cabinet|policy|summit|treaty|resigns?|impeach(?:ment)?|government)\b/i,
    /\b(vot(?:e|er|ing)|ballot|polling|turnout|candidate|constituency|campaign|assembly|commission|results?|coalition|bill|law|regulation|agreement|appointed|ousted|leaders?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.COURT_LEGAL,
    /\b(court|supreme court|verdict|trial|convict|sentence|lawsuit|judge|legal)\b/i,
    /\b(order|ruling|case|hearing|appeal|petition|charges?|accused|judgment|bench|announc)\b/i),
  rule(TOP_STORY_EVENT_TYPES.ECONOMY_SYSTEMIC,
    /\b(inflation|rates?|market crash|selloff|recession|budget|rupee|oil prices?|banking|tariff)\b/i,
    /\b(economy|central bank|reserve bank|rbi|tax|fiscal|prices?|markets?|currency|trade|growth|spending)\b/i),
  rule(TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
    /\b(alert|warning|closure|outage|strike|protest|traffic|school closed|public notice)\b/i,
    /\b(public|government|residents?|commuters?|services?|roads?|schools?|airport|power|water|transport|municipal|police)\b/i),
  rule(TOP_STORY_EVENT_TYPES.LOCAL_ALERT,
    /\b(muscat|oman|chennai|trichy|tamil nadu|district|municipal|local)\b/i,
    /\b(alert|warning|closure|outage|traffic|evacuat|protest|strike|public notice|emergency)\b/i),
  rule(TOP_STORY_EVENT_TYPES.ROUTINE_BUSINESS,
    /\b(results|earnings|quarter|profit|ipo|startup|funding|launch)\b/i,
    /\b(company|business|revenue|shares?|investors?|market|sales|financial|valuation|quarterly|profit|results?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.SPORTS,
    /\b(cricket|football|tennis|ipl|world cup|match|score|final)\b/i,
    /\b(team|player|tournament|league|innings|goal|won|defeat|fixture)\b/i),
]);

function rule(eventType, anchor, context) {
  return Object.freeze({ eventType, anchor, context });
}

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

  const unqualified = [];
  for (const candidate of EVENT_RULES) {
    if (!candidate.anchor.test(text)) continue;
    if (candidate.context.test(text)) {
      return makeEvent(candidate.eventType, 0.8, [candidate.eventType, 'context_qualified']);
    }
    unqualified.push(`unqualified_keyword:${candidate.eventType}`);
  }

  if (unqualified.length > 0) {
    return makeEvent(TOP_STORY_EVENT_TYPES.UNKNOWN, 0.25, unqualified, false);
  }
  return makeEvent(TOP_STORY_EVENT_TYPES.UNKNOWN, 0.35, ['fallback_unknown'], false);
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

function makeEvent(eventType, confidence, evidence, qualified = true) {
  return { eventType, confidence, evidence, qualified };
}
