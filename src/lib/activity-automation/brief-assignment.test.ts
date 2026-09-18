import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
let db:PGlite;
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read=(p:string)=>readFileSync(p,'utf8');
const q=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema activity_automation_private;create schema battle_pass_private;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type assignment_trigger as enum('create','recheck','rerun');
 create type work_status as enum('unassigned','need_brief','assigned','in_progress','review','blocked','delivered','cancelled');
 create table users(id uuid primary key,is_active boolean,role text default 'member');create table user_team_memberships(user_id uuid,team_code text);create function flowmate_kpi_can_view() returns boolean language sql as $$select exists(select 1 from public.users where id=auth.uid() and role='admin')$$;create function flowmate_can_read_work_item(uuid,uuid) returns boolean language sql as $$select false$$;
 create table work_items(id uuid primary key,display_id text,title text,work_type text default 'creative_request',requester_team text default 'Operations',owning_team_code text default 'ops',requester_user_id uuid,status work_status default 'unassigned',priority text default 'normal',due_date date default current_date,final_approved_due_date date,launch_date date,archived_at timestamptz,final_owner_member_id uuid,assignee_user_id uuid,effort_point integer default 1,needs_split boolean default false,wip_counted boolean default false,assignment_reason text,urgent_reason text,updated_at timestamptz);
 create table team_members(id uuid primary key,user_id uuid,member_code text,display_name text,discipline text,discipline_short text,active boolean default true,skills text[],backup_skills text[] default '{}',availability text default 'available',wip_limit integer default 5,capacity_per_day numeric default 8,capacity_override_per_day numeric);
 create table creative_request_details(work_item_id uuid primary key,brief_link text default 'https://example.org/brief',asset_type text default 'static-graphic',asset_subtype text default 'banner',asset_count integer default 1,asset_type_2 text,asset_subtype_2 text,asset_count_2 integer,brief_completeness_status text,brief_missing_reason text,updated_at timestamptz);
 create table creative_kpi_brief_evidence(id bigint generated always as identity primary key,work_item_id uuid,action text,submission_id bigint unique,actor_user_id uuid,reason text,brief_link text default 'https://example.org/brief');
 create table work_item_events(created_at timestamptz default now(),work_item_id uuid,actor_user_id uuid,event_type text,from_status work_status,to_status work_status,metadata jsonb);
 create table assignment_runs(work_item_id uuid,triggered_by assignment_trigger,result text,reason text,effort_point integer,raw_range_min int,raw_range_max int,was_capped boolean,capacity_snapshot jsonb,suggested_owner_member_id uuid,final_owner_member_id uuid,ran_at timestamptz default now());
 create table flowmate_capacity_allocations(work_item_id uuid,team_member_id uuid,bucket_date date,bucket_half text,capacity_point numeric);
 create table activity_automation_private.runs(id uuid primary key,activity text);
 create table activity_automation_private.output_bindings(work_item_id uuid,run_id uuid);
 create table battle_pass_private.monthly_runs(brief_id uuid,mode text,state text default 'complete',checkpoint jsonb default '{}',period text default '2026-10',review_released_at timestamptz,review_released_by uuid);
 create table battle_pass_private.brief_bindings(brief_id uuid,mode text);
 create function flowmate_brief_missing_reason(uuid) returns text language sql as $$select null::text$$;
 create function flowmate_effort_for_subtype(text,text,integer) returns integer language sql as $$select $3$$;
 create function flowmate_normalize_creative_skill(text,text) returns text language sql as $$select $2$$;
 create function flowmate_next_working_day(date) returns date language sql as $$select $1$$;
 create function flowmate_is_th_business_day(date) returns boolean language sql as $$select true$$;
 create function flowmate_leave_fraction_for_bucket(uuid,date,text) returns numeric language sql as $$select 0::numeric$$;
 create function flowmate_is_gdve_member_code(text) returns boolean language sql as $$select $1 in ('eye','tong','jo','pond','ploy','vee')$$;
 create function flowmate_subtract_th_business_days(date,integer) returns date language sql as $$select $1-$2$$;
 create view flowmate_team_schedule_v as select id work_item_id,title from work_items;create function is_active_app_user() returns boolean language sql as $$select true$$;create function flowmate_normalize_team_code(text) returns text language sql as $$select 'gdve'::text$$;
 `);
 await db.exec(read('src/lib/activity-automation/fixtures/assignment-engine-20260918.sql'));
 await db.exec(read('src/lib/activity-automation/fixtures/allocation-20260918.sql'));
 await db.exec(read('src/lib/activity-automation/fixtures/gantt-rpc-20260918.sql'));
 await db.exec(read('src/lib/activity-automation/fixtures/brief-rpc-20260918.sql'));
 await db.exec(read('supabase/activity_automation_brief_assignment.sql'));
 await db.exec(`create trigger activity_test_guard before update on work_items for each row execute function activity_automation_private.guard_test_work();
 create view test_kpi as select id from work_items where not public.activity_automation_is_test(id);`);
 for(const [n,code,skills] of [[1,'eye',['banner','web-reskin','cdn-design']],[2,'tong',['banner','web-reskin','cdn-design']],[3,'jo',['banner','web-reskin','cdn-design']],[4,'pond',['motion','video-standard']],[5,'ploy',['banner']]] as const){
 await q('insert into users(id,is_active) values($1,true)',[uid(n)]);await q('insert into team_members(id,user_id,member_code,display_name,skills) values($1,$1,$2,$2,$3)',[uid(n),code,skills]);
 }
},30000);
afterAll(async()=>db.close());
async function task(n:number,activity='golden_spin',test=true,skill='banner'){
 const id=uid(n);await q('insert into work_items(id,display_id,title) values($1,$2,$3)',[id,`CR-${n}`,test?`[TEST][4D:test] ${activity}`:activity]);
 await q('insert into creative_request_details(work_item_id,asset_subtype) values($1,$2)',[id,skill]);
 if(activity==='battle_pass') await q("insert into battle_pass_private.brief_bindings values($1,$2)",[id,test?'test':'production']);
 else {await q('insert into activity_automation_private.runs values($1,$2)',[id,activity]);await q('insert into activity_automation_private.output_bindings values($1,$1)',[id]);}
 return id;
}
async function accept(id:string){const [s]=await q("insert into creative_kpi_brief_evidence(work_item_id,action) values($1,'submitted') returning id",[id]);return q("insert into creative_kpi_brief_evidence(work_item_id,action,submission_id,actor_user_id) values($1,'accepted',$2,$3)",[id,s.id,uid(3)]);}
it('does not assign automation before acceptance',async()=>{const id=await task(10);const [r]=await q("select flowmate_run_assignment($1,'recheck') r",[id]);expect(r.r.reason).toBe('Awaiting brief acceptance');expect((await q('select count(*)::int n from assignment_runs'))[0].n).toBe(0);});
it.each(['membership','golden_spin','conqueror_crate','topup_promotion','battle_pass'])('accepts %s and uses existing Operations skill routing',async(activity)=>{const id=await task(20+['membership','golden_spin','conqueror_crate','topup_promotion','battle_pass'].indexOf(activity),activity);await accept(id);const [w]=await q('select w.status,m.member_code from work_items w join team_members m on m.id=w.final_owner_member_id where w.id=$1',[id]);expect(w.status).toBe('assigned');expect(['eye','tong','jo']).toContain(w.member_code);expect((await q('select count(*)::int n from flowmate_capacity_allocations where work_item_id=$1',[id]))[0].n).toBe(0);expect(await q('select * from flowmate_team_schedule_v where work_item_id=$1',[id])).toEqual([]);expect(await q('select * from test_kpi where id=$1',[id])).toEqual([]);});
it('does not rotate or load real routing from TEST assignments',async()=>{const rows=await q("select capacity_snapshot from assignment_runs where result='assigned'");expect(rows.every(r=>r.capacity_snapshot.assigned_count===0)).toBe(true);expect(rows.every(r=>r.capacity_snapshot.last_auto_assigned_at==='-infinity')).toBe(true);});
it('routes motion to Pond and does not assign again',async()=>{const id=await task(30,'golden_spin',true,'motion');await accept(id);const [r]=await q('select m.member_code from work_items w join team_members m on m.id=w.final_owner_member_id where w.id=$1',[id]);expect(r.member_code).toBe('pond');const before=await q('select count(*) n from assignment_runs where work_item_id=$1',[id]);await q("select flowmate_run_assignment($1,'recheck')",[id]);expect(await q('select count(*) n from assignment_runs where work_item_id=$1',[id])).toEqual(before);});
it('keeps no-skill work Unassigned with recorded reason',async()=>{const id=await task(31,'golden_spin',true,'unknown-skill');await accept(id);const [w]=await q('select status,assignment_reason from work_items where id=$1',[id]);expect(w.status).toBe('unassigned');expect(w.assignment_reason).toContain('no eligible');});
it('allows cancellation and archive while retaining TEST exclusion',async()=>{await q("update work_items set status='cancelled',archived_at=now() where id=$1",[uid(21)]);expect(await q('select * from test_kpi where id=$1',[uid(21)])).toEqual([]);});
it('rejects execution and WIP for TEST tasks',async()=>{await expect(q("update work_items set status='in_progress',wip_counted=true where id=$1",[uid(22)])).rejects.toThrow('test_execution_not_enabled');});
it('blocks assignment when latest submitted version has changed',async()=>{const id=uid(10);await q("insert into creative_kpi_brief_evidence(work_item_id,action) values($1,'submitted')",[id]);await expect(q("update work_items set status='assigned' where id=$1",[id])).rejects.toThrow('test_brief_acceptance_required');});
it('is idempotent to install and hides TEST even after title rename',async()=>{await db.exec(read('src/lib/activity-automation/fixtures/brief-rpc-20260918.sql'));
 await db.exec(read('supabase/activity_automation_brief_assignment.sql'));await q("update work_items set title='renamed BP' where id=$1",[uid(24)]);expect((await q('select activity_automation_is_test($1) t',[uid(24)]))[0].t).toBe(true);});

it('registers old and future Battle Pass Brief Links once, without accepting',async()=>{
 const id=await task(41,'battle_pass');
 await db.exec(read('supabase/activity_automation_battle_pass_brief_evidence.sql'));
 await db.exec(read('supabase/activity_automation_battle_pass_brief_evidence.sql'));
 expect((await q("select count(*)::int n from creative_kpi_brief_evidence where work_item_id=$1 and action='submitted'",[id]))[0].n).toBe(1);
 expect((await q("select count(*)::int n from creative_kpi_brief_evidence where work_item_id=$1 and action='accepted'",[id]))[0].n).toBe(0);
 const next=await task(42,'battle_pass');
 expect((await q("select count(*)::int n from creative_kpi_brief_evidence where work_item_id=$1 and action='submitted'",[next]))[0].n).toBe(1);
});it('does not auto-assign a manually requested brief',async()=>{
 const id=uid(50);await q("insert into work_items(id,title) values($1,'manual brief')",[id]);await q('insert into creative_request_details(work_item_id) values($1)',[id]);await accept(id);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('unassigned');
});
it('does not silently accept stale links for assignment',async()=>{
 const id=await task(51);await q("update creative_request_details set brief_link='https://example.org/new' where work_item_id=$1",[id]);await accept(id);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('unassigned');
});
it('does not resurrect cancelled work on acceptance',async()=>{
 const id=await task(52);await q("update work_items set status='cancelled' where id=$1",[id]);await accept(id);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('cancelled');
});
it('requires both primary skills using the existing engine',async()=>{
 const id=await task(53);await q("update creative_request_details set asset_type_2='static-graphic',asset_subtype_2='motion',asset_count_2=1 where work_item_id=$1",[id]);await accept(id);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('unassigned');
});
it('accepted Battle Pass production releases the legacy gate with the actual reviewer',async()=>{
 const id=await task(60,'battle_pass',false,'unknown-skill');
 await q("insert into battle_pass_private.monthly_runs(brief_id,mode) values($1,'production')",[id]);await accept(id);
 const [r]=await q('select review_released_at,review_released_by from battle_pass_private.monthly_runs where brief_id=$1',[id]);expect(r.review_released_at).toBeTruthy();expect(r.review_released_by).toBe(uid(3));
});
it('a held Battle Pass cannot be accepted or released',async()=>{
 const id=await task(61,'battle_pass',false);await q("insert into battle_pass_private.monthly_runs(brief_id,mode,checkpoint) values($1,'production','{\"hold\":\"source_changed\"}')",[id]);
 await expect(accept(id)).rejects.toThrow('Battle Pass source review required');expect((await q("select count(*)::int n from creative_kpi_brief_evidence where work_item_id=$1 and action='accepted'",[id]))[0].n).toBe(0);
});
it('keeps real Battle Pass in Gantt and creates normal allocation',async()=>{
 const id=await task(62,'battle_pass',false,'banner');await q("insert into battle_pass_private.monthly_runs(brief_id,mode) values($1,'production')",[id]);await accept(id);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('assigned');
 expect((await q('select count(*)::int n from flowmate_team_schedule_v where work_item_id=$1',[id]))[0].n).toBe(1);
 expect((await q('select count(*)::int n from flowmate_capacity_allocations where work_item_id=$1',[id]))[0].n).toBeGreaterThan(0);
});
it('allows Operations reviewers for all Operations briefs, but not other teams or inactive users',async()=>{
 await db.exec(read('supabase/activity_automation_ops_brief_reviewers.sql'));
 await q('insert into user_team_memberships values($1,\'ops\')',[uid(3)]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(3)]);
 const id=uid(10);expect((await q("select flowmate_creative_brief($1) r",[id]))[0].r.can_accept).toBe(true);
 const [latest]=await q("select max(id) id from creative_kpi_brief_evidence where work_item_id=$1 and action='submitted'",[id]);
 await q("select flowmate_creative_brief($1,'accepted','Reviewed by Operations',$2)",[id,latest.id]);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('assigned');
 await expect(q("select flowmate_creative_brief($1,'accepted','double click',$2)",[id,latest.id])).rejects.toThrow('already accepted');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(2)]);
 await expect(q('select flowmate_creative_brief($1)',[id])).rejects.toThrow('Not authorized');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(3)]);
 await q('update users set is_active=false where id=$1',[uid(3)]);
 await expect(q('select flowmate_creative_brief($1)',[id])).rejects.toThrow('Not authorized');
 await q('update users set is_active=true where id=$1',[uid(3)]);
 const other=uid(50);await q("update work_items set owning_team_code='mkt',requester_team='Marketing' where id=$1",[other]);
 expect((await q('select flowmate_can_review_ops_brief($1) allowed',[other]))[0].allowed).toBe(false);
});
it('permits Admin review and rejects stale submissions through the RPC',async()=>{
 await q("update users set role='admin' where id=$1",[uid(2)]);await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(2)]);
 const id=await task(70);const [s]=await q("insert into creative_kpi_brief_evidence(work_item_id,action) values($1,'submitted') returning id",[id]);
 expect((await q('select flowmate_creative_brief($1) r',[id]))[0].r.can_accept).toBe(true);
 await expect(q("select flowmate_creative_brief($1,'accepted','reviewed',$2)",[id,Number(s.id)-1])).rejects.toThrow('brief changed');
 await q("select flowmate_creative_brief($1,'accepted','reviewed',$2)",[id,s.id]);
 expect((await q('select status from work_items where id=$1',[id]))[0].status).toBe('assigned');
});
it('retires the old Aof release endpoint and exposes brief acceptance mode',async()=>{
 await db.exec(read('supabase/activity_automation_battle_pass_acceptance.sql'));
 const id=uid(62);await expect(q('select battle_pass_release_review($1)',[id])).rejects.toThrow('Confirm Brief Complete');
 const [r]=await q('select battle_pass_review_status($1) r',[id]);expect(r.r.can_release).toBe(false);expect(r.r.review_mode).toBe('brief_acceptance');
});
it('release bundle installs atomically and never accepts or assigns existing work',async()=>{
 const before=await q("select (select count(*) from assignment_runs) assignments,(select count(*) from creative_kpi_brief_evidence where action='accepted') accepted");
 await db.exec(read('supabase/activity_automation_acceptance_release.sql'));
 expect(await q("select (select count(*) from assignment_runs) assignments,(select count(*) from creative_kpi_brief_evidence where action='accepted') accepted")).toEqual(before);
 expect((await q("select has_function_privilege('anon','public.flowmate_can_review_ops_brief(uuid)','execute') allowed"))[0].allowed).toBe(false);
});
it('excludes assigned TESTs in the actual Gantt RPC, not just its fallback view',async()=>{

 await db.exec(read('src/lib/activity-automation/fixtures/gantt-rpc-20260918.sql'));
 expect((await q("select count(*)::int n from flowmate_list_team_schedule() where title like '[TEST]%'"))[0].n).toBeGreaterThan(0);
 await db.exec(read('supabase/activity_automation_gantt_isolation.sql'));
 expect((await q("select count(*)::int n from flowmate_list_team_schedule() where title like '[TEST]%'"))[0].n).toBe(0);
 expect((await q('select count(*)::int n from flowmate_list_team_schedule() where work_item_id=$1',[uid(62)]))[0].n).toBe(1);
});
