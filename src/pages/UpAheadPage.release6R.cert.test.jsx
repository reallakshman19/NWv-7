import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  __upAheadPageViewModelInternalsForTest,
} from '../viewModels/useUpAheadPageViewModel.js';

const read = path => fs.readFileSync(path, 'utf8');

function hasHookCall(content, name) {
  return new RegExp(`\\b${name}\\s*\\(`).test(content);
}

describe('Release 6R UpAheadPage ViewModel binding', () => {
  const page = read('src/pages/UpAheadPage.jsx');
  const vm = read('src/viewModels/useUpAheadPageViewModel.js');
  const dataset = read('src/data/datasets/upAheadDataset.js');

  it('UpAheadPage no longer owns settings/runtime/service/planner orchestration', () => {
    expect(page).not.toContain("from '../context/SettingsContext'");
    expect(page).not.toContain("from '../services/upAheadService'");
    expect(page).not.toContain("from '../utils/plannerStorage'");
    expect(page).not.toContain("from '../runtime/runtimeCapabilities'");
    expect(page).not.toContain("from '../services/upAheadEvidence'");
    expect(page).not.toContain("from '../services/upAheadBriefing'");
    expect(hasHookCall(page, 'useSettings')).toBe(false);
    expect(page).toContain('useUpAheadPageViewModel');
  });

  it('ViewModel owns data fetch, cache, runtime and planner logic', () => {
    [
      "from '../context/SettingsContext'",
      "from '../services/upAheadService'",
      "from '../utils/plannerStorage'",
      "from '../runtime/runtimeCapabilities'",
      "from '../services/upAheadProjection.js'",
      "from '../data/datasets/upAheadDataset'",
      'loadUpAhead(',
      'loadFromCache',
      'plannerStorage.addItem',
      'plannerStorage.addToBlacklist',
      'getRuntimeCapabilities',
    ].forEach(token => {
      expect(vm).toContain(token);
    });
    expect(vm).not.toContain('clearUpAheadCache');
    const projection = read('src/services/upAheadProjection.js');
    expect(projection).toContain('upAheadEvidence: getUpAheadEvidence({');
    expect(projection).toContain('upAheadBriefing: getUpAheadBriefing({');
    expect(dataset).toContain('getVisibleUpAheadProjection({ data, settings })');
  });

  it('does not treat blocked static-host browser feeds as a successful empty offer query', () => {
    expect(dataset).toContain('providerDecision.browserWideFeedFetchAllowed');
    expect(dataset).toContain('static_runtime_blocks_browser_live');
    expect(vm).toContain('deriveOfferCapability');
    expect(page).toContain('<RetailOffersPanel');
    expect(page).not.toContain('emptyMessage="No online offers right now."');
  });

  it('UpAheadPage preserves evidence, briefing, data-state and timeline UI', () => {
    expect(page).toContain('<UpAheadEvidencePanel evidence={upAheadEvidence} />');
    expect(page).toContain('<UpAheadBriefingPanel briefing={upAheadBriefing} />');
    expect(page).toContain('<DataStatePill mode={modeStr} label={modeLabel} />');
    expect(page).toContain('TimelineCard');
    expect(page).toContain('EntertainmentStyleGrid');
  });

  it('source mode projection handles static and live runtimes', () => {
    const { getSourceModeState } = __upAheadPageViewModelInternalsForTest;

    expect(getSourceModeState({
      data: { sourceMode: 'snapshot' },
      runtime: { isStaticHost: true },
    })).toEqual({
      modeStr: 'snapshot',
      modeLabel: 'Snapshot',
    });

    expect(getSourceModeState({
      data: { sourceMode: 'cache' },
      runtime: { isStaticHost: false },
    })).toEqual({
      modeStr: 'cached',
      modeLabel: 'Cached',
    });

    expect(getSourceModeState({
      data: { sourceMode: 'dataset-api' },
      runtime: { isStaticHost: true },
      envelope: { freshness: 'fresh' },
    })).toEqual({
      modeStr: 'snapshot',
      modeLabel: 'Worker API',
    });

    expect(getSourceModeState({
      data: { sourceMode: 'dataset-api' },
      runtime: { isStaticHost: true },
      envelope: { freshness: 'stale' },
    })).toEqual({
      modeStr: 'degraded',
      modeLabel: 'Limited',
    });
  });

  it('visible content detector requires fetched rows rather than only saved plan items', () => {
    const { hasVisibleUpAheadContent } = __upAheadPageViewModelInternalsForTest;

    expect(hasVisibleUpAheadContent({ timeline: [{ items: [{ id: 'x' }] }] })).toBe(true);
    expect(hasVisibleUpAheadContent({ sections: { movies: [{ id: 'x' }] } })).toBe(true);
    expect(hasVisibleUpAheadContent({ weekly_plan: [{ items: [{ id: 'x' }] }] })).toBe(false);
    expect(hasVisibleUpAheadContent({ timeline: [], sections: {}, weekly_plan: [] })).toBe(false);
  });
});
