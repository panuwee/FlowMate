import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:[
  'src/lib/activity-automation/monitor-ui.test.ts',
  'src/lib/activity-automation/monitor-navigation.test.ts',
  'src/lib/activity-automation/monitor-integrations.test.ts',
  'src/lib/activity-automation/operations-workspace.test.ts',
  'src/lib/control-center/ui.test.ts'
],cache:false,pool:'forks',poolOptions:{forks:{singleFork:true}},testTimeout:20000}});
