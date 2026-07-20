import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Text } from './canonicalJson.mjs';
import {
  TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION,
  validateTopStoriesTraceRelations,
} from './traceRelationsValidation.mjs';

const PUBLICATION_SCHEMA = 'nw-top-stories-shadow-publication-manifest/v1';
const CORE_MANIFEST_SCHEMA = 'nw-top-stories-artifact-manifest/v1';
const SNAPSHOT_SCHEMA = 'nw-top-stories-run-snapshot/v1';
const FAILURE_SCHEMA = 'nw-top-stories-run-failure/v1';
const OPERATIONAL_SCHEMA = 'nw-top-stories-shadow-operational/v1';

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const wrapped = new Error(`Invalid JSON in ${name}: ${error.message}`);
    wrapped.code = 'invalid_json';
    throw wrapped;
  }
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertSchema(value, expected, name) {
  if (value?.schemaVersion !== expected) {
    throw codedError(
      'unsupported_schema',
      `Unsupported ${name} schema: ${value?.schemaVersion || 'missing'}`,
    );
  }
}

function assertDescriptor(descriptor, text) {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (Number(descriptor.byteSize) !== bytes) {
    throw codedError('artifact_byte_size_mismatch', `Byte-size mismatch for ${descriptor.name}`);
  }
  if (descriptor.sha256 !== sha256Text(text)) {
    throw codedError('artifact_hash_mismatch', `SHA-256 mismatch for ${descriptor.name}`);
  }
}

async function readDescribedFiles(directory, descriptors = []) {
  const files = new Map();
  const names = new Set();
  for (const descriptor of descriptors) {
    if (!descriptor?.name || names.has(descriptor.name)) {
      throw codedError(
        'invalid_file_descriptor',
        'Publication manifest contains an invalid or duplicate file name',
      );
    }
    names.add(descriptor.name);
    const text = await readText(path.join(directory, descriptor.name));
    assertDescriptor(descriptor, text);
    files.set(descriptor.name, text);
  }
  return files;
}

function assertCrossFileConsistency(publication, operational, payload) {
  const shared = [
    ['studyId', publication.studyId, operational.studyId, payload.studyId],
    ['scheduledAt', publication.scheduledAt, operational.scheduledAt, payload.scheduledAt],
    ['runAt', publication.runAt, operational.runAt, payload.runAt],
  ];
  shared.forEach(([field, ...values]) => {
    const present = values.filter(value => value !== undefined && value !== null && value !== '');
    if (new Set(present.map(String)).size > 1) {
      throw codedError('cross_file_identity_mismatch', `Cross-file ${field} mismatch`);
    }
  });
}

async function validateCoreManifest(directory, files) {
  const text = files.get('manifest.json');
  if (!text) throw codedError('missing_core_manifest', 'manifest.json is missing');
  const manifest = parseJson(text, 'manifest.json');
  assertSchema(manifest, CORE_MANIFEST_SCHEMA, 'core manifest');
  if (!Array.isArray(manifest.files) || manifest.files.length !== 1) {
    throw codedError('invalid_core_manifest', 'Core manifest must describe exactly one payload');
  }
  const descriptor = manifest.files[0];
  const payloadText = files.get(descriptor.name) ||
    await readText(path.join(directory, descriptor.name));
  assertDescriptor(descriptor, payloadText);
  return { manifest, payloadText, payloadName: descriptor.name };
}

function assertSnapshotTraceRoot(snapshot) {
  const arrays = [
    'candidateBuildTrace', 'candidateEvidence', 'ranked', 'displayed', 'selectionTrace',
  ];
  arrays.forEach(field => {
    if (!Array.isArray(snapshot[field])) {
      throw codedError('trace_relation_validation_failed', `Snapshot ${field} must be an array`);
    }
  });
  ['rankedCount', 'displayedCount'].forEach(field => {
    if (!Number.isInteger(snapshot[field]) || snapshot[field] < 0) {
      throw codedError('trace_relation_validation_failed', `Snapshot ${field} is invalid`);
    }
  });
  const expectedRankedIds = snapshot.ranked.map(item => item?.id || null);
  const expectedDisplayedIds = snapshot.displayed.map(item => item?.id || null);
  if (JSON.stringify(snapshot.rankedIds) !== JSON.stringify(expectedRankedIds) ||
    JSON.stringify(snapshot.displayedTopNIds) !== JSON.stringify(expectedDisplayedIds)) {
    throw codedError('trace_relation_validation_failed', 'Snapshot projection IDs are inconsistent');
  }
}

