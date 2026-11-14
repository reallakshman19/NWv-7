import { matchesEntertainmentGuard, hasWord, DEFAULT_RANKING_POLICY } from '../config/rankingPolicy.js';

const ANIMAL = /\b(?:elephants?|tigers?|leopards?|lions?|deer|dolphins?|whales?|turtles?|birds?|wildlife|animals?)\b/i;
const MORTALITY = /\b(?:dead|deaths?|died|die|killed|kills?|carcasses?|mortality)\b/i;
const HUMAN_HARM = /\b(?:people|persons?|man|woman|men|women|villagers?|residents?|children|child|workers?|passengers?|tourists?|farmers?|humans?|police|officers?|soldiers?|troops?)\b.{0,45}\b(?:killed|dead|death|injured|attacked|trampled)\b|\b(?:kills?|killed|killing|injured|attack(?:s|ed|ing)?|tramples?|trampled)\b.{0,35}\b(?:people|persons?|man|woman|men|women|villagers?|residents?|children|workers?|passengers?|farmers?|humans?|police|officers?|soldiers?|troops?)\b/i;
const CONSERVATION = /\b(?:mass (?:deaths?|die[- ]off)|die[- ]off|extinction|poaching (?:ring|network)|wildlife trafficking|habitat loss|conservation (?:policy|law|crisis)|wildlife (?:disease|epidemic)|across (?:\w+\s+){0,3}(?:reserves|forests|states)|multiple (?:reserves|forests|states))\b/i;
const BROAD_REACH = /\b(?:nationwide|national|across india|across the country|pan[- ]india|multiple states|several states|statewide|across (?:the )?state|across tamil nadu|tamil nadu|t\.?n\.? government|state government|supreme court|union cabinet|parliament|central government|rbi|reserve bank|election commission)\b/i;
const NATIONAL_REACH = /\b(?:nationwide|across india|across the country|pan[- ]india|multiple states|several states|supreme court|union cabinet|parliament|central government|rbi|reserve bank|india[-– ](?:us|u\.s\.)|india['’]s)\b/i;
const DISASTER = /\b(?:cyclone|earthquake|tsunami|flood(?:s|ing)?|landslide|wildfire|outbreak|epidemic|pandemic|storm surge)\b/i;
const DANGER_CONTEXT = /\b(?:warning|alert|evacuat\w*|threat|braces?|intensif\w*|rain|coast|boats?|rescue|killed|dead|injur\w*|homes?|residents?|cases?|spreads?|emergency)\b/i;
const PUBLIC_SERVICE = /\b(?:water|power|electricity|schools?|hospitals?|roads?|bridges?|drains?|swd|transport|trains?|rail|metro|buses|commuters?|residents?|public health|biomedical waste|air quality)\b/i;
const CIVIC_HAZARD = /\b(?:alert|warning|closure|closed|outage|disrupt\w*|contaminat\w*|unsafe|broken|open (?:drain|swd)|dumped|sewage|collapsed|collapse|suspend\w*|cancel\w*|toxic|hazard\w*)\b/i;
const POLICY_DOMAIN = /\b(?:stock limits?|paddy|pulses|prices?|tax(?:es)?|tariffs?|subsid(?:y|ies)|pensions?|wages?|education|admissions?|healthcare|health care|employment|labour|labor|land rights|water (?:rights|sharing)|electoral rolls?|voters?|voting|ballots?|budget|spending|regulations?|legislation|law|bill|procurement|scholarship|public funds|sub[- ]plan funds|sanitation)\b/i;
const DECISION = /\b(?:amends?|amended|imposes?|imposed|approves?|approved|passes|passed|enacts?|orders?|ordered|bans?|banned|withdrawn|withdraws?|cuts?|raises?|hikes?|limits?|cleared|announces?|announced|sets?|changes?|reforms?)\b/i;
const ACCOUNTABILITY = /\b(?:probe|investigat\w*|corruption|scam|irregularities|audit|transparency|missing|exclusion|rights|court|tribal|cauvery|mekedatu)\b/i;
const SYSTEMIC_ECONOMY = /\b(?:trade (?:deal|agreement|negotiations)|inflation|recession|poverty|unemployment|interest rates?|milk prices?|air passenger traffic|banking crisis|economic growth)\b/i;
const ROUTINE_FEATURE = /\b(?:readers write|diary|celebrat\w*|greeting cards?|sweet pongal|cakes?|exhibition|artworks?|music(?:al)?|earthen lamps?|charity|gift a toy|opens? (?:\w+\s+){0,3}centre|mourn\w*|tribute|visionary leader|should be named|naming (?:row|demand))\b/i;
const HEALTH_HAZARD = /\b(?:air quality|air pollution|smog|aqi|toxic exposure|public health)\b/i;
const HEALTH_SEVERITY = /\b(?:severe|hazardous|dangerous|toxic|emergency|critical)\b/i;
const HEALTH_RESPONSE = /\b(?:schools? (?:close[ds]?|shut)|(?:closures?|restrictions?|health warning|health alert|respiratory cases|hospital admissions)|stay indoors|emergency measures)\b/i;
const VACCINATION_ACTION = /\b(?:launch(?:es|ed)?|begin[sn]?|starts?|rolls? out|expands?)\b.{0,65}\b(?:vaccination|immunisation|immunization|vaccine)\b.{0,25}\b(?:drive|campaign|rollout|programme|program)\b/i;
const SECURITY_ATTACK = /\b(?:(?:terror(?:ist)?|militant|insurgent) attacks?|terrorism|bombing)\b/i;
const FICTION_CONTEXT = /\b(?:fictional|(?:film|movie) (?:review|trailer|depicts|recreates|portrays)|terror thriller|(?:new|upcoming) (?:film|movie)|in (?:the|a) (?:movie|film))\b/i;

function plainText(value) {
    return String(value || '').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ')
        .replace(/&(?:amp|nbsp|quot|#39);/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Contextual public consequences for India/state feeds. Geography establishes
 * reach only after an event qualifies; a place, trusted source, or harm word
 * alone cannot establish importance. These are ranking signals, never filters.
 */
export function assessPublicImpact(title, description = '') {
    const headline = plainText(title);
    const text = `${headline} ${plainText(description)}`;
    const national = NATIONAL_REACH.test(text);
    const broad = national || BROAD_REACH.test(text);
    const scope = national ? 'national' : broad ? 'state' : 'local';
    const animalMortality = ANIMAL.test(headline) && MORTALITY.test(headline);
    const conservation = animalMortality && CONSERVATION.test(text);
    const humanHarm = HUMAN_HARM.test(text);
    const disaster = DISASTER.test(headline) && DANGER_CONTEXT.test(text);
    const civicAlert = PUBLIC_SERVICE.test(text) && CIVIC_HAZARD.test(headline);
    const incidentalAnimalMortality = animalMortality && !conservation && !humanHarm && !civicAlert && !disaster;
    const result = (priority, kind, evidence) => ({
        priority,
        kind,
        scope,
        multiplier: [0.6, 0.95, 1.5, 2.2][priority],
        incidentalAnimalMortality,
        evidence,
    });

    if (incidentalAnimalMortality) return result(0, 'limited_wildlife_incident', ['animal mortality without systemic conservation or public danger']);
    if (conservation) return result(broad ? 3 : 2, 'conservation', ['wildlife mortality with systemic conservation consequences']);

    // Features can describe a metaphorical "war zone" or a minister's visit.
    // A separate live hazard or substantive policy still takes precedence.
    if (disaster) return result(3, 'disaster', ['hazard with warning, affected public, or response']);
    if (HEALTH_HAZARD.test(headline) && HEALTH_SEVERITY.test(text) && HEALTH_RESPONSE.test(text)) {
        return result(3, 'public_health', ['severe public-health hazard with closures, restrictions, or health response']);
    }
    const awarenessOnly = /\b(?:awareness|anniversary|feature|poster|essay)\b/i.test(headline)
        && !/\b(?:administer\w*|doses?|vaccinat(?:ed|ing))\b/i.test(text);
    if (broad && VACCINATION_ACTION.test(headline) && !awarenessOnly) {
        return result(3, 'public_health', ['statewide or national vaccination programme launched or expanded']);
    }
    if (SECURITY_ATTACK.test(headline) && humanHarm && !FICTION_CONTEXT.test(text) && !matchesEntertainmentGuard(text)) {
        return result(3, 'public_security', ['terror or insurgent attack with reported harm to people or security personnel']);
    }
    if (civicAlert) return result(broad ? 3 : 2, 'civic_alert', ['public service with concrete hazard or disruption']);

    const massHarm = /\b(?:[5-9]|[1-9]\d+|five|six|seven|eight|nine|ten|eleven|twelve|dozens|scores|hundreds)\b.{0,30}\b(?:killed|dead|deaths?|injured|toll)\b|\b(?:toll (?:rises|climbs|increases) to|kills?)\s+(?:[5-9]|[1-9]\d+|dozens|scores|hundreds)\b/i.test(headline);
    const transportCrash = /\b(?:collision|crash|derail\w*|stampede|explosion|blast|shooting)\b/i.test(headline);
    if ((massHarm && !animalMortality) || (transportCrash && /\b(?:train|bus|minibus|passengers?|crowd|airport)\b/i.test(text))) {
        return result(3, 'public_safety', ['mass harm or public transport emergency']);
    }
    if (humanHarm && animalMortality) return result(2, 'public_safety', ['wildlife incident with harm to people']);

    if (ROUTINE_FEATURE.test(headline)) return result(0, 'routine_feature', ['feature, ceremony, or personal-interest coverage']);
    if (POLICY_DOMAIN.test(text) && DECISION.test(headline)) {
        return result(broad ? 3 : 2, 'policy_decision', ['substantive decision affecting public services, rights, or household costs']);
    }
    if (SYSTEMIC_ECONOMY.test(headline)) return result(broad ? 3 : 2, 'systemic_economy', ['economy, trade, or household price consequences']);
    if (POLICY_DOMAIN.test(text) && ACCOUNTABILITY.test(headline)) {
        const concreteFinding = /\b(?:probe|investigat\w*|corruption|scam|irregularities|missing|exclusion)\b/i.test(headline);
        return result(broad && concreteFinding ? 3 : 2, 'public_accountability', ['public rights, funds, or institutional accountability']);
    }
    if (/\b(?:cauvery|mekedatu|electoral rolls?|voters? missing|ceasefire|border clashes|insurgent|rebels?|security forces)\b/i.test(text)) {
        return result(2, 'public_affairs', ['water rights, electoral rights, or public security dispute']);
    }
    if (humanHarm || MORTALITY.test(headline) || /\b(?:arrest\w*|burgl\w*|rob(?:s|bery|bed)|cheating|fraud|potholes?|maintenance|inspects?|funds?|scholarship|counselling)\b/i.test(text)) {
        return result(1, 'limited_public_impact', ['bounded local incident or civic concern']);
    }
    return result(0, 'routine_or_unqualified', ['no concrete broad public consequence established']);
}

/**
 * Calculates a bounded impact score from geographic scale and magnitude.
 * Keyword matches are retained only as explainability evidence; a single word
 * must never create a direct multiplicative ranking boost.
 */
export function calculateImpactScore(title, description, settings) {
    void settings;
    const text = `${plainText(title)} ${plainText(description)}`;

    // 1. Scale Detection — uses policy geoScale lexicon.
    const scale = DEFAULT_RANKING_POLICY.geoScale;
    const scaleScore = scale.global.some(term => hasWord(text, term)) ? 1.5
        : scale.national.some(term => hasWord(text, term)) ? 1.3
        : scale.regional.some(term => hasWord(text, term)) ? 1.1 : 1;

    // 2. Magnitude Detection (Population/Financial Impact).
    let magnitudeScore = 1.0;
    const textLow = text.toLowerCase();

    if (/\b(billions?|trillions?)\b/.test(textLow)) {
        magnitudeScore = 1.5;
    } else if (/\b(millions?|lakhs?|crores?)\b/.test(textLow)) {
        magnitudeScore = 1.3;
    } else if (/\b(thousands?|hundreds of thousands?)\b/.test(textLow)) {
        magnitudeScore = 1.1;
    }

    // 3. High-impact words are evidence only. Event qualification and Top
    // Stories eligibility are handled by the contextual Top Stories ranker.
    const decisions = [];
    const guarded = matchesEntertainmentGuard(text);

    for (const entry of DEFAULT_RANKING_POLICY.highImpactKeywords) {
        const term = (entry.term || '').toLowerCase();
        if (!term) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`\\b${escaped}\\b`, 'i').test(text)) continue;

        decisions.push(
            guarded
                ? `keyword '${term}' suppressed: entertainment guard`
                : `keyword evidence '${term}' (no direct multiplier)`
        );
        break;
    }

    calculateImpactScore._lastDecisions = [...new Set(decisions)];
    return scaleScore * magnitudeScore;
}
