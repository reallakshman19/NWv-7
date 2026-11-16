import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredSectionsAuthority,
  getSectionsDataSource,
  isSectionsSourceOverrideEnabled,
  SECTIONS_DATA_SOURCES,
  setSectionsDataSource,
} from './sectionsDataSource.js';

function storage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) || null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Sections serving authority', () => {
  it('defaults safely to GitHub/static when no authority is configured', () => {
    expect(getConfiguredSectionsAuthority()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
  });

  it('uses Cloudflare as the configured authority only when its HTTPS endpoint exists', () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://sections.example/preview/sections/latest');

    expect(getConfiguredSectionsAuthority()).toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
  });

  it('does not let local storage override production authority unless explicitly enabled', () => {
    const localStorage = storage();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://sections.example/preview/sections/latest');

    expect(isSectionsSourceOverrideEnabled()).toBe(false);
    expect(setSectionsDataSource(SECTIONS_DATA_SOURCES.GITHUB))
      .toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('permits an explicit developer override only when the build enables it', () => {
    const localStorage = storage();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://sections.example/preview/sections/latest');
    vi.stubEnv('VITE_SECTIONS_ALLOW_SOURCE_OVERRIDE', 'true');

    expect(setSectionsDataSource(SECTIONS_DATA_SOURCES.GITHUB)).toBe(SECTIONS_DATA_SOURCES.GITHUB);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
  });
  it('does not allow a production build to promote Cloudflare through environment flags', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://sections.example/preview/sections/latest');
    vi.stubEnv('VITE_SECTIONS_ALLOW_SOURCE_OVERRIDE', 'true');
    const localStorage = storage();
    localStorage.setItem('nw_sections_data_source', SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    vi.stubGlobal('localStorage', localStorage);

    expect(getConfiguredSectionsAuthority()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
    expect(isSectionsSourceOverrideEnabled()).toBe(false);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
    expect(setSectionsDataSource(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW))
      .toBe(SECTIONS_DATA_SOURCES.GITHUB);
  });

});
