import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Explicitly exclude ALL files under tests/ — those are Playwright E2E specs,
    // not Vitest unit tests. Vitest picks them up by default and fails because
    // they import @playwright/test.
    exclude: [
      'tests/**',
      'node_modules/**',
      'dist/**',
    ],
    // Only include actual unit/integration test files in src or server
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'server/**/*.{test,spec}.ts',
    ],
  },
});
