export const SECTIONS_DATA_SOURCES = Object.freeze({
  GITHUB: 'github_static',
  CLOUDFLARE_PREVIEW: 'cloudflare_preview',
});

export const SECTIONS_DATA_SOURCE_STATUS_EVENT = 'nw:sections-data-source-status';

const STORAGE_KEY = 'nw_sections_data_source';
let lastRuntimeStatus = null;

function normalizeSource(value) {
  return value === SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW
    ? SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW
    : SECTIONS_DATA_SOURCES.GITHUB;
}

export function getSectionsDataSource() {
  if (typeof localStorage === 'undefined') return SECTIONS_DATA_SOURCES.GITHUB;
  try {
    return normalizeSource(localStorage.getItem(STORAGE_KEY));
  } catch {
    return SECTIONS_DATA_SOURCES.GITHUB;
  }
}

export function setSectionsDataSource(value) {
  const source = normalizeSource(value);
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

export function getCloudflareSectionsPreviewUrl() {
  return String(import.meta.env.VITE_SECTIONS_CLOUDFLARE_PREVIEW_URL || '').trim();
}

export function isCloudflareSectionsPreviewConfigured() {
  return /^https:\/\//i.test(getCloudflareSectionsPreviewUrl());
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
