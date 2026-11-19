import { InsightStory } from "../types";
import { namedHazardIdentities } from "./eventOccurrenceIdentity";
import { hasSharedMeetingIdentity } from "./meetingIdentity";

const TOPIC_STOP_WORDS = new Set([
  "about", "after", "again", "against", "ahead", "among", "around", "before",
  "being", "between", "could", "during", "every", "first", "from", "have",
  "into", "latest", "more", "news", "over", "said", "says", "their", "there",
  "these", "this", "those", "through", "under", "update", "when", "where",
  "which", "while", "with", "would", "will", "your"
]);

const TOPIC_BOOST_PATTERNS = [
  /\b[A-Z][a-z]+\s+(Bank|Group|Corp|Ltd|Limited|Ministry|Court|Agency|Airlines|Motors|Energy|Power|Police|University)\b/g,
  /\b[A-Z]{2,}\b/g,
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
];

// Content-derived memo only: include every mutable input and bound memory.
// A centroid comparison copies the story object, so object-identity caching
// alone would still repeat this tokenization for every pair in the corpus.
const topicTokenMemo = new Map<string, readonly string[]>();
const MAX_TOPIC_MEMO_ENTRIES = 1024;

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter(token => token.length >= 4)
    .filter(token => !TOPIC_STOP_WORDS.has(token));
}

function boostedTopicPhrases(text: string): string[] {
  const phrases: string[] = [];

  for (const pattern of TOPIC_BOOST_PATTERNS) {
    for (const match of String(text || "").matchAll(pattern)) {
      const phrase = normalizeToken(match[0]);
      if (phrase.length >= 4) phrases.push(phrase);
    }
  }

  return phrases;
}

export function getStoryTopicTokens(story: InsightStory): string[] {
  const memoKey = JSON.stringify([
    story.title, story.summary, story.category, story.region,
    story.entities?.orgs, story.entities?.places, story.entities?.people,
    story.entities?.products, story.keywords,
  ]);
  const cached = topicTokenMemo.get(memoKey);
  if (cached) return [...cached];
  const text = [
    story.title,
    story.summary,
    story.category,
    story.region,
    ...(story.entities?.orgs || []),
    ...(story.entities?.places || []),
    ...(story.entities?.people || []),
    ...(story.entities?.products || []),
    ...(story.keywords || []),
  ].filter(Boolean).join(" ");

  const tokens = [
    ...tokenize(text),
    ...boostedTopicPhrases(`${story.title || ""} ${story.summary || ""}`),
    ...(story.entities?.orgs || []).map(normalizeToken),
    ...(story.entities?.places || []).map(normalizeToken),
  ].filter(Boolean);

  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const result = [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([token]) => token)
    .slice(0, 16);
  if (memoKey.length <= 8192) {
    if (topicTokenMemo.size >= MAX_TOPIC_MEMO_ENTRIES) {
      topicTokenMemo.delete(topicTokenMemo.keys().next().value!);
    }
    topicTokenMemo.set(memoKey, [...result]);
  }
  return result;
}

// Generic geographic / filler tokens that appear across unrelated stories and must
// NOT drive topic cohesion (kept in sync with hasSharedTopicSignature's exclusion).
const GENERIC_TOPIC_TOKENS = /^(india|indian|world|global|country|countries|record|report|reports|people|year|years|national|international|news|update|updates|live|latest|today|breaking)$/;

// Sparse browser embeddings can omit short names (for example a named cyclone
// or a person's surname). Do not lower the general similarity threshold: use
// names actually printed in BOTH headlines, backed by event-specific wording.
const GENERIC_NAME_WORDS = new Set([
  ...TOPIC_STOP_WORDS, "india", "indian", "world", "national", "international",
  "minister", "ministry", "government", "court", "supreme", "high", "police",
  "bank", "business", "market", "markets", "news", "day", "year", "state",
  "city", "new", "live", "updates", "report", "reports", "today",
  "cyclone", "hurricane", "typhoon", "storm", "warning", "alert", "threat",
  "united", "states", "kingdom", "saudi", "arabia", "middle", "east",
  "tamil", "nadu", "university", "college", "school", "hospital",
]);

function headlineNames(title: string): string[][] {
  return [...String(title || "").matchAll(/\b(?:[A-Z][a-z]+\s+){1,3}[A-Z][a-z]+\b/g)]
    .map(match => match[0].toLowerCase().split(/\s+/))
    .filter(words => words.filter(word => !GENERIC_NAME_WORDS.has(word)).length >= 2);
}

