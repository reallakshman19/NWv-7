import { isSelectableCandidate } from './contracts.js';

export const SLOT_ORDER = Object.freeze(['I1', 'I2', 'I3', 'G1']);
export const QUALITY_FIELDS = Object.freeze([
  'roleFitClass',
  'significanceClass',
  'breadthClass',
  'diversityClass',
  'provenanceClass',
  'accessibilityClass',
]);

const CLASS_ORDER = Object.freeze({
  roleFitClass: ['EXACT', 'ACCEPTABLE', 'INCOMPATIBLE'],
  significanceClass: ['HIGH', 'ADEQUATE', 'LOW'],
  breadthClass: ['BROAD', 'ADEQUATE', 'NARROW'],
  diversityClass: ['DIVERSE', 'MODERATE', 'CONCENTRATED'],
  provenanceClass: ['ORIGINAL_EDITORIAL', 'PUBLIC_BROADCAST', 'DERIVED_ROUNDUP'],
  accessibilityClass: ['OPEN', 'PAYWALLED', 'REDIRECTED', 'BLOCKED_TO_COLLECTOR', 'UNKNOWN'],
});

function rank(field, value) {
  const index = CLASS_ORDER[field]?.indexOf(value) ?? -1;
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function compareQualityTuples(a, b) {
  for (const field of QUALITY_FIELDS) {
    const difference = rank(field, a?.[field]) - rank(field, b?.[field]);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isChallengerMateriallySuperior(incumbent, challenger) {
  for (const field of QUALITY_FIELDS) {
    const comparison = rank(field, challenger?.[field]) - rank(field, incumbent?.[field]);
    if (comparison < 0) return true;
    if (comparison > 0) return false;
  }
  return false;
}

function compareCandidates(a, b) {
  const quality = compareQualityTuples(a, b);
  if (quality !== 0) return quality;
  const precedence = Number(a.registryPrecedence ?? 999) - Number(b.registryPrecedence ?? 999);
  if (precedence !== 0) return precedence;
  return String(a.canonicalId || '').localeCompare(String(b.canonicalId || ''));
}

export function candidatesForSlot(candidates, slot, usedPublishers = new Set()) {
  return [...(candidates || [])]
    .filter(candidate => isSelectableCandidate(candidate, slot))
    .filter(candidate => !usedPublishers.has(candidate.publisherFamily))
    .sort(compareCandidates);
}

export function resolveCompositionState(selection) {
  const indiaCount = ['I1', 'I2', 'I3'].filter(slot => Boolean(selection?.[slot])).length;
  const hasGlobal = Boolean(selection?.G1);
  if (indiaCount === 3 && hasGlobal) return 'NORMAL';
  if (indiaCount === 2 && hasGlobal) return 'DEGRADED_INDIA_SHORTFALL';
  if (indiaCount >= 2 && !hasGlobal) return 'DEGRADED_GLOBAL_UNAVAILABLE';
  return 'DEGRADED_INSUFFICIENT';
}

export function selectDailyDigest(candidates = []) {
  const usedPublishers = new Set();
  const selection = {};
  for (const slot of SLOT_ORDER) {
    const chosen = candidatesForSlot(candidates, slot, usedPublishers)[0] || null;
    if (!chosen) continue;
    selection[slot] = chosen;
    usedPublishers.add(chosen.publisherFamily);
  }
  return { selection, compositionState: resolveCompositionState(selection) };
}
