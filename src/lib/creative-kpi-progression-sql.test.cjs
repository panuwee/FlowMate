const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const ids={lead:'00000000-0000-0000-0000-000000000001',requester:'00000000-0000-0000-0000-000000000002',owner:'00000000-0000-0000-0000-000000000003',other:'00000000-0000-0000-0000-000000000004',member:'00000000-0000-0000-0000-000000000005',task:'00000000-0000-0000-0000-000000000006'};
async function database(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create table users(id uuid primary key,is_active boolean);
    create table team_members(id uuid primary key,user_id uuid,member_code text,display_name text);
    create table work_items(id uuid primary key,work_type text,status text,created_at timestamptz default now(),due_date date,launch_date date,delivered_at timestamptz,final_owner_member_id uuid,requester_user_id uuid,archived_at timestamptz);
    create table creative_request_details(work_item_id uuid primary key,brief_link text);
    create table work_item_events(id bigint generated always as identity,work_item_id uuid,actor_user_id uuid,event_type text,from_status text,to_status text,metadata jsonb default '{}',created_at timestamptz default now());
    create table assignment_runs(id bigint generated always as identity,work_item_id uuid,final_owner_member_id uuid,ran_at timestamptz default now());
    create table work_item_ai_tags(work_item_id uuid,tag text);
    create table flowmate_non_working_days(day date,scope text,active boolean);
    create function flowmate_current_user_has_all_team_access() returns boolean language sql stable as $$select auth.uid()='${ids.lead}'::uuid$$;
    create function flowmate_can_read_work_item(w uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.work_items wi left join public.team_members tm on tm.id=wi.final_owner_member_id where wi.id=w and (wi.requester_user_id=u or tm.user_id=u))$$;
    create function flowmate_kpi_ai_tags(w uuid) returns text[] language sql stable as $$select coalesce(array_agg(tag),'{}') from public.work_item_ai_tags where work_item_id=w$$;
    insert into users values('${ids.lead}',true),('${ids.requester}',true),('${ids.owner}',true),('${ids.other}',true);
    insert into team_members values('${ids.member}','${ids.owner}','ploy','Ploy');
    grant select on all tables in schema public to authenticated;
  `);
  const foundation=fs.readFileSync('supabase/creative_monthly_kpi_data_foundation.sql','utf8');
  await db.exec(foundation.slice(foundation.indexOf('create or replace function public.flowmate_kpi_can_view()'),foundation.indexOf('create or replace view public.flowmate_creative_kpi_facts_v')));
  await db.exec(`create view flowmate_creative_kpi_report_v with(security_invoker=true) as
    select wi.id as work_item_id,wi.created_at,wi.due_date,wi.launch_date,wi.delivered_at,wi.status,
    public.flowmate_kpi_ai_tags(wi.id) as ai_tags,
    (select min(created_at) from work_item_events where work_item_id=wi.id and to_status='assigned') as assigned_at,
    (select min(created_at) from work_item_events where work_item_id=wi.id and to_status='in_progress') as started_at,
    (select min(created_at) from work_item_events where work_item_id=wi.id and from_status='in_progress' and to_status='review') as review_submitted_at
    from work_items wi where flowmate_kpi_can_view();
    grant select on flowmate_creative_kpi_report_v to authenticated;`);
  await db.exec(fs.readFileSync('supabase/creative_kpi_progression.sql','utf8'));
  return db;
}
async function login(db,id,role='authenticated'){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id||''}',false);set role ${role};`);}
async function seed(db){await db.exec(`reset role;insert into work_items(id,work_type,status,due_date,launch_date,final_owner_member_id,requester_user_id) values('${ids.task}','creative_request','assigned','2026-09-16','2026-09-18','${ids.member}','${ids.requester}');insert into creative_request_details values('${ids.task}','https://example.com/brief');`);}
test('SQL installs and is repeatable; snapshots freeze AI/deadline and first delivery after reopen',async()=>{
  const db=await database();try{
    await db.exec(fs.readFileSync('supabase/creative_kpi_progression.sql','utf8'));
    await seed(db);
    await db.exec(`insert into work_item_ai_tags values('${ids.task}','AI');update work_items set status='in_progress' where id='${ids.task}';update work_items set status='review' where id='${ids.task}';update work_items set status='delivered',delivered_at=now() where id='${ids.task}';`);
    const before=(await db.query(`select * from creative_kpi_milestones where milestone='delivered'`)).rows[0];
    await db.exec(`delete from work_item_ai_tags;update work_items set status='in_progress',due_date='2026-09-20';update work_items set status='delivered',delivered_at=now();`);
    const after=(await db.query(`select * from creative_kpi_milestones where milestone='delivered'`)).rows[0];
    assert.deepEqual(after,before);assert.deepEqual(after.ai_tags,['AI']);
    await login(db,ids.lead);
    const row=(await db.query('select * from flowmate_creative_kpi_progression_v')).rows[0];
    assert.equal(row.evaluation_due.toISOString().slice(0,10),'2026-09-16');assert.deepEqual(row.delivered_ai_tags,['AI']);assert.equal(row.ai_evidence_source,'delivery_snapshot');assert.equal(row.deadline_history.length,1);
    await assert.rejects(db.exec(`update creative_kpi_milestones set ai_tags='{}'`),/permission denied/);
  }finally{await db.close();}
});
test('brief permissions, stale submission, Lead reason, audit and direct-write denial',async()=>{
  const db=await database();try{
    await seed(db);await login(db,ids.other);
    await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}')`),/Not authorized/);
    assert.equal((await db.query('select * from creative_kpi_brief_evidence')).rows.length,0);
    await login(db,ids.owner);await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}','submitted','brief')`),/Only the requester/);
    await login(db,ids.requester);
    const result=(await db.query(`select flowmate_creative_brief('${ids.task}','submitted','version 1') as value`)).rows[0].value;
    const v1=result.history[0].id;
    await db.query(`select flowmate_creative_brief('${ids.task}','submitted','version 2')`);
    await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}','accepted','okay',${v1})`),/Only the owner/);
    await login(db,ids.owner);await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}','accepted','okay',${v1})`),/brief changed/);
    const v2=(await db.query(`select flowmate_creative_brief('${ids.task}') as value`)).rows[0].value.history[0].id;
    await login(db,ids.lead);await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}','accepted','',${v2})`),/Record confirmation/);
    const accepted=(await db.query(`select flowmate_creative_brief('${ids.task}','accepted','Owner on leave; checked with team',${v2}) as value`)).rows[0].value;
    assert.equal(accepted.history[0].action,'accepted');assert.equal(accepted.history[0].actor_user_id,ids.lead);
    await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}','accepted','again',${v2})`),/already accepted/);
    await assert.rejects(db.exec(`delete from creative_kpi_brief_evidence`),/permission denied/);
    const audit=(await db.query(`select metadata from work_item_events where metadata->>'action'='brief_accepted'`)).rows[0];assert.equal(audit.metadata.on_behalf,true);
    await login(db,null,'anon');await assert.rejects(db.query('select * from flowmate_creative_kpi_progression_v'),/permission denied/);await assert.rejects(db.query(`select flowmate_creative_brief('${ids.task}')`),/permission denied/);
  }finally{await db.close();}
});
test('legacy event cohort, no invented snapshots, role gating and signed weekday gap',async()=>{
  const db=await database();try{
    await db.exec(`alter table work_items disable trigger creative_kpi_capture_milestone;`);await seed(db);
    await db.exec(`insert into work_item_events(work_item_id,to_status,from_status,created_at) values
      ('${ids.task}','delivered','review','2026-08-31T17:00:00Z'),('${ids.task}','delivered','review','2026-10-01T00:00:00Z'),('${ids.task}','in_progress','assigned','2026-08-01T00:00:00Z');
      insert into assignment_runs(work_item_id,final_owner_member_id,ran_at) values('${ids.task}','${ids.member}','2026-07-01');
      alter table work_items enable trigger creative_kpi_capture_milestone;`);
    await login(db,ids.lead);
    const row=(await db.query('select * from flowmate_creative_kpi_progression_v')).rows[0];assert.equal(row.first_delivery_year,2026);assert.equal(row.delivery_at.toISOString(),'2026-08-31T17:00:00.000Z');assert.equal(row.delivery_snapshot,null);assert.equal(row.delivery_history_owner.owner_name,'Ploy');assert.equal(row.delivered_event_n,2);
    const gap=(await db.query("select flowmate_kpi_working_date_gap('2026-09-18','2026-09-16','gdve') as n")).rows[0].n;assert.equal(gap,-2);
    await db.exec(`reset role;insert into team_members values('00000000-0000-0000-0000-000000000007','${ids.other}','vee','Vee');
      insert into work_item_events(work_item_id,event_type,metadata,created_at) values('${ids.task}','updated','{"action":"assignee_changed","new_member_id":"00000000-0000-0000-0000-000000000007"}','2026-08-20');`);
    await login(db,ids.lead);
    assert.equal((await db.query('select delivery_history_owner from flowmate_creative_kpi_progression_v')).rows[0].delivery_history_owner.owner_name,'Vee');
    await login(db,ids.owner);assert.equal((await db.query('select * from flowmate_creative_kpi_progression_v')).rows.length,0);
  }finally{await db.close();}
});