const NAMED_INCIDENT_SIGNALS = [
  /\b(?:kill(?:ed|ing)?|dead|death|terrorist|encounter)\b/i,
  /\b(?:arrest(?:ed)?|detain(?:ed)?|custody)\b/i,
  /\b(?:outage|blackout|disruption)\b/i,
  /\b(?:demerg(?:e|es|ed|er)|merg(?:e|es|ed|er))\b/i,
  /\b(?:fire|blaze|arson)\b/i,
  /\b(?:crash|collision|derailment)\b/i,
  /\b(?:protest|rally|march|sloganeering|adjourned)\b/i,
];

export function hasSharedNamedEventSignature(a: InsightStory, b: InsightStory): boolean {
  if (hasSharedMeetingIdentity(a, b)) return true;
  const aHazards = namedHazardIdentities(a.title);
  const bHazards = namedHazardIdentities(b.title);
  // A multi-event roundup must not bridge two separately named hazards.
  if (aHazards.length || bHazards.length) {
    if (aHazards.length > 1 || bHazards.length > 1) return false;
    if (aHazards.length === 1 && bHazards.length === 1) return aHazards[0] === bHazards[0];
    const name = aHazards[0] || bHazards[0];
    const otherTitle = aHazards.length ? b.title : a.title;
    const words = new Set(String(otherTitle || "").toLowerCase().match(/[a-z-]+/g) || []);
    return /\b(?:cyclone|hurricane|typhoon|storm)\b/i.test(otherTitle) && words.has(name);
  }

  // A brand, institution or venue is not an event. Shared names opt in only
  // with the same explicit incident type, plus the separate wording test below.
  // Product launches and loosely related controversies stay on the normal path.
  if (!NAMED_INCIDENT_SIGNALS.some(pattern => pattern.test(a.title) && pattern.test(b.title))) return false;
  const aNames = headlineNames(a.title);
  const bNameKeys = new Set(headlineNames(b.title).map(words => words.join(" ")));
  const aTokens = new Set(tokenize(a.title).filter(word => !GENERIC_NAME_WORDS.has(word)));
  const bTokens = new Set(tokenize(b.title).filter(word => !GENERIC_NAME_WORDS.has(word)));
  return aNames.some(words => bNameKeys.has(words.join(" ")) &&
    [...aTokens].filter(word => !words.includes(word) && bTokens.has(word)).length >= 2);
}

export function topicTokenOverlap(a: InsightStory, b: InsightStory): number {
  const aTokens = new Set(getStoryTopicTokens(a));
  const bTokens = new Set(getStoryTopicTokens(b));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  let nonGenericShared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
      if (!GENERIC_TOPIC_TOKENS.test(token)) nonGenericShared += 1;
    }
  }

  const smallerSetSize = Math.min(aTokens.size, bTokens.size);
  const union = aTokens.size + bTokens.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Containment rewards subset relationships, but it must be backed by at least one
  // SPECIFIC (non-generic) shared token. Otherwise an OOV/foreign-language headline
  // reduced to a single generic geo token ("india") scored containment 1.0 → 0.72 and
  // force-merged with any unrelated story (the France-heatwave + Hindi-cricket bug).
  // Genuine overlaps (which always share specific tokens) are unchanged.
  const containment = nonGenericShared >= 1 ? intersection / Math.max(1, smallerSetSize) : 0;

  return Math.max(jaccard, containment * 0.72);
}

export function hasSharedTopicSignature(a: InsightStory, b: InsightStory): boolean {
  const overlap = topicTokenOverlap(a, b);

  if (overlap >= 0.42) return true;

  const aTokens = new Set(getStoryTopicTokens(a));
  const bTokens = new Set(getStoryTopicTokens(b));

  const strongTokens = [...aTokens].filter(token => {
    if (!bTokens.has(token)) return false;

    // Exclude high-frequency geographic/generic tokens that appear across unrelated stories
    if (/^(india|indian|world|global|country|countries|record|report|people|year|years|national|international)$/.test(token)) return false;

    return token.length >= 7 ||
      /bank|ministry|court|market|shares|outage|policy|election|storm|crash|launch|strike|attack|regulator/.test(token);
  });

  return strongTokens.length >= 3;
}

export function getTopicCohesionDiagnostics(a: InsightStory, b: InsightStory) {
  const aTokens = getStoryTopicTokens(a);
  const bTokens = getStoryTopicTokens(b);
  const bSet = new Set(bTokens);
  const shared = aTokens.filter(token => bSet.has(token));

  return {
    topicOverlap: topicTokenOverlap(a, b),
    sharedTopicSignature: hasSharedTopicSignature(a, b),
    aTokens,
    bTokens,
    sharedTokens: shared,
  };
}
