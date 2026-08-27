export const SHADOW_MODE = 'S1_GITHUB_PRIMARY_CF_SHADOW' as const;
export const SHADOW_DATASET_KEY = 'sections_shadow' as const;
export const EXPECTED_SECTIONS_LANE_COUNT = 41;

export const TERMINAL_DISPOSITIONS = [
  'OK',
  'EMPTY',
  'TIMEOUT',
  'HTTP_ERROR',
  'PARSE_ERROR',
  'POLICY_BLOCKED',
] as const;

export type TerminalDisposition = typeof TERMINAL_DISPOSITIONS[number];
export type EpochState =
  | 'STAGED'
  | 'SEALED'
  | 'SHADOW_COMMITTED'
  | 'ABORTED'
  | 'REJECTED';
export type AcquisitionMode = 'FROZEN_REPLAY' | 'INDEPENDENT_LIVE';

export interface FrozenReplayQueueMessage {
  type: 'RUN_FROZEN_REPLAY';
  epochId: string;
  logicalSlot: number;
  attempt?: number;
}

export interface StartLiveEpochQueueMessage {
  type: 'START_LIVE_EPOCH';
  epochId: string;
  logicalSlot: number;
  attempt?: number;
}

export interface AcquireLiveLaneQueueMessage {
  type: 'ACQUIRE_LIVE_LANE';
  epochId: string;
  logicalSlot: number;
  evaluationNowMs: number;
  laneId: string;
  attempt?: number;
}

export interface FinalizeLiveEpochQueueMessage {
  type: 'FINALIZE_LIVE_EPOCH';
  epochId: string;
  logicalSlot: number;
  attempt?: number;
}

export interface AcquireLiveBrowserLanesQueueMessage {
  type: 'ACQUIRE_LIVE_BROWSER_LANES';
  epochId: string;
  logicalSlot: number;
  evaluationNowMs: number;
  attempt?: number;
}

export type ShadowQueueMessage =
  | FrozenReplayQueueMessage
  | StartLiveEpochQueueMessage
  | AcquireLiveLaneQueueMessage
  | AcquireLiveBrowserLanesQueueMessage
  | FinalizeLiveEpochQueueMessage;

export interface EpochStart {
  epochId: string;
  logicalSlot: number;
  scheduledAtMs: number;
  evaluationNowMs: number;
  attempt: number;
  acquisitionMode: AcquisitionMode;
  expectedLaneCount: number;
  sourceRegistryVersion: string;
  sourceRegistryDigest: string;
  inputEvidenceDigest?: string;
  nowMs: number;
}

export interface LaneEvidence {
  epochId: string;
  laneId: string;
  sectionKey: string;
  sourceGroup: string;
  sourceName: string;
  feedUrlDigest: string;
  disposition: TerminalDisposition;
  itemCount: number;
  evidenceDigest: string;
  evidenceObjectKey?: string;
  attemptCount: number;
  httpStatus?: number;
  durationMs?: number;
  errorCode?: string;
  observedAtMs: number;
}

export interface DecisionEvidenceRow {
  epochId: string;
  candidateIdentity: string;
  authoritativeRank: number;
  selectedPosition?: number;
  displayedPosition?: number;
  evidenceDigest: string;
  evidenceJson: string;
}

export interface FrozenDecisionEvidence {
  schemaVersion: string;
  inputEvidenceDigest: string;
  sourceRegistryVersion: string;
  sourceRegistryDigest: string;
  nowMs: number;
  normalizationDigest: string;
  rankerPolicyDigest: string;
  rawInputCount: number;
  candidateCount: number;
  candidateEvidence: Array<Record<string, unknown> & {
    identity: string;
    authoritativeRank: number;
    selectedPosition: number | null;
    displayedPosition: number | null;
  }>;
  selectedIds: string[];
  displayedIds: string[];
  decisionOutputDigest: string;
  [key: string]: unknown;
}

export interface ShadowEpochRow {
  epoch_id: string;
  logical_slot: number;
  scheduled_at_ms: number;
  evaluation_now_ms: number;
  attempt: number;
  acquisition_mode: AcquisitionMode;
  state: EpochState;
  expected_lane_count: number;
  terminal_lane_count: number;
  expected_decision_count: number | null;
  actual_decision_count: number;
  source_registry_version: string;
  source_registry_digest: string;
  input_evidence_digest: string | null;
  decision_output_digest: string | null;
  evidence_object_key: string | null;
  evidence_object_digest: string | null;
  evidence_verified: number;
  failure_code: string | null;
  failure_message: string | null;
  created_at_ms: number;
  sealed_at_ms: number | null;
  committed_at_ms: number | null;
  terminal_at_ms: number | null;
}

export interface ShadowPointerRow {
  dataset_key: typeof SHADOW_DATASET_KEY;
  epoch_id: string;
  logical_slot: number;
  generation: number;
  updated_at_ms: number;
}

export class ShadowCustodyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ShadowCustodyError';
  }
}
