const AREA_RELEVANCE_VERSION = 'area-relevance-v1';

const TARGETS = Object.freeze({
  chennai: Object.freeze({
    target: 'chennai',
    exactArea: [
      'greater chennai',
      'gcc',
      'cmrl',
      'omr',
      'ecr',
      'adyar',
      'velachery',
      'tambaram',
      'anna nagar',
      'tnagar',
      't nagar',
      'mylapore',
      'guindy',
      'porur',
      'ambattur',
      'avadi',
      'perambur',
      'chromepet',
      'pallavaram',
      'chennai airport',
      'airport',
      'kodungaiyur',
      'chennai port',
      'marina',
      'egmore',
      'central station',
    ],
    city: ['chennai', 'madras', 'சென்னை'],
    institutions: ['greater chennai corporation', 'chennai corporation', 'metro rail', 'chennai metro', 'cmrl', 'gcc'],
    stateRegion: ['tamil nadu', 'tamilnadu', 'tn', 'தமிழ்நாடு', 'madurai', 'sriperumbudur'],
    country: ['india', 'indian'],
    offArea: ['mumbai', 'delhi', 'bengaluru', 'bangalore', 'hyderabad', 'kerala', 'karnataka'],
  }),
  muscat: Object.freeze({
    target: 'muscat',
    exactArea: [
      'muttrah',
      'matrah',
      'ruwi',
      'seeb',
      'al seeb',
      'qurum',
      'al khuwair',
      'ghubra',
      'ghala',
      'azaiba',
      'bawshar',
      'bausher',
      'amerat',
      'al amerat',
      'mabela',
      'mawalah',
      'muscat municipality',
      'royal oman police muscat',
      'port sultan qaboos',
      'oman airports',
    ],
    city: ['muscat', 'masqat', 'maskat', 'مسقط'],
    stateRegion: ['muscat governorate'],
    country: ['oman', 'omani', 'royal oman police', 'عمان', 'dhofar', 'salalah', 'nizwa', 'sohar', 'duqm', 'ibra'],
    regionalBackfill: ['gulf', 'hormuz', 'iran', 'middle east', 'regional'],
    offArea: ['dubai', 'abu dhabi', 'doha', 'riyadh', 'kuwait city'],
  }),
});

const FIELD_WEIGHTS = Object.freeze({
  title: 1,
  headline: 1,
  summary: 0.78,
  description: 0.78,
  // Acquisition metadata is not admissible evidence of event geography.
  city: 1,
  country: 0.65,
  location: 0.95,
  // Publisher URLs and feed lanes cannot establish an event location.
});

