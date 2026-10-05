// Local review artifact only: never commits, deploys, changes a branch or calls a provider.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const baseline = '4663e6f66b8dd72f7cf4e3b6cfe641b67d172459';
const out = path.join(root, 'output', 'control-center-release-20261005');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const base = file => cp.execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
const write = (file, value) => { const dest = path.join(out, file); fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.writeFileSync(dest, value); };
function replaceOnce(value, anchor, replacement) {
  if (value.split(anchor).length !== 2) throw new Error('Baseline anchor changed: ' + anchor.slice(0, 80));
  return value.replace(anchor, replacement);
}
const files = [
  'workgrid-control-center.jsx', 'workgrid-control-center.js', 'workgrid-control-center.css',
  'home/control-center.html', 'supabase/workgrid_control_center.sql',
  'supabase/workgrid_control_center_adapters.sql', 'supabase/workgrid_control_center_preflight.sql',
  'supabase/functions/workgrid-control-center/index.ts',
  'supabase/functions/workgrid-control-center/deploy.ts',
  'src/lib/control-center/native-contracts.sql', 'src/lib/control-center/fixture.sql',
  'src/lib/control-center/database.test.ts', 'src/lib/control-center/adapters.test.ts',
  'src/lib/control-center/provider.test.ts', 'src/lib/control-center/ui.test.ts',
  'src/lib/control-center/vitest.config.mjs',
  'docs/WORKGRID_CONTROL_CENTER_PRODUCTION_PREFLIGHT_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_SQL_INSTALL_RESULT_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_DEPLOY_REVIEW_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_WORKER_DEPLOY_RESULT_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_SPEC_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_IMPLEMENTATION_PLAN_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_ORCHESTRATION_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_LOCAL_HANDOFF_20261005.md',
  'docs/WORKGRID_CONTROL_CENTER_UI_PUBLICATION_REVIEW_20261005.md',
  'scripts/workgrid-control-center-package.cjs',
  'scripts/workgrid-control-center-ui-rehearsal.cjs',
  'scripts/workgrid-control-center-preview.cjs'
];
for (const file of files) write(file, read(file));
// Extract only the previously reviewed WCC additions from the dirty checkout.
const current = read('app.jsx');
const accessStart = current.indexOf('  const [controlCenterAccess,');
const accessEnd = current.indexOf('  useEffectApp(() => {\n    let cancelled = false;', accessStart);
if (accessStart < 0 || accessEnd < 0) throw new Error('WCC access fragment missing');
let app = replaceOnce(base('app.jsx'), '  const [automationAccess, setAutomationAccess] = useStateApp({ userId: null, state: "loading" });\n',
  '  const [automationAccess, setAutomationAccess] = useStateApp({ userId: null, state: "loading" });\n' + current.slice(accessStart, accessEnd));
const navStart = current.indexOf('(isAdminUser || controlCenterAccess.userId');
const navEnd = current.indexOf('React.createElement(LiveStatus, {', navStart);
if (navStart < 0 || navEnd < 0) throw new Error('WCC navigation fragment missing');
app = replaceOnce(app, '}, "Activity Automation"), React.createElement(LiveStatus, {',
  '}, "Activity Automation"), ' + current.slice(navStart, navEnd) + 'React.createElement(LiveStatus, {');
const team = replaceOnce(base('screens-b.jsx'), 'People, access & creative capacity</div>',
  'People, access & creative capacity · <a href={new URL("home/control-center.html", document.baseURI).href}>ตั้งค่า SeaTalk Notifications</a></div>');
const build = replaceOnce(base('build-github.cjs'), '"screens-task-assign.jsx", "app.jsx"]',
  '"screens-task-assign.jsx", "app.jsx", "workgrid-control-center.jsx"]');
for (const [file, value] of [['app.jsx', app], ['screens-b.jsx', team], ['build-github.cjs', build]]) {
  write(file, value);
  if (file.endsWith('.jsx')) {
    const compiled = babel.transformSync(value, {filename:file,babelrc:false,configFile:false,
      presets:[['@babel/preset-react',{runtime:'classic'}]],compact:false,comments:false});
    write(file.replace('.jsx','.js'), `/* AUTO-GENERATED from ${file} by build-github.cjs. Do not edit; edit the .jsx and re-run \`npm run build:github\`. */\n${compiled.code}\n`);
  }
  // Review-only patch: compare against the fresh release, not against root HEAD.
  const before = path.join(out, '.baseline', file);
  fs.mkdirSync(path.dirname(before), {recursive:true}); fs.writeFileSync(before, base(file));
  const diff = cp.spawnSync('git', ['diff','--no-index','--',before,path.join(out,file)], {cwd:root,encoding:'utf8'});
  if (![0,1].includes(diff.status)) throw new Error(diff.stderr);
  write('review/' + file + '.diff', diff.stdout);
}
write('review/function-config.toml', '# Merge this entry only into the release configuration; do not copy root config.\n[functions.workgrid-control-center]\nverify_jwt = false\nentrypoint = "./functions/workgrid-control-center/deploy.ts"\n');
// Compose function config from the release baseline; retain every existing entry.
const config = base('supabase/config.toml');
if (config.includes('[functions.workgrid-control-center]')) throw new Error('WCC function already exists in baseline; review before replacing');
write('supabase/config.toml', config.trimEnd() + '\n\n[functions.workgrid-control-center]\nverify_jwt = false\nentrypoint = "./functions/workgrid-control-center/deploy.ts"\n');
const shipped = [...files, 'app.jsx','app.js','screens-b.jsx','screens-b.js','build-github.cjs','supabase/config.toml'];
// Run the released stamping implementation with an explicit content fingerprint.
const stampHash = crypto.createHash('sha256');
for (const file of shipped) stampHash.update(file).update(fs.readFileSync(path.join(out,file)));
const releaseStamp = '20261005-' + stampHash.digest('hex').slice(0,6);
for (const file of ['index.html','home/index.html','product-book/index.html','scripts/release-stamp.cjs']) write(file,base(file));
cp.execFileSync(process.execPath,[path.join(out,'scripts/release-stamp.cjs')],{cwd:out,env:{...process.env,FLOWMATE_RELEASE_STAMP:releaseStamp},stdio:'inherit'});
shipped.push('index.html','home/index.html','product-book/index.html');
const manifest = {version:'0.6',baseline,project:'jbavahimqjalvcfawgqw',createdAt:new Date().toISOString(),
  releaseStamp,
  status:'review overlay; SQL installed and worker v1 deployed; UI publication, recipient configuration and live pilot pending',
  files:shipped.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')}))};
write('manifest.json', JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${shipped.length} files at ${out}; baseline ${baseline}; no publication.`);
