import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['src/lib/battle-pass-seatalk-idle-gate.test.ts','src/lib/creative-seatalk-scheduler-ready-gate.test.ts'],
  cache: false, pool: 'forks', poolOptions: { forks: { singleFork: true } },
  testTimeout: 20000, hookTimeout: 20000
} });
