const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');let db;
const owner='00000000-0000-0000-0000-000000000001',requester='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',viewer='00000000-0000-0000-0000-000000000004';
const item='10000000-0000-0000-0000-000000000001';
async function actor(id){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);}
before(async()=>{db=new PGlite();await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table users(id uuid primary key,is_active boolean default true,role text);
create type priority_level as enum('low','normal','high','urgent');
insert into users(id,role) values('${owner}','member'),('${requester}','member'),('${other}','member'),('${viewer}','viewer');
create table team_members(id uuid primary key,user_id uuid);
create table work_items(id uuid primary key,title text,description text,work_type text,status text,priority text default 'normal',requester_user_id uuid,assignee_user_id uuid,final_owner_member_id uuid,archived_at timestamptz,owning_team_code text default 'ops',task_reference_links text[] default '{}',task_requested_deadline date,task_request_key uuid);
create table work_item_events(id bigint generated always as identity,work_item_id uuid,to_status text,created_at timestamptz default now());
create table creative_kpi_brief_evidence(work_item_id uuid,action text);
create function flowmate_can_read_work_item(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.work_items where id=$1 and ($2 in (requester_user_id,assignee_user_id) or $2='${viewer}'::uuid))$$;
alter table work_items add column current_read_allowed boolean not null default true;
create function flowmate_current_user_can_read_work_item(uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.work_items where id=$1 and current_read_allowed and public.flowmate_can_read_work_item($1,auth.uid()))$$;
create function flowmate_kpi_can_view() returns boolean language sql stable as $$select false$$;
create function task_assign_can_execute(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.work_items where id=$2 and assignee_user_id=$1 and status not in ('cancelled','delivered'))$$;
revoke all on function task_assign_can_execute(uuid,uuid) from public,anon,authenticated;
alter table work_items enable row level security;create policy work_read on work_items for select to authenticated using(flowmate_current_user_can_read_work_item(id));
grant select on work_items,users,team_members to authenticated;
create function task_assign_create(p_source_team text,p_responsible_team text,p_title text,p_note text,p_deadline date,p_request_key uuid,p_review_date date default null,p_project text default null,p_assignee uuid default null,p_priority public.priority_level default 'normal',p_urgent_reason text default null,p_references text[] default '{}',p_confidential boolean default false,p_collaborators uuid[] default '{}',p_parent uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
if p_source_team<>p_responsible_team and p_assignee is not null then raise exception 'Receiving team must assign';end if;
select id into v_id from public.work_items where task_request_key=p_request_key and requester_user_id=auth.uid();if v_id is not null then return jsonb_build_object('id',v_id);end if;
v_id:=gen_random_uuid();insert into public.work_items(id,title,description,work_type,status,requester_user_id,assignee_user_id,priority,task_request_key) values(v_id,p_title,p_note,'quick_task','assigned',auth.uid(),p_assignee,p_priority::text,p_request_key);return jsonb_build_object('id',v_id);end $$;
`);await db.exec(fs.readFileSync('supabase/kpi_measurement_evidence.sql','utf8'));
await db.exec(`insert into work_items(id,title,description,work_type,status,requester_user_id,assignee_user_id,priority,kpi_plan_at_intake) values('${item}','Synthetic only','Complete brief','quick_task','in_progress','${requester}','${owner}','urgent','planned');`);
}, {timeout:30000});
after(async()=>{await db?.close();});
test('install stores the exact 19 approved holidays and does not backfill historical evidence',async()=>{
await db.exec('reset role');const c=(await db.query('select * from flowmate_kpi_calendars')).rows[0];assert.equal(c.holidays.length,19);assert.deepEqual(c.weekdays,[1,2,3,4,5]);
const rows=(await db.query('select * from flowmate_kpi_measurement_evidence')).rows;assert.equal(rows.length,1);assert.equal(rows[0].kind,'intake');assert.equal(rows[0].priority_at_intake,'urgent');assert.equal(rows[0].plan_at_intake,'planned');
await db.exec(fs.readFileSync('supabase/kpi_measurement_evidence.sql','utf8'));assert.equal((await db.query('select count(*)::int n from flowmate_kpi_measurement_evidence')).rows[0].n,1);
});
test('owner records an endpoint and repeated request returns the same append-only row',async()=>{
await actor(owner);const args=[item,'deadline','20000000-0000-0000-0000-000000000001','Agreement','task_submit','2026-12-30'];
const query='select flowmate_kpi_record_evidence($1,$2,$3,$4,$5,$6) value';const a=(await db.query(query,args)).rows[0].value,b=(await db.query(query,args)).rows[0].value;assert.equal(a.id,b.id);assert.equal(a.actor_user_id,owner);
await assert.rejects(db.query(query,[...args.slice(0,5),'2026-12-29']),/reused/);
await assert.rejects(db.exec(`update flowmate_kpi_measurement_evidence set due_date='2026-12-31' where id=${a.id}`),/permission denied/);
});
test('requester, unrelated users, viewers and anonymous role cannot record receiver agreements',async()=>{
for(const id of [requester,other,viewer]){await actor(id);await assert.rejects(db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,$5,$6)',[item,'deadline','20000000-0000-0000-0000-000000000002','Reason','task_submit','2026-12-30']),/authorized|row-level security/);}
await db.exec('reset role;set role anon');await assert.rejects(db.query('select flowmate_kpi_evidence_context($1)',[item]),/permission denied/);
});
test('read visibility and direct writes do not bypass task scope, timestamps, actors or intake capture',async()=>{
await actor(other);assert.equal((await db.query('select * from flowmate_kpi_measurement_evidence')).rows.length,0);
await actor(owner);await assert.rejects(db.query("insert into flowmate_kpi_measurement_evidence(work_item_id,kind,priority_at_intake,plan_at_intake) values($1,'intake','urgent','planned')",[item]),/only captured/);
const row=(await db.query("insert into flowmate_kpi_measurement_evidence(work_item_id,kind,endpoint,due_date,actor_user_id,recorded_at,reason) values($1,'deadline','task_approve','2026-12-30',$2,'2020-01-01','Confirmed') returning *",[item,other])).rows[0];assert.equal(row.actor_user_id,owner);assert.ok(new Date(row.recorded_at).getUTCFullYear()>2020);
});
test('brief confirmation requires current fingerprint and does not accept stale evidence',async()=>{
await actor(owner);const context=(await db.query('select flowmate_kpi_evidence_context($1) value',[item])).rows[0].value;assert.equal(context.can_ready,true);
await assert.rejects(db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,null,null,null,null,$5)',[item,'ready','20000000-0000-0000-0000-000000000003','Checked brief','stale']),/Brief changed/);
const r=(await db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,null,null,null,null,$5)',[item,'ready','20000000-0000-0000-0000-000000000003','Checked brief',context.fingerprint])).rows[0].flowmate_kpi_record_evidence;assert.equal(r.brief_fingerprint,context.fingerprint);
});
test('domain mismatches and post-endpoint deadline backfill are rejected',async()=>{
await actor(owner);await assert.rejects(db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,$5,$6)',[item,'deadline','20000000-0000-0000-0000-000000000004','Reason','creative_draft','2026-12-30']),/domain/);
await db.exec('reset role');await db.query("insert into work_item_events(work_item_id,to_status) values($1,'review')",[item]);await actor(owner);await assert.rejects(db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,$5,$6)',[item,'deadline','20000000-0000-0000-0000-000000000004','Reason','task_submit','2026-12-30']),/already happened/);
});
test('only requester records CSAT for completed work; survey uses current server quarter and valid scale',async()=>{
await db.exec('reset role');await db.query("update work_items set status='delivered' where id=$1",[item]);await actor(owner);await assert.rejects(db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,null,null,null,null,null,$5)',[item,'csat','20000000-0000-0000-0000-000000000005','',5]),/authorized/);
await actor(requester);await assert.rejects(db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,null,null,null,null,null,$5)',[item,'csat','20000000-0000-0000-0000-000000000005','',6]),/check constraint/);
const r=(await db.query('select flowmate_kpi_record_evidence($1,$2,$3,$4,null,null,null,null,null,$5)',[item,'csat','20000000-0000-0000-0000-000000000005','',5])).rows[0].flowmate_kpi_record_evidence;assert.equal(r.score,5);assert.match(r.survey_period,/^20\d\d-Q[1-4]$/);
});
test('planned intake wrapper delegates to existing creation, captures before completion, and preserves idempotent classification',async()=>{
await actor(requester);const key='20000000-0000-0000-0000-000000000007';const query='select task_assign_create_with_kpi($1,$2,$3,$4,$5,$6,p_plan_at_intake=>$7) value',args=['mkt','ops','Synthetic planned task','Expected deliverable','2026-12-30',key,'planned'];const first=(await db.query(query,args)).rows[0].value;
const row=(await db.query("select plan_at_intake,priority_at_intake from flowmate_kpi_measurement_evidence where work_item_id=$1 and kind='intake'",[first.id])).rows[0];assert.equal(row.plan_at_intake,'planned');assert.equal(row.priority_at_intake,'normal');assert.equal((await db.query(query,args)).rows[0].value.id,first.id);
await assert.rejects(db.query(query,[...args.slice(0,6),'unplanned']),/different or missing/);
await assert.rejects(db.query("select task_assign_create_with_kpi('mkt','ops','Synthetic','Expected','2026-12-30',$1,p_assignee=>$2,p_plan_at_intake=>'planned')",['20000000-0000-0000-0000-000000000008',owner]),/Receiving team/);
});
test('schema preflight reads helper bodies, policies and triggers without modifying evidence',async()=>{
await db.exec('reset role');const before=(await db.query('select count(*)::integer n from flowmate_kpi_measurement_evidence')).rows[0].n;
const results=await db.exec(fs.readFileSync('supabase/kpi_measurement_evidence_preflight.sql','utf8'));
assert.ok(results.some(r=>r.rows.some(v=>typeof v.definition==='string'&&v.definition.includes('task_assign_create'))));
assert.ok(results.some(r=>r.rows.some(v=>v.tgname==='kpi_capture_intake')));
assert.equal((await db.query('select count(*)::integer n from flowmate_kpi_measurement_evidence')).rows[0].n,before);
});
test('internal executor stays private while the actor-bound KPI bridge enforces canonical visibility',async()=>{
await actor(owner);await assert.rejects(db.query('select public.task_assign_can_execute($1,$2)',[owner,item]),/permission denied/);
await assert.rejects(db.query('select flowmate_kpi_capture_private.fingerprint($1)',[item]),/permission denied/);
await db.exec('reset role');await db.query('update work_items set current_read_allowed=false where id=$1',[item]);
await actor(owner);assert.equal((await db.query('select public.flowmate_can_read_work_item($1,$2) value',[item,owner])).rows[0].value,true);
assert.equal((await db.query('select flowmate_kpi_capture_private.current_user_can_execute($1) value',[item])).rows[0].value,false);
assert.equal((await db.query('select count(*)::integer n from flowmate_kpi_measurement_evidence where work_item_id=$1',[item])).rows[0].n,0);
await assert.rejects(db.query('select flowmate_kpi_evidence_context($1)',[item]),/Not authorized/);
await db.exec('reset role');await db.query('update work_items set current_read_allowed=true where id=$1',[item]);
await db.exec('set role anon');await assert.rejects(db.query('select flowmate_kpi_capture_private.current_user_can_execute($1)',[item]),/permission denied/);
await db.exec('reset role');
});
test('schema preflight reports missing prerequisites safely on an empty database',async()=>{
const empty=new PGlite();try{const results=await empty.exec(fs.readFileSync('supabase/kpi_measurement_evidence_preflight.sql','utf8'));const prerequisites=results.find(r=>r.rows.some(v=>typeof v.installed==='boolean'));assert.ok(prerequisites);assert.equal(prerequisites.rows.every(v=>v.installed===false),true);}finally{await empty.close();}
});
