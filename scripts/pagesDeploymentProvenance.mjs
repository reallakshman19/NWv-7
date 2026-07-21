import crypto from 'node:crypto';

export const PAGES_DEPLOYMENT_PROVENANCE_SCHEMA =
  'nw-pages-deployment-provenance/v1';
export const PAGES_TRACKED_FILE_NAMES = Object.freeze([
  'insight_latest.json',
  'sections_latest.json',
  'source_health.json',
  'prefetch_commit_manifest.json',
  'insight_quality_report.json',
  'insight_quality_summary.md',
]);

const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const INTEGER_RE = /^[1-9]\d*$/;
const EVENTS = new Set(['workflow_run', 'push', 'workflow_dispatch']);
const REASON_ORDER = [
  'provenance_missing', 'provenance_schema_unsupported',
  'trigger_event_unsupported', 'source_sha_invalid',
  'checked_out_sha_invalid', 'source_checkout_mismatch',
  'expected_source_sha_mismatch', 'deploy_workflow_context_invalid',
  'frozen_at_invalid', 'workflow_run_upstream_missing',
  'workflow_run_upstream_sha_mismatch', 'upstream_fields_unexpected',
  'tracked_file_missing', 'tracked_file_duplicate',
  'tracked_file_record_invalid', 'tracked_file_hash_invalid',
  'tracked_file_hash_mismatch', 'tracked_file_accounting_mismatch',
];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalizeSha(value, code = 'source_sha_invalid') {
  const sha = String(value || '').trim().toLowerCase();
  if (!SHA_RE.test(sha)) fail(code, `${code}: expected a 40-character Git SHA`);
  return sha;
}

function workflowRun(context = {}) {
  return context.workflowRun || context.workflow_run || {};
}

function value(record, camel, snake) {
  return record?.[camel] ?? record?.[snake] ?? null;
}

function normalizeRunId(input, name) {
  const text = String(input ?? '').trim();
  if (!INTEGER_RE.test(text)) {
    fail('deploy_workflow_context_invalid', `${name} must be a positive integer`);
  }
  return text;
}

