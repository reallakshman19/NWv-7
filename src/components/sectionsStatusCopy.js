import { SECTIONS_DATA_SOURCES } from '../utils/sectionsDataSource.js';

function readableFallbackReason(value) {
  const reason = String(value || '').trim();
  if (!reason) return 'unknown reason';
  if (reason === 'preview_snapshot_unusable') return 'preview snapshot stale/incomplete';
  if (reason === 'github_snapshot_unusable') return 'GitHub snapshot stale, empty or invalid';
  if (reason === 'snapshot-budget-exceeded') return 'preview request timed out';
  if (reason === 'preview_not_configured') return 'preview not configured';
  if (/HTTP\s+503/i.test(reason)) return 'preview service unavailable';
  return reason.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function statusCopy(source, runtimeStatus, previewConfigured) {
  // A verified failed attempt must outrank the preferred authority selection.
  if (runtimeStatus?.effective === 'unavailable' || runtimeStatus?.failed) {
    const scope = source === SECTIONS_DATA_SOURCES.GITHUB
      ? 'GitHub Sections unavailable'
      : 'Sections authorities unavailable';
    const lastGood = runtimeStatus.lastSuccessfulAt
      ? ' · last good ' + new Date(runtimeStatus.lastSuccessfulAt).toISOString()
      : '';
    return scope + ' · ' + readableFallbackReason(runtimeStatus.fallbackReason) + lastGood;
  }
  if (source === SECTIONS_DATA_SOURCES.GITHUB) return 'GitHub static authority';
  if (!previewConfigured) return 'Preview endpoint is not configured';
  if (runtimeStatus?.fallback) {
    return `Cloudflare authority fallback · ${readableFallbackReason(runtimeStatus.fallbackReason)} · showing GitHub`;
  }
  if (runtimeStatus?.effective === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW) {
    return 'Cloudflare authority active · committed epoch';
  }
  return 'Cloudflare authority selected · GitHub fallback stays on';
}
