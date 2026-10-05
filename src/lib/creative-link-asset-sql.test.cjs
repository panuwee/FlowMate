const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
let db;const owner='00000000-0000-0000-0000-000000000001',requester='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',viewer='00000000-0000-0000-0000-000000000004';
const item='10000000-0000-0000-0000-000000000001';
async function actor(id){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);}
const add=(kind,key,url='https://example.test/asset')=>db.query('select add_work_item_link_with_kind($1,$2,$3,$4,$5) value',['CR-TEST',url,'Asset submission',kind,`20000000-0000-0000-0000-${String(key).padStart(12,'0')}`]);
before(async()=>{db=new PGlite();await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table users(id uuid primary key,is_active boolean default true,role text);
insert into users(id,role) values('${owner}','member'),('${requester}','member'),('${other}','member'),('${viewer}','viewer');
create table team_members(id uuid primary key,user_id uuid);
create table work_items(id uuid primary key,display_id text,work_type text,status text,archived_at timestamptz,assignee_user_id uuid,final_owner_member_id uuid,read_allowed boolean default true);
insert into work_items(id,display_id,work_type,status,assignee_user_id) values('${item}','CR-TEST','creative_request','in_progress','${owner}');
create table work_item_links(id uuid primary key default gen_random_uuid(),work_item_id uuid,url text,description text,created_by_user_id uuid,created_at timestamptz default clock_timestamp(),deleted_at timestamptz);
create table work_item_events(id uuid primary key default gen_random_uuid(),work_item_id uuid,actor_user_id uuid,to_status text,metadata jsonb,created_at timestamptz default clock_timestamp());
create table creative_kpi_milestones(work_item_id uuid,milestone text);
create function flowmate_current_user_can_read_work_item(uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.work_items where id=$1 and read_allowed) and auth.uid() in ('${owner}'::uuid,'${requester}'::uuid,'${viewer}'::uuid)$$;
create function flowmate_can_collaborate_on_work_item(uuid,uuid) returns boolean language sql stable as $$select $2 in ('${owner}'::uuid,'${requester}'::uuid,'${viewer}'::uuid)$$;
create function flowmate_kpi_can_view() returns boolean language sql stable as $$select false$$;
create function add_work_item_link(p_display_id text,p_url text,p_description text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare l public.work_item_links;e uuid;begin
insert into public.work_item_links(work_item_id,url,description,created_by_user_id) values('${item}',trim(p_url),nullif(trim(coalesce(p_description,'')),''),auth.uid()) returning * into l;
insert into public.work_item_events(work_item_id,actor_user_id,metadata) values('${item}',auth.uid(),jsonb_build_object('action','add_link','url',l.url,'link_id',l.id)) returning id into e;
return to_jsonb(l)||jsonb_build_object('event_id',e);end $$;
alter table work_item_links enable row level security;create policy link_read on work_item_links for select to authenticated using(deleted_at is null and flowmate_current_user_can_read_work_item(work_item_id));
alter table work_item_events enable row level security;create policy event_read on work_item_events for select to authenticated using(flowmate_current_user_can_read_work_item(work_item_id));
grant select on work_item_links,work_item_events to authenticated;
insert into work_item_links(work_item_id,url,created_by_user_id) values('${item}','https://example.test/legacy','${owner}');
`);await db.exec(fs.readFileSync('supabase/creative_link_asset_evidence.sql','utf8'));}, {timeout:30000});
after(async()=>{await db?.close();});
test('migration preserves old links as general and does not backfill events',async()=>{
assert.equal((await db.query('select link_kind from work_item_links')).rows[0].link_kind,'general');assert.equal((await db.query('select count(*)::int n from work_item_events')).rows[0].n,0);
assert.equal((await db.query("select has_function_privilege('anon','add_work_item_link_with_kind(text,text,text,text,uuid)','execute') n")).rows[0].n,false);
});
test('receiver submission preserves status and stores immutable server-actor evidence',async()=>{
await actor(owner);const a=(await add('first_draft',1)).rows[0].value;assert.equal(a.link_kind,'first_draft');assert.equal(a.created_by_user_id,owner);assert.equal(a.kpi_eligible,true);
const e=(await db.query('select * from work_item_events where id=$1',[a.event_id])).rows[0];assert.equal(e.metadata.kpi_evidence_source,'link_zone_v1');assert.equal(e.metadata.url,'https://example.test/asset');assert.equal(e.actor_user_id,owner);
await assert.rejects(db.exec('update work_item_events set metadata=\'{}\''),/permission denied/);
await db.exec('reset role');assert.equal((await db.query('select status from work_items')).rows[0].status,'in_progress');
});
test('retry returns same link while changed payload cannot reuse a request key',async()=>{
await actor(owner);const a=(await add('final_asset',2)).rows[0].value,b=(await add('final_asset',2)).rows[0].value;assert.equal(a.id,b.id);assert.equal(a.event_id,b.event_id);assert.equal(a.kpi_eligible,b.kpi_eligible);
await assert.rejects(add('first_draft',2),/reused/);assert.equal((await db.query('select count(*)::int n from work_item_events')).rows[0].n,2);
});
test('requester, unrelated actor, viewer and no actor cannot manufacture receiver evidence',async()=>{
for(const id of [requester,other,viewer,'']){await actor(id);await assert.rejects(add('first_draft',3),/authorized|receiver/);}
});
test('canonical visibility and invalid URLs fail before any link is created',async()=>{
await actor(owner);await assert.rejects(add('first_draft',4,'javascript:alert(1)'),/http/);
await db.exec('reset role;update work_items set read_allowed=false');await actor(owner);await assert.rejects(add('first_draft',4),/authorized/);
await db.exec('reset role;update work_items set read_allowed=true');
});
test('reviewed work captures the actual new submission; visible-link removal retains evidence',async()=>{
await db.exec(`reset role;insert into work_item_events(work_item_id,to_status,metadata) values('${item}','review','{}');`);await actor(owner);
const a=(await add('first_draft',5)).rows[0].value;assert.equal(a.kpi_eligible,true);
await db.exec('reset role');await db.query('update work_item_links set deleted_at=clock_timestamp() where id=$1',[a.id]);await actor(owner);
assert.equal((await db.query('select count(*)::int n from work_item_links where id=$1',[a.id])).rows[0].n,0);
assert.equal((await db.query('select metadata from work_item_events where id=$1',[a.event_id])).rows[0].metadata.link_kind,'first_draft');
});
test('completed, cancelled, archived and Task Assign work cannot receive new Creative evidence',async()=>{
for(const update of ["status='delivered'","status='cancelled'","archived_at=clock_timestamp()","work_type='quick_task'"]){await db.exec(`reset role;update work_items set status='in_progress',archived_at=null,work_type='creative_request';update work_items set ${update}`);await actor(owner);await assert.rejects(add('final_asset',6),/open Creative/);}
});
