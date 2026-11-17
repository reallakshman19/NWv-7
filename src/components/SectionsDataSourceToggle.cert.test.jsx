// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SectionsDataSourceToggle from './SectionsDataSourceToggle.jsx';
import { statusCopy } from './sectionsStatusCopy.js';
import {
  SECTIONS_DATA_SOURCES,
  publishSectionsDataSourceStatus,
  setSectionsDataSource,
} from '../utils/sectionsDataSource.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  publishSectionsDataSourceStatus(null);
  vi.unstubAllEnvs();
});

describe('Sections authority UI', () => {
  it('shows production authority as status-only when source overrides are disabled', () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    render(<SectionsDataSourceToggle />);

    expect(screen.getByText('Sections authority')).toBeTruthy();
    expect(screen.getByText('Cloudflare authority selected · GitHub fallback stays on')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'GitHub' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cloudflare.*Preview/i })).toBeNull();
  });

  it('exposes source buttons only in an explicitly enabled developer override build', () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    vi.stubEnv('VITE_SECTIONS_ALLOW_SOURCE_OVERRIDE', 'true');
    setSectionsDataSource(SECTIONS_DATA_SOURCES.GITHUB);
    render(<SectionsDataSourceToggle />);

    expect(screen.getByRole('button', { name: 'GitHub' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Cloudflare.*Preview/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('GitHub static authority')).toBeTruthy();
  });
  it('shows total outage ahead of selected source in the real React status control', () => {
    vi.stubEnv('VITE_SECTIONS_AUTHORITY', 'cloudflare');
    vi.stubEnv('VITE_SECTIONS_AUTHORITY_URL', 'https://preview.example/preview/sections/latest');
    render(<SectionsDataSourceToggle />);
    act(() => publishSectionsDataSourceStatus({
      requested: 'cloudflare_preview', effective: 'unavailable', failed: true,
      fallbackReason: 'github_snapshot_unusable', lastSuccessfulAt: Date.parse('2026-11-16T10:00:00Z'),
    }));
    expect(screen.getByText(/Sections authorities unavailable/)).toBeTruthy();
    expect(screen.getByText(/last good/)).toBeTruthy();
  });

  it.each([
    ['GitHub selected', SECTIONS_DATA_SOURCES.GITHUB, true],
    ['Cloudflare selected and configured', SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW, true],
    ['Cloudflare selected but not configured', SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW, false],
  ])('prioritizes failure in status copy for %s', (_, source, configured) => {
    const value = statusCopy(source, {
      effective: 'unavailable', failed: true, fallbackReason: 'github_snapshot_unusable',
    }, configured);
    expect(value).toContain('unavailable');
    expect(value).not.toContain('authority active');
    expect(value).not.toBe('GitHub static authority');
    expect(value).not.toBe('Preview endpoint is not configured');
  });

});
