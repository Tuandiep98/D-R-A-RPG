import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'tools/**/*.test.ts'],
    testTimeout: 30_000,
    // In-memory PGlite + migrations can take >10 s to boot when the whole repo runs in parallel.
    hookTimeout: 60_000,
    environment: 'node',
  },
});
