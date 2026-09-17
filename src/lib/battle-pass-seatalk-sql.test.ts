import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const sql=readFileSync("supabase/battle_pass_seatalk.sql","utf8");

describe("Battle Pass SeaTalk SQL contract",()=>{
  it("requires all three brief-ready facts",()=>{expect(sql).toContain("r.state = 'complete'");
    expect(sql).toContain("w.work_type = 'creative_request'");expect(sql).toContain("w.status = 'unassigned'");
    expect(sql).toContain("m.flowmate_work_item_id = w.id");
    expect(sql).toContain("rtrim(v_settings.flowmate_base_url,'/') || '/home/#detail/' || w.display_id");});
  it("routes success and errors to approved recipients",()=>{expect(sql).toContain("'NTgyNzAzMjc5MjE4'");
    expect(sql).toContain("'ODg5NDI1MDQwODI3'");expect(sql).toContain("'panuwee.w@garena.com'");
    expect(sql).toMatch(/'brief_ready',[\s\S]*?'group'/);expect(sql).toMatch(/'run_failed',[\s\S]*?'user'/);});
  it("ships disabled and paused with service-only RPC grants",()=>{expect(sql).toContain("seatalk_enabled boolean not null default false");
    expect(sql).toContain("perform cron.alter_job(v_job,active:=false)");
    expect(sql).toContain("revoke all on battle_pass_private.seatalk_notifications from public, anon, authenticated, service_role");
    expect(sql).toMatch(/grant execute on function public\.battle_pass_seatalk_claim\(integer\),[\s\S]*?to service_role/);});
  it("does not blind-retry an uncertain send",()=>{expect(sql).toContain("'delivery_unknown'");
    expect(sql).toContain("and n.send_started_at is null");expect(sql).toContain("operator_reconciliation_required");});
  it("executes locally and enqueues only a fully linked Unassigned brief",async()=>{
    const db=new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role;
        create schema battle_pass_private; create schema cron; create schema vault; create schema net;
        create table battle_pass_private.monthly_settings(singleton boolean primary key,enabled boolean,scheduler_secret_id uuid);
        insert into battle_pass_private.monthly_settings values(true,true,null);
        create table battle_pass_private.monthly_runs(mode text,period text,state text,task_id uuid,brief_id uuid,
          run_id uuid,checkpoint jsonb,updated_at timestamptz);
        create table battle_pass_private.production_ticks(run_id uuid primary key,status text,code text,
          checked_at timestamptz,detail jsonb);
        create table public.work_items(id uuid primary key,display_id text,work_type text,title text,status text);
        create table public.marketing_content_items(id uuid primary key,brief_link text,flowmate_work_item_id uuid);
        create table cron.job(jobid bigint generated always as identity,jobname text,schedule text,command text,active boolean);
        create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$
          declare v_id bigint; begin insert into cron.job(jobname,schedule,command,active) values(p_name,p_schedule,p_command,true)
          returning jobid into v_id; return v_id; end $$;
        create function cron.alter_job(p_jobid bigint,active boolean) returns void language sql as $$
          update cron.job set active=$2 where jobid=$1 $$;
        create function battle_pass_private.require_worker() returns void language plpgsql as $$begin return; end$$;`);
      await db.exec(sql);
      const work="11111111-1111-4111-8111-111111111111",task="22222222-2222-4222-8222-222222222222";
      const run="33333333-3333-4333-8333-333333333333";
      await db.exec(`update battle_pass_private.monthly_settings set seatalk_enabled=true,
          seatalk_activation_cutoff=clock_timestamp()-interval '1 day';
        insert into public.work_items values('${work}','CR-1200','creative_request','Battle Pass (Oct 2026)','unassigned');
        insert into public.marketing_content_items values('${task}','https://wrong.example/home/#detail/CR-1200','${work}');
        insert into battle_pass_private.monthly_runs values('production','2026-10','complete','${task}','${work}','${run}','{}',clock_timestamp());
        select battle_pass_private.seatalk_detect();`);
      expect((await db.query<any>("select count(*)::integer as count from battle_pass_private.seatalk_notifications")).rows[0].count).toBe(0);
      await db.exec(`update public.marketing_content_items
        set brief_link='https://panuwee.github.io/FlowMate/home/#detail/CR-1200' where id='${task}';
        select battle_pass_private.seatalk_detect();`);
      let result=await db.query<any>("select event_kind,recipient_kind,status,payload->>'displayId' as display_id from battle_pass_private.seatalk_notifications");
      expect(result.rows).toEqual([{event_kind:"brief_ready",recipient_kind:"group",status:"pending",display_id:"CR-1200"}]);
      await db.exec(`update public.work_items set status='assigned' where id='${work}';
        select battle_pass_private.seatalk_detect(); select battle_pass_private.seatalk_detect();`);
      result=await db.query<any>("select status,status_reason from battle_pass_private.seatalk_notifications");
      expect(result.rows).toEqual([{status:"cancelled",status_reason:"readiness_stale"}]);
      const failedRun="44444444-4444-4444-8444-444444444444";
      await db.exec(`insert into battle_pass_private.production_ticks values('${failedRun}','failed','source_read_failed',
        clock_timestamp(),'{"stage":"source_read","code":"source_read_failed","period":"2026-11"}');
        select battle_pass_private.seatalk_detect();`);
      result=await db.query<any>(`select event_kind,recipient_kind,recipient_key,status from battle_pass_private.seatalk_notifications
        where event_kind='run_failed'`);
      expect(result.rows).toEqual([{event_kind:"run_failed",recipient_kind:"user",
        recipient_key:"panuwee.w@garena.com",status:"pending"}]);
      const claimed=(await db.query<any>("select public.battle_pass_seatalk_claim(10) as result")).rows[0].result.claims;
      expect(claimed).toHaveLength(1);expect(claimed[0]).toMatchObject({eventKind:"run_failed",recipientKind:"user"});
      expect((await db.query<any>("select public.battle_pass_seatalk_mark_send_started($1) as marked",[claimed[0].dispatchKey])).rows[0].marked).toBe(true);
      const finished=(await db.query<any>("select public.battle_pass_seatalk_finish($1,'delivery_unknown',null,'message_send_network') as result",
        [claimed[0].dispatchKey])).rows[0].result;
      expect(finished).toMatchObject({finalized:true,status:"delivery_unknown"});
      expect((await db.query<any>("select public.battle_pass_seatalk_claim(10) as result")).rows[0].result.claims).toHaveLength(0);
      const jobs=await db.query<any>("select active from cron.job where jobname='battle-pass-seatalk-15m'");
      expect(jobs.rows).toEqual([{active:false}]);
    } finally { await db.close(); }
  },30000);
});