function normalizeFrozenAt(input) {
  const text = String(input || '').trim();
  if (!text || !Number.isFinite(Date.parse(text))) {
    fail('frozen_at_invalid', 'frozenAt must be an ISO-8601 timestamp');
  }
  return text;
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function resolvePagesDeploymentSource(context = {}) {
  const event = String(
    context.triggerEvent ?? context.eventName ?? context.event_name ?? '',
  );
  if (!EVENTS.has(event)) {
    fail('trigger_event_unsupported', `Unsupported deployment trigger: ${event || 'missing'}`);
  }
  if (event === 'workflow_run') {
    const headSha = value(workflowRun(context), 'headSha', 'head_sha');
    if (!headSha) {
      fail('workflow_run_upstream_missing', 'workflow_run.head_sha is required');
    }
    return normalizeSha(headSha);
  }
  return normalizeSha(context.githubSha ?? context.github_sha);
}

function upstreamProvenance(context, sourceSha) {
  const run = workflowRun(context);
  const upstreamHeadSha = normalizeSha(value(run, 'headSha', 'head_sha'));
  const upstreamWorkflowName = String(value(run, 'workflowName', 'name') || '').trim();
  const upstreamConclusion = String(value(run, 'conclusion', 'conclusion') || '').trim();
  if (!upstreamWorkflowName || !upstreamConclusion) {
    fail('workflow_run_upstream_missing', 'workflow_run name and conclusion are required');
  }
  if (upstreamHeadSha !== sourceSha) {
    fail('workflow_run_upstream_sha_mismatch', 'sourceSha must equal upstreamHeadSha');
  }
  return {
    upstreamWorkflowName,
    upstreamWorkflowRunId: normalizeRunId(value(run, 'runId', 'id'), 'upstreamWorkflowRunId'),
    upstreamWorkflowRunAttempt: normalizeRunId(
      value(run, 'runAttempt', 'run_attempt'),
      'upstreamWorkflowRunAttempt',
    ),
    upstreamHeadSha,
    upstreamConclusion,
  };
}

function nullUpstream() {
  return {
    upstreamWorkflowName: null,
    upstreamWorkflowRunId: null,
    upstreamWorkflowRunAttempt: null,
    upstreamHeadSha: null,
    upstreamConclusion: null,
  };
}

export function buildPagesDeploymentProvenance(context = {}) {
  const triggerEvent = String(
    context.triggerEvent ?? context.eventName ?? context.event_name ?? '',
  );
  const resolved = resolvePagesDeploymentSource(context);
  const sourceSha = normalizeSha(context.sourceSha ?? resolved);
  if (sourceSha !== resolved) {
    fail('expected_source_sha_mismatch', 'sourceSha does not match the event source authority');
  }
  const checkedOutSha = normalizeSha(context.checkedOutSha, 'checked_out_sha_invalid');
  const upstream = triggerEvent === 'workflow_run'
    ? upstreamProvenance(context, sourceSha)
    : nullUpstream();
  const provenance = {
    schemaVersion: PAGES_DEPLOYMENT_PROVENANCE_SCHEMA,
    sourceSha,
    checkedOutSha,
    triggerEvent,
    deployWorkflowRunId: normalizeRunId(context.deployWorkflowRunId, 'deployWorkflowRunId'),
    deployWorkflowRunAttempt: normalizeRunId(
      context.deployWorkflowRunAttempt,
      'deployWorkflowRunAttempt',
    ),
    frozenAt: normalizeFrozenAt(context.frozenAt),
    ...upstream,
    sourceCheckoutMatched: sourceSha === checkedOutSha,
  };
  const result = validatePagesDeploymentProvenance(
    { provenance },
    { expectedSourceSha: sourceSha, skipTrackedFiles: true },
  );
  if (!result.valid) fail(result.reasonCodes[0], result.reasonCodes.join(', '));
  return provenance;
}

function add(reasons, code, condition = true) {
  if (condition) reasons.add(code);
}

function validateProvenance(provenance, expected, reasons) {
  if (!provenance || typeof provenance !== 'object') {
    add(reasons, 'provenance_missing');
    return;
  }
  add(reasons, 'provenance_schema_unsupported',
    provenance.schemaVersion !== PAGES_DEPLOYMENT_PROVENANCE_SCHEMA);
  add(reasons, 'trigger_event_unsupported', !EVENTS.has(provenance.triggerEvent));
  add(reasons, 'source_sha_invalid', !SHA_RE.test(String(provenance.sourceSha || '')));
  add(reasons, 'checked_out_sha_invalid',
    !SHA_RE.test(String(provenance.checkedOutSha || '')));
  add(reasons, 'source_checkout_mismatch',
    provenance.sourceSha !== provenance.checkedOutSha ||
      provenance.sourceCheckoutMatched !== true);
  if (expected.expectedSourceSha) {
    add(reasons, 'expected_source_sha_mismatch',
      provenance.sourceSha !== String(expected.expectedSourceSha).toLowerCase());
  }
  add(reasons, 'deploy_workflow_context_invalid',
    !INTEGER_RE.test(String(provenance.deployWorkflowRunId ?? '')) ||
      !INTEGER_RE.test(String(provenance.deployWorkflowRunAttempt ?? '')));
  add(reasons, 'frozen_at_invalid',
    typeof provenance.frozenAt !== 'string' ||
      !Number.isFinite(Date.parse(provenance.frozenAt)));
  const upstream = [
    provenance.upstreamWorkflowName,
    provenance.upstreamWorkflowRunId,
    provenance.upstreamWorkflowRunAttempt,
    provenance.upstreamHeadSha,
    provenance.upstreamConclusion,
  ];
  if (provenance.triggerEvent === 'workflow_run') {
    add(reasons, 'workflow_run_upstream_missing',
      upstream.some(item => item === null || item === '' || item === undefined));
    add(reasons, 'workflow_run_upstream_sha_mismatch',
      provenance.upstreamHeadSha !== provenance.sourceSha);
  } else if (EVENTS.has(provenance.triggerEvent)) {
    add(reasons, 'upstream_fields_unexpected',
      upstream.some(item => item !== null));
  }
}

function validateHashes(file, reasons) {
  const sourceValid = !file.sourceExists || SHA256_RE.test(String(file.sourceSha256 || ''));
  const distValid = !file.distExists || SHA256_RE.test(String(file.distSha256 || ''));
  add(reasons, 'tracked_file_hash_invalid', !sourceValid || !distValid);
  if (!sourceValid || !distValid) return;
  if (file.sourceExists) {
    add(reasons, 'tracked_file_hash_mismatch',
      file.sourceHash !== file.sourceSha256.slice(0, 16));
  }
  if (file.distExists) {
    add(reasons, 'tracked_file_hash_mismatch',
      file.distHash !== file.distSha256.slice(0, 16));
  }
  if (file.sourceExists && file.distExists) {
    add(reasons, 'tracked_file_hash_mismatch',
      file.matched !== (file.sourceSha256 === file.distSha256));
  }
}

function validateTrackedFiles(manifest, expected, reasons) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const requiredNames = expected.requiredFileNames || PAGES_TRACKED_FILE_NAMES;
  const names = files.map(file => file?.name);
  add(reasons, 'tracked_file_duplicate', new Set(names).size !== names.length);
  add(reasons, 'tracked_file_missing',
    !Array.isArray(manifest?.files) || requiredNames.some(name => !names.includes(name)));
  for (const file of files) {
    const validRecord = typeof file?.name === 'string' &&
      typeof file.sourceExists === 'boolean' &&
      typeof file.distExists === 'boolean' &&
      typeof file.matched === 'boolean';
    add(reasons, 'tracked_file_record_invalid', !validRecord);
    if (!validRecord) continue;
    add(reasons, 'tracked_file_missing', file.sourceExists && !file.distExists);
    validateHashes(file, reasons);
  }
  const conserved = files
    .filter(file => file?.sourceExists === true)
    .every(file => file.distExists === true && file.matched === true);
  add(reasons, 'tracked_file_accounting_mismatch',
    manifest?.allTrackedFilesMatched !== conserved);
}

function ordered(reasons) {
  return [...reasons].sort((left, right) => {
    const li = REASON_ORDER.indexOf(left);
    const ri = REASON_ORDER.indexOf(right);
    return (li < 0 ? REASON_ORDER.length : li) -
      (ri < 0 ? REASON_ORDER.length : ri) || left.localeCompare(right);
  });
}

export function validatePagesDeploymentProvenance(manifest = {}, expected = {}) {
  const reasons = new Set();
  validateProvenance(manifest?.provenance, expected, reasons);
  if (!expected.skipTrackedFiles) validateTrackedFiles(manifest, expected, reasons);
  const reasonCodes = ordered(reasons);
  return { valid: reasonCodes.length === 0, reasonCodes };
}
