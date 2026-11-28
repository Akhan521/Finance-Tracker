import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'db',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          // Auth-heavy setups and fixed sleeps need more than Vitest's 5 s default.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          globalSetup: 'tests/helpers/env.ts',
        },
      },
    ],
  },
});
