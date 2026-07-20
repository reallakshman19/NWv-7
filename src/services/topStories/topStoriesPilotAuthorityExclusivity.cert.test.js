import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const AUTH_WORKFLOW = '.github/workflows/top_stories_shadow_pilot_decision.yml';
const AUTH_CLI = 'scripts/build_top_stories_pilot_decision.mjs';
const AUTH_BUILDER = 'scripts/top-stories-shadow/pilotDecision.mjs';
const AUTH_SCHEMA = 'nw-top-stories-seven-day-pilot-decision/v1';
const SELF = 'src/services/topStories/topStoriesPilotAuthorityExclusivity.cert.test.js';

const RETIRED_FILES = Object.freeze([
  '.github/workflows/top_stories_shadow_pilot_rollup.yml',
  'scripts/build_top_stories_pilot_rollup.mjs',
  'scripts/top-stories-shadow/pilotRollup.mjs',
  'scripts/top-stories-shadow/pilotDecisionPack.mjs',
  'scripts/top-stories-shadow/pilotRollupMarkdown.mjs',
  'src/services/topStories/topStoriesPilotRollup.cert.test.js',
  'src/services/topStories/topStoriesPilotDecisionPack.cert.test.js',
  'src/services/topStories/topStoriesPilotRollupWorkflow.cert.test.js',
]);

const RETIRED_IDENTIFIERS = Object.freeze([
  'top_stories_shadow_pilot_rollup.yml',
  'build_top_stories_pilot_rollup.mjs',
  'pilotRollup.mjs',
  'pilotDecisionPack.mjs',
  'pilotRollupMarkdown.mjs',
  'nw-top-stories-pilot-rollup/v1',
  'nw-top-stories-pilot-manifest/v1',
  'REPAIR_RECALL_THEN_PERSISTENCE',
  'REPAIR_RECALL',
  'ADD_PERSISTENCE',
  'RETAIN_POLICY',
]);

const SCAN_ROOTS = Object.freeze(['.github/workflows', 'scripts', 'src']);
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.vite',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

async function exists(relativePath) {
  try {
    await access(absolute(relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(relativeRoot) {
  const files = [];
  const stack = [relativeRoot];
  while (stack.length) {
    const current = stack.pop();
    const entries = await readdir(absolute(current), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    entries.forEach(entry => {
      const relativePath = normalize(path.join(current, entry.name));
      if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
        stack.push(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    });
  }
  return files.sort();
}

async function readSources(roots = SCAN_ROOTS) {
  const paths = (await Promise.all(roots.map(walkFiles)))
    .flat()
    .filter(relativePath => relativePath !== SELF)
    .sort();
  return Promise.all(paths.map(async relativePath => ({
    path: relativePath,
    text: await readFile(absolute(relativePath), 'utf8'),
  })));
}

function workflowDispatchBlock(text) {
  const match = text.match(/workflow_dispatch:\n([\s\S]*?)\npermissions:/);
  return match?.[1] || '';
}

describe('NW-RANK-012E single pilot decision authority', () => {
  it('removes every retired executable and certification file', async () => {
    const presence = await Promise.all(RETIRED_FILES.map(async relativePath => ({
      path: relativePath,
      exists: await exists(relativePath),
    })));
    expect(presence.filter(row => row.exists)).toEqual([]);
  });

  it('leaves no retired executable identifier outside this certification', async () => {
    const sources = await readSources();
    const hits = [];
    sources.forEach(source => {
      RETIRED_IDENTIFIERS.forEach(identifier => {
        if (source.text.includes(identifier)) {
          hits.push({ path: source.path, identifier });
        }
      });
    });
    expect(hits).toEqual([]);
  });

  it('retains exactly one scheduled fixed-window pilot decision workflow', async () => {
    const workflows = await readSources(['.github/workflows']);
    const authorities = workflows.filter(source =>
      source.text.includes(AUTH_CLI) || source.text.includes(AUTH_SCHEMA));
    expect(authorities.map(source => source.path)).toEqual([AUTH_WORKFLOW]);

    const text = authorities[0].text;
    expect(text).toContain('name: Top Stories Shadow Pilot Decision');
    expect(text).toContain('schedule:');
    expect(text).toMatch(/cron:\s*'47 3 \* \* \*'/);
    expect(text).toContain("require('./config/top_stories_shadow_study.json').pilotStartDate");
    expect(text).toContain("require('./config/top_stories_shadow_study.json').pilotWindowDays");
    expect(text).toContain('node scripts/build_top_stories_pilot_decision.mjs');

    const dispatch = workflowDispatchBlock(text);
    expect(dispatch).toContain('evaluation_time:');
    expect(dispatch).not.toMatch(/^\s+(start_date|end_date):\s*$/m);

    const parallel = workflows.filter(source =>
      source.path !== AUTH_WORKFLOW &&
      /pilot/i.test(source.text) &&
      /(pilot[_ -]decision|recommendation|policy[_ -]candidate|diagnostic[_ -]result)/i
        .test(source.text));
    expect(parallel).toEqual([]);
  });

  it('preserves the authoritative CLI, builder, schema and authorization posture', async () => {
    const [workflow, cli, builder] = await Promise.all([
      readFile(absolute(AUTH_WORKFLOW), 'utf8'),
      readFile(absolute(AUTH_CLI), 'utf8'),
      readFile(absolute(AUTH_BUILDER), 'utf8'),
    ]);

    expect(workflow).toContain(AUTH_CLI);
    expect(cli).toContain('buildTopStoriesPilotDecision');
    expect(cli).toContain('TOP_STORIES_PILOT_DECISION_SCHEMA');
    expect(builder).toContain(`'${AUTH_SCHEMA}'`);
    expect(builder).toContain('export function buildTopStoriesPilotDecision');
    expect(builder).toContain('productionChangeAuthorized: false');
    expect(builder).toContain('automaticPolicyChangeAuthorized: false');
  });

  it('keeps the NW-RANK-011H historical report family present', async () => {
    const reports = (await readdir(absolute('reports')))
      .filter(name => name.startsWith('NW-RANK-011H_'))
      .sort();
    expect(reports.length).toBeGreaterThan(0);
    expect(await Promise.all(reports.map(name => exists(`reports/${name}`))))
      .toEqual(reports.map(() => true));
  });
});
