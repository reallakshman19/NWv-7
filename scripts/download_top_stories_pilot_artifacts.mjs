import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableJson } from './top-stories-shadow/canonicalJson.mjs';

const API_ORIGIN = 'https://api.github.com';
const DAY_MS = 24 * 60 * 60 * 1000;
const WORKFLOWS = Object.freeze([
  {
    type: 'daily',
    file: 'top_stories_shadow_aggregate.yml',
    prefix: studyId => `top-stories-shadow-daily-${studyId}-`,
  },
  {
    type: 'validation',
    file: 'top_stories_shadow_validate_24h.yml',
    prefix: () => 'top-stories-shadow-24h-validation-',
  },
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid CLI argument near ${argv[index]}`);
    args[key] = value;
  }
  ['output', 'repository', 'study-id', 'start-date', 'days'].forEach(key => {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  });
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repository)) {
    throw new Error('repository must use owner/name');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args['start-date'])) {
    throw new Error('start-date must use YYYY-MM-DD');
  }
  const days = Number(args.days);
  if (!Number.isInteger(days) || days <= 0 || days > 31) {
    throw new Error('days must be an integer from 1 to 31');
  }
  return { ...args, days };
}

function queryWindow(startDate, days) {
  const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(startMs)) throw new Error('start-date must be valid');
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + ((days + 2) * DAY_MS)).toISOString(),
  };
}

function requestHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'nw-top-stories-pilot-rollup',
  };
}

async function fetchJson(url, token) {
  if (!String(url).startsWith(API_ORIGIN)) throw new Error('Only api.github.com is allowed');
  const response = await fetch(url, { headers: requestHeaders(token) });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return response.json();
}

async function listWorkflowRuns(repository, workflow, token, window) {
  const runs = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      per_page: '100',
      page: String(page),
      created: `${window.start}..${window.end}`,
    });
    const url = `${API_ORIGIN}/repos/${repository}/actions/workflows/${workflow}/runs?${query}`;
    const payload = await fetchJson(url, token);
    const rows = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
    runs.push(...rows);
    if (rows.length < 100) break;
  }
  return runs.sort((left, right) =>
    String(left.created_at).localeCompare(String(right.created_at)) || Number(left.id) - Number(right.id));
}

async function listArtifacts(repository, runId, token) {
  const artifacts = [];
  for (let page = 1; ; page += 1) {
    const url = `${API_ORIGIN}/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`;
    const payload = await fetchJson(url, token);
    const rows = Array.isArray(payload.artifacts) ? payload.artifacts : [];
    artifacts.push(...rows);
    if (rows.length < 100) break;
  }
  return artifacts;
}

async function downloadArtifact(repository, artifact, token, targetPath) {
  const url = `${API_ORIGIN}/repos/${repository}/actions/artifacts/${artifact.id}/zip`;
  const response = await fetch(url, {
    headers: requestHeaders(token),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Artifact download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, bytes);
  return bytes.length;
}

async function collectWorkflow(args, workflow, token, window) {
  const runs = await listWorkflowRuns(args.repository, workflow.file, token, window);
  const downloaded = [];
  const excludedRuns = [];
  const prefix = workflow.prefix(args['study-id']);
  for (const run of runs) {
    const artifacts = await listArtifacts(args.repository, run.id, token);
    const matching = artifacts.filter(artifact =>
      !artifact.expired && String(artifact.name || '').startsWith(prefix));
    if (matching.length === 0) {
      excludedRuns.push({
        type: workflow.type,
        workflow: workflow.file,
        runId: run.id,
        runAttempt: run.run_attempt,
        runCreatedAt: run.created_at,
        runConclusion: run.conclusion,
        reason: 'no_matching_artifact',
      });
      continue;
    }
    for (const artifact of matching) {
      const fileName = `${workflow.type}-${run.id}-${artifact.id}.zip`;
      const byteSize = await downloadArtifact(
        args.repository,
        artifact,
        token,
        path.join(args.output, fileName),
      );
      downloaded.push({
        type: workflow.type,
        workflow: workflow.file,
        fileName,
        byteSize,
        artifactId: artifact.id,
        artifactName: artifact.name,
        artifactCreatedAt: artifact.created_at,
        runId: run.id,
        runAttempt: run.run_attempt,
        runCreatedAt: run.created_at,
        runUpdatedAt: run.updated_at,
        runConclusion: run.conclusion,
        headSha: run.head_sha,
      });
    }
  }
  return { runs, downloaded, excludedRuns };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const window = queryWindow(args['start-date'], args.days);
  await mkdir(args.output, { recursive: true });
  const collections = [];
  for (const workflow of WORKFLOWS) {
    collections.push(await collectWorkflow(args, workflow, token, window));
  }
  const downloaded = collections.flatMap(row => row.downloaded)
    .sort((left, right) => left.type.localeCompare(right.type) || left.artifactId - right.artifactId);
  const excludedRuns = collections.flatMap(row => row.excludedRuns)
    .sort((left, right) => left.type.localeCompare(right.type) || left.runId - right.runId);
  const manifest = {
    schemaVersion: 'nw-top-stories-pilot-download-manifest/v1',
    repository: args.repository,
    studyId: args['study-id'],
    pilotStartDate: args['start-date'],
    pilotWindowDays: args.days,
    queryWindow: window,
    workflowRunCount: collections.reduce((sum, row) => sum + row.runs.length, 0),
    downloadedArtifactCount: downloaded.length,
    downloaded,
    excludedRuns,
  };
  await writeFile(
    path.join(args.output, 'pilot_download_manifest.json'),
    `${stableJson(manifest)}\n`,
    'utf8',
  );
  console.log(JSON.stringify({ downloadedArtifactCount: downloaded.length }));
}

await main();
