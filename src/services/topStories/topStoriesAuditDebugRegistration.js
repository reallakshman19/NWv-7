import { registerAuditDebugProvider } from '../auditDebug/auditDebugRegistry.js';
import { getTopStoriesAuditComparisonPayload } from './topStoriesAuditAdapter.js';

export function createTopStoriesAuditDebugProvider() {
  return {
    id: 'top-stories.audit.shadow',
    title: 'Top Stories Owner Audit Snapshot',
    description: 'Deterministic shadow-mode Top Stories golden/actual comparison payload for owner/auditor review.',
    mode: 'shadow-audit',
    buildPayload: options => getTopStoriesAuditComparisonPayload(options),
  };
}

export function registerTopStoriesAuditDebugProvider(registry) {
  return registerAuditDebugProvider(registry, createTopStoriesAuditDebugProvider());
}
