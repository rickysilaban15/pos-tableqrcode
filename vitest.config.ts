import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./server/__tests__/vitest-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: ['tests/**', 'node_modules/**', 'dist/**'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
  },
});
