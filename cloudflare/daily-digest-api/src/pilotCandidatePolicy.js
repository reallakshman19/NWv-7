import { classifyDigestQuality } from './qualityClassifier.js';
import { findRegistryEntry } from './registry.js';

const QUALITY_VALUES = Object.freeze({
  significanceClass: Object.freeze(['HIGH', 'ADEQUATE', 'LOW']),
  breadthClass: Object.freeze(['BROAD', 'ADEQUATE', 'NARROW']),
  diversityClass: Object.freeze(['DIVERSE', 'MODERATE', 'CONCENTRATED']),
});

const ACCESSIBILITY_CLASS = Object.freeze({
  OPEN: 'OPEN',
  PAYWALLED: 'PAYWALLED',
  REDIRECTED: 'REDIRECTED',
  BLOCKED_TO_COLLECTOR: 'BLOCKED_TO_COLLECTOR',
  UNKNOWN: 'UNKNOWN',
});

function qualityValue(field, value, fallback) {
  return QUALITY_VALUES[field].includes(value) ? value : fallback;
}

function registryEntryFor(candidate) {
  return findRegistryEntry(candidate.publisherFamily, candidate.product, candidate.edition);
}

function resolvedClasses(derived, overrides) {
  return {
    significanceClass: qualityValue('significanceClass', overrides?.significanceClass, derived.significanceClass),
    breadthClass: qualityValue('breadthClass', overrides?.breadthClass, derived.breadthClass),
    diversityClass: qualityValue('diversityClass', overrides?.diversityClass, derived.diversityClass),
  };
}

export function evaluatePilotCandidate(candidate, options = {}) {
  const registryEntry = registryEntryFor(candidate);
  if (!registryEntry) throw new Error('candidate_not_registered');
  const derived = classifyDigestQuality(options.qualityEvidence);
  return {
    ...candidate,
    ...derived,
    ...resolvedClasses(derived, options.overrides),
    registryPrecedence: registryEntry.precedence,
    roleFitClass: 'EXACT',
    provenanceClass: candidate.provenanceClass || 'ORIGINAL_EDITORIAL',
    accessibilityClass: ACCESSIBILITY_CLASS[candidate.accessibilityState] || 'UNKNOWN',
    decision: 'PENDING',
    decisionReason: 'PENDING_SELECTION',
  };
}

function selectedSlots(selection) {
  return new Map(Object.entries(selection || {}).map(([slot, candidate]) => [candidate.canonicalId, slot]));
}

export function applySelectionDecisions(candidates, selection) {
  const slots = selectedSlots(selection);
  return candidates.map(candidate => {
    const slot = slots.get(candidate.canonicalId);
    if (slot) {
      return { ...candidate, decision: 'SELECTED', decisionReason: `SELECTED_${slot}` };
    }
    return { ...candidate, decision: 'ELIGIBLE_NOT_SELECTED', decisionReason: 'LOWER_ROLE_RANK' };
  });
}
