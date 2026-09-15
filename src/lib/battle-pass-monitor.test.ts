import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// Isolated PostgreSQL and DOM: no production connection or external requests.
import { PGlite } from '@electric-sql/pglite';
import { Window } from 'happy-dom';

const source = readFileSync('battle-pass-monitor.js', 'utf8');
const context: any = {};
vm.runInNewContext(source, context);
const api = context.BattlePassMonitor;
const fixture = () => ({
  observedAt: '2026-09-15T05:00:00Z', enabled: true,
  scheduler: {active: true, schedule: '*/30 * * * *', lastRun: {runId: 8, status: 'succeeded', startedAt: '2026-09-15T04:30:00Z'}},
  history: [{runId: 'worker-1', checkedAt: '2026-09-15T04:30:10Z', status: 'waiting_confirmation', period: '2026-10', kind: 'production', stage: 'source'}], outputs: []
});

describe('Battle Pass monitor interpretation', () => {
  it('separates a successful cron dispatch from waiting for P', () => {
    const m = api.model(fixture());
    expect(m.enabled).toBe(true); expect(m.latest.status).toBe('waiting_confirmation'); expect(m.stale).toBe(false);
  });
  it('requires both switches and a job before saying enabled', () => {
    for (const data of [{...fixture(), enabled: false}, {...fixture(), scheduler: null}, {...fixture(), scheduler: {active:false}}]) expect(api.model(data).enabled).toBe(false);
  });
  it('does not let a fresh readiness check conceal an old worker run', () => {
    const data = fixture(); data.observedAt = '2026-09-15T07:00:00Z';
    data.history.unshift({...data.history[0], kind: 'readiness', status:'readiness_checked', checkedAt: data.observedAt});
    expect(api.model(data).stale).toBe(true);
  });
  it('treats absent or unrecognised evidence conservatively', () => {
    expect(api.model({...fixture(), history:[]}).stale).toBe(true);
    expect(api.status('surprise')).toContain('ยังไม่รู้จัก');
    expect(() => api.model({})).toThrow();
  });
  it('only builds links for valid output IDs', () => {
    expect(api.outputLinks({displayId:'javascript:alert(1)', slideId:'../../evil'})).toEqual([]);
    expect(api.outputLinks({displayId:'CR-1244', slideId:'valid_deck_id_123'})).toHaveLength(2);
    expect(api.time('invalid')).toBe('ยังไม่มีข้อมูล');
  });
});

