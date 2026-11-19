/** Named diplomatic meeting identity only: no angle or independence credit. */
type MeetingEvidence = { title: string; publishedAt: number; entities?: { orgs?: string[] } };
const FRAMING = new Set((
  'the this that what why how on in at to for and of with from before after today tomorrow yesterday '
  + 'live updates news explained historic leaders leader president prime minister summit meeting meet '
  + 'trilateral bilateral talks agenda world global china india russia united states kingdom france '
  + 'people public officials teachers students parents companies business technology discuss discusses '
  + 'germany italy japan canada brazil oman new delhi london washington beijing shenzhen tokyo paris '
  + 'november october december january february march april may june july august september'
).split(' '));
const MEETING = /\b(?:summit|trilateral|bilateral|meet|meeting)\b/i;
const VENUES: Record<string, string> = {
  shenzhen: 'china', beijing: 'china', china: 'china', tokyo: 'japan', japan: 'japan',
  paris: 'france', france: 'france', delhi: 'india', 'new delhi': 'india', india: 'india',
  washington: 'us', 'united states': 'us', london: 'uk', 'united kingdom': 'uk',
  russia: 'russia', germany: 'germany', italy: 'italy', canada: 'canada', brazil: 'brazil', oman: 'oman',
};
function names(story: MeetingEvidence): Set<string> {
  const organizations = new Set((story.entities?.orgs || []).filter(name => !/\s/.test(name)).map(name => name.toLowerCase()));
  return new Set((story.title.slice(0, 500).match(/\b[A-Z][a-z]+\b/g) || [])
    .map(word => word.toLowerCase()).filter(word => !FRAMING.has(word) && !organizations.has(word)));
}
function venue(title: string): string | undefined {
  const match = title.match(/\b(?:in|at)\s+(New Delhi|United States|United Kingdom|Shenzhen|Beijing|China|Tokyo|Japan|Paris|France|Delhi|India|Washington|London|Russia|Germany|Italy|Canada|Brazil|Oman)\b/i);
  return match ? VENUES[match[1].toLowerCase()] : undefined;
}
export function hasSharedMeetingIdentity(a: MeetingEvidence, b: MeetingEvidence): boolean {
  if (!MEETING.test(a.title) || !MEETING.test(b.title)
    || !Number.isFinite(a.publishedAt) || !Number.isFinite(b.publishedAt)
    || Math.abs(a.publishedAt - b.publishedAt) >= 36 * 3_600_000) return false;
  if (!/\b(?:trilateral|bilateral|APEC|G20|G7|BRICS|SCO|NATO|ASEAN|UNGA)\b/i.test(`${a.title} ${b.title}`)) return false;
  const family = (text: string) => text.match(/\b(?:APEC|G20|G7|BRICS|SCO|NATO|ASEAN|UNGA)\b/i)?.[0].toLowerCase();
  const first = family(a.title), second = family(b.title);
  if (first && second && first !== second) return false;
  const aVenue = venue(a.title), bVenue = venue(b.title);
  if (aVenue && bVenue && aVenue !== bVenue) return false;
  const date = (text: string) => text.match(/\b(?:on|dated)\s+(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  const aDate = date(a.title), bDate = date(b.title);
  if (aDate && bDate && aDate !== bDate) return false;
  const aNames = names(a), bNames = names(b);
  // Countries, venues, framing and a single common official cannot establish
  // an occurrence. Require three actual shared headline names, in any order.
  return [...aNames].filter(name => bNames.has(name)).length >= 3;
}
