import { DAILY_DIGEST_REGISTRY } from './registry.js';

export const G1_ROLE = 'GLOBAL_BUSINESS_AND_WORLD';

function isGlobalRole(role) {
  return String(role || '').startsWith('GLOBAL_');
}

export function globalV1Candidates(registry = DAILY_DIGEST_REGISTRY) {
  return registry.filter(item => isGlobalRole(item.role));
}

export function resolveGlobalV1Availability(registry = DAILY_DIGEST_REGISTRY) {
  const candidates = globalV1Candidates(registry);
  const eligible = candidates.filter(item => (
    item.role === G1_ROLE
    && item.qualificationState === 'QUALIFIED'
    && item.v1Eligibility !== 'EXCLUDED'
  ));
  return {
    state: eligible.length ? 'AVAILABLE' : 'GLOBAL_UNAVAILABLE',
    requiredRole: G1_ROLE,
    eligiblePublisherFamilies: eligible.map(item => item.publisherFamily),
    candidateDecisions: candidates.map(item => ({
      publisherFamily: item.publisherFamily,
      product: item.product,
      edition: item.edition,
      role: item.role,
      qualificationState: item.qualificationState,
      holdReason: item.holdReason || null,
      v1Eligibility: item.v1Eligibility || 'PENDING',
      v1ExclusionReason: item.v1ExclusionReason || null,
    })),
  };
}
