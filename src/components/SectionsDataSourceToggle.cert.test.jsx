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

describe('Cloudflare Preview UI toggle', () => {
  it('shows GitHub as the default production source and labels Cloudflare as Preview', () => {
    vi.stubEnv('VITE_SECTIONS_CLOUDFLARE_PREVIEW_URL', 'https://preview.example/preview/sections/latest');
    render(<SectionsDataSourceToggle />);

    expect(screen.getByRole('button', { name: 'GitHub' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Cloudflare.*Preview/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Current production source')).toBeTruthy();
  });

  it('makes the preview choice explicit and keeps the fallback visible', () => {
    vi.stubEnv('VITE_SECTIONS_CLOUDFLARE_PREVIEW_URL', 'https://preview.example/preview/sections/latest');
    setSectionsDataSource(SECTIONS_DATA_SOURCES.CLOUDFLARE_PREVIEW);
    render(<SectionsDataSourceToggle />);

    expect(screen.getByRole('button', { name: /Cloudflare.*Preview/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Preview selected · GitHub fallback stays on')).toBeTruthy();
  });
});
