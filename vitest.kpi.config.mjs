import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['src/lib/team-members/navigation.test.ts','src/lib/flowmate-monthly-kpi-ui.uat.test.ts'],cache:false,pool:'forks',poolOptions:{forks:{singleFork:true}}}});
