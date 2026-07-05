export function normalizeDatasetPolicy(policy) {
  const supported = new Set(['smart', 'refresh-now', 'developer-live', 'offline', 'legacy']);
  return supported.has(policy) ? policy : 'legacy';
}
