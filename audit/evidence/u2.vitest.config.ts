import { defineConfig } from 'vitest/config';

// Isolated config for U2 harnesses that must import the viewModel (which pulls in
// React contexts via extensionless imports vite resolves but plain node cannot).
// Mirrors audit/evidence/u0.vitest.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'audit/evidence/u2_6_windowing.harness.test.mjs',
    ],
    globals: true,
    testTimeout: 120000,
  },
});
