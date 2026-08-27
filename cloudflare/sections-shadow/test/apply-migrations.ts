import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { beforeEach } from 'vitest';

beforeEach(async () => {
  const testEnv = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };
  await applyD1Migrations(testEnv.SHADOW_DB, testEnv.TEST_MIGRATIONS);
  await testEnv.SHADOW_DB.batch([
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_browser_quota_daily'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_parity_results'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_current_pointer'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_evidence_objects'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_lane_payloads'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_decisions'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_lane_evidence'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_epochs'),
    testEnv.SHADOW_DB.prepare('DROP TABLE sections_shadow_quota_daily'),
    testEnv.SHADOW_DB.prepare('DROP TABLE d1_migrations'),
  ]);
  await applyD1Migrations(testEnv.SHADOW_DB, testEnv.TEST_MIGRATIONS);
});
