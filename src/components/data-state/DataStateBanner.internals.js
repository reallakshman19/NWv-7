export function getBannerTone({ envelope, error, loading }) {
  if (loading) return 'neutral';
  if (error || envelope?.ok === false || envelope?.validation?.passed === false) return 'danger';
  if (envelope?.validation?.passed !== true) return 'warning';
  if (envelope?.slo?.passed === false) return 'warning';
  if (['stale', 'expired', 'unknown'].includes(envelope?.freshness)) return 'warning';
  if (envelope?.fallbackUsed) return 'warning';
  if (envelope?.freshness === 'empty') return 'muted';

  return 'positive';
}

export function getBannerMessage({ envelope, error, loading, label = 'Data' }) {
  if (loading) return `${label} is loading…`;
  if (error) return `${label} failed to load.`;
  if (envelope?.ok === false) return envelope?.error || `${label} is degraded.`;
  if (envelope?.validation?.passed === false) return `${label} validation failed; content may be retained.`;
  if (envelope?.validation?.passed !== true) return `${label} validation has not been evaluated; retained content is not a verified provider result.`;
  if (envelope?.slo?.passed === false) return `${label} quality check failed; content may be retained.`;
  if (envelope?.freshness === 'stale' || envelope?.freshness === 'expired') return `${label} is stale; retained content is not a fresh provider result.`;
  if (envelope?.freshness === 'unknown') return `${label} freshness has not been verified.`;
  if (envelope?.fallbackUsed) return `${label} is using fallback data.`;
  if (envelope?.freshness === 'empty') return `${label} has no visible items.`;

  return `${label} is ready.`;
}

export const __dataStateBannerInternalsForTest = {
  getBannerTone,
  getBannerMessage,
};
