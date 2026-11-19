export const TOP_STORIES_EVENT_CLASSIFIER_VERSION =
  'nw-top-stories-event-classifier-v2';

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

const PROMO_RE = /\b(god of war|call of duty|gameplay|box office|ott release|web series|season premiere|movie (?:review|release|trailer|teaser)|(?:film|game|series|movie) trailer|trailer (?:released|revealed|unveiled|drops)|teaser (?:released|revealed|unveiled))\b/i;
const ROAD_INCIDENT = /\b(?:crash(?:es|ed)?|collision|accident|hit by|run over|rammed)\b/i;
const MASS_HARM = /\b(?:[2-9]|[1-9]\d+|two|three|four|five|six|seven|eight|nine|ten|dozens|scores|hundreds|multiple|several)\s+(?:(?:people|persons?|passengers?|workers?|residents?|children|men|women|civilians?|victims?)\s+)?(?:(?:were|are)\s+)?(?:killed|dead|injur\w*|casualt\w*|deaths?)\b|\b(?:kills?|toll (?:rises|climbs) to)\s+(?:[2-9]|[1-9]\d+|dozens|scores|hundreds)\b(?![-\s]*year[-\s]*old)/i;
const TRANSPORT_EMERGENCY = /\b(?:train|bus|minibus|passengers?|airport|public transport|school bus)\b/i;
const LEGAL_UPDATE = /\b(?:court|sc|judge|bench)\b.{0,70}\b(?:orders?|allows?|rules?|hears?|transfer|trial|appeal|verdict|hearing|petition|bail)\b/i;
const MARKET_UPDATE = /\b(?:stocks?|shares?)\b.{0,55}\b(?:drop|fall|rise|jump|sink|decline|surge|gain|slump)\w*\b/i;

const EVENT_RULES = Object.freeze([
  rule(TOP_STORY_EVENT_TYPES.WAR_CONFLICT,
    /\b(war|invasion|airstrike|missile|drone attack|ceasefire|border clash)\b/i,
    /\b(killed|dead|injur\w*|military|troops?|attack|strike|gaza|ukraine|iran|israel|nato|border|civilians?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY,
    /\b(kill(?:s|ed|ings?)?|dead|injur\w*|shooting|blast|explosion|hostage|derail\w*|collapse|attack|collision|crash|abduct\w*|assault\w*)\b/i,
    /\b(people|residents?|passengers?|workers?|police|hospital|casualt\w*|civilians?|victims?|deceased|toll|driver|truck|minibus|fire|building|train|bus|road|highway|public|station|transit)\b/i),
  rule(TOP_STORY_EVENT_TYPES.DISASTER,
    /\b(earthquake|tsunami|cyclone|flood|wildfire|landfall|storm surge|landslide|disaster)\b/i,
    /\b(alert|warning|evacuat\w*|damage|rescue|killed|dead|injur\w*|displaced|inundat\w*|landfall|emergency|intensif\w*|closures?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.GOVERNANCE,
    /\b(election|parliament|minister|cabinet|policy|summit|treaty|resigns?|impeach(?:ment)?|government)\b/i,
    /\b(vot\w*|ballot|polling|turnout|candidate|constituency|campaign|assembly|commission|results?|coalition|bill|law|regulation|agreement|appointed|ousted|devolution)\b/i),
  rule(TOP_STORY_EVENT_TYPES.GOVERNANCE,
    /\b(summit)\b/i,
    /\b(leaders?|heads? of (?:state|government)|delegations?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.GOVERNANCE,
    /\b(foreign ministers?|diplomat\w*|bilateral|nuclear[ -]arms?|arms[ -]control)\b/i,
    /\b(visits?|meet(?:s|ing)?|talks?|negotiat\w*|cuts?|treaty|agreement|summit)\b/i),
  rule(TOP_STORY_EVENT_TYPES.COURT_LEGAL,
    /\b(court|supreme court|verdict|trial|convict\w*|sentence|lawsuit|judge|legal)\b/i,
    /\b(orders?|ruling|case|hearing|appeal|petition|charges?|accused|judgment|bench|announc\w*)\b/i),
  rule(TOP_STORY_EVENT_TYPES.ECONOMY_SYSTEMIC,
    /\b(inflation|rates?|market crash|selloff|recession|budget|rupee|oil prices?|banking|tariff)\b/i,
    /\b(economy|central bank|reserve bank|rbi|tax|fiscal|prices?|markets?|currency|trade|growth|spending)\b/i),
  rule(TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
    /\b(ground stop|air traffic control|flights? (?:suspend\w*|cancel\w*)|airport closure)\b/i,
    /\b(disruption|outage|overload\w*|grounded|suspend\w*|cancel\w*|closure|resume\w*|affected|faa)\b/i),
  rule(TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
    /\b(air quality|air pollution|smog|aqi)\b/i,
    /\b(very poor|severe|hazardous|unhealthy|toxic|health (?:alert|warning)|school closures?)\b/i),
  rule(TOP_STORY_EVENT_TYPES.CIVIC_ALERT,
    /\b(alert|warning|closure|outage|strike|protest|traffic (?:restrictions?|diversions?|disruption|congestion|notice)|school closed|public notice)\b/i,
    /\b(public|government|residents?|commuters?|services?|roads?|schools?|airport|power|water|transport|municipal|police)\b/i),
  rule(TOP_STORY_EVENT_TYPES.LOCAL_ALERT,
    /\b(muscat|oman|chennai|trichy|tamil nadu|district|municipal|local)\b/i,
    /\b(alert|warning|closure|outage|traffic (?:restrictions?|diversions?|disruption|congestion|notice)|evacuat\w*|protest|strike|public notice|emergency)\b/i),
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

  const headline = String(story.title || story.headline || '');
  if (LEGAL_UPDATE.test(headline)) {
    return makeEvent(TOP_STORY_EVENT_TYPES.COURT_LEGAL, 0.8, ['legal_development']);
  }
  if (MARKET_UPDATE.test(headline) && !/\b(?:market crash|recession|central bank|inflation|systemic)\b/i.test(headline)) {
    return makeEvent(TOP_STORY_EVENT_TYPES.ROUTINE_BUSINESS, 0.8, ['company_market_update']);
  }
  const unqualified = [];
  for (const candidate of EVENT_RULES) {
    if (!candidate.anchor.test(text)) continue;
    if (candidate.context.test(text)) {
      if (candidate.eventType === TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY &&
          ROAD_INCIDENT.test(headline) && !MASS_HARM.test(headline) &&
          !TRANSPORT_EMERGENCY.test(text)) {
        unqualified.push('bounded_road_incident');
        continue;
      }
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
    [TOP_STORY_EVENT_TYPES.UNKNOWN]: 0.08,
    [TOP_STORY_EVENT_TYPES.ROUTINE_BUSINESS]: 0.24,
    [TOP_STORY_EVENT_TYPES.SPORTS]: 0.16,
    [TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO]: 0.04,
  };
  return scores[eventType] ?? scores[TOP_STORY_EVENT_TYPES.UNKNOWN];
}

function makeEvent(eventType, confidence, evidence, qualified = true) {
  return { eventType, confidence, evidence, qualified };
}
