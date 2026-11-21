import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Regression: GitHub Actions GITHUB_TOKEN commits do not fire push workflows.
// When the qualified Buzz producer finishes on main, Pages must rebuild from
// the committed data rather than relying on a never-fired bot push event.
const deployment = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const publisher = fs.readFileSync('.github/workflows/buzz_rolling_retention.yml', 'utf8');
const adapter = fs.readFileSync('src/adapters/buzzRetentionFetcher.js', 'utf8');

function hasQualifiedBuzzDeployTrigger(yaml) {
  const workflowRun = yaml.match(/\n  workflow_run:\s*\n    workflows:([\s\S]*?)\n    types:/)?.[1] || '';
  return workflowRun.includes('      - "Buzz Rolling Retention"')
    && /\n    types: \[completed\]/.test(yaml)
    && /\n    branches: \[ main \]/.test(yaml)
    && yaml.includes("github.event.workflow_run.conclusion == 'success'");
}

function hasMainBootstrap(yaml) {
  const pushPaths = yaml.match(/\n  push:\s*\n    branches: \[main\]\n    paths:([\s\S]*?)\n  pull_request:/)?.[1] || '';
  return pushPaths.includes("      - 'public/newsdata/sections_latest.json'")
    && pushPaths.includes("      - '.github/workflows/buzz_rolling_retention.yml'")
    && pushPaths.includes("      - '.github/workflows/deploy.yml'");
}

test('reviewed main releases can bootstrap the first qualified rolling JSON', () => {
  assert.equal(hasMainBootstrap(publisher), true);
  const broken = publisher.replace("      - 'public/newsdata/sections_latest.json'\n", '');
  assert.equal(hasMainBootstrap(broken), false);
});

test('qualified Buzz publication triggers Pages deployment from main', () => {
  assert.equal(hasQualifiedBuzzDeployTrigger(deployment), true);
  assert.match(publisher, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(publisher,
    /git add -- public\/newsdata\/buzz_retained_latest\.json public\/newsdata\/buzz_retention_report\.json/);
  assert.match(adapter, /newsdata\/buzz_retained_latest\.json/);
  assert.doesNotMatch(adapter, /raw\.githubusercontent\.com/);
});

test('missing Buzz workflow trigger is caught instead of passing on a bot push', () => {
  const broken = deployment.replace('      - "Buzz Rolling Retention"\n', '');
  assert.equal(hasQualifiedBuzzDeployTrigger(broken), false);
});
