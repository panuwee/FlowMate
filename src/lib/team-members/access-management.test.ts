import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
let db:PGlite;
const read=(p:string)=>readFileSync(p,'utf8');
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=async(sql:string,args:unknown[]=[]) => (await db.query<Record<string,any>>(sql,args)).rows;
const save=(extra={})=>q('select flowmate_admin_save_member($1::jsonb)',[JSON.stringify({email:'web@sea.com',display_name:'Web',role:'viewer',viewer_teams:['ops'],...extra})]);
beforeAll(async()=>{
 db=new PGlite(); await db.exec(read('src/lib/team-members/fixture.sql'));
 await db.exec(`alter table users add column email text unique,add column display_name text,add column updated_at timestamptz,add column requester_team text;
 alter table user_team_memberships add column is_primary boolean default false;
 create table teams(code text primary key,is_active boolean default true);
 insert into teams(code) values('ops'),('mkt'),('gdve'),('esport');
 alter table team_members add column updated_at timestamptz,add column initials text;
 create unique index member_code_unique on team_members(member_code);
 create table user_whitelist(email text primary key,display_name text,role text constraint user_whitelist_role_check check(role in ('admin','member')),team_member_code text,added_by uuid,constraint user_whitelist_email_shape check(email ~ '@garena\\.com$'));
 create function flowmate_hybrid_rebuild_allocation(uuid,uuid) returns void language sql as $$select$$;
 `);
 await db.exec(read('src/lib/activity-automation/fixtures/assignment-engine-20260918.sql'));
 await db.exec(read('supabase/team_members_lifecycle.sql'));
 await db.exec(`create or replace function public.flowmate_can_read_work_item(p_work_item_id uuid,p_user_id uuid) returns boolean language sql as $$select false$$;
 create function public.task_assign_legacy_flowmate_user_can_read_work_item(uuid,uuid) returns boolean language sql as $$select false$$;
 create function public.task_assign_can_read(uuid,uuid) returns boolean language sql as $$select false$$;
 create function public.flowmate_user_can_read_work_item(p_user_id uuid,p_work_item_id uuid) returns boolean language sql as $$select case when exists(select 1 from work_items where id=p_work_item_id and work_type='quick_task') then task_assign_can_read(p_user_id,p_work_item_id) else task_assign_legacy_flowmate_user_can_read_work_item(p_user_id,p_work_item_id) end$$;`);
 const settings=read('supabase/team_settings_admin.sql');
 const settingsStart=settings.indexOf('create or replace function public.flowmate_admin_update_team_member(');
 await db.exec(settings.slice(settingsStart,settings.indexOf('$$;',settingsStart)+3));
 await db.exec(`create table auth.users(id uuid primary key,email text);
 create function public.enforce_garena_domain() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger enforce_garena_domain_trg before insert or update of email on auth.users for each row execute function enforce_garena_domain();
 create function public.flowmate_creative_brief(p_work_item_id uuid,p_action text default 'read',text default null,bigint default null) returns text language plpgsql as $$begin return p_action;end$$;
 create function public.ot_seatalk_claim_dispatch(uuid,p_actor_id uuid) returns boolean language plpgsql as $$begin return true;end$$;
 `);
 await db.exec(read('supabase/team_members_access_management.sql'));
 await q("insert into users(id,email,display_name,is_active,role) values($1,'admin@garena.com','Admin',true,'admin')",[uid(99)]);
 await q("insert into user_whitelist(email,display_name,role) values('admin@garena.com','Admin','admin')");
},30000);
beforeEach(async()=>{
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(99)]);
 await db.exec("delete from work_items;delete from flowmate_members_private.lifecycle;delete from user_whitelist where email<>'admin@garena.com';delete from team_members;delete from users where id<>'00000000-0000-4000-8000-000000000099';update flowmate_members_private.allowed_domains set enabled=true;");
});
afterAll(async()=>db.close());
it('installs idempotently and seeds only approved domains',async()=>{
 await db.exec(read('supabase/team_members_access_management.sql'));
 expect((await q('select flowmate_admin_domains() d'))[0].d.map((d:any)=>d.domain)).toEqual(['garena.com','sea.com']);
});
it('accepts a listed sea.com viewer and rejects domain lookalikes',async()=>{
 await save(); expect((await q("select role from user_whitelist where email='web@sea.com'"))[0].role).toBe('viewer');
 for(const email of ['web@sea.com.evil','web@sub.sea.com','web@garena.com.evil','web@gmail.com','web@@sea.com']) await expect(save({email})).rejects.toThrow('domain');
});
it('enables exact new domains and protects own domain',async()=>{
 await q("select flowmate_admin_save_domain(' Example.com ',true)");await save({email:'web@example.com'});
 await expect(q("select flowmate_admin_save_domain('garena.com',false)")).rejects.toThrow('own login');
 for(const domain of ['@sea.com','https://sea.com','*.sea.com','sea.com/','sea..com']) await expect(q('select flowmate_admin_save_domain($1,true)',[domain])).rejects.toThrow('exact domain');
});
it('disabled domains block existing sessions and new enrollment, enabling restores access',async()=>{
 await save();await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','viewer',true)",[uid(1)]);
 expect((await q('select flowmate_member_access_allowed($1) a',[uid(1)]))[0].a).toBe(true);
 await q("select flowmate_admin_save_domain('sea.com',false)");await expect(save({email:'new@sea.com'})).rejects.toThrow('domain');
 expect((await q('select flowmate_member_access_allowed($1) a',[uid(1)]))[0].a).toBe(false);
 await q("select flowmate_admin_save_domain('sea.com',true)");expect((await q('select flowmate_member_access_allowed($1) a',[uid(1)]))[0].a).toBe(true);
});
it('creates linked paused profiles, detects duplicate names and rolls back on member failure',async()=>{
 await save({role:'member',new_profile_name:'Webdev New'});
 const [profile]=await q('select * from team_members');expect(profile.display_name).toBe('Webdev New');expect(profile.active).toBe(false);expect(profile.skills).toEqual([]);
 expect((await q('select flowmate_admin_members() r'))[0].r.find((r:any)=>r.email==='web@sea.com').team_profile_name).toBe('Webdev New');
 await expect(save({email:'other@sea.com',new_profile_name:'webdev new'})).rejects.toThrow('already exists');
 await expect(save({new_profile_name:'Rollback',stop_assign_at:'invalid'})).rejects.toThrow();expect(await q("select * from team_members where display_name='Rollback'")).toHaveLength(0);
});
it('viewer cannot write directly or through SECURITY DEFINER, including zero-row writes',async()=>{
 await save();await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','viewer',true)",[uid(1)]);
 await db.exec("create or replace function public.test_definer_write() returns void language sql security definer as $$update public.users set display_name='hacked' where false$$;");
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 await expect(q("update users set role='admin' where id=$1",[uid(1)])).rejects.toThrow('read-only');
 await expect(q('select test_definer_write()')).rejects.toThrow('read-only');
 await expect(q('truncate work_items')).rejects.toThrow('read-only');
 await expect(q('select flowmate_admin_domains()')).rejects.toThrow('Admin');
 await expect(save()).rejects.toThrow('Admin');
});
it('API guard permits reads, denies write RPCs via POST and GET',async()=>{
 await save();await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','viewer',true)",[uid(1)]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 for(const [path,method,allowed] of [['/users','GET',true],['/users','PATCH',false],['/rpc/flowmate_board_summary','POST',true],['/rpc/flowmate_admin_save_member','POST',false],['/rpc/test_definer_write','GET',false]] as const){
 await q("select set_config('request.path',$1,false),set_config('request.method',$2,false)",[path,method]);
 if(allowed) await q('select flowmate_check_member_access()');else await expect(q('select flowmate_check_member_access()')).rejects.toThrow('read-only');
 }
});
it('member write behavior remains available',async()=>{
 await save({role:'member'});await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','member',true)",[uid(1)]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 await q("update users set display_name='Updated' where id=$1",[uid(1)]);expect((await q('select display_name from users where id=$1',[uid(1)]))[0].display_name).toBe('Updated');
});
it('browser guard blocks mutations and allows authentication and approved reads',()=>{
 const source=read('supabase-client.js');const box:any={window:{supabase:null},URL,Set,console};
 vm.runInNewContext(source,box);
 const allow=box.window.flowmateViewerRequestAllowed;
 expect(allow('/rest/v1/users',{method:'GET'})).toBe(true);
 expect(allow('/rest/v1/users',{method:'PATCH'})).toBe(false);
 expect(allow('/rest/v1/rpc/flowmate_board_summary',{method:'POST'})).toBe(true);
 expect(allow('/rest/v1/rpc/flowmate_admin_save_member',{method:'GET'})).toBe(false);
 expect(allow('/functions/v1/seatalk-ot-callback',{method:'POST'})).toBe(false);
 expect(allow('/auth/v1/logout',{method:'POST'})).toBe(true);
 expect(allow('/rest/v1/rpc/flowmate_creative_brief',{method:'POST',body:JSON.stringify({p_action:'submitted'})})).toBe(false);
});
it('login requires an enabled exact domain, listed email and active lifecycle',async()=>{
 await expect(q("insert into auth.users values($1,'unlisted@sea.com')",[uid(8)])).rejects.toThrow('whitelist');
 await save();await q("insert into auth.users values($1,'web@sea.com')",[uid(8)]);
 await expect(q("update auth.users set email='web@sea.com.evil' where id=$1",[uid(8)])).rejects.toThrow('domain');
 await q("select flowmate_admin_save_domain('sea.com',false)");
 await expect(q("insert into auth.users values($1,'web@sea.com')",[uid(9)])).rejects.toThrow('domain');
});
it('teams are stored before first login and resynchronized on edits without global access',async()=>{
 await save({viewer_teams:['mkt','ops']});
 await q("insert into users(id,email,display_name,role,is_active,requester_team,can_access_all_teams) values($1,'web@sea.com','Web','viewer',true,'Marketing',true)",[uid(1)]);
 expect((await q('select team_code from user_team_memberships where user_id=$1 order by team_code',[uid(1)])).map(r=>r.team_code)).toEqual(['mkt','ops']);
 expect((await q('select requester_team,can_access_all_teams from users where id=$1',[uid(1)]))[0]).toEqual({requester_team:null,can_access_all_teams:false});
 await save({viewer_teams:['gdve']});expect((await q('select team_code from user_team_memberships where user_id=$1',[uid(1)])).map(r=>r.team_code)).toEqual(['gdve']);
 await expect(save({viewer_teams:[]})).rejects.toThrow('valid teams');
 await expect(save({viewer_teams:['webdev']})).rejects.toThrow('valid teams');
});
it('multi-action read RPC and service-role dispatch reject a Viewer actor',async()=>{
 await save();await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','viewer',true)",[uid(1)]);
 await q("insert into work_items(id,title,owning_team_code) values($1,'Allowed','ops')",[uid(10)]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 expect((await q("select flowmate_creative_brief($1,'read') a",[uid(10)]))[0].a).toBe('read');
 await expect(q("select flowmate_creative_brief($1,'submitted')",[uid(10)])).rejects.toThrow('read-only');
 await q("select set_config('request.jwt.claim.sub','',false)");
 await expect(q('select ot_seatalk_claim_dispatch($1,$2)',[uid(10),uid(1)])).rejects.toThrow('read-only');
});
it('restrictive work-item policy hides unselected teams even under a permissive legacy read policy',async()=>{
 await save({viewer_teams:['gdve']});await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','viewer',true)",[uid(1)]);
 await q("insert into work_items(id,title,owning_team_code) values($1,'GDVE','gdve'),($2,'Ops','ops')",[uid(10),uid(11)]);
 await db.exec('grant select on work_items to authenticated; create policy test_permissive_read on work_items for select to authenticated using(true);');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 await db.exec('set role authenticated');
 try {expect((await q('select title from work_items')).map(r=>r.title)).toEqual(['GDVE']);}
 finally {await db.exec('reset role');}
 await expect(q("select flowmate_creative_brief($1,'read')",[uid(11)])).rejects.toThrow('not available');
 expect((await q('select flowmate_user_can_read_work_item($1,$2) a,flowmate_can_read_work_item($2,$1) b',[uid(1),uid(10)]))[0]).toEqual({a:true,b:true});
 expect((await q('select flowmate_user_can_read_work_item($1,$2) a,flowmate_can_read_work_item($2,$1) b',[uid(1),uid(11)]))[0]).toEqual({a:false,b:false});
});
it('new profiles become assignable through the existing capacity RPC, but Viewer remains excluded',async()=>{
 await save({role:'member',new_profile_name:'New Receiver'});
 const [profile]=await q('select * from team_members');
 await q("insert into users(id,email,display_name,role,is_active) values($1,'web@sea.com','Web','member',true)",[uid(1)]);
 await save({role:'member',team_member_code:profile.member_code});
 await q('select flowmate_admin_update_team_member($1,8,3,$2::text[],null)',[profile.id,['banner']]);
 expect((await q('select flowmate_member_can_assign($1,current_date) a',[profile.id]))[0].a).toBe(true);
 await save({team_member_code:profile.member_code});
 expect((await q('select flowmate_member_can_assign($1,current_date) a',[profile.id]))[0].a).toBe(false);
});
