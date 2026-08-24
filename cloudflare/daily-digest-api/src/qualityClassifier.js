export const QUALITY_EVIDENCE_VERSION = 'daily-digest-quality/v0.1';

const TOPIC_RULES = Object.freeze([
  Object.freeze({ topic: 'COURTS', patterns: [/\bsupreme court\b/i, /\bhigh court\b/i, /\bcourt\b/i, /\bjudge\b/i, /\bcji\b/i, /\bverdict\b/i, /\bpetition\b/i, /\bbail\b/i, /\btribunal\b/i] }),
  Object.freeze({ topic: 'PUBLIC_SAFETY', patterns: [/\baccident\b/i, /\bcrash\b/i, /\bflood\b/i, /\bfire\b/i, /\bcyclone\b/i, /\bearthquake\b/i, /\blandslide\b/i, /\brescue\b/i, /\bdisaster\b/i, /\bkilled\b/i, /\bpolice\b/i] }),
  Object.freeze({ topic: 'DEFENCE_SECURITY', patterns: [/\barmy\b/i, /\bnavy\b/i, /\bair force\b/i, /\bdefen[cs]e\b/i, /\bmilitary\b/i, /\bborder\b/i, /\bmissile\b/i, /\bterror/i, /\binsurgent/i, /\bceasefire\b/i, /\bsecurity forces?\b/i] }),
  Object.freeze({ topic: 'ECONOMY', patterns: [/\beconom/i, /\binflation\b/i, /\bgdp\b/i, /\brbi\b/i, /\brupee\b/i, /\bmarkets?\b/i, /\bstocks?\b/i, /\btrade\b/i, /\btariff\b/i, /\btax\b/i, /\bbudget\b/i, /\bbanks?\b/i, /\bfinance\b/i, /\boil prices?\b/i] }),
  Object.freeze({ topic: 'GOVERNANCE', patterns: [/\bgovernment\b/i, /\bparliament\b/i, /\blok sabha\b/i, /\brajya sabha\b/i, /\bministry\b/i, /\bminister\b/i, /\bcabinet\b/i, /\belection\b/i, /\bpolicy\b/i, /\bbill\b/i, /\bscheme\b/i, /\bprime minister\b/i, /\bpresident\b/i] }),
  Object.freeze({ topic: 'INTERNATIONAL', patterns: [/\bunited states\b/i, /\bu\.?s\.?\b/i, /\bchina\b/i, /\brussia\b/i, /\bukraine\b/i, /\bisrael\b/i, /\bgaza\b/i, /\biran\b/i, /\bpakistan\b/i, /\bbangladesh\b/i, /\bsri lanka\b/i, /\bunited nations\b/i, /\beuropean union\b/i, /\bforeign\b/i, /\bglobal\b/i, /\bsummit\b/i] }),
  Object.freeze({ topic: 'SCIENCE_TECH', patterns: [/\bscience\b/i, /\bspace\b/i, /\bisro\b/i, /\bnasa\b/i, /\bartificial intelligence\b/i, /\bai\b/i, /\btechnology\b/i, /\btech\b/i, /\bsemiconductor\b/i, /\bcyber/i, /\bresearch\b/i, /\bsatellite\b/i] }),
  Object.freeze({ topic: 'HEALTH_SOCIAL', patterns: [/\bhealth\b/i, /\bhospital\b/i, /\bdisease\b/i, /\bvaccine\b/i, /\bschool\b/i, /\beducation\b/i, /\bwomen\b/i, /\bchildren?\b/i, /\bwelfare\b/i, /\bpoverty\b/i, /\bemployment\b/i] }),
  Object.freeze({ topic: 'ENVIRONMENT', patterns: [/\bclimate\b/i, /\benvironment\b/i, /\bpollution\b/i, /\bmonsoon\b/i, /\bwildlife\b/i, /\bforest\b/i, /\bheatwave\b/i, /\bheat wave\b/i] }),
  Object.freeze({ topic: 'SPORTS_CULTURE', patterns: [/\bcricket\b/i, /\bfootball\b/i, /\bsports?\b/i, /\bolympic/i, /\bfilm\b/i, /\bcinema\b/i, /\bactor\b/i, /\bmusic\b/i, /\bart\b/i, /\bculture\b/i, /\baward\b/i] }),
]);

