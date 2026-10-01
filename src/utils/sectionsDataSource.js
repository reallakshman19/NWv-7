import { PRODUCTION_RUNTIME_ENDPOINTS } from '../config/runtimeEndpoints.js';

export const SECTIONS_DATA_SOURCES = Object.freeze({
  GITHUB: 'github_static',
  CLOUDFLARE_PREVIEW: 'cloudflare_preview',
});

export const SECTIONS_DATA_SOURCE_STATUS_EVENT = 'nw:sections-data-source-status';

const STORAGE_KEY = 'nw_sections_data_source';
let lastRuntimeStatus = null;

function normalizeSource(value, fallback = SECTIONS_DATA_SOURCES.GITHUB) {
  if (value === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW) {
    return SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW;
  }
  if (value === SECTIONS_DATA_SOURCES.GITHUB) {
    return SECTIONS_DATA_SOURCES.GITHUB;
  }
  return fallback;
}

export function getCloudflareSectionsPreviewUrl() {
  const configured = String(
    import.meta.env.VITE_SECTIONS_AUTHORITY_URL ||
    import.meta.env.VITE_SECTIONS_CLOUDFLARE_PREVIEW_URL ||
    ''
  ).trim();
  if (configured) return configured;
  return import.meta.env.PROD ? PRODUCTION_RUNTIME_ENDPOINTS.sectionsAuthorityUrl : '';
}

export function isCloudflareSectionsPreviewConfigured() {
  return /^https:\/\//i.test(getCloudflareSectionsPreviewUrl());
}

export function getConfiguredSectionsAuthority() {
  const configured = String(
    import.meta.env.VITE_SECTIONS_AUTHORITY ||
    (import.meta.env.PROD ? PRODUCTION_RUNTIME_ENDPOINTS.sectionsAuthority : '')
  ).trim().toLowerCase();
  if (configured === 'cloudflare' && isCloudflareSectionsPreviewConfigured()) {
    return SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW;
  }
  return SECTIONS_DATA_SOURCES.GITHUB;
}

export function isSectionsSourceOverrideEnabled() {
  return String(import.meta.env.VITE_SECTIONS_ALLOW_SOURCE_OVERRIDE || '').trim().toLowerCase() === 'true';
}

export function getSectionsDataSource() {
  const authority = getConfiguredSectionsAuthority();
  if (!isSectionsSourceOverrideEnabled() || typeof localStorage === 'undefined') return authority;
  try {
    return normalizeSource(localStorage.getItem(STORAGE_KEY), authority);
  } catch {
    return authority;
  }
}

export function setSectionsDataSource(value) {
  const authority = getConfiguredSectionsAuthority();
  if (!isSectionsSourceOverrideEnabled()) return authority;
  const source = normalizeSource(value, authority);
  if (typeof localStorage === 'undefined') return source;
  try {
    localStorage.setItem(STORAGE_KEY, source);
  } catch (error) {
    console.warn('[SectionsDataSource] Preference could not be saved', {
      message: error?.message || String(error),
    });
  }
  return source;
}

export function publishSectionsDataSourceStatus(status) {
  lastRuntimeStatus = status && typeof status === 'object' ? { ...status } : null;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(SECTIONS_DATA_SOURCE_STATUS_EVENT, {
    detail: lastRuntimeStatus,
  }));
}

export function getSectionsDataSourceRuntimeStatus() {
  return lastRuntimeStatus ? { ...lastRuntimeStatus } : null;
}

export const __sectionsDataSourceInternalsForTest = {
  STORAGE_KEY,
  normalizeSource,
};
