import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['src/lib/team-members/*.test.ts'],testTimeout:15000,hookTimeout:30000}});
