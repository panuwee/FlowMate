import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
let db:PGlite;
const run='30000000-0000-0000-0000-000000000001',work='20000000-0000-0000-0000-000000000001';
async function rpc(n:string,args:any[]=[]){return (await db.query<any>(`select public.${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;}
async function server(){await db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");}
async function verify(kind:string,key:string){await server();const e=(await db.query<any>('select version from wcc_private.entities where kind=$1 and key=$2',[kind,key])).rows[0];await rpc('wcc_record_check',[kind,key,e.version,true,'{}']);}
async function ownActivity(){await db.exec("update wcc_private.entities set data=jsonb_set(data,'{state}','\"active\"') where kind in ('bot','destination');update wcc_private.entities set data=jsonb_set(data,'{enabled}','true') where key='ops:activity.output_ready';update wcc_private.settings set runtime_enabled=true;");await verify('bot','flowmate');await verify('destination','fcoth-operation');await db.exec("insert into wcc_private.ownership(event_kind,scope) values('activity.output_ready','ops') on conflict do nothing");}
async function nativeAlert(){await db.query("insert into activity_automation_private.production_notification_outbox(run_id,event_kind,recipient_kind,payload) values($1,'brief_ready','group','{}')",[run]);}
async function count(table:string){return (await db.query<any>(`select count(*)::int n from ${table}`)).rows[0].n;}
beforeAll(async()=>{db=new PGlite();await db.exec(readFileSync('src/lib/control-center/fixture.sql','utf8'));await db.exec(readFileSync('supabase/workgrid_control_center.sql','utf8'));
 await db.exec(`create schema private;create table private.creative_seatalk_outbox(id uuid default gen_random_uuid(),recipient_user_id uuid,status text,last_error text,updated_at timestamptz);
 create schema activity_automation_private;
 create table activity_automation_private.production_runs(id uuid primary key,stage text,source_model jsonb,slide_id text,slide_revision text,google_verified_at timestamptz);
 create table activity_automation_private.production_output_bindings(run_id uuid,work_item_id uuid,content_item_id uuid,slide_id text,slide_revision text);
 create table public.marketing_content_items(id uuid primary key,flowmate_work_item_id uuid,brief_link text);
 create table public.creative_request_details(work_item_id uuid,asset_count integer,asset_count_2 integer,asset_subtype text,asset_subtype_2 text,channel_codes text[],brief_link text);
 create table public.marketing_channel_placements(content_item_id uuid,channel text);
 create table activity_automation_private.production_notification_outbox(id uuid default gen_random_uuid(),run_id uuid,event_kind text,recipient_kind text,payload jsonb,issue_key text,status text default 'pending',error_code text,updated_at timestamptz);
 alter table public.work_items add column wip_counted boolean default false; alter table public.work_items add column assignee_other_name text;
 alter table activity_automation_private.production_runs add column activity text default 'membership';
 alter table activity_automation_private.production_runs add column project_code text default 'SYNTHETIC';
 alter table activity_automation_private.production_runs add column period text default '2026-10';
 alter table activity_automation_private.production_runs add column hold_reason text;
 create table activity_automation_private.production_observations(activity text,project_code text,period text,working_sheet_linked boolean,loot_confirmed boolean,observed_at timestamptz,state text);
 create table activity_automation_private.output_bindings(work_item_id uuid);
 create table public.creative_kpi_brief_evidence(id bigint generated always as identity,work_item_id uuid,action text,brief_link text,submission_id bigint);
 create table public.marketing_campaigns(id uuid,name text);
 create table public.creative_channels(code text,label text,active boolean);
 alter table public.marketing_content_items add column campaign_id uuid; alter table public.marketing_content_items add column title text;
 alter table public.marketing_content_items add column format text; alter table public.marketing_content_items add column details text;
 alter table public.marketing_content_items add column source_start_date date; alter table public.marketing_content_items add column source_start_time time;
 alter table public.marketing_channel_placements add column publish_date date; alter table public.marketing_channel_placements add column publish_time time;
 alter table public.marketing_channel_placements add column note text;`);
 await db.exec(readFileSync('src/lib/control-center/native-contracts.sql','utf8'));
 await db.exec(readFileSync('supabase/workgrid_control_center_adapters.sql','utf8'));});
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec(`delete from wcc_private.deliveries;delete from wcc_private.events;delete from wcc_private.ownership;delete from wcc_private.checks;delete from private.creative_seatalk_outbox;delete from activity_automation_private.production_notification_outbox;delete from public.work_items;delete from public.marketing_content_items;delete from public.creative_request_details;delete from public.marketing_channel_placements;delete from activity_automation_private.production_runs;delete from activity_automation_private.production_output_bindings;
 delete from wcc_private.activity_manifests;delete from activity_automation_private.production_observations;delete from public.creative_kpi_brief_evidence;delete from activity_automation_private.output_bindings;delete from public.marketing_campaigns;delete from public.creative_channels;
 update wcc_private.settings set runtime_enabled=false;
 update wcc_private.entities set data=jsonb_set(data,'{enabled}','false') where kind='rule';delete from wcc_private.entities where kind='profile';
 insert into public.work_items(id,display_id,title,work_type,status,owning_team_code) values('${work}','CR-9999','Synthetic Activity','creative_request','unassigned','ops');
 insert into activity_automation_private.production_runs(id,stage,source_model,slide_id,slide_revision,google_verified_at) values('${run}','complete','{"creative":{"count":1,"count2":2,"subtype":"test-a","subtype2":"test-b","channels":["facebook","youtube"]}}','test-slide','v1',now());
 insert into public.marketing_campaigns values('50000000-0000-0000-0000-000000000001','Revenue');
 insert into public.creative_channels values('facebook','Facebook',true),('youtube','YouTube',true);
 insert into public.marketing_content_items(id,flowmate_work_item_id,brief_link,campaign_id,title,format,source_start_date,source_start_time) values('40000000-0000-0000-0000-000000000001','${work}','https://workgrid.example.test/#detail/CR-9999','50000000-0000-0000-0000-000000000001','Synthetic','Video','2026-10-05','10:00');
 insert into public.creative_request_details values('${work}',1,2,'test-a','test-b',array['facebook','youtube'],'https://docs.google.com/presentation/d/test-slide/edit');
 insert into public.marketing_channel_placements(content_item_id,channel) values('40000000-0000-0000-0000-000000000001','facebook'),('40000000-0000-0000-0000-000000000001','youtube');
 insert into activity_automation_private.production_output_bindings values('${run}','${work}','40000000-0000-0000-0000-000000000001','test-slide','v1');
 insert into activity_automation_private.production_observations values('membership','SYNTHETIC','2026-10',true,true,now(),'ready');
 insert into public.creative_kpi_brief_evidence(work_item_id,action,brief_link) values('${work}','submitted','https://docs.google.com/presentation/d/test-slide/edit');`);});
it('unowned legacy events remain in the native queue',async()=>{await nativeAlert();expect(await count('activity_automation_private.production_notification_outbox')).toBe(1);expect(await count('wcc_private.deliveries')).toBe(0);});
it('complete bundle becomes one WCC delivery with no duplicate native send',async()=>{await ownActivity();await nativeAlert();await nativeAlert();expect(await count('activity_automation_private.production_notification_outbox')).toBe(0);expect(await count('wcc_private.deliveries')).toBe(1);});
it('missing channel or mismatched asset set never produces success; later complete retry can enqueue',async()=>{await ownActivity();await db.exec("delete from public.marketing_channel_placements where channel='youtube'");await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(0);await db.exec("insert into public.marketing_channel_placements(content_item_id,channel) values('40000000-0000-0000-0000-000000000001','youtube');update public.creative_request_details set asset_count=9");await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(0);await db.exec('update public.creative_request_details set asset_count=1');await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(1);});
it('native readiness remains required and is checked again immediately before send',async()=>{await ownActivity();await nativeAlert();await server();const c=await rpc('wcc_claim');expect(c).toBeTruthy();await db.exec('update activity_automation_private.production_observations set loot_confirmed=false');expect(await rpc('wcc_mark_started',[c.delivery.id,c.delivery.lease_id])).toBe(false);expect((await db.query<any>('select status from wcc_private.deliveries')).rows[0].status).toBe('cancelled');});
it('pause or disabled owned rule does not silently fall back to legacy',async()=>{await ownActivity();await db.exec('update wcc_private.settings set runtime_enabled=false');await nativeAlert();expect(await count('activity_automation_private.production_notification_outbox')).toBe(0);await db.exec("update wcc_private.settings set runtime_enabled=true;update wcc_private.entities set data=jsonb_set(data,'{enabled}','false') where key='ops:activity.output_ready'");await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(0);});
it('Creative cutover cancels pending but preserves in-flight and keeps suppression after pause',async()=>{const recipient='00000000-0000-0000-0000-000000000003';await db.query("insert into private.creative_seatalk_outbox(recipient_user_id,status) values($1,'pending'),($1,'sending')",[recipient]);await db.query("insert into wcc_private.ownership(event_kind,scope) values('creative.assigned',$1)",[recipient]);expect((await db.query<any>('select status from private.creative_seatalk_outbox order by status')).rows.map(r=>r.status)).toEqual(['cancelled','sending']);await db.query("insert into private.creative_seatalk_outbox(recipient_user_id,status) values($1,'pending')",[recipient]);expect(await count('private.creative_seatalk_outbox')).toBe(2);});
it('operator DM notifications stay owned by their existing adapter',async()=>{await ownActivity();await db.query("insert into activity_automation_private.production_notification_outbox(run_id,event_kind,recipient_kind,payload) values($1,'brief_ready','user','{}')",[run]);expect(await count('activity_automation_private.production_notification_outbox')).toBe(1);});
it('staging enabled profiles while runtime is off does not seize legacy ownership',async()=>{await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false),set_config('request.jwt.claim.role','authenticated',false)");const data={member_id:'10000000-0000-0000-0000-000000000003',bot_key:'creative',channel:'direct',employment_type:'Fulltime',events:['creative.assigned'],enabled:false};await rpc('wcc_apply',['profile','staging',JSON.stringify(data),'gdve',0,'staging']);await verify('profile','staging');await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false),set_config('request.jwt.claim.role','authenticated',false)");await rpc('wcc_apply',['profile','staging',JSON.stringify({...data,enabled:true}),'gdve',1,'staging enabled']);expect(await count('wcc_private.ownership')).toBe(0);await db.exec("insert into private.creative_seatalk_outbox(recipient_user_id,status) values('00000000-0000-0000-0000-000000000003','pending')");expect(await count('private.creative_seatalk_outbox')).toBe(1);await rpc('wcc_set_runtime',[true,'cutover']);expect(await count('wcc_private.ownership')).toBe(1);expect((await db.query<any>('select status from private.creative_seatalk_outbox')).rows[0].status).toBe('cancelled');});

it('native Working Sheet inheritance can change subtype and channels without suppressing a complete bundle',async()=>{
 await db.exec("delete from wcc_private.activity_manifests; delete from activity_automation_private.production_output_bindings; delete from public.marketing_channel_placements where channel='youtube'");
 const draft=(await db.query<any>(`select activity_automation_private.production_working_sheet_draft('40000000-0000-0000-0000-000000000001','2026-10-05','10:00','test',source_model->'creative',true) draft from activity_automation_private.production_runs`)).rows[0].draft;
 expect(draft.creative.subtype).toBe('video-standard');expect(draft.creative.channels).toEqual(['facebook']);
 await db.query('update public.creative_request_details set asset_subtype=$1,channel_codes=$2',[draft.creative.subtype,draft.creative.channels]);
 await db.exec(`insert into activity_automation_private.production_output_bindings values('${run}','${work}','40000000-0000-0000-0000-000000000001','test-slide','v1')`);
 await ownActivity();await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(1);
 await server();const c=await rpc('wcc_claim');await db.exec("update public.creative_request_details set asset_subtype='banner'");
 expect(await rpc('wcc_mark_started',[c.delivery.id,c.delivery.lease_id])).toBe(false);
});
it('removing both CR channel declarations and placements cannot redefine the frozen expected bundle',async()=>{
 await ownActivity();await db.exec("delete from public.marketing_channel_placements where channel='youtube';update public.creative_request_details set channel_codes=array['facebook']");
 await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(0);
});
it.each(['old_observation','loot_removed','missing_evidence','accepted_brief','archived','assigned'])(
 'real native readiness rejects %s',async reason=>{
 await ownActivity();
 const statements:Record<string,string>={
 old_observation:"update activity_automation_private.production_observations set observed_at=now()-interval '66 minutes'",
 loot_removed:'update activity_automation_private.production_observations set loot_confirmed=false',
 missing_evidence:'delete from public.creative_kpi_brief_evidence',
 accepted_brief:`insert into public.creative_kpi_brief_evidence(work_item_id,action,brief_link,submission_id) select work_item_id,'accepted',brief_link,id from public.creative_kpi_brief_evidence where action='submitted'`,
 archived:'update public.work_items set archived_at=now()',
 assigned:"update public.work_items set status='in_progress',assignee_user_id='00000000-0000-0000-0000-000000000003'"};
 await db.exec(statements[reason]);await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(0);
});
it('pre-installation outputs with no captured manifest remain suppressed; no implicit historical backfill',async()=>{
 await ownActivity();await db.exec('delete from wcc_private.activity_manifests');await nativeAlert();expect(await count('wcc_private.deliveries')).toBe(0);
});
it('reinstallation retains the immutable manifest and disabled runtime state',async()=>{
 const before=(await db.query<any>('select * from wcc_private.activity_manifests')).rows;
 await db.exec(readFileSync('supabase/workgrid_control_center_adapters.sql','utf8'));
 expect((await db.query<any>('select * from wcc_private.activity_manifests')).rows).toEqual(before);
 expect((await db.query<any>('select runtime_enabled from wcc_private.settings')).rows[0].runtime_enabled).toBe(false);
});
