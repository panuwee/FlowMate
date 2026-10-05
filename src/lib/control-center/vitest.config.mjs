import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['src/lib/control-center/**/*.test.ts'],cache:false,
 pool:'forks',poolOptions:{forks:{singleFork:true}},testTimeout:20000,hookTimeout:30000}});
