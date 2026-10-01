// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SectionsDataSourceToggle from './SectionsDataSourceToggle.jsx';
import {
  SECTIONS_DATA_SOURCES,
  setSectionsDataSource,
} from '../utils/sectionsDataSource.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
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
});
