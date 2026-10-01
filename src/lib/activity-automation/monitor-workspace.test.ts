import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
let db:PGlite;
const read=(s:string)=>readFileSync(s,'utf8');
const uid='00000000-0000-4000-8000-000000000001';
const run='a0000000-0000-4000-8000-000000000004';
const q=async(sql:string,args:unknown[]=[]) => (await db.query<{v:any}>(sql,args)).rows[0]?.v;
const as=(id:string)=>q("select set_config('request.jwt.claim.sub',$1,false) v",[id]);
const get=(id=run,source='shared',entity='production_run')=>q('select activity_automation_monitor_issue_get($1,\'production\',$2,$3) v',[source,entity,id]);
const action=(key:string,state='acknowledged',comment='ตรวจข้อมูลแล้ว กำลังติดตาม',id=run,source='shared',entity='production_run')=>q('select activity_automation_monitor_issue_action($1,\'production\',$2,$3,$4,$5,$6) v',[source,entity,id,key,state,comment]);
beforeAll(async()=>{
 db=new PGlite();await db.exec(read('src/lib/activity-automation/monitor-fixture.sql'));
 await db.exec(read('src/lib/activity-automation/fixtures/monitor-production-support.sql'));
 for(const f of ['contract','assignment','finalize','google'])await db.exec(read(`supabase/activity_automation_production_${f}.sql`));
 await db.exec(read('supabase/activity_automation_monitor.sql'));await db.exec(read('supabase/activity_automation_monitor_production.sql'));
 await db.exec(`create table activity_automation_private.production_ticks(id uuid primary key,started_at timestamptz,finished_at timestamptz,lease_until timestamptz,status text,code text,snapshot_at timestamptz);
 create table activity_automation_private.production_observations(source_row integer,activity text,project_code text,period text,state text,code text,observed_at timestamptz,tick_id uuid,working_sheet_linked boolean,loot_confirmed boolean,done_output jsonb);
 alter table work_items add column archived_at timestamptz,add column launch_date date,add column campaign_name text,add column title text;
 alter table marketing_content_items add column title text,add column brief_link text,add column note text,add column campaign_id uuid;
 create table marketing_plans(id uuid primary key,market text,month_key text);
 create table marketing_campaigns(id uuid primary key,plan_id uuid);
 create function public.activity_automation_is_test(uuid) returns boolean language sql immutable as $$select false$$;`);
 const helper=read('supabase/activity_automation_production_done_skip.sql');
 await db.exec(helper.slice(helper.indexOf('create function activity_automation_private.production_existing_output'),helper.indexOf('create or replace function public.activity_production_tick_snapshot')));
 await db.exec(read('supabase/activity_automation_monitor_workspace.sql'));
},30000);
beforeEach(async()=>{
 await db.exec(`reset role;truncate activity_automation_private.monitor_issue_reviews cascade;truncate activity_automation_private.production_observations;truncate activity_automation_private.production_ticks;truncate activity_automation_private.production_runs cascade;
 delete from creative_kpi_brief_evidence where id>=100;delete from creative_request_details where work_item_id='b0000000-0000-4000-8000-000000000001';delete from marketing_content_items where id='c0000000-0000-4000-8000-000000000001';delete from work_items where id='b0000000-0000-4000-8000-000000000001';
 delete from battle_pass_private.production_ticks where run_id<>'60000000-0000-4000-8000-000000000001';delete from battle_pass_private.monthly_runs where mode='production';truncate marketing_campaigns,marketing_plans;`);
 await db.exec(read('src/lib/activity-automation/fixtures/monitor-production-seed.sql'));await as(uid);
});
afterAll(async()=>db.close());
it('requires active source-specific permission and denies direct table writes',async()=>{
 await as('00000000-0000-4000-8000-000000000003');await expect(get()).rejects.toThrow('Monitor access denied');
 await as(uid);await db.exec('set role authenticated');await expect(db.query('select * from activity_automation_private.monitor_issue_reviews')).rejects.toThrow();
 await expect(db.query("select activity_automation_private.monitor_issue_key('{}')")).rejects.toThrow();await db.exec('reset role');
 await expect(get('60000000-0000-4000-8000-000000000001','battle_pass','tick')).rejects.toThrow('Monitor access denied');
});
it('acknowledges with ownership/comment/audit without changing a run or dispatching',async()=>{
 const before=await q('select to_jsonb(r) v from activity_automation_private.production_runs r where id=$1',[run]);
 const key=(await get()).data.issueKey;const v=await action(key);
 expect(v.data.review).toMatchObject({state:'acknowledged',ownerId:uid});expect(v.data.audit).toHaveLength(1);
 expect(await q('select to_jsonb(r) v from activity_automation_private.production_runs r where id=$1',[run])).toEqual(before);
 await action(key);expect((await get()).data.audit).toHaveLength(1);
});
it('unchanged polling timestamps do not reopen; changed issue code does',async()=>{
 const key=(await get()).data.issueKey;await action(key,'archived','เหตุการณ์เก่า ตรวจแล้วว่าไม่เกี่ยวกับรอบนี้');
 await db.query('update activity_automation_private.production_runs set updated_at=now() where id=$1',[run]);expect((await get()).data.review.state).toBe('archived');
 await db.query("update activity_automation_private.production_runs set hold_reason='source_identity_changed' where id=$1",[run]);
 expect((await get()).data.review).toBeNull();await expect(action(key)).rejects.toThrow('recheck required');
});
it.each([null,'','ab','x'.repeat(501)])('rejects invalid comment %#',async(comment)=>{
 await expect(action((await get()).data.issueKey,'acknowledged',comment as any)).rejects.toThrow('Invalid review action');
});
it('does not close with a complete output from another project or period',async()=>{
 await expect(action((await get()).data.issueKey,'resolved')).rejects.toThrow('Matching complete output evidence required');
 expect((await get()).data.review).toBeNull();
});
it('resolves only matching independently verified complete output',async()=>{
 const id='a0000000-0000-4000-8000-000000000002';
 await db.exec(`update work_items set work_type='creative_request',launch_date='2026-10-05',title='GOLD-OCT',campaign_name='GOLD-OCT' where display_id='CR-2001';
 insert into marketing_plans values('f0000000-0000-4000-8000-000000000001','TH','2026-10');
 insert into marketing_campaigns values('f0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001');
 update marketing_content_items set title='GOLD-OCT',brief_link='https://panuwee.github.io/FlowMate/home/#detail/CR-2001',campaign_id='f0000000-0000-4000-8000-000000000002' where flowmate_work_item_id='b0000000-0000-4000-8000-000000000001';`);
 const v=await action((await get(id)).data.issueKey,'resolved','พบชุดงานครบที่ตรงโครงการแล้ว',id);
 expect(v.data.review.state).toBe('resolved');expect(v.data.review.evidence.displayId).toBe('CR-2001');
 await action(v.data.issueKey,'resolved','กดซ้ำ',id);expect((await get(id)).data.audit).toHaveLength(1);
});
it('requires delivery evidence for uncertain SeaTalk instead of a completed CR',async()=>{
 const id=(await db.query<{id:string}>('select id from activity_automation_private.production_notification_outbox limit 1')).rows[0].id;
 await db.query("update activity_automation_private.production_notification_outbox set status='uncertain' where id=$1",[id]);
 await expect(action((await get(id,'shared','notification')).data.issueKey,'resolved','ตรวจ CR แล้ว',id,'shared','notification')).rejects.toThrow('provider evidence');
});
it('reads stored SSoT booleans and current tick coverage without code inference',async()=>{
 await db.exec(`insert into activity_automation_private.production_ticks values('e0000000-0000-4000-8000-000000000001',now(),now(),now()+interval '10 minutes','waiting','source_waiting',now());
 insert into activity_automation_private.production_observations values(750,'golden_spin','261019_Golden Spin (LE)','2026-10','waiting','waiting_confirmation',now(),'e0000000-0000-4000-8000-000000000001',true,false,null);`);
 const v=await q("select activity_automation_monitor_workspace_summary('production','2026-10','golden_spin') v");
 expect(v.data.activities[0].projects[0].lastSourceCheck).toMatchObject({workingSheetLinked:true,confirmed:false});
 expect(v.data.scanners[0]).toMatchObject({fresh:true,observedFamilies:1});
});
it('keeps closed incidents in review history and acknowledged items actionable',async()=>{
 const key=(await get()).data.issueKey;await action(key);let v=await q("select activity_automation_monitor_workspace_summary('production','2026-10') v");
 expect(v.data.attention.find((r:any)=>r.id===run).review.state).toBe('acknowledged');
 await action(key,'archived','เหตุการณ์เก่าที่ได้ตรวจสอบแล้ว');v=await q("select activity_automation_monitor_workspace_summary('production','2026-10') v");
 expect(v.data.attention.some((r:any)=>r.id===run)).toBe(false);expect(v.data.reviewHistory.some((r:any)=>r.id===run)).toBe(true);
});
it('separates scans from creation and scopes history cursors',async()=>{
 await as('00000000-0000-4000-8000-000000000002');
 const args=['production','2026-09',null,null,null,null,1,'scans'];
 const v=await q('select activity_automation_monitor_history($1,$2,$3,$4,$5,$6,$7,$8) v',args);
 expect(v.data.rows[0].entityType).toBe('tick');
 const important=await q("select activity_automation_monitor_history('production','2026-09',null,null,null,null,100,'significant') v");
 expect(important.data.rows.some((r:any)=>r.status==='waiting_confirmation')).toBe(false);
 const all=await q("select activity_automation_monitor_history('production','2026-09',null,null,null,null,1,'all') v");
 expect(all.data.hasMore).toBe(true);await expect(q("select activity_automation_monitor_history('production','2026-09',null,null,null,$1,1,'scans') v",[all.data.nextCursor])).rejects.toThrow('Invalid history cursor');
});
it('projects no raw model/checkpoint/provider secrets through workspace APIs',async()=>{
 const v=await q("select activity_automation_monitor_workspace_summary('production','2026-10') v");
 expect(JSON.stringify(v)).not.toContain('DO_NOT_EXPOSE');expect(JSON.stringify(await get())).not.toContain('source_model');
});
it('fences acknowledgment when underlying source identity changes',async()=>{
 const key=(await get()).data.issueKey;await action(key);
 await db.query("update activity_automation_private.production_runs set source_hash=repeat('f',64) where id=$1",[run]);
 expect((await get()).data.review).toBeNull();await expect(action(key)).rejects.toThrow('recheck required');
});
it('cannot manage waiting scans, or resolve a Battle Pass failure without a period',async()=>{
 await as('00000000-0000-4000-8000-000000000002');
 const waiting='60000000-0000-4000-8000-000000000001';expect((await get(waiting,'battle_pass','tick')).data.canManage).toBe(false);
 await expect(action((await get(waiting,'battle_pass','tick')).data.issueKey,'archived','รอข้อมูล',waiting,'battle_pass','tick')).rejects.toThrow('no longer active');
 const failed='60000000-0000-4000-8000-000000000099';await db.query("insert into battle_pass_private.production_ticks values($1,now(),'failed','validation_failed','{}')",[failed]);
 await expect(action((await get(failed,'battle_pass','tick')).data.issueKey,'resolved','พบงาน Oct',failed,'battle_pass','tick')).rejects.toThrow('Matching complete output');
});
it('validates Battle Pass output linkage independently before resolving',async()=>{
 await as('00000000-0000-4000-8000-000000000002');
 const id='60000000-0000-4000-8000-000000000098';await db.query("insert into battle_pass_private.production_ticks values($1,now(),'failed','validation_failed','{\"period\":\"2026-10\"}')",[id]);
 await db.exec(`insert into battle_pass_private.monthly_runs(mode,period,state,brief_id,task_id,slide_id,updated_at) values('production','2026-10','complete','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','prod_slide',now());`);
 const key=(await get(id,'battle_pass','tick')).data.issueKey;
 const v=await action(key,'resolved','ตรวจ Working Sheet CR และ Brief แล้ว',id,'battle_pass','tick');expect(v.data.review.state).toBe('resolved');
 await db.exec("truncate activity_automation_private.monitor_issue_reviews cascade;update marketing_content_items set flowmate_work_item_id=null where id='c0000000-0000-4000-8000-000000000001'");
 await expect(action(key,'resolved','พบ CR แล้ว',id,'battle_pass','tick')).rejects.toThrow('Matching complete output');
});