const CORE_TOPICS = Object.freeze(new Set(TOPIC_RULES.slice(0, 9).map(rule => rule.topic)));
const NEUTRAL_CLASSES = Object.freeze({
  significanceClass: 'ADEQUATE',
  breadthClass: 'ADEQUATE',
  diversityClass: 'MODERATE',
});

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const text = normalizeText(item);
    const key = text.toLowerCase();
    if (text.length < 15 || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= 20) break;
  }
  return output;
}

export function observedQualityEvidence(items, sourceSurface) {
  return { state: 'OBSERVED', sourceSurface, items: uniqueItems(items) };
}

export function unavailableQualityEvidence(reason) {
  return { state: 'UNAVAILABLE', reason, items: [] };
}

export function classifyQualityTopic(text) {
  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some(pattern => pattern.test(text))) return rule.topic;
  }
  return 'OTHER';
}

function topicMetrics(items) {
  const counts = new Map();
  let coreItemCount = 0;
  for (const item of items) {
    const topic = classifyQualityTopic(item);
    counts.set(topic, (counts.get(topic) || 0) + 1);
    if (CORE_TOPICS.has(topic)) coreItemCount += 1;
  }
  const topics = [...counts.keys()];
  const coreTopicCount = topics.filter(topic => CORE_TOPICS.has(topic)).length;
  const dominant = Math.max(0, ...counts.values());
  const dominantShareBps = items.length ? Math.round((dominant * 10000) / items.length) : 0;
  const orderedCounts = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
  return { counts: orderedCounts, topicCount: topics.length, coreTopicCount, coreItemCount, dominantShareBps };
}

function significanceClass(metrics) {
  if (metrics.coreItemCount >= 4 && metrics.coreTopicCount >= 3) return 'HIGH';
  if (metrics.coreItemCount >= 2 && metrics.coreTopicCount >= 2) return 'ADEQUATE';
  return 'LOW';
}

function breadthClass(itemCount, metrics) {
  if (itemCount >= 6 && metrics.topicCount >= 5) return 'BROAD';
  if (itemCount >= 4 && metrics.topicCount >= 3) return 'ADEQUATE';
  return 'NARROW';
}

function diversityClass(itemCount, metrics) {
  if (itemCount >= 6 && metrics.topicCount >= 4 && metrics.dominantShareBps <= 4000) return 'DIVERSE';
  if (itemCount >= 4 && metrics.topicCount >= 3 && metrics.dominantShareBps <= 6000) return 'MODERATE';
  return 'CONCENTRATED';
}

export function classifyDigestQuality(evidence) {
  const items = uniqueItems(evidence?.items);
  const metrics = topicMetrics(items);
  const evidenceState = evidence?.state === 'OBSERVED' ? 'OBSERVED' : 'UNAVAILABLE';
  const integrityClass = evidenceState === 'UNAVAILABLE'
    ? 'UNAVAILABLE'
    : (items.length >= 4 ? 'SUFFICIENT' : 'LIMITED');
  const classes = integrityClass === 'SUFFICIENT'
    ? {
        significanceClass: significanceClass(metrics),
        breadthClass: breadthClass(items.length, metrics),
        diversityClass: diversityClass(items.length, metrics),
      }
    : NEUTRAL_CLASSES;
  return {
    ...classes,
    qualityEvidenceVersion: QUALITY_EVIDENCE_VERSION,
    qualityEvidenceState: evidenceState,
    qualityIntegrityClass: integrityClass,
    qualityItemCount: items.length,
    qualityTopicCount: metrics.topicCount,
    qualityCoreTopicCount: metrics.coreTopicCount,
    qualityDominantTopicShareBps: metrics.dominantShareBps,
    qualityTopicCountsJson: JSON.stringify(metrics.counts),
  };
}