const AMBIGUOUS_CHENNAI_TERMS = new Set(['gcc', 'omr', 'ecr', 'airport', 'marina', 'central station']);
const CHENNAI_CONTEXT = [
  ...TARGETS.chennai.city,
  ...TARGETS.chennai.exactArea.filter(term => !AMBIGUOUS_CHENNAI_TERMS.has(term)),
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTarget(target) {
  const value = normalize(target);
  if (['chennai', 'tamilnadu', 'tamil nadu', 'tn'].includes(value)) return 'chennai';
  if (['muscat', 'local', 'oman', 'masqat', 'maskat'].includes(value)) return 'muscat';
  return value;
}

function storyFields(story = {}) {
  // Normalized snapshots mirror title/headline and summary/description. A copy
  // of the same words is not a second independent event-location observation.
  const seenText = new Set();
  return Object.entries(FIELD_WEIGHTS)
    .map(([field, weight]) => ({
      field,
      weight,
      value: normalize(story?.[field]),
    }))
    .filter(row => {
      if (!row.value) return false;
      if (['title', 'headline', 'summary', 'description'].includes(row.field)) {
        if (seenText.has(row.value)) return false;
        seenText.add(row.value);
      }
      return true;
    });
}

function hasTerm(fieldValue, normalizedTerm) {
  if (!fieldValue || !normalizedTerm) return false;
  const padded = ` ${fieldValue} `;
  const term = ` ${normalizedTerm} `;
  if (padded.includes(term)) return true;
  // Tamil place-names may carry grammatical suffixes: சென்னை -> சென்னையில்.
  return /[\u0b80-\u0bff]/u.test(normalizedTerm) && fieldValue.split(' ').some(token => token.startsWith(normalizedTerm));
}

function isContextualLocalTerm(term, value) {
  if (term === 'airport') return /(?:^| )(?:chennai|madras|meenambakkam)(?: |$)/.test(value);
  if (AMBIGUOUS_CHENNAI_TERMS.has(term) && !CHENNAI_CONTEXT.some(place => hasTerm(value, place))) return false;
  if (term === 'gcc') return !/(?:gulf cooperation council|gcc summit|gcc leaders|gcc ministers)/.test(value)
    && /(?:^| )(?:corporation|municipal|civic|cmrl|tender|flyover|road|traffic|water)(?: |$)/.test(value);
  if (term === 'omr') return !/(?:^| )(?:omr \p{Nd}+|\p{Nd}+ omr)(?: |$)/u.test(value)
    && /(?:^| )(?:road|route|metro|traffic|junction|corridor|transport|sholinganallur|cmrl)(?: |$)/.test(value);
  return true;
}

function collectMatches(fields, terms, category, baseScore) {
  const matches = [];

  for (const rawTerm of terms || []) {
    const term = normalize(rawTerm);
    if (!term) continue;

    for (const row of fields) {
      if (!hasTerm(row.value, term) || !isContextualLocalTerm(term, row.value)) continue;
      matches.push({
        term: rawTerm,
        normalizedTerm: term,
        field: row.field,
        category,
        score: baseScore * row.weight,
      });
    }
  }

  return matches;
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function evidenceFromMatches(matches) {
  return {
    matchedTerms: uniqueStrings(matches.map(match => match.term)),
    matchedFields: uniqueStrings(matches.map(match => match.field)),
    sourceEvidence: uniqueStrings(
      matches
        .filter(match => match.field === 'source' || match.field === 'sourceGroup' || match.field === 'section')
        .map(match => `${match.field}:${match.term}`)
    ),
  };
}

export function getAreaRelevanceLabel(score = 0, evidence = {}) {
  void score; // Retain the numeric public API, but labels depend on evidence scope.
  // Scope is a property of the *kind* of event evidence, not the sum of how
  // many times 'Oman' appeared. In particular, 5 country mentions cannot
  // establish Muscat-city or exact-neighbourhood evidence.
  const categories = new Set(asArray(evidence.categories));
  if (categories.has('off-area') && !categories.has('exact-area') && !categories.has('city')) return 'off-area';
  if (categories.has('exact-area')) return 'exact-area';
  if (categories.has('city') || categories.has('institution')) return 'city';
  if (categories.has('state-region')) return 'state-region';
  if (categories.has('country')) return 'country';
  if (categories.has('regional-backfill')) return 'backfill';
  return 'weak';
}

function normalizeScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreAreaRelevance(story = {}, target = '') {
  const targetKey = normalizeTarget(target);
  const config = TARGETS[targetKey];

  if (!config) {
    return {
      target: targetKey || '',
      score: 0,
      label: 'weak',
      matchedTerms: [],
      matchedFields: [],
      sourceEvidence: [],
      reasons: ['unsupported_target'],
      version: AREA_RELEVANCE_VERSION,
    };
  }

  const fields = storyFields(story);
  const matches = [
    ...collectMatches(fields, config.exactArea, 'exact-area', 54),
    ...collectMatches(fields, config.city, 'city', 42),
    ...collectMatches(fields, config.institutions, 'institution', 38),
    ...collectMatches(fields, config.stateRegion, 'state-region', 26),
    ...collectMatches(fields, config.country, 'country', 16),
    ...collectMatches(fields, config.regionalBackfill, 'regional-backfill', 8),
  ];
  const offAreaMatches = collectMatches(fields, config.offArea, 'off-area', 0);
  const categories = uniqueStrings([
    ...matches.map(match => match.category),
    ...(offAreaMatches.length ? ['off-area'] : []),
  ]);
  const rawScore = matches.reduce((sum, match) => sum + match.score, 0);
  const score = normalizeScore(rawScore);
  const evidence = evidenceFromMatches(matches);
  const label = getAreaRelevanceLabel(score, { ...evidence, categories });
  const reasons = [];

  if (categories.includes('exact-area')) reasons.push('exact_area_match');
  if (categories.includes('city')) reasons.push('city_match');
  if (categories.includes('institution')) reasons.push('institution_match');
  if (categories.includes('state-region')) reasons.push('state_region_backfill');
  if (categories.includes('country')) reasons.push('country_backfill');
  if (categories.includes('regional-backfill')) reasons.push('regional_backfill');
  if (offAreaMatches.length > 0 && matches.length === 0) reasons.push('off_area_match_without_target_evidence');
  if (offAreaMatches.length > 0 && matches.length > 0) reasons.push('conflicting_event_locations');
  if (matches.length === 0) reasons.push('no_area_evidence');
  if (score > 0 && !['exact-area', 'city'].includes(label)) reasons.push('not_exact_local');

  return {
    target: config.target,
    score,
    label: matches.length === 0 && offAreaMatches.length > 0 ? 'off-area' : label,
    matchedTerms: evidence.matchedTerms,
    matchedFields: evidence.matchedFields,
    sourceEvidence: evidence.sourceEvidence,
    locationConflict: offAreaMatches.length > 0 && matches.length > 0,
    offAreaTerms: uniqueStrings(offAreaMatches.map(match => match.term)),
    reasons: uniqueStrings(reasons),
    version: AREA_RELEVANCE_VERSION,
  };
}

function areaSortRank(label) {
  return {
    'exact-area': 0,
    city: 1,
    'state-region': 2,
    country: 3,
    backfill: 4,
    weak: 5,
    'off-area': 6,
  }[label] ?? 5;
}

export function applyAreaRelevance(stories = [], target = '') {
  return asArray(stories)
    .map((story, index) => ({
      story: {
        ...story,
        _areaRelevance: scoreAreaRelevance(story, target),
      },
      index,
    }))
    .sort((a, b) => {
      // Keep weak/off-area matches below grounded local coverage. Within the
      // region, public consequence takes precedence over neighbourhood proximity.
      const relevanceTier = story => ['weak', 'off-area'].includes(story._areaRelevance.label) ? 1 : 0;
      const tierDelta = relevanceTier(a.story) - relevanceTier(b.story);
      if (tierDelta !== 0) return tierDelta;
      const impactDelta = Number(b.story._publicImpact?.priority || 0) - Number(a.story._publicImpact?.priority || 0);
      if (impactDelta !== 0) return impactDelta;
      const rankDelta = areaSortRank(a.story._areaRelevance.label) - areaSortRank(b.story._areaRelevance.label);
      if (rankDelta !== 0) return rankDelta;
      const scoreDelta = b.story._areaRelevance.score - a.story._areaRelevance.score;
      if (scoreDelta !== 0) return scoreDelta;
      return a.index - b.index;
    })
    .map(item => item.story);
}
