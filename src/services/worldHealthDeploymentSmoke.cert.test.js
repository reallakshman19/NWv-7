import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const smoke = fs.readFileSync('scripts/verify_world_health_deployment.mjs', 'utf8');

describe('NW-DEPLOY-001 World health deployment verification', () => {
  it('runs after the real Pages deployment using the emitted page URL', () => {
    expect(workflow).toContain('verify-world-health:');
    expect(workflow).toContain('needs: deploy');
    expect(workflow).toContain('page_url: ${{ steps.deployment.outputs.page_url }}');
    expect(workflow).toContain('DEPLOYED_BASE_URL: ${{ needs.deploy.outputs.page_url }}');
    expect(workflow).toContain('node scripts/verify_world_health_deployment.mjs');
  });

  it('uploads browser evidence even when the smoke check fails', () => {
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('world-health-deployment-verification');
    expect(workflow).toContain('artifacts/world-health-deployment');
  });

  it('rejects unknown World health and requires concrete source evidence', () => {
    expect(smoke).toContain("page.locator('#world-news')");
    expect(smoke).toContain("worldSection.locator('.section-health-badge')");
    expect(smoke).toContain("['ok', 'warning', 'critical'].includes(report.badgeStatus)");
    expect(smoke).toContain('/unknown\\s*[—-]\\s*diagnostics unavailable/i.test(dialogText)');
    expect(smoke).toContain("report.sectionId !== 'world'");
    expect(smoke).toContain('report.storyCount <= 0');
    expect(smoke).toContain('report.sourceGroupCount <= 0');
    expect(smoke).toContain('/none recorded/i.test(report.topSourcesText)');
  });
});
