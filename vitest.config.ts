import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'db',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          globalSetup: 'tests/helpers/env.ts',
        },
      },
    ],
  },
});
