const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..');
const source=require('./fixtures/creative-kpi-fast-source.json');
const baseInstall=fs.readFileSync(path.join(root,'supabase/creative_kpi_fast_report_20261027.sql'),'utf8');
const {variantInstaller,reportQuery,buildProbeSuite,buildGateProbeSuite}=require('../../scripts/creative-kpi-probe-variants.cjs');
const {periodInstaller,buildPeriodProbes}=require('../../scripts/build-creative-kpi-period.cjs');
const {buildPeriodVerification}=require('../../scripts/creative-kpi-period-verification.cjs');
const rollback=fs.readFileSync(path.join(root,'supabase/creative_kpi_fast_report_20261027_rollback.sql'),'utf8');
const lead='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',member='00000000-0000-0000-0000-000000000003';
const task=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const login=async(db,id=lead,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role};`);

for(const variant of ['baseline','shared-lookups','per-task-history','shared-report-gate']) {
const install=variantInstaller(baseInstall,variant);
test(`${variant}: fast report preserves full data and permission contracts locally`,async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role authenticated;create role anon;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;
   create type work_type as enum('creative_request','quick_task');
   create type work_status as enum('unassigned','assigned','in_progress','review','delivered','cancelled','blocked');
   create type priority_level as enum('normal','urgent');
   create table users(id uuid primary key,display_name text,is_active boolean,all_teams boolean);
   create table team_members(id uuid primary key,user_id uuid,display_name text,member_code text,discipline text,discipline_short text);
   create table work_items(id uuid primary key,display_id text,title text,priority priority_level,effort_point numeric,status work_status,work_type work_type,
    requester_user_id uuid,requester_team text,final_owner_member_id uuid,due_date date,final_approved_due_date date,launch_date date,delivered_at timestamptz,archived_at timestamptz,created_at timestamptz,visible_to uuid,is_test boolean default false);
   create table creative_request_details(work_item_id uuid primary key,asset_type text,asset_subtype text,asset_count integer,asset_type_2 text,asset_subtype_2 text,asset_count_2 integer);
   create table work_item_events(id bigint generated always as identity,work_item_id uuid,created_at timestamptz,from_status work_status,to_status work_status,actor_user_id uuid,metadata jsonb default '{}');
   create table assignment_runs(id bigint generated always as identity,work_item_id uuid,ran_at timestamptz,final_owner_member_id uuid,result text);
   create table comments(id bigint generated always as identity,work_item_id uuid,author_user_id uuid,created_at timestamptz,deleted_at timestamptz);
   create table work_item_ai_tags(id bigint generated always as identity,work_item_id uuid,tag text,created_at timestamptz);
   create table flowmate_non_working_days(day date primary key,active boolean,scope text);
   create table creative_kpi_milestones(work_item_id uuid,milestone text,occurred_at timestamptz,owner_member_id uuid,owner_name text,owner_code text,due_date date,launch_date date,ai_tags text[],primary key(work_item_id,milestone));
   create table creative_kpi_brief_evidence(id bigint,work_item_id uuid,action text,submission_id bigint,actor_user_id uuid,occurred_at timestamptz,reason text,brief_link text);
   create function flowmate_current_user_has_all_team_access() returns boolean language sql stable as $$select coalesce((select is_active and all_teams from public.users where id=auth.uid()),false)$$;
   create function activity_automation_is_test(w uuid) returns boolean language sql stable as $$select coalesce((select is_test from public.work_items where id=w),false)$$;
   alter table work_items enable row level security;
   create policy tasks on work_items for select to authenticated using(visible_to=auth.uid());
   alter table work_item_events enable row level security;
   create policy events on work_item_events for select to authenticated using(work_item_id in(select id from work_items) and (metadata->>'private') is distinct from 'yes');
   alter table assignment_runs enable row level security;
   create policy assignments on assignment_runs for select to authenticated using(work_item_id in(select id from work_items));
   insert into users values('${lead}','Lead',true,true),('${other}','Other lead',true,true),('${member}','Member',true,false);
   insert into team_members values('${member}','${member}','Designer','ploy','GD','GD');
   insert into flowmate_non_working_days values('2026-09-04',true,'gdve'),('2026-09-07',false,'all');
   insert into work_items(id,display_id,title,status,work_type,created_at,visible_to,requester_user_id,final_owner_member_id,due_date,launch_date,delivered_at)
    select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'CR-'||i,'Synthetic '||i,'delivered','creative_request','2026-09-01','${lead}','${lead}','${member}','2026-09-05','2026-09-03','2026-09-09' from generate_series(1,6)i;
   update work_items set visible_to='${other}' where id='${task(3)}';
   update work_items set is_test=true where id='${task(4)}';
   update work_items set created_at='2025-12-30',archived_at='2026-09-10' where id='${task(5)}';
   update work_items set created_at='2027-01-02' where id='${task(6)}';
   insert into creative_request_details(work_item_id,asset_type,asset_count) select id,'static-graphic',1 from work_items;
   insert into assignment_runs(work_item_id,ran_at,final_owner_member_id,result) select id,'2026-09-01','${member}','assigned' from work_items;
   insert into work_item_events(work_item_id,created_at,from_status,to_status,actor_user_id)
    select id,'2026-09-01'::timestamptz,'unassigned'::work_status,'assigned'::work_status,'${lead}'::uuid from work_items union all
    select id,'2026-09-02','assigned','in_progress','${lead}' from work_items union all
    select id,'2026-09-04','in_progress','review','${lead}' from work_items union all
    select id,'2026-09-08','review','delivered','${lead}' from work_items union all
    select id,'2026-09-09','review','delivered','${lead}' from work_items;
   delete from work_item_events where work_item_id='${task(2)}';
   insert into work_item_events(work_item_id,created_at,from_status,to_status,metadata) values('${task(2)}','2026-09-03','review','delivered','{"private":"yes"}');
   insert into creative_kpi_milestones values('${task(1)}','delivered','2026-09-08','${member}','Frozen designer','ploy','2026-09-05','2026-09-03','{AI}');
   insert into work_item_ai_tags(work_item_id,tag,created_at) values('${task(1)}','Current AI','2026-09-10');
   grant select on all tables in schema public to authenticated;
  `);
  for(const f of source.functions)await db.exec(f.definition);
  for(const v of source.views)await db.exec(`create view public.${v.name} with(security_invoker=true) as ${v.definition};grant select on public.${v.name} to authenticated;`);
  // PGlite's fixture types can change deparser formatting (for example text
  // casts). Bind guards to this isolated database's exact equivalent baseline;
  // keep the shipped production hashes untouched.
  const crypto=require('node:crypto'),md5=s=>crypto.createHash('md5').update(s).digest('hex');
  let localInstall=install;
  for(const v of source.views){
   const actual=(await db.query(`select pg_get_viewdef('public.${v.name}'::regclass,true) d`)).rows[0].d;
   localInstall=localInstall.replaceAll(md5(v.definition),md5(actual));
  }
  const owner=source.functions.find(f=>f.name.startsWith('flowmate_kpi_owner_at('));
  const actualOwner=(await db.query("select pg_get_functiondef('public.flowmate_kpi_owner_at(uuid,timestamptz)'::regprocedure) d")).rows[0].d;
  localInstall=localInstall.replaceAll(md5(owner.definition),md5(actualOwner));
  const localRollback=rollback.replace(md5(baseInstall.split('$fast_report$')[1]),md5(localInstall.split('$fast_report$')[1]));
  await db.exec(localInstall);
  if(variant==='baseline') await t.test('period endpoint preserves complete month cohorts, annual exports and caller permissions',async()=>{
   let periodSql=periodInstaller(baseInstall);
   const shippedPeriod=fs.readFileSync(path.join(root,'supabase/creative_kpi_period_report_20261027.sql'),'utf8');
   assert.equal(periodSql,shippedPeriod);
   for(const v of source.views){
    const actual=(await db.query(`select pg_get_viewdef('public.${v.name}'::regclass,true) d`)).rows[0].d;
    periodSql=periodSql.replaceAll(md5(v.definition),md5(actual));
   }
   periodSql=periodSql.replaceAll(md5(owner.definition),md5(actualOwner));
   await db.exec(periodSql);
   await db.exec(`begin;
    insert into work_items(id,display_id,title,status,work_type,created_at,visible_to,requester_user_id)
    values('${task(7)}','CR-7','Old open work','in_progress','creative_request','2025-12-01','${lead}','${lead}'),
    ('${task(8)}','CR-8','Old unrelated delivered','delivered','creative_request','2025-12-01','${lead}','${lead}'),
    ('${task(9)}','CR-9','January Bangkok boundary','delivered','creative_request','2025-12-01','${lead}','${lead}'),
    ('${task(10)}','CR-10','Future creation with earlier evidence','delivered','creative_request','2026-11-01','${lead}','${lead}'),
    ('${task(11)}','CR-11','Hidden monthly delivery','delivered','creative_request','2025-12-01','${lead}','${lead}'),
    ('${task(12)}','CR-12','Open from next month','in_progress','creative_request','2026-10-01','${lead}','${lead}');
    insert into work_item_events(work_item_id,created_at,from_status,to_status,metadata) values
    ('${task(9)}','2025-12-31T17:00:00Z','review','delivered','{}'),
    ('${task(10)}','2026-09-30T16:59:59Z','review','delivered','{}'),
    ('${task(11)}','2026-09-01','review','delivered','{"private":"yes"}');`);
   await login(db);
   const model=require('../../creative-kpi-report.js');
   for(const month of [null,1,8,9,10,12]){
    const result=(await db.query(`with original as materialized(
      select * from flowmate_creative_kpi_progression_v
      where work_item_id in(select id from work_items where created_at<'2027-01-01T00:00:00+07:00')
      and(created_year=2026 or review_year=2026 or first_delivery_year=2026 or started_year=2026 or(is_open and created_year<=2026))
    ) select (select coalesce(jsonb_agg(to_jsonb(o) order by work_item_id),'[]'::jsonb) from original o) original,
      flowmate_creative_kpi_report_period(2026,$1::integer) candidate`,[month])).rows[0];
    const c=result.candidate;
    assert.equal(c.month,month);assert.equal(c.scope,month===null?'year':'month');assert.equal(c.rowCount,c.rows.length);
    if(month===null)assert.deepEqual(c.rows,result.original);
    const start=month?`2026-${String(month).padStart(2,'0')}-01T00:00:00+07:00`:null;
    const end=month?(month===12?'2027-01-01T00:00:00+07:00':`2026-${String(month+1).padStart(2,'0')}-01T00:00:00+07:00`):null;
    const inPeriod=d=>d&&Date.parse(d)>=Date.parse(start)&&Date.parse(d)<Date.parse(end);
    const expected=month===null?result.original:result.original.filter(r=>[r.created_at,r.review_submitted_at,r.delivery_at,r.acknowledge_at].some(inPeriod)||(r.is_open&&Date.parse(r.created_at)<Date.parse(end)));
    assert.deepEqual(c.rows,expected,`all columns for month ${month}`);
    for(const filters of [{},{role:'GD'},{personId:member},{timingGroup:'unknown'}]){
     const options={year:2026,month,asOf:c.asOf,calendarActiveN:c.calendarActiveN,...filters};
     const annual=model.buildReport(result.original,options),selected=model.buildReport(c.rows,{...options,coverage:c.scope});
     for(const key of ['selected','selectedRows','aiTasks','timingOverview'])assert.deepEqual(selected[key],annual[key],`${month}: ${key}`);
     if(month!==null){assert.equal(selected.annual,null);assert.equal(selected.monthly,null);assert.throws(()=>model.buildWorkbook(selected),/complete annual/);}
    }
   }
   await login(db,other);
   assert.equal((await db.query(`select flowmate_creative_kpi_report_period(2026,9,array['${task(1)}'::uuid]) v`)).rows[0].v.rowCount,0);
   // Leave the fixture transaction before testing errors, since failed SQL
   // statements abort a transaction even when their JS error is caught.
   await db.exec('rollback');await login(db);
   for(const m of [0,13])await assert.rejects(db.query(`select flowmate_creative_kpi_report_period(2026,${m})`),/Invalid Creative report month/);
   await login(db,member);await assert.rejects(db.query('select flowmate_creative_kpi_report_period(2026,9)'),/KPI access denied/);
   await login(db,'','anon');await assert.rejects(db.query('select flowmate_creative_kpi_report_period(2026,9)'),/permission denied/);
   await db.exec('reset role');
   const undo=fs.readFileSync(path.join(root,'supabase/creative_kpi_period_report_20261027_rollback.sql'),'utf8')
    .replace(md5(shippedPeriod.split('$fast_report$')[1]),md5(periodSql.split('$fast_report$')[1]));
   await login(db);
   for(let probe of Object.values(buildPeriodVerification(baseInstall,lead,[task(1)],2026,9))){
    probe=probe.replaceAll(md5(baseInstall.split('$fast_report$')[1]),md5(localInstall.split('$fast_report$')[1]))
     .replaceAll(md5(shippedPeriod.split('$fast_report$')[1]),md5(periodSql.split('$fast_report$')[1]));
    for(const v of source.views){
     const actual=(await db.query(`select pg_get_viewdef('public.${v.name}'::regclass,true) d`)).rows[0].d;
     probe=probe.replaceAll(md5(v.definition),md5(actual));
    }
    probe=probe.replaceAll(md5(owner.definition),md5(actualOwner));
    const results=await db.exec(probe);
    const parity=results.find(r=>r.rows?.[0]?.monthly_parity)?.rows[0].monthly_parity;
    if(parity){assert.equal(parity.missing,0);assert.equal(parity.extra,0);assert.equal(parity.actual_month_rows,3);}
    else {const v=results.find(r=>r.rows?.[0]?.period_verification).rows[0].period_verification;
     assert.equal(v.scope,'month');assert.equal(v.month,9);assert.equal(v.row_count,3);assert.equal(v.returned_rows,3);
     assert.equal(v.security_definer,false);assert.equal(v.anon_can_execute,false);}
   }
   await db.exec('reset role');
   await db.exec(undo);
   assert.ok((await db.query("select to_regprocedure('flowmate_creative_kpi_report_fast(integer,uuid[])') f")).rows[0].f);
   await login(db);
   for(let probe of Object.values(buildPeriodProbes(baseInstall,lead,[task(1)],2026,9))){
    probe=probe.replaceAll(md5(baseInstall.split('$fast_report$')[1]),md5(localInstall.split('$fast_report$')[1]));
    for(const v of source.views){
     const actual=(await db.query(`select pg_get_viewdef('public.${v.name}'::regclass,true) d`)).rows[0].d;
     probe=probe.replaceAll(md5(v.definition),md5(actual));
    }
    probe=probe.replaceAll(md5(owner.definition),md5(actualOwner));
    const results=await db.exec(probe),parity=results.find(r=>r.rows?.[0]?.monthly_parity)?.rows[0].monthly_parity;
    if(parity){assert.equal(parity.missing,0);assert.equal(parity.extra,0);assert.equal(parity.actual_month_rows,3);assert.equal(parity.calendar_matches,true);}
    else assert.ok(results.some(r=>r.rows?.[0]?.['QUERY PLAN']));
   }
   await db.exec('reset role');
  });
  await t.test('all columns match legacy, including reopened, archived, missing evidence and test exclusions',async()=>{
   await login(db);
   const r=(await db.query(`with original as materialized (
    select * from flowmate_creative_kpi_progression_v where work_item_id in(select id from work_items where created_at<'2027-01-01T00:00:00+07:00')
     and(created_year=2026 or review_year=2026 or first_delivery_year=2026 or started_year=2026 or(is_open and created_year<=2026))
   ), fast as(select flowmate_creative_kpi_report_fast(2026) as value)
   select (select jsonb_agg(to_jsonb(o) order by work_item_id) from original o) as original,value from fast`)).rows[0];
   assert.deepEqual(r.value.rows,r.original);assert.equal(r.value.rowCount,3);assert.equal(r.value.calendarActiveN,1);
   assert.equal(r.value.rows.find(r=>r.work_item_id===task(1)).delivered_event_n,2);
   assert.equal(r.value.rows.find(r=>r.work_item_id===task(2)).delivery_at,null);
   assert.ok(r.value.rows.find(r=>r.work_item_id===task(5)));
  });
  await t.test('per-user scope is rechecked; caller-supplied task IDs do not bypass RLS',async()=>{
   await login(db,other);const a=(await db.query(`select flowmate_creative_kpi_report_fast(2026) v`)).rows[0].v;
   assert.deepEqual(a.rows.map(r=>r.work_item_id),[task(3)]);
   const b=(await db.query(`select flowmate_creative_kpi_report_fast(2026,array['${task(1)}'::uuid]) v`)).rows[0].v;
   assert.equal(b.rowCount,0);assert.deepEqual(b.rows,[]);
  });
  await t.test('standalone diagnostic SELECT matches the endpoint without database writes',async()=>{
   await login(db);
   await db.exec('begin read only');
   try {
    const actual=(await db.query(reportQuery(baseInstall,variant,'$1::integer','$2::uuid[]'),[2026,null])).rows[0].snapshot;
    const expected=(await db.query('select flowmate_creative_kpi_report_fast(2026) v')).rows[0].v;
    delete actual.asOf;delete expected.asOf;
    assert.deepEqual(actual,expected);
   } finally {await db.exec('rollback');}
  });
  if(variant==='shared-report-gate') await t.test('report gate is evaluated once within a statement and rechecked for the next caller',async()=>{
   await login(db);
   const plan=(await db.query('explain (analyze,format json) '+reportQuery(baseInstall,variant))).rows[0]['QUERY PLAN'][0].Plan;
   const gates=[];const visit=n=>{if(n['Subplan Name']==='CTE kpi_access')gates.push(n);(n.Plans||[]).forEach(visit);};visit(plan);
   assert.equal(gates.length,1);assert.equal(gates[0]['Actual Loops'],1);
   await login(db,member);
   const denied=(await db.query(reportQuery(baseInstall,variant))).rows[0].snapshot;
   assert.deepEqual(denied.rows,[]);
  });
  await t.test('lookup reuse preserves hidden details and member records under RLS',async()=>{
   await db.exec(`reset role;
    alter table creative_request_details enable row level security;
    create policy details on creative_request_details for select to authenticated using(work_item_id <> '${task(1)}');
    alter table team_members enable row level security;
    create policy members on team_members for select to authenticated using(false);
    alter table users enable row level security;
    create policy users on users for select to authenticated using(id=auth.uid());`);
   await login(db);
   const r=(await db.query(`with original as materialized (
    select to_jsonb(p) value from flowmate_creative_kpi_progression_v p
    where work_item_id in(select id from work_items where created_at<'2027-01-01T00:00:00+07:00')
    and(created_year=2026 or review_year=2026 or first_delivery_year=2026 or started_year=2026 or(is_open and created_year<=2026))
   ), candidate as(select value from jsonb_array_elements(flowmate_creative_kpi_report_fast(2026)->'rows'))
   select (select count(*) from(select * from original except all select * from candidate)d) missing,
          (select count(*) from(select * from candidate except all select * from original)d) extra`)).rows[0];
   assert.equal(Number(r.missing),0);assert.equal(Number(r.extra),0);
   await db.exec('reset role;alter table creative_request_details disable row level security;alter table team_members disable row level security;alter table users disable row level security;');
  });
  await t.test('non-lead, anonymous and null identities cannot read the fast endpoint',async()=>{
   await login(db,member);await assert.rejects(db.query('select flowmate_creative_kpi_report_fast(2026)'),/KPI access denied/);
   await login(db,'');await assert.rejects(db.query('select flowmate_creative_kpi_report_fast(2026)'),/KPI access denied/);
   await login(db,'','anon');await assert.rejects(db.query('select flowmate_creative_kpi_report_fast(2026)'),/permission denied/);
  });
  await t.test('validates year and bounded diagnostic IDs',async()=>{
   await login(db);for(const y of ['null','2025','2101'])await assert.rejects(db.query(`select flowmate_creative_kpi_report_fast(${y})`),/Invalid Creative/);
   await assert.rejects(db.query(`select flowmate_creative_kpi_report_fast(2026,array_fill('${task(1)}'::uuid,array[41]))`),/exceeds 40/);
  });
  await t.test('prepared verification statements execute only reads in the isolated database',async()=>{
   await login(db);
   const evidence=path.resolve(__dirname,'fixtures');
   // Local auth helper reads the fixture claim; no production connection is used.
   const parity=(await db.exec(fs.readFileSync(path.join(evidence,'creative-kpi-verify-40.sql'),'utf8'))).find(r=>r.rows?.[0]?.verification).rows[0].verification;
   assert.equal(parity.different_original,0);assert.equal(parity.different_candidate,0);
   assert.equal(parity.security_definer,false);assert.equal(parity.anon_can_execute,false);
   const year=(await db.exec(fs.readFileSync(path.join(evidence,'creative-kpi-verify-year.sql'),'utf8'))).find(r=>r.rows?.[0]?.full_year_probe).rows[0].full_year_probe;
   assert.equal(year.row_count,3);assert.equal(year.returned_rows,3);
  });
  if(variant==='baseline') await t.test('all four next probes rehearse read-only with synthetic identities and guarded source',async()=>{
   await login(db);
   const suite=buildProbeSuite(baseInstall,lead,[task(1),task(2),task(5)],md5(localInstall.split('$fast_report$')[1]));
   for(let sql of Object.values(suite)){
    for(const v of source.views){
     const actual=(await db.query(`select pg_get_viewdef('public.${v.name}'::regclass,true) d`)).rows[0].d;
     sql=sql.replaceAll(md5(v.definition),md5(actual));
    }
    sql=sql.replaceAll(md5(owner.definition),md5(actualOwner));
    const results=await db.exec(sql);
    const parity=results.find(r=>r.rows?.[0]?.parity)?.rows[0].parity;
    if(parity){
     assert.equal(parity.original_count,3);assert.equal(parity.shared_count,3);assert.equal(parity.task_count,3);
     for(const k of ['shared_missing','shared_extra','task_missing','task_extra'])assert.equal(parity[k],0);
    }else assert.ok(results.some(r=>r.rows?.[0]?.['QUERY PLAN']));
   }
  });
  if(variant==='baseline') await t.test('new gate probes rehearse read-only and reject a non-stable gate',async()=>{
   await login(db);
   const suite=buildGateProbeSuite(baseInstall,lead,[task(1),task(2),task(5)]);
   const adapt=sql=>{
    sql=sql.replaceAll(md5(baseInstall.split('$fast_report$')[1]),md5(localInstall.split('$fast_report$')[1]));
    for(const v of source.views){
     const originalHash=md5(v.definition);
     const match=localInstall.match(new RegExp("pg_get_viewdef\\('public\\."+v.name+"'::regclass,true\\)\\) <> '([0-9a-f]+)'"));
     assert.ok(match);sql=sql.replaceAll(originalHash,match[1]);
    }
    return sql.replaceAll(md5(owner.definition),md5(actualOwner));
   };
   for(const sql of Object.values(suite)){
    const results=await db.exec(adapt(sql));
    const parity=results.find(r=>r.rows?.[0]?.parity)?.rows[0].parity;
    if(parity){assert.equal(parity.original_count,3);assert.equal(parity.candidate_count,3);assert.equal(parity.missing,0);assert.equal(parity.extra,0);}
    else assert.ok(results.some(r=>r.rows?.[0]?.['QUERY PLAN']));
   }
   await db.exec('reset role;alter function flowmate_kpi_can_view() volatile');
   await assert.rejects(db.exec(adapt(suite['gate-1-parity-40.sql'])),/no longer stable/);
   await db.exec('rollback;reset role;alter function flowmate_kpi_can_view() stable');
  });
  await t.test('rollback refuses an endpoint changed after installation',async()=>{
   await db.exec('reset role');
   const ddl=(await db.query("select pg_get_functiondef('public.flowmate_creative_kpi_report_fast(integer,uuid[])'::regprocedure) d")).rows[0].d;
   const changed=ddl.replace('declare v_result jsonb;','declare v_result jsonb; -- changed candidate');assert.notEqual(changed,ddl);
   await db.exec(changed);await assert.rejects(db.exec(localRollback),/Unexpected endpoint/);
   await db.exec('rollback');await db.exec(ddl);
  });
  await t.test('formula drift fails closed and rollback removes only the added endpoint',async()=>{
   await db.exec('reset role');const v=source.views[2];
   await db.exec(`create or replace view public.${v.name} with(security_invoker=true) as select * from (${v.definition.replace(/;\s*$/,'')}) x where true;`);
   await login(db);await assert.rejects(db.query('select flowmate_creative_kpi_report_fast(2026)'),/source changed/);
   await db.exec('reset role');await db.exec(localRollback);
   assert.equal((await db.query("select to_regprocedure('public.flowmate_creative_kpi_report_fast(integer,uuid[])') f")).rows[0].f,null);
   assert.ok((await db.query("select to_regclass('public.flowmate_creative_kpi_progression_v') v")).rows[0].v);
  });
 }finally{await db.close();}
});
}
