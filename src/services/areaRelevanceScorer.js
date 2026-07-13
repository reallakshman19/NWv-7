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
      'chennai port',
      'marina',
      'egmore',
      'central station',
    ],
    city: ['chennai', 'madras'],
    institutions: ['greater chennai corporation', 'chennai corporation', 'metro rail', 'chennai metro', 'cmrl', 'gcc'],
    stateRegion: ['tamil nadu', 'tamilnadu', 'tn'],
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
    city: ['muscat', 'masqat', 'maskat'],
    stateRegion: ['muscat governorate'],
    country: ['oman', 'omani', 'royal oman police'],
    regionalBackfill: ['gulf', 'hormuz', 'iran', 'middle east', 'regional'],
    offArea: ['dubai', 'abu dhabi', 'doha', 'riyadh', 'kuwait city'],
  }),
});

const FIELD_WEIGHTS = Object.freeze({
  title: 1,
  headline: 1,
  summary: 0.78,
  description: 0.78,
  source: 0.45,
  sourceGroup: 0.45,
  section: 0.35,
  city: 1,
  country: 0.65,
  location: 0.95,
  url: 0.4,
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
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
  return Object.entries(FIELD_WEIGHTS)
    .map(([field, weight]) => ({
      field,
      weight,
      value: normalize(story?.[field]),
    }))
    .filter(row => row.value);
}

function hasTerm(fieldValue, normalizedTerm) {
  if (!fieldValue || !normalizedTerm) return false;
  const padded = ` ${fieldValue} `;
  const term = ` ${normalizedTerm} `;
  return padded.includes(term);
}

function collectMatches(fields, terms, category, baseScore) {
  const matches = [];

  for (const rawTerm of terms || []) {
    const term = normalize(rawTerm);
    if (!term) continue;

    for (const row of fields) {
      if (!hasTerm(row.value, term)) continue;
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
  const categories = new Set(asArray(evidence.categories));
  const hasStrongLocalEvidence =
    categories.has('exact-area') ||
    categories.has('city') ||
    categories.has('institution') ||
    categories.has('state-region') ||
    categories.has('country');

  if (categories.has('off-area') && !categories.has('exact-area') && !categories.has('city')) return 'off-area';
  if (categories.has('exact-area') || score >= 86) return 'exact-area';
  if (categories.has('city') || categories.has('institution') || score >= 70) return 'city';
  if (categories.has('state-region') || score >= 48) return 'state-region';
  if (categories.has('regional-backfill') && !hasStrongLocalEvidence) return 'backfill';
  if (categories.has('country') || score >= 28) return 'country';
  if (categories.has('regional-backfill') || score >= 14) return 'backfill';
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
  const categories = uniqueStrings(matches.map(match => match.category));
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
  if (matches.length === 0) reasons.push('no_area_evidence');
  if (score > 0 && !['exact-area', 'city'].includes(label)) reasons.push('not_exact_local');

  return {
    target: config.target,
    score,
    label: matches.length === 0 && offAreaMatches.length > 0 ? 'off-area' : label,
    matchedTerms: evidence.matchedTerms,
    matchedFields: evidence.matchedFields,
    sourceEvidence: evidence.sourceEvidence,
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
      const rankDelta = areaSortRank(a.story._areaRelevance.label) - areaSortRank(b.story._areaRelevance.label);
      if (rankDelta !== 0) return rankDelta;
      const scoreDelta = b.story._areaRelevance.score - a.story._areaRelevance.score;
      if (scoreDelta !== 0) return scoreDelta;
      return a.index - b.index;
    })
    .map(item => item.story);
}
