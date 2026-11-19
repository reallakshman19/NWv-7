import { describe, expect, it } from 'vitest';
import { __dataStateBoundaryInternalsForTest } from './DataStateBoundary.internals.js';

const { getBoundaryState } = __dataStateBoundaryInternalsForTest;

// Buzz Hub may synthesize a content-only envelope from NewsContext/cache.
// Preserve the display while withholding "Ready" until validation is proven.
describe('DataStateBoundary — Buzz synthesized envelope renders when content exists', () => {
  it('renders degraded retained content when synthesized envelope lacks validation evidence', () => {
    const synthesized = {
      ok: true,
      freshness: 'fresh',
      error: null,
      data: { technology: [{ title: 'Pixel 11 leak' }], entertainment: [], social: [] },
    };
    const state = getBoundaryState({
      envelope: synthesized,
      loading: false,
      error: null,
      allowDegraded: true,
      treatEmptyAsReady: false,
    });
    expect(state).toBe('degraded');
  });

  it('still shows empty when there is genuinely no content anywhere', () => {
    const emptyEnvelope = {
      ok: true,
      freshness: 'empty',
      error: null,
      data: { technology: [], entertainment: [], social: [] },
    };
    const state = getBoundaryState({
      envelope: emptyEnvelope,
      loading: false,
      error: null,
      allowDegraded: true,
      treatEmptyAsReady: false,
    });
    expect(state).toBe('empty');
  });
});
