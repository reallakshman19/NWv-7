import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSectionsDataSource,
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
});

describe('Sections data source preference', () => {
  it('defaults safely to GitHub/static', () => {
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
  });

  it('persists only the explicit Cloudflare Preview choice', () => {
    const localStorage = storage();
    vi.stubGlobal('localStorage', localStorage);

    expect(setSectionsDataSource(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW))
      .toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);

    expect(setSectionsDataSource('unexpected'))
      .toBe(SECTIONS_DATA_SOURCES.GITHUB);
    expect(getSectionsDataSource()).toBe(SECTIONS_DATA_SOURCES.GITHUB);
  });
});
