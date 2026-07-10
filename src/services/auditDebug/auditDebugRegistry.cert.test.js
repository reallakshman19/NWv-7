import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAuditDebugPayload,
  createAuditDebugRegistry,
  getAuditDebugProvider,
  listAuditDebugProviders,
  registerAuditDebugProvider,
} from './auditDebugRegistry.js';

function provider(id, extra = {}) {
  return {
    id,
    title: `Provider ${id}`,
    description: `Description for ${id}`,
    mode: 'shadow-audit',
    buildPayload: options => ({ ok: true, id, options }),
    ...extra,
  };
}

describe('NW-RANK-006 audit debug registry', () => {
  it('starts empty', () => {
    const registry = createAuditDebugRegistry();
    expect(registry).toEqual({ providers: [] });
    expect(listAuditDebugProviders(registry)).toEqual([]);
  });

  it('registers providers deterministically with stable list order', () => {
    const registry = registerAuditDebugProvider(
      registerAuditDebugProvider(createAuditDebugRegistry(), provider('z-provider')),
      provider('a-provider'),
    );
    expect(listAuditDebugProviders(registry).map(item => item.id)).toEqual(['a-provider', 'z-provider']);
    expect(listAuditDebugProviders(registry)).toEqual(listAuditDebugProviders(registry));
  });

  it('rejects duplicate provider IDs', () => {
    const registry = registerAuditDebugProvider(createAuditDebugRegistry(), provider('same'));
    expect(() => registerAuditDebugProvider(registry, provider('same'))).toThrow(/Duplicate audit debug provider id/);
  });

  it('rejects providers without valid buildPayload', () => {
    expect(() => registerAuditDebugProvider(createAuditDebugRegistry(), provider('bad', { buildPayload: null })))
      .toThrow(/requires buildPayload function/);
  });

  it('does not mutate registry or provider inputs', () => {
    const baseRegistry = createAuditDebugRegistry();
    const item = provider('immutable');
    const beforeRegistry = JSON.stringify(baseRegistry);
    const beforeProvider = { ...item };
    const nextRegistry = registerAuditDebugProvider(baseRegistry, item);
    expect(JSON.stringify(baseRegistry)).toBe(beforeRegistry);
    expect(item).toEqual(beforeProvider);
    expect(nextRegistry).not.toBe(baseRegistry);
  });

  it('returns provider payloads through buildAuditDebugPayload', () => {
    const registry = registerAuditDebugProvider(createAuditDebugRegistry(), provider('payload'));
    expect(getAuditDebugProvider(registry, 'payload')).toMatchObject({ id: 'payload', mode: 'shadow-audit' });
    expect(buildAuditDebugPayload(registry, 'payload', { requestedBy: 'owner' }))
      .toEqual({ ok: true, id: 'payload', options: { requestedBy: 'owner' } });
  });

  it('returns structured failure for missing providers', () => {
    const failure = buildAuditDebugPayload(createAuditDebugRegistry(), 'missing');
    expect(failure).toMatchObject({
      ok: false,
      mode: 'audit-debug',
      providerId: 'missing',
      error: { code: 'provider_not_found' },
    });
  });

  it('keeps registry module local and network-free', () => {
    const source = readFileSync(new URL('./auditDebugRegistry.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest|WebSocket/);
    expect(source).not.toMatch(/rssAggregator|NewsContext|useMainTabViewModel|sectionsDataset|diagnosticsStore/);
  });
});