async function page(rpcResult: any, loggedIn = true) {
  const window: any = new Window({url:'http://localhost/home/battle-pass-status.html'});
  window.document.write(readFileSync('home/battle-pass-status.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
  const calls: string[] = []; let authCallback: any;
  window.flowmateSupabase = {auth: {
    getUser: async () => ({data:{user:loggedIn?{id:'owner'}:null}}),
    onAuthStateChange: (callback: any) => {authCallback = callback;}
  }, rpc: async (name: string) => {calls.push(name); return typeof rpcResult === 'function' ? await rpcResult() : rpcResult;}};
  window.eval(source);
  await new Promise(resolve => setTimeout(resolve, 10));
  return {window, calls, signOut: () => authCallback('SIGNED_OUT')};
}
describe('Battle Pass monitor page', () => {
  it('renders waiting status, details and empty outputs without any write call', async () => {
    const p = await page({data:fixture()});
    expect(p.window.document.getElementById('latest').textContent).toContain('รอ Aof');
    expect(p.window.document.getElementById('cron').textContent).toBe('เรียกงานสำเร็จ');
    expect(p.window.document.getElementById('history').textContent).toContain('worker-1');
    expect(p.calls).toEqual(['battle_pass_monitor']);
    p.signOut(); expect(p.window.document.getElementById('monitor').hidden).toBe(true);
    expect(p.window.document.getElementById('history').children.length).toBe(0);
    expect(p.window.document.getElementById('cron-time').textContent).toBe('');
    await p.window.happyDOM.close();
  });
  it('discards a response arriving after sign-out', async () => {
    let finish:any;
    const pending = new Promise(resolve => {finish = resolve;});
    const p = await page(() => pending);
    p.signOut(); finish({data:fixture()}); await new Promise(resolve => setTimeout(resolve, 10));
    expect(p.window.document.getElementById('monitor').hidden).toBe(true);
    expect(p.window.document.getElementById('history').children.length).toBe(0);
    await p.window.happyDOM.close();
  });
  it.each(['42501','PGRST202','NETWORK'])('hides data on access or loading error %s', async (code) => {
    const p = await page({error:{code, message:'sensitive server detail'}});
    expect(p.window.document.getElementById('monitor').hidden).toBe(true);
    expect(p.window.document.body.textContent).not.toContain('sensitive server detail');
    expect(p.window.document.getElementById('refresh').disabled).toBe(false);
    await p.window.happyDOM.close();
  });
  it('never requests records while signed out', async () => {
    const p = await page({data:fixture()}, false); expect(p.calls).toEqual([]);
    expect(p.window.document.getElementById('login').hidden).toBe(false); await p.window.happyDOM.close();
  });
  it('renders record text safely and filters readiness checks', async () => {
    const data = fixture(); data.history.push({...data.history[0], kind:'readiness', status:'readiness_checked', runId:'<img src=x onerror=alert(1)>'});
    const p = await page({data}); expect(p.window.document.querySelector('#history img')).toBeNull();
    const filter = p.window.document.getElementById('filter'); filter.value='checks'; filter.dispatchEvent(new p.window.Event('change'));
    expect(p.window.document.querySelectorAll('#history tr').length).toBe(1); await p.window.happyDOM.close();
  });
});

describe('Read-only monitor SQL on isolated PostgreSQL', () => {
  it('authorizes only active owner/Aof, caps history, excludes secrets and TEST outputs', async () => {
    const db = new PGlite();
    const owner='6e274581-5905-4146-a3eb-871f9c847bc6', aof='5abad25d-3e8c-4a0d-baa6-0a0615ba00fc', other='00000000-0000-0000-0000-000000000001';
    try {
      await db.exec(`create role anon; create role authenticated; create schema auth; create schema battle_pass_private; create schema cron;
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        create table public.users(id uuid primary key,is_active boolean);
        insert into public.users values('${owner}',true),('${aof}',true),('${other}',true);
        create table battle_pass_private.google_connection(singleton boolean,user_id uuid,refresh_token text);
        insert into battle_pass_private.google_connection values(true,'${owner}','SECRET_TOKEN');
        create table battle_pass_private.monthly_settings(singleton boolean,enabled boolean,scheduler_secret_id text);
        insert into battle_pass_private.monthly_settings values(true,true,'SECRET_ID');
        create table battle_pass_private.production_ticks(run_id uuid primary key,status text,code text,checked_at timestamptz,detail jsonb);
        insert into battle_pass_private.production_ticks select gen_random_uuid(),'waiting_confirmation',null,now()-i*interval '1 minute','{"plan":{"next":{"period":"2026-10"}},"secret":"SECRET_DETAIL"}'::jsonb from generate_series(1,60) i;
        create table cron.job(jobid bigint,jobname text,active boolean,schedule text,command text);
        insert into cron.job values(4,'battle-pass-production-30m',true,'*/30 * * * *','SECRET_COMMAND');
        create table cron.job_run_details(jobid bigint,runid bigint,status text,start_time timestamptz,end_time timestamptz,return_message text);
        insert into cron.job_run_details values(4,99,'succeeded',now(),now(),'SECRET_ERROR');
        create table public.work_items(id uuid,display_id text);
        create table battle_pass_private.monthly_runs(mode text,period text,state text,updated_at timestamptz,brief_id uuid,slide_id text,review_released_at timestamptz,checkpoint jsonb);
        insert into battle_pass_private.monthly_runs values('test','2026-07','complete',now(),null,'JUL_TEST',null,'{}'),('production','2026-10','complete',now(),null,'oct_deck_12345',null,'{"secret":"SECRET_CHECKPOINT"}');`);
      await db.exec(readFileSync('supabase/battle_pass_monitor.sql','utf8'));
      for (const id of [owner,aof]) {
        await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
        const result:any = await db.query('select public.battle_pass_monitor() as result');
        const data = result.rows[0].result;
        expect(data.history).toHaveLength(50); expect(data.outputs).toHaveLength(1); expect(data.outputs[0].period).toBe('2026-10');
        expect(data.scheduler.lastRun.runId).toBe(99); expect(data.enabled).toBe(true);
        expect(JSON.stringify(data)).not.toContain('SECRET');
        await expect(db.query('select * from battle_pass_private.production_ticks')).rejects.toThrow();
        await db.exec('reset role;');
      }
      for (const id of [other,'']) {
        await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
        await expect(db.query('select public.battle_pass_monitor()')).rejects.toThrow('Monitor access denied'); await db.exec('reset role;');
      }
      await db.exec(`update public.users set is_active=false where id='${aof}'; set role authenticated; select set_config('request.jwt.claim.sub','${aof}',false);`);
      await expect(db.query('select public.battle_pass_monitor()')).rejects.toThrow('Monitor access denied'); await db.exec('reset role; set role anon;');
      await expect(db.query('select public.battle_pass_monitor()')).rejects.toThrow(); await db.exec('reset role;');
      const intact:any = await db.query('select enabled, (select count(*) from cron.job) as jobs from battle_pass_private.monthly_settings');
      expect(intact.rows[0]).toEqual({enabled:true,jobs:1});
    } finally { await db.close(); }
  }, 30000);
});
