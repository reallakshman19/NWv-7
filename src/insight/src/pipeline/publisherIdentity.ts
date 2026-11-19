/**
 * A08 publisher family identity for Insight evidence accounting.
 * This is a bounded alias contract, not a claim about wire-story originality.
 * Do not infer the underlying publisher of a Google News or other wrapper.
 * Source authority remains controlled by normalize.ts and the A06 taxonomy.
 */
import type { InsightStory } from "../types";

const FAMILY_ALIASES: Record<string,string> = {
  hindu: "the_hindu", the_hindu: "the_hindu", thehindu: "the_hindu",
  toi: "times_of_india", the_times_of_india: "times_of_india",
  times_of_india: "times_of_india", timesofindia: "times_of_india",
  economic_times: "economic_times", the_economic_times: "economic_times",
  economictimes: "economic_times", financial_express: "financial_express",
  financialexpress: "financial_express", business_line: "business_line",
  businessline: "business_line", ndtv_profit: "ndtv_profit",
  hindustan_times: "hindustan_times", india_today: "india_today",
  google_news: "google_news", googlenews: "google_news",
  bbc_news: "bbc", associated_press: "ap", associatedpress: "ap",
  reuters_news: "reuters", oman_observer: "oman_observer",
  omanobserver: "oman_observer", ap_news: "ap", apnews: "ap", apnews_com: "ap",
  thehindu_com: "the_hindu", hindustan: "hindustan_times", hindustantimes: "hindustan_times",
  hindustantimes_com: "hindustan_times", money_control: "moneycontrol", moneycontrol_com: "moneycontrol",
  timesofindia_indiatimes_com: "times_of_india", economictimes_indiatimes_com: "economic_times",
  the_hindu_businessline: "business_line", timesofoman: "times_of_oman", timesofoman_com: "times_of_oman",
  muscatdaily: "muscat_daily", muscatdaily_com: "muscat_daily", omanobserver_om: "oman_observer",
  aljazeera: "al_jazeera", aljazeera_com: "al_jazeera",
  indianexpress: "indian_express", indianexpress_com: "indian_express",
  livemint: "mint", livemint_com: "mint", mint_markets: "mint",
  dw_english: "dw", deutsche_welle: "dw", dw_com: "dw",
  arstechnica: "ars_technica", arstechnica_com: "ars_technica",
  the_arabian_stories_oman: "the_arabian_stories", thearabianstories_com: "the_arabian_stories",
};

/** A family key; unknown sources remain unknown, never promoted to a known outlet. */
export function canonicalPublisherFamily(source: string | Pick<InsightStory,"sourceGroup" | "source" | "sourceDistributionType"> | null | undefined): string {
  const raw = typeof source === "string" ? source : (source?.sourceGroup || source?.source || "");
  const key = String(raw).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  // Regional acquisition lanes are still Google News wrappers, not outlets.
  if (/^(?:google_news|googlenews)(?:_|$)/.test(key)) return "google_news";
  return FAMILY_ALIASES[key] || key || "unknown_source";
}

export function isVerifiedPublisherFamily(story: Pick<InsightStory,"sourceGroup" | "source" | "sourceDistributionType">): boolean {
  const key = canonicalPublisherFamily(story);
  return key !== "google_news" && key !== "unknown_source" && story.sourceDistributionType !== "aggregator";
}

/** Evidence credit, not acquisition identity or a new authority-tier registry.
 * Explicit agency credit is one reporting origin across different republishers.
 * Unattributed wrappers and generic unknown labels do not establish independence.
 */
export function publisherEvidenceFamily(story: InsightStory): string | null {
  const family = canonicalPublisherFamily(story);
  const raw = story as any;
  const credit = String(raw.byline || raw.wireOrigin || raw.originalPublisher || raw.storySignals?.wireOrigin || "").trim();
  const agency = /^(?:by\s+)?(Reuters|Associated Press|AP|PTI|Press Trust of India|ANI|AFP|Agence France-Presse)$/i;
  const match = credit.match(agency) || String(story.summary || "").match(/^\s*(?:by\s+)?(Reuters|Associated Press|AP|PTI|Press Trust of India|ANI|AFP|Agence France-Presse)\s*[-–—:|]/i);
  if (match) {
    const origin = canonicalPublisherFamily(match[1]);
    return origin === "press_trust_of_india" ? "pti" : origin === "agence_france_presse" ? "afp" : origin;
  }
  if (!isVerifiedPublisherFamily(story) || /^(unknown(?:_source)?|source|publisher|unattributed|unknown_.*)$/.test(family)) return null;
  if (/\b(?:same wire report|unattributed wire report|no independently gathered facts)\b/i.test(story.summary || "")) return null;
  // NDTV's business feed is not a separate publisher family from NDTV.
  return family === "ndtv_profit" ? "ndtv" : family;
}

export function countPublisherEvidenceFamilies(stories: InsightStory[]): number {
  return new Set(stories.map(publisherEvidenceFamily).filter(Boolean)).size;
}
