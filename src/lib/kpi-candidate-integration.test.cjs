const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),ts=require('typescript');
const source=fs.readFileSync('app.jsx','utf8'),parsed=ts.createSourceFile('app.jsx',source,ts.ScriptTarget.ES2020,true,ts.ScriptKind.JSX);
function fn(name){let result;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)result=n.getText(parsed);ts.forEachChild(n,visit);}visit(parsed);assert.ok(result,name+' missing');return result;}
const maps=source.match(/const TASK_ASSIGN_HASH_TO_ROUTE = \{[\s\S]*?\n\};/)[0]+'\n'+source.match(/const TASK_ASSIGN_ROUTE_TO_HASH = [^\n]+/)[0];
function sandbox(){const box={TASK_ASSIGN_PRODUCT_KEY:'task-assign',window:{location:{hash:''}},route:'kpi',TITLE_MAP:{kpi:'ภาพรวม KPI'},activeProduct:'task-assign',changes:[],setActiveProduct:v=>box.changes.push(['product',v]),setFocusId:v=>box.changes.push(['id',v]),setRoute:v=>box.changes.push(['route',v])};vm.runInNewContext(maps+'\n'+fn('getProductHashRoute')+'\n'+fn('getFlowMateKpiDetailDestination')+'\n'+fn('openKpiWorkItem')+'\n'+fn('nav'),box);return box;}
test('KPI detail destination uses explicit domain and preserves Task Assign product hashes',()=>{
 const box=sandbox();for(const [id,domain,productKey,hash] of [['opaque-id','task','task-assign','task-assign-detail/opaque-id'],['QT-looking-id','creative','flowmate','detail/QT-looking-id'],['opaque-id','requester','flowmate','detail/opaque-id']])assert.deepEqual(JSON.parse(JSON.stringify(box.getFlowMateKpiDetailDestination(id,domain))),{productKey,route:'detail',hash});
});
test('opening a Task KPI row switches product, retains back context and only changes navigation',()=>{
 const box=sandbox();box.window.saveFlowMateDetailBackContext=v=>box.back=v;box.openKpiWorkItem('opaque-id','task');assert.equal(box.window.location.hash,'task-assign-detail/opaque-id');assert.deepEqual(box.changes,[['product','task-assign'],['id','opaque-id'],['route','detail']]);assert.equal(box.back.route,'kpi');
});
test('KPI navigation from Task Assign switches to FlowMate while ordinary Task Assign links retain hashes',()=>{
 const box=sandbox();box.nav('kpi-requester');assert.equal(box.window.location.hash,'kpi-requester');assert.deepEqual(box.changes,[['product','flowmate'],['route','kpi-requester']]);box.changes.length=0;box.nav('board');assert.equal(box.window.location.hash,'task-assign-board');assert.deepEqual(box.changes,[['route','board']]);
});
test('actual KPI evidence buttons dispatch their domain, including the shared panel implementation',async()=>{
 const {createClient,makeTables}=require('./fixtures/kpi-fixture.cjs'),user={id:'test-lead',role:'member',can_access_all_teams:true};
 const box={exports:{},AbortController,Date,Intl,setTimeout,clearTimeout};vm.runInNewContext(ts.transpileModule(fs.readFileSync('kpi-workspace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,box);const api=box.FlowMateKpi;
 for(const domain of ['creative','requester','task']){
  const snapshot=await api.load(createClient(makeTables()),user,domain,'2026-09'),metric=domain==='creative'?'C04':domain==='requester'?'R03':'T03';
  const state=[snapshot,{status:'ready'},0,'','',metric,0,false,'',null];let index=0,opened;
  const react={Fragment:Symbol('fragment'),useState:()=>[state[index++],()=>{}],useEffect:()=>{},useRef:()=>({current:null}),createElement:(type,props,...children)=>({type,props:props||{},children})};
  const ui={React:react,window:{FlowMateKpi:api,FLOWMATE_CURRENT_USER:user},Intl,Date};vm.runInNewContext(ts.transpileModule(fs.readFileSync('screens-kpi.jsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText,ui);
  const tree=ui.FlowMateKpiDomainPanel({domain,month:'2026-09',scope:api.scopeKey(user),overview:false,onOpen:(id,kind)=>opened={id,kind},onNav:()=>{}}),expected=api.metrics(snapshot).find(m=>m.id===metric).cohort[0].displayId;
  function find(node){if(Array.isArray(node)){for(const n of node){const hit=find(n);if(hit)return hit;}}else if(node&&typeof node==='object'){if(node.type==='button'&&node.children.includes(expected))return node;return find(node.children);}return null;}
  const button=find(tree);assert.ok(button,domain+' evidence button');button.props.onClick();assert.deepEqual(opened,{id:expected,kind:domain});
 }
});
test('release integration retains baseline packages, Task Assign source list, EOL handling and stamps KPI assets',()=>{
 const base='b26a4e3df7aedfadbc6de84bdd00bd8734e367ba',gitRoot='.';
 for(const file of ['package.json','package-lock.json'])assert.equal(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),cp.execFileSync('git',['-C',gitRoot,'show',base+':'+file],{encoding:'utf8'}).replace(/\r\n/g,'\n'));
 const build=fs.readFileSync('build-github.cjs','utf8');assert.ok(build.includes('"screens-task-assign.jsx"'));assert.ok(build.includes('const normalizeEol'));
 const stamp=fs.readFileSync('scripts/release-stamp.cjs','utf8');for(const asset of ['kpi-workspace.css','kpi-workspace.js','screens-kpi.js'])assert.ok(stamp.includes('"'+asset+'"'));
 assert.ok(source.includes('React.createElement(TaskAssignWorkspaceScreen'));assert.ok(source.includes('isTaskAssignProduct ? TaskAssignDetailScreen : DetailScreen'));
});
