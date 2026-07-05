const SUPPORTED_POLICIES = new Set([
  'smart',
  'refresh-now',
  'developer-live',
  'offline',
  'legacy',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeDatasetPolicy(policy) {
  return SUPPORTED_POLICIES.has(policy) ? policy : 'legacy';
}

export function normalizeAsOfDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' ? value : null;
}

export function normalizeDatasetOptions(options = {}, context = {}) {
  const raw = options === true ? { forceRefresh: true } : (isPlainObject(options) ? options : {});
  const liveMode = Boolean(context.liveMode);
  const explicitPolicy = typeof raw.policy === 'string' && raw.policy.length > 0;
  const policy = normalizeDatasetPolicy(
    explicitPolicy ? raw.policy : (liveMode ? 'developer-live' : 'legacy')
  );

  return {
    forceRefresh: Boolean(raw.forceRefresh) || options === true || liveMode,
    liveOnly: Boolean(raw.liveOnly),
    includeInsight: Boolean(raw.includeInsight),
    policy,
    asOfDate: normalizeAsOfDate(raw.asOfDate),
  };
}

export function mergeDatasetOptions(baseOptions = {}, reloadOptions = {}) {
  const base = isPlainObject(baseOptions) ? baseOptions : {};
  if (typeof reloadOptions === 'boolean') {
    return { ...base, forceRefresh: reloadOptions };
  }
  return isPlainObject(reloadOptions) ? { ...base, ...reloadOptions } : base;
}

export function reusableDatasetOptions(options) {
  return { ...options, forceRefresh: false };
}

export function getAsOfDateCacheValue(value) {
  const normalized = normalizeAsOfDate(value);
  return normalized === null ? '' : String(normalized);
}

export function buildDatasetCacheKey(datasetId, options) {
  const reusable = reusableDatasetOptions(options);
  const asOfDate = getAsOfDateCacheValue(reusable.asOfDate);
  const isLegacyDefault = reusable.policy === 'legacy'
    && !reusable.liveOnly
    && !reusable.includeInsight
    && !asOfDate;

  if (isLegacyDefault) return datasetId;

  return [
    datasetId,
    `policy=${reusable.policy}`,
    `liveOnly=${reusable.liveOnly ? '1' : '0'}`,
    `includeInsight=${reusable.includeInsight ? '1' : '0'}`,
    `asOfDate=${encodeURIComponent(asOfDate)}`,
  ].join('|');
}
