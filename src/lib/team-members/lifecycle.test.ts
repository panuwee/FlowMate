import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
let db:PGlite;
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read=(p:string)=>readFileSync(p,'utf8');
const q=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows;
const input=(extra={})=>({email:'eye@garena.com',display_name:'Eye',role:'member',team_member_code:'eye',...extra});
const save=(extra={})=>q('select flowmate_admin_save_member($1::jsonb)',[JSON.stringify(input(extra))]);
beforeAll(async()=>{
 db=new PGlite(); await db.exec(read('src/lib/team-members/fixture.sql'));
 await db.exec(`alter table users add column email text unique,add column display_name text,add column updated_at timestamptz;
 alter table team_members add column updated_at timestamptz;create unique index member_code_unique on team_members(member_code);
 create table user_whitelist(email text primary key,display_name text,role text,team_member_code text,added_by uuid);
 create function flowmate_hybrid_rebuild_allocation(uuid,uuid) returns void language sql as $$select$$;
 `);
 await db.exec(read('src/lib/activity-automation/fixtures/assignment-engine-20260918.sql'));
 await db.exec(read('supabase/team_members_lifecycle.sql'));
 for(const [n,code,role] of [[99,'admin','admin'],[1,'eye','member'],[2,'tong','member']] as const){
  await q('insert into users(id,email,display_name,is_active,role) values($1,$2,$3,true,$4)',[uid(n),`${code}@garena.com`,code,role]);
  await q('insert into user_whitelist(email,display_name,role,team_member_code) values($1,$2,$3,$4)',[`${code}@garena.com`,code,role,n===99?null:code]);
  if(n!==99) await q("insert into team_members(id,user_id,member_code,display_name,skills) values($1,$1,$2,$2,array['banner'])",[uid(n),code]);
 }
},30000);
beforeEach(async()=>{await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(99)]);await db.exec('delete from flowmate_members_private.lifecycle;delete from work_items;update users set is_active=true;');});
afterAll(async()=>db.close());
it('retains members and supports idempotent install',async()=>{await db.exec(read('supabase/team_members_lifecycle.sql'));expect((await q('select flowmate_admin_members() r'))[0].r).toHaveLength(3);});
it('enforces exact stop time without disabling access',async()=>{await save({stop_assign_at:new Date(Date.now()-1000).toISOString()});expect((await q('select flowmate_member_can_assign($1,current_date) a,flowmate_member_access_allowed($1) b',[uid(1)]))[0]).toEqual({a:false,b:true});});
it('last day is inclusive and unknown/end dates beyond it are excluded',async()=>{await save({last_working_day:'2090-09-30',deactivate_at:'2090-10-01T00:00:00+07:00'});expect((await q("select flowmate_member_can_assign($1,'2090-09-30') a,flowmate_member_can_assign($1,'2090-10-01') b,flowmate_member_can_assign($1,null) c",[uid(1)]))[0]).toEqual({a:true,b:false,c:false});});
it('denies expired sessions through the API guard',async()=>{await save({deactivate_at:new Date(Date.now()-1000).toISOString()});await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);expect((await q('select is_active_app_user() a'))[0].a).toBe(false);await expect(q('select flowmate_check_member_access()')).rejects.toThrow('inactive');});
it('does not reactivate on ordinary profile edits or extending expired dates',async()=>{await save({action:'deactivate'});await save({display_name:'Eye updated'});expect((await q('select flowmate_member_access_allowed($1) a',[uid(1)]))[0].a).toBe(false);await save({action:'reactivate'});expect((await q('select flowmate_member_access_allowed($1) a',[uid(1)]))[0].a).toBe(true);await save({deactivate_at:new Date(Date.now()-1000).toISOString()});await save({deactivate_at:'2090-10-01T00:00:00+07:00'});expect((await q('select flowmate_member_access_allowed($1) a',[uid(1)]))[0].a).toBe(false);});
it('protects own admin access and occupied creative profiles',async()=>{await expect(save({email:'admin@garena.com',team_member_code:null,action:'deactivate'})).rejects.toThrow('own admin');await expect(save({team_member_code:'tong'})).rejects.toThrow('already linked');});
it('rejects non-admin reads/writes and invalid schedule',async()=>{await expect(save({stop_assign_at:'2091-01-01Z',deactivate_at:'2090-01-01Z'})).rejects.toThrow();await q("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);await expect(save()).rejects.toThrow('Admin access');await expect(q('select flowmate_admin_members()')).rejects.toThrow('Admin access');});
it('blocks manual and direct user-only reassignment but retains existing work',async()=>{await q("insert into work_items(id,display_id,title,final_owner_member_id,status) values($1,'CR-1','Handover',$2,'in_progress')",[uid(10),uid(1)]);await save({stop_assign_at:new Date(Date.now()-1000).toISOString()});await q("update work_items set title='Retained' where id=$1",[uid(10)]);await expect(q("insert into work_items(id,title,final_owner_member_id) values($1,'new',$2)",[uid(11),uid(1)])).rejects.toThrow('not accepting');await expect(q("insert into work_items(id,title,assignee_user_id) values($1,'new',$2)",[uid(12),uid(1)])).rejects.toThrow('not accepting');expect((await q('select flowmate_admin_members() r'))[0].r.find((r:any)=>r.email==='eye@garena.com').open_work).toHaveLength(1);});
it('actual assignment engine skips Eye and selects another eligible member',async()=>{await save({stop_assign_at:new Date(Date.now()-1000).toISOString()});await q("insert into work_items(id,display_id,title) values($1,'CR-20','Assignment')",[uid(20)]);await q('insert into creative_request_details(work_item_id) values($1)',[uid(20)]);await q("select flowmate_run_assignment($1,'recheck')",[uid(20)]);expect((await q('select final_owner_member_id from work_items where id=$1',[uid(20)]))[0].final_owner_member_id).toBe(uid(2));});
it('audit is recorded and private tables cannot be read by authenticated users',async()=>{await save();expect((await q('select count(*)::int n from flowmate_members_private.audit'))[0].n).toBeGreaterThan(0);await db.exec('set role authenticated');try{await expect(q('select * from flowmate_members_private.lifecycle')).rejects.toThrow('permission denied');}finally{await db.exec('reset role');}});
it('keeps future cutoffs active and excludes expired candidates even for urgent requests',async()=>{
 await save({stop_assign_at:'2090-01-01T00:00:00+07:00'});
 expect((await q('select flowmate_member_can_assign($1,current_date) a',[uid(1)]))[0].a).toBe(true);
 await save({last_working_day:'2000-09-30',deactivate_at:'2000-10-01T00:00:00+07:00'});
 await q("update team_members set active=false where member_code='tong'");
 try {
 await q("insert into work_items(id,display_id,title,priority) values($1,'CR-90','No candidate','urgent')",[uid(90)]);
 await q('insert into creative_request_details(work_item_id) values($1)',[uid(90)]);
 await q("select flowmate_run_assignment($1,'recheck')",[uid(90)]);
 expect((await q('select final_owner_member_id,status from work_items where id=$1',[uid(90)]))[0]).toEqual({final_owner_member_id:null,status:'unassigned'});
 } finally {await q("update team_members set active=true where member_code='tong'");}
});
it('installs the API hook idempotently and refuses to overwrite an existing hook',async()=>{
 await db.exec('create role authenticator');
 await db.exec(read('supabase/team_members_access_hook.sql'));
 await db.exec(read('supabase/team_members_access_hook.sql'));
 expect((await q("select rolconfig from pg_roles where rolname='authenticator'"))[0].rolconfig).toContain('pgrst.db_pre_request=public.flowmate_check_member_access');
 await db.exec("alter role authenticator set pgrst.db_pre_request='public.existing_guard'");
 try {await expect(db.exec(read('supabase/team_members_access_hook.sql'))).rejects.toThrow('Existing API pre-request hook');}
 finally {await db.exec('rollback');}
});
