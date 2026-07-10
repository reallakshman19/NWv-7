import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAuditDebugRegistry, buildAuditDebugPayload, listAuditDebugProviders } from '../auditDebug/auditDebugRegistry.js';
import { rankTopStories } from './topStoriesRanker.js';
import { TOP_STORIES_REGRESSION_INPUT } from './fixtures/topStoriesRegressionFixtures.js';
import {
  createTopStoriesAuditDebugProvider,
  registerTopStoriesAuditDebugProvider,
} from './topStoriesAuditDebugRegistration.js';

const rankedIds = () => rankTopStories(TOP_STORIES_REGRESSION_INPUT).map(item => item.id);

describe('NW-RANK-006 Top Stories audit debug registration', () => {
  it('creates the expected Top Stories provider metadata', () => {
    const provider = createTopStoriesAuditDebugProvider();
    expect(provider).toMatchObject({
      id: 'top-stories.audit.shadow',
      title: 'Top Stories Owner Audit Snapshot',
      mode: 'shadow-audit',
    });
    expect(typeof provider.buildPayload).toBe('function');
  });

  it('registers the provider by returning a new registry', () => {
    const registry = createAuditDebugRegistry();
    const nextRegistry = registerTopStoriesAuditDebugProvider(registry);
    expect(nextRegistry).not.toBe(registry);
    expect(listAuditDebugProviders(registry)).toEqual([]);
    expect(listAuditDebugProviders(nextRegistry).map(item => item.id)).toEqual(['top-stories.audit.shadow']);
  });

  it('builds ok=true shadow audit payloads through the registry', () => {
    const registry = registerTopStoriesAuditDebugProvider(createAuditDebugRegistry());
    const payload = buildAuditDebugPayload(registry, 'top-stories.audit.shadow');
    expect(payload).toMatchObject({ ok: true, mode: 'shadow-audit' });
    expect(payload.comparison.ok).toBe(true);
  });

  it('builds deterministic provider payloads by default', () => {
    const provider = createTopStoriesAuditDebugProvider();
    expect(provider.buildPayload()).toEqual(provider.buildPayload());
  });

  it('does not change ranker behavior while building provider payloads', () => {
    const before = rankedIds();
    createTopStoriesAuditDebugProvider().buildPayload();
    const registry = registerTopStoriesAuditDebugProvider(createAuditDebugRegistry());
    buildAuditDebugPayload(registry, 'top-stories.audit.shadow');
    expect(rankedIds()).toEqual(before);
  });

  it('keeps registration module isolated from forbidden runtime surfaces', () => {
    const source = readFileSync(new URL('./topStoriesAuditDebugRegistration.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest|WebSocket/);
    expect(source).not.toMatch(/rssAggregator|NewsContext|useMainTabViewModel|sectionsDataset|diagnosticsStore/);
    expect(source).not.toMatch(/frontPageComposer|breakingNewsService|entertainmentService|sectionClassifier/);
  });
});
