/** Bounded high-confidence occurrence veto, not generic topic similarity. */
import type { InsightStory } from "../types";

const HAZARD_NAME_STOP_WORDS = new Set([
  "warning", "warnings", "alert", "alerts", "weather", "landfall", "rain",
  "expected", "likely", "could", "will", "forms", "formed", "hits", "hit",
  "intensifies", "approaches", "strong", "next", "season", "system", "threat",
  "danger", "watch", "remnants", "toll", "news", "update", "updates", "live",
  "latest", "today", "after", "before", "over", "under", "says", "report",
]);

export function namedHazardIdentities(title: string): string[] {
  const matches = String(title || "").matchAll(/\b(cyclone|hurricane|typhoon|storm)\s+["'‘’“”]*([a-z][a-z-]{2,})\b/gi);
  return [...new Set([...matches]
    .filter(match => /^[A-Z]/.test(match[2]) && !HAZARD_NAME_STOP_WORDS.has(match[2].toLowerCase()))
    // "Hurricane X" becoming "Storm X" is development of the same event.
    .map(match => match[2].toLowerCase()))];
}

/** Recognized publisher navigation labels contain no event-specific evidence.
 * Inspect the article text, never inferred entities or embeddings. An actual
 * report (including Arabic text) with additional information remains eligible.
 */
export function isGenericPublisherPage(story: Pick<InsightStory, "title" | "summary">): boolean {
  const clean = (value: string) => String(value || "").normalize("NFKC")
    .replace(/<[^>]*>|&(?:nbsp|amp|quot|apos);/gi, " ")
    .replace(/[أإآ]/g, "ا").replace(/[^\p{L}\p{N}]+/gu, " ").toLowerCase().trim();
  const title = clean(story.title);
  const navigation = /^(?:news|latest news|headlines|home) (?:oman news agency|وكالة الانباء العمانية(?: العمانية)?|reuters|associated press|bbc news)$/;
  const summary = clean(story.summary);
  // Broad multi-event live pages and daily roundups cannot be the identity of
  // a single occurrence. Dedicated event liveblogs remain eligible.
  const roundup = /^(?:india|world|top|latest|breaking) news live updates\b/.test(title)
    || /^(?:ht )?(?:morning |evening )?news brief\b/.test(title)
    || /^(?:india|world) news \d{1,2} [a-z]+ 20\d{2}\b/.test(title)
    || /^letters to (?:the )?editor\b/.test(title);
  const quoteTracker = /\bshare price live updates\b/.test(title) && !summary;
  return roundup || quoteTracker || navigation.test(title) && (!summary || summary === title);
}

function token(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/** Explicit event identity provided by a source. Article ID is NEVER event ID. */
function explicitEventId(story: InsightStory): string {
  const raw = story as any;
  return token(raw.eventOccurrenceId ?? raw.occurrenceId ?? raw.storySignals?.eventOccurrenceId);
}

function referencedObject(story: InsightStory): string {
  const raw = story as any;
  const fromSource = token(raw?.storySignals?.caseId || raw?.storySignals?.eventObjectId || raw?.incidentId);
  if (fromSource) return fromSource;
  const text = `${story.title || ""} ${story.summary || ""}`;
  // Recognize *labelled* article subjects, never arbitrary reported numbers.
  const match = text.match(/\b(permit|licen[sc]e|flight|train|case|order|decree|tender|contract|project)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*([a-z]{0,4}[- ]?\d{2,8}[a-z]?)\b/i);
  return match ? `${token(match[1])}:${token(match[2])}` : "";
}

function explicitEventDate(story: InsightStory): string {
  const raw=story as any;
  const direct=raw.eventDate || raw.incidentDate || raw.storySignals?.eventDate;
  if (direct) return String(direct).slice(0,10);
  const text = `${story.title || ""} ${story.summary || ""}`;
  const match=text.match(/\b(?:incident|accident|hearing|event|match|strike|explosion|crash)\s+(?:on|dated)\s+(20\d\d[-/]\d\d[-/]\d\d)\b/i);
  return match ? match[1].replace(/\//g,"-") : "";
}

// Explicitly distinguished named assets, not general co-mentions. A report
// saying a second project is independent of the first must not join the first.
function namedAssets(text: string): string[] {
  return [...text.matchAll(/\b(?:[A-Z][a-z]+\s+){1,5}(?:Bridge|Terminal|Airport|Station|Hospital|Plant|Dam|Highway|Port|Tunnel)\b/g)].map(m => token(m[0]));
}
function explicitlySeparate(a: InsightStory, b: InsightStory): boolean {
  const text = `${a.title || ""} ${a.summary || ""}`;
  const match = text.match(/\b(?:distinct|separate|unrelated|independent)\s+((?:[A-Z][a-z]+\s+){1,5}(?:Bridge|Terminal|Airport|Station|Hospital|Plant|Dam|Highway|Port|Tunnel))\b/);
  if (!match) return false;
  const separate = token(match[1]);
  const otherAssets = namedAssets(`${b.title || ""} ${b.summary || ""}`);
  if (otherAssets.includes(separate)) return false;
  const otherEntities = (b.entities?.products || []).map(token);
  return [...otherAssets, ...otherEntities].some(name => name && name !== separate);
}

/** Prefer under-merging ambiguous material over inventing two occurrences. */
export function hasConflictingEventIdentity(a: InsightStory,b: InsightStory): boolean {
  if (explicitlySeparate(a,b) || explicitlySeparate(b,a)) return true;
  const hazardA = namedHazardIdentities(a.title), hazardB = namedHazardIdentities(b.title);
  if (hazardA.length === 1 && hazardB.length === 1 && hazardA[0] !== hazardB[0]) return true;
  const first=explicitEventId(a),second=explicitEventId(b);
  if(first && second && first !== second) return true;
  const objectA=referencedObject(a), objectB=referencedObject(b);
  if(objectA && objectB && objectA !== objectB) return true;
  const dateA=explicitEventDate(a),dateB=explicitEventDate(b);
  if(dateA && dateB && dateA !== dateB) return true;
  return false;
}
