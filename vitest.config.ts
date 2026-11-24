import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['backend/tests/**/*.test.ts', 'frontend/tests/**/*.test.tsx'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
