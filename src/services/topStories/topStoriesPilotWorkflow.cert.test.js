import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WORKFLOW = path.join(
  ROOT,
  '.github/workflows/top_stories_shadow_pilot_decision.yml',
);
const DOWNLOADER = path.join(
  ROOT,
  'scripts/download_top_stories_pilot_artifacts.mjs',
);

async function text(filePath) {
  return readFile(filePath, 'utf8');
}

describe('Top Stories pilot decision workflow', () => {
  it('is a read-only artifact workflow with deterministic pilot configuration', async () => {
    const workflow = await text(WORKFLOW);
    expect(workflow).toContain("cron: '47 3 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('pilotStartDate');
    expect(workflow).toContain('pilotWindowDays');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('git push');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('Enforce technical failure');
  });

  it('downloads only GitHub Actions artifacts from the two study workflows', async () => {
    const downloader = await text(DOWNLOADER);
    expect(downloader).toContain("const API_ORIGIN = 'https://api.github.com'");
    expect(downloader).toContain("file: 'top_stories_shadow_aggregate.yml'");
    expect(downloader).toContain("file: 'top_stories_shadow_validate_24h.yml'");
    expect(downloader).not.toMatch(/rss|feedUrl|publisherUrl|public\/newsdata/i);
    expect(downloader).not.toContain('git push');
  });
});
