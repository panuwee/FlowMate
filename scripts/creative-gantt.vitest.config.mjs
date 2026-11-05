import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['src/lib/creative-gantt*.test.ts'],
  exclude: ['output/**', '.worktrees/**', 'node_modules/**'],
  testTimeout: 15000, hookTimeout: 30000,
} });
