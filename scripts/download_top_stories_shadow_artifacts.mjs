import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableJson } from './top-stories-shadow/canonicalJson.mjs';

const REQUIRED_ARGS = ['output', 'repository', 'workflow', 'study-id', 'date'];
const API_ORIGIN = 'https://api.github.com';
const CONTEXT_MS = 90 * 60 * 1000;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid CLI argument near ${argv[index]}`);
    args[key] = value;
  }
  REQUIRED_ARGS.forEach(key => {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  });
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repository)) {
    throw new Error('repository must use owner/name');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('date must use YYYY-MM-DD');
  return args;
}

function dateWindow(date) {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start)) throw new Error('date must be valid');
  return {
    start: new Date(start - CONTEXT_MS).toISOString(),
    end: new Date(start + (24 * 60 * 60 * 1000) + CONTEXT_MS).toISOString(),
  };
}

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'nw-top-stories-shadow-aggregator',
  };
}

async function fetchJson(url, token) {
  if (!String(url).startsWith(API_ORIGIN)) throw new Error('Only api.github.com is allowed');
  const response = await fetch(url, { headers: headers(token) });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return response.json();
}

async function listWorkflowRuns(args, token, window) {
  const runs = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      per_page: '100',
      page: String(page),
      created: `${window.start}..${window.end}`,
    });
    const url = `${API_ORIGIN}/repos/${args.repository}/actions/workflows/${encodeURIComponent(args.workflow)}/runs?${query}`;
    const payload = await fetchJson(url, token);
    const rows = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
    runs.push(...rows);
    if (rows.length < 100) break;
  }
  return runs.sort((left, right) =>
    String(left.created_at).localeCompare(String(right.created_at)) || Number(left.id) - Number(right.id));
}

async function listRunArtifacts(repository, runId, token) {
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

async function downloadArtifact(repository, artifact, token, filePath) {
  const url = `${API_ORIGIN}/repos/${repository}/actions/artifacts/${artifact.id}/zip`;
  const response = await fetch(url, {
    headers: headers(token),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Artifact download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, bytes);
  return bytes.length;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const window = dateWindow(args.date);
  await mkdir(args.output, { recursive: true });
  const runs = await listWorkflowRuns(args, token, window);
  const prefix = `top-stories-shadow-${args['study-id']}-`;
  const downloaded = [];
  const excludedRuns = [];

  for (const run of runs) {
    const artifacts = await listRunArtifacts(args.repository, run.id, token);
    const matching = artifacts.filter(artifact =>
      !artifact.expired && String(artifact.name || '').startsWith(prefix));
    if (matching.length === 0) {
      excludedRuns.push({
        runId: run.id,
        runAttempt: run.run_attempt,
        createdAt: run.created_at,
        conclusion: run.conclusion,
        reason: 'no_matching_artifact',
      });
      continue;
    }
    for (const artifact of matching) {
      const fileName = `${run.id}-${artifact.id}.zip`;
      const byteSize = await downloadArtifact(
        args.repository,
        artifact,
        token,
        path.join(args.output, fileName),
      );
      downloaded.push({
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

  const manifest = {
    schemaVersion: 'nw-top-stories-shadow-download-manifest/v1',
    repository: args.repository,
    workflow: args.workflow,
    studyId: args['study-id'],
    date: args.date,
    queryWindow: window,
    workflowRunCount: runs.length,
    downloadedArtifactCount: downloaded.length,
    downloaded,
    excludedRuns,
  };
  await writeFile(
    path.join(args.output, 'download_manifest.json'),
    `${stableJson(manifest)}\n`,
    'utf8',
  );
  console.log(JSON.stringify({ downloadedArtifactCount: downloaded.length }));
}

await run();
