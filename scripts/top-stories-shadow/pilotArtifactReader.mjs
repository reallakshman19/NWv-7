import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Text } from './canonicalJson.mjs';
import { validateTopStoriesDailyComparisonEvidence } from './comparisonEvidenceValidation.mjs';

export const PILOT_DOWNLOAD_SCHEMA = 'nw-top-stories-pilot-download-manifest/v1';
const DAILY_REPORT_SCHEMA = 'nw-top-stories-daily-stability-report/v1';
const DAILY_MANIFEST_SCHEMA = 'nw-top-stories-shadow-aggregation-manifest/v1';
const VALIDATION_SCHEMA = 'nw-top-stories-24h-operational-validation/v1';
const VALIDATION_MANIFEST_SCHEMA = 'nw-top-stories-24h-validation-manifest/v1';

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid_json:${name}:${error.message}`);
  }
}

function validateDescriptors(manifest, expectedSchema, files) {
  const errors = [];
  if (manifest?.schemaVersion !== expectedSchema) errors.push('manifest_schema_mismatch');
  if (!Array.isArray(manifest?.files)) return [...errors, 'manifest_files_missing'];
  const descriptors = new Map();
  manifest.files.forEach(descriptor => {
    const name = String(descriptor?.name || '');
    if (!name || descriptors.has(name)) {
      errors.push(name ? `duplicate_descriptor:${name}` : 'invalid_descriptor_name');
      return;
    }
    descriptors.set(name, descriptor);
  });
  Object.entries(files).forEach(([name, text]) => {
    const descriptor = descriptors.get(name);
    if (!descriptor) {
      errors.push(`missing_descriptor:${name}`);
      return;
    }
    if (Number(descriptor.byteSize) !== Buffer.byteLength(text, 'utf8')) {
      errors.push(`byte_size_mismatch:${name}`);
    }
    if (descriptor.sha256 !== sha256Text(text)) errors.push(`sha256_mismatch:${name}`);
  });
  return errors.sort();
}

async function readDaily(directory, metadata) {
  const reportText = await readText(path.join(directory, 'daily_report.json'));
  const markdownText = await readText(path.join(directory, 'daily_report.md'));
  const manifestText = await readText(path.join(directory, 'aggregation_manifest.json'));
  const dailyReport = parseJson(reportText, 'daily_report.json');
  const manifest = parseJson(manifestText, 'aggregation_manifest.json');
  const errors = validateDescriptors(manifest, DAILY_MANIFEST_SCHEMA, {
    'daily_report.json': reportText,
    'daily_report.md': markdownText,
  });
  if (dailyReport?.schemaVersion !== DAILY_REPORT_SCHEMA) errors.push('daily_report_schema_mismatch');
  if (dailyReport?.studyId !== manifest?.studyId) errors.push('daily_study_mismatch');
  if (dailyReport?.date !== manifest?.date) errors.push('daily_date_mismatch');
  const comparison = validateTopStoriesDailyComparisonEvidence(dailyReport);
  if (comparison.status === 'INVALID') errors.push(...comparison.reasonCodes);
  return {
    ...metadata,
    type: 'daily',
    directory,
    schemaValid: errors.length === 0,
    integrityErrors: [...new Set(errors)].sort(),
    comparisonEvidenceStatus: comparison.status,
    comparisonEvidenceReasonCodes: comparison.reasonCodes,
    studyId: dailyReport?.studyId || manifest?.studyId || null,
    date: dailyReport?.date || manifest?.date || null,
    dailyReport,
    manifest,
  };
}

async function readValidation(directory, metadata) {
  const validationText = await readText(path.join(directory, 'operational_validation.json'));
  const markdownText = await readText(path.join(directory, 'operational_validation.md'));
  const manifestText = await readText(path.join(directory, 'validation_manifest.json'));
  const validation = parseJson(validationText, 'operational_validation.json');
  const manifest = parseJson(manifestText, 'validation_manifest.json');
  const errors = validateDescriptors(manifest, VALIDATION_MANIFEST_SCHEMA, {
    'operational_validation.json': validationText,
    'operational_validation.md': markdownText,
  });
  if (validation?.schemaVersion !== VALIDATION_SCHEMA) errors.push('validation_schema_mismatch');
  if (validation?.studyId !== manifest?.studyId) errors.push('validation_study_mismatch');
  if (validation?.date !== manifest?.date) errors.push('validation_date_mismatch');
  if (validation?.decision !== manifest?.decision) errors.push('validation_decision_mismatch');
  return {
    ...metadata,
    type: 'validation',
    directory,
    schemaValid: errors.length === 0,
    integrityErrors: errors.sort(),
    comparisonEvidenceStatus: 'NOT_APPLICABLE',
    comparisonEvidenceReasonCodes: [],
    studyId: validation?.studyId || manifest?.studyId || null,
    date: validation?.date || manifest?.date || null,
    validation,
    manifest,
  };
}

export async function readTopStoriesPilotArtifact(directory, metadata = {}) {
  try {
    if (metadata.type === 'daily') return await readDaily(directory, metadata);
    if (metadata.type === 'validation') return await readValidation(directory, metadata);
    throw new Error('unsupported_artifact_type');
  } catch (error) {
    return {
      ...metadata,
      directory,
      schemaValid: false,
      integrityErrors: [error.message || String(error)],
      comparisonEvidenceStatus: metadata.type === 'daily' ? 'INVALID' : 'NOT_APPLICABLE',
      comparisonEvidenceReasonCodes: metadata.type === 'daily'
        ? ['comparison_evidence_invalid'] : [],
      studyId: null,
      date: null,
    };
  }
}

function chooseCanonical(left, right) {
  if (left.schemaValid !== right.schemaValid) return right.schemaValid ? right : left;
  const attemptDelta = Number(right.runAttempt || 1) - Number(left.runAttempt || 1);
  if (attemptDelta !== 0) return attemptDelta > 0 ? right : left;
  return Number(right.artifactId || 0) >= Number(left.artifactId || 0) ? right : left;
}

export function canonicalizeTopStoriesPilotArtifacts(records = []) {
  const canonicalByKey = new Map();
  const superseded = [];
  const unassigned = [];
  records.forEach(record => {
    if (!record.type || !record.date || !record.studyId) {
      unassigned.push(record);
      return;
    }
    const key = `${record.type}|${record.studyId}|${record.date}`;
    if (!canonicalByKey.has(key)) {
      canonicalByKey.set(key, record);
      return;
    }
    const prior = canonicalByKey.get(key);
    const selected = chooseCanonical(prior, record);
    const rejected = selected === record ? prior : record;
    canonicalByKey.set(key, selected);
    superseded.push({
      key,
      retainedArtifactId: selected.artifactId || null,
      supersededArtifactId: rejected.artifactId || null,
      retainedSchemaValid: selected.schemaValid,
      supersededSchemaValid: rejected.schemaValid,
    });
  });
  const canonical = [...canonicalByKey.values()].sort((left, right) =>
    String(left.date).localeCompare(String(right.date)) || left.type.localeCompare(right.type));
  return { canonical, superseded, unassigned };
}

export function buildPilotArtifactInputManifest(records, canonicalized, downloadManifest) {
  const retainedIds = new Set(canonicalized.canonical.map(row => row.artifactId));
  const expectedStudyId = downloadManifest?.studyId || null;
  return {
    schemaVersion: 'nw-top-stories-pilot-input-manifest/v1',
    studyId: expectedStudyId,
    pilotStartDate: downloadManifest?.pilotStartDate || null,
    pilotWindowDays: downloadManifest?.pilotWindowDays || null,
    downloadedArtifactCount: records.length,
    canonicalArtifactCount: canonicalized.canonical.length,
    supersededCount: canonicalized.superseded.length,
    unassignedCount: canonicalized.unassigned.length,
    foreignStudyCount: records.filter(record =>
      record.studyId && expectedStudyId && record.studyId !== expectedStudyId).length,
    excludedRuns: downloadManifest?.excludedRuns || [],
    artifacts: records.map(record => ({
      type: record.type || null,
      artifactId: record.artifactId || null,
      artifactName: record.artifactName || null,
      runId: record.runId || null,
      runAttempt: record.runAttempt || null,
      studyId: record.studyId || null,
      date: record.date || null,
      schemaValid: record.schemaValid === true,
      integrityErrors: record.integrityErrors || [],
      comparisonEvidenceStatus: record.comparisonEvidenceStatus ||
        (record.type === 'daily' ? 'MISSING_LEGACY' : 'NOT_APPLICABLE'),
      comparisonEvidenceReasonCodes: record.comparisonEvidenceReasonCodes || [],
      disposition: retainedIds.has(record.artifactId) ? 'CANONICAL' :
        record.date && record.studyId ? 'SUPERSEDED' : 'UNASSIGNED',
    })).sort((left, right) =>
      String(left.date || '').localeCompare(String(right.date || '')) ||
      String(left.type || '').localeCompare(String(right.type || '')) ||
      Number(left.artifactId || 0) - Number(right.artifactId || 0)),
    superseded: canonicalized.superseded,
  };
}