function assertCandidateTraceOwnership(snapshot) {
  const ledger = snapshot.traceRelations;
  const candidateIdByKey = new Map();
  ledger.candidates.forEach(candidate => {
    if (candidateIdByKey.has(candidate.candidateKey)) {
      throw codedError('trace_relation_validation_failed', 'Duplicate candidate trace key');
    }
    candidateIdByKey.set(candidate.candidateKey, candidate.candidateId);
  });
  const traceByCandidateId = new Map();
  snapshot.selectionTrace.forEach(trace => {
    const candidateId = candidateIdByKey.get(String(trace?.candidateKey || ''));
    if (!candidateId || traceByCandidateId.has(candidateId)) {
      throw codedError('trace_relation_validation_failed', 'Candidate trace coverage is invalid');
    }
    traceByCandidateId.set(candidateId, trace);
  });
  if (traceByCandidateId.size !== ledger.candidates.length) {
    throw codedError('trace_relation_validation_failed', 'Candidate trace coverage is incomplete');
  }
  ledger.candidateRankEdges.forEach(edge => {
    const trace = traceByCandidateId.get(edge.candidateId);
    const ranked = ['DISPLAYED', 'RANKED_NOT_DISPLAYED'].includes(trace?.finalDisposition);
    if (!ranked || Number(trace.selectedRank) !== edge.rank) {
      throw codedError('trace_relation_validation_failed', 'Candidate rank trace mismatch');
    }
  });
  ledger.candidateDispositionRecords.forEach(record => {
    const trace = traceByCandidateId.get(record.candidateId);
    if (!trace || trace.selectedRank !== null ||
      trace.finalDisposition !== record.finalDisposition ||
      trace.terminalStage !== record.terminalStage ||
      trace.terminalReasonCode !== record.terminalReasonCode) {
      throw codedError('trace_relation_validation_failed', 'Candidate disposition trace mismatch');
    }
  });
}

function validateSnapshotTraceRelations(snapshot) {
  const hasSchema = Object.hasOwn(snapshot, 'traceRelationSchemaVersion');
  const hasLedger = Object.hasOwn(snapshot, 'traceRelations');
  if (!hasSchema && !hasLedger) return 'MISSING_LEGACY';
  if (!hasSchema || !hasLedger) {
    throw codedError(
      'trace_relation_fields_incomplete',
      'Trace relation schema and ledger must be published together',
    );
  }
  if (snapshot.traceRelationSchemaVersion !== TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION ||
    snapshot.traceRelations?.schemaVersion !== TOP_STORIES_TRACE_RELATION_SCHEMA_VERSION) {
    throw codedError(
      'trace_relation_schema_unsupported',
      `Unsupported trace relation schema: ${snapshot.traceRelationSchemaVersion ||
        snapshot.traceRelations?.schemaVersion || 'missing'}`,
    );
  }
  assertSnapshotTraceRoot(snapshot);
  try {
    validateTopStoriesTraceRelations(snapshot.traceRelations, {
      rawInputCount: snapshot.candidateBuildTrace.length,
      candidateEvidence: snapshot.candidateEvidence,
      ranked: snapshot.ranked,
      displayed: snapshot.displayed,
      rankedCount: snapshot.rankedCount,
      displayedCount: snapshot.displayedCount,
    });
    assertCandidateTraceOwnership(snapshot);
  } catch (error) {
    throw codedError('trace_relation_validation_failed', error.message || String(error));
  }
  return 'VALID';
}

export async function readTopStoriesArtifactDirectory(directory) {
  try {
    const publicationText = await readText(path.join(directory, 'publication_manifest.json'));
    const publicationManifest = parseJson(publicationText, 'publication_manifest.json');
    assertSchema(publicationManifest, PUBLICATION_SCHEMA, 'publication manifest');
    if (!Array.isArray(publicationManifest.files)) {
      throw codedError('invalid_publication_manifest', 'Publication manifest files must be an array');
    }
    const files = await readDescribedFiles(directory, publicationManifest.files);
    const operationalText = files.get('operational.json');
    if (!operationalText) {
      throw codedError('missing_operational_record', 'operational.json is missing');
    }
    const operational = parseJson(operationalText, 'operational.json');
    assertSchema(operational, OPERATIONAL_SCHEMA, 'operational record');
    const core = await validateCoreManifest(directory, files);
    const hasSnapshot = core.payloadName === 'snapshot.json';
    const hasFailure = core.payloadName === 'failure.json';
    if (hasSnapshot === hasFailure) {
      throw codedError(
        'invalid_payload_selection',
        'Artifact must contain exactly one snapshot or failure payload',
      );
    }
    const payload = parseJson(core.payloadText, core.payloadName);
    assertSchema(payload, hasSnapshot ? SNAPSHOT_SCHEMA : FAILURE_SCHEMA, core.payloadName);
    assertCrossFileConsistency(publicationManifest, operational, payload);
    const traceRelationStatus = hasSnapshot
      ? validateSnapshotTraceRelations(payload)
      : 'NOT_APPLICABLE';
    return {
      directory,
      schemaValid: true,
      status: hasSnapshot ? 'VALID_SNAPSHOT' : 'VALID_FAILURE',
      traceRelationStatus,
      publicationManifest,
      coreManifest: core.manifest,
      operational,
      snapshot: hasSnapshot ? payload : null,
      failure: hasFailure ? payload : null,
      exclusionReason: hasSnapshot ? null : 'failure_artifact',
    };
  } catch (error) {
    return {
      directory,
      schemaValid: false,
      status: 'INVALID_ARTIFACT',
      traceRelationStatus: 'INVALID',
      publicationManifest: null,
      coreManifest: null,
      operational: null,
      snapshot: null,
      failure: null,
      exclusionReason: error.code || 'artifact_validation_failed',
      errorMessage: error.message,
    };
  }
}

async function walk(directory, matches) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some(entry => entry.isFile() && entry.name === 'publication_manifest.json')) {
    matches.push(directory);
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await walk(path.join(directory, entry.name), matches);
  }
}

export async function discoverTopStoriesArtifactDirectories(rootDirectory) {
  const matches = [];
  try {
    await walk(rootDirectory, matches);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return matches.sort();
}
