import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Text } from './canonicalJson.mjs';

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

function assertSchema(value, expected, name) {
  if (value?.schemaVersion !== expected) {
    const error = new Error(`Unsupported ${name} schema: ${value?.schemaVersion || 'missing'}`);
    error.code = 'unsupported_schema';
    throw error;
  }
}

function assertDescriptor(descriptor, text) {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (Number(descriptor.byteSize) !== bytes) {
    const error = new Error(`Byte-size mismatch for ${descriptor.name}`);
    error.code = 'artifact_byte_size_mismatch';
    throw error;
  }
  if (descriptor.sha256 !== sha256Text(text)) {
    const error = new Error(`SHA-256 mismatch for ${descriptor.name}`);
    error.code = 'artifact_hash_mismatch';
    throw error;
  }
}

async function readDescribedFiles(directory, descriptors = []) {
  const files = new Map();
  const names = new Set();
  for (const descriptor of descriptors) {
    if (!descriptor?.name || names.has(descriptor.name)) {
      const error = new Error('Publication manifest contains an invalid or duplicate file name');
      error.code = 'invalid_file_descriptor';
      throw error;
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
      const error = new Error(`Cross-file ${field} mismatch`);
      error.code = 'cross_file_identity_mismatch';
      throw error;
    }
  });
}

async function validateCoreManifest(directory, files) {
  const text = files.get('manifest.json');
  if (!text) {
    const error = new Error('manifest.json is missing');
    error.code = 'missing_core_manifest';
    throw error;
  }
  const manifest = parseJson(text, 'manifest.json');
  assertSchema(manifest, CORE_MANIFEST_SCHEMA, 'core manifest');
  if (!Array.isArray(manifest.files) || manifest.files.length !== 1) {
    const error = new Error('Core manifest must describe exactly one payload');
    error.code = 'invalid_core_manifest';
    throw error;
  }
  const descriptor = manifest.files[0];
  const payloadText = files.get(descriptor.name) || await readText(path.join(directory, descriptor.name));
  assertDescriptor(descriptor, payloadText);
  return { manifest, payloadText, payloadName: descriptor.name };
}

export async function readTopStoriesArtifactDirectory(directory) {
  try {
    const publicationText = await readText(path.join(directory, 'publication_manifest.json'));
    const publicationManifest = parseJson(publicationText, 'publication_manifest.json');
    assertSchema(publicationManifest, PUBLICATION_SCHEMA, 'publication manifest');
    if (!Array.isArray(publicationManifest.files)) {
      throw Object.assign(new Error('Publication manifest files must be an array'), {
        code: 'invalid_publication_manifest',
      });
    }
    const files = await readDescribedFiles(directory, publicationManifest.files);
    const operationalText = files.get('operational.json');
    if (!operationalText) {
      throw Object.assign(new Error('operational.json is missing'), {
        code: 'missing_operational_record',
      });
    }
    const operational = parseJson(operationalText, 'operational.json');
    assertSchema(operational, OPERATIONAL_SCHEMA, 'operational record');
    const core = await validateCoreManifest(directory, files);
    const hasSnapshot = core.payloadName === 'snapshot.json';
    const hasFailure = core.payloadName === 'failure.json';
    if (hasSnapshot === hasFailure) {
      throw Object.assign(new Error('Artifact must contain exactly one snapshot or failure payload'), {
        code: 'invalid_payload_selection',
      });
    }
    const payload = parseJson(core.payloadText, core.payloadName);
    assertSchema(payload, hasSnapshot ? SNAPSHOT_SCHEMA : FAILURE_SCHEMA, core.payloadName);
    assertCrossFileConsistency(publicationManifest, operational, payload);
    return {
      directory,
      schemaValid: true,
      status: hasSnapshot ? 'VALID_SNAPSHOT' : 'VALID_FAILURE',
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
