import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { Window } from 'happy-dom';

const source = readFileSync('battle-pass-readiness.js','utf8');
const ctx:any = {}; vm.runInNewContext(source,ctx);
const summarize = ctx.BattlePassReadiness.summarize;
const OWNER='6e274581-5905-4146-a3eb-871f9c847bc6', AOF='5abad25d-3e8c-4a0d-baa6-0a0615ba00fc';
const RUN='00000000-0000-4000-8000-000000000111';
const complete = {requestId:'1001',state:'complete',runId:RUN,requestedAt:'2026-09-15T08:00:00Z',checkedAt:'2026-09-15T08:00:05Z',
  period:'2026-10',planState:'planned',nextState:'waiting_confirmation',confirmed:false,workingSheetLinked:true,sourceReady:false,googleReady:true,databaseReady:true,issues:[]};

describe('Readiness result meaning',()=>{
  it('does not call unconfirmed Loot ready when Google and DB pass',()=>{
    const r=summarize(complete); expect(r.title).toContain('รอ Aof'); expect(r.checks.join(' ')).toContain('รอ P ก่อนตรวจ Loot');
  });
  it('requires source, Google and DB together before calling ready',()=>{
    expect(summarize({...complete,confirmed:true,sourceReady:true}).title).toContain('ข้อมูลพร้อม ณ');
    expect(summarize({...complete,confirmed:true,sourceReady:true,databaseReady:false}).title).not.toContain('ข้อมูลพร้อม ณ');
  });
  it('shows no pending month separately from ready and failed',()=>{
    expect(summarize({...complete,period:null,nextState:null}).title).toContain('ไม่มีเดือน');
    expect(summarize({state:'failed',code:'readiness_result_unavailable'}).title).toContain('ยังยืนยันผล');
  });
});

describe('Manual readiness SQL — isolated PostgreSQL, no network',()=>{
  let db:PGlite;
  async function login(id=OWNER) {await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated');}
  async function request(){return (await db.query<any>('select public.battle_pass_request_readiness() as r')).rows[0].r;}
  async function status(id:string|null=null){return (await db.query<any>('select public.battle_pass_readiness_status($1) as r',[id])).rows[0].r;}
  async function respond(id:string,body:any={runId:RUN},detail:any={}) {
    await db.exec('reset role');
    await db.query("insert into battle_pass_private.production_ticks values($1,'readiness_checked',clock_timestamp(),$2)",[RUN,{plan:{state:'planned',next:{period:'2026-10',state:'waiting_confirmation',issues:[]},issues:[]},sourceStatus:{confirmed:false,workingSheetLinked:true},sourceReady:false,google:{capabilitiesVerified:true,secret:'SECRET_GOOGLE'},database:{ready:true},...detail}]);
    await db.query("insert into net._http_response values($1,200,false,null,$2)",[id,JSON.stringify(body)]); await login();
  }
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema battle_pass_private; create schema net;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key,is_active boolean);
      insert into public.users values('${OWNER}',true),('${AOF}',true),('00000000-0000-0000-0000-000000000001',true);
      create table battle_pass_private.google_connection(singleton boolean,user_id uuid);
      insert into battle_pass_private.google_connection values(true,'${OWNER}');
      create table battle_pass_private.production_ticks(run_id uuid,status text,checked_at timestamptz,detail jsonb);
      create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text,content text);
      create table battle_pass_private.dispatch_calls(id bigint generated always as identity(start with 1001),action text);
      create function battle_pass_private.dispatch(p_action text) returns bigint language plpgsql security definer as $$
        declare rid bigint; begin insert into battle_pass_private.dispatch_calls(action) values(p_action) returning id into rid; return rid; end $$;`);
    await db.exec(readFileSync('supabase/battle_pass_readiness.sql','utf8'));
  },30000);
  beforeEach(async()=>{await db.exec('reset role; truncate battle_pass_private.readiness_requests,battle_pass_private.production_ticks,net._http_response,battle_pass_private.dispatch_calls restart identity;');await login();});
  afterAll(async()=>{await db.close();});
  it('dispatches only readiness and shares one request across owner/Aof',async()=>{
    const first=await request();await login(AOF);const second=await request();
    expect(second.requestId).toBe(first.requestId);expect(second.reused).toBe(true);expect((await status()).state).toBe('pending');
    await db.exec('reset role');expect((await db.query<any>('select action from battle_pass_private.dispatch_calls')).rows).toEqual([{action:'readiness'}]);
  });
  it('denies other users, signed-out users, inactive Aof and anonymous execution',async()=>{
    for(const id of ['00000000-0000-0000-0000-000000000001','']) {await login(id);await expect(request()).rejects.toThrow('Readiness access denied');await expect(status()).rejects.toThrow('Readiness access denied');}
    await db.exec(`reset role; update public.users set is_active=false where id='${AOF}';`);await login(AOF);await expect(request()).rejects.toThrow();
    await db.exec(`reset role; update public.users set is_active=true where id='${AOF}'; set role anon;`);await expect(request()).rejects.toThrow();
    await login();await expect(db.query('select * from battle_pass_private.readiness_requests')).rejects.toThrow();
  });
  it('correlates the exact run, hides provider fields, and persists sanitized results',async()=>{
    const r=await request();await respond(r.requestId);
    const s=await status(r.requestId);expect(s.state).toBe('complete');expect(s.confirmed).toBe(false);expect(s.runId).toBe(RUN);expect(JSON.stringify(s)).not.toContain('SECRET');
    await db.exec('reset role; truncate net._http_response');await login();expect(await status(r.requestId)).toEqual(s);
    expect((await request()).reused).toBe(true);
  });
  it('does not substitute the most recent unrelated worker tick',async()=>{
    const r=await request();await respond(r.requestId,{runId:'wrong'});expect((await status(r.requestId)).code).toBe('readiness_response_invalid');
  });
  it.each(['provider-error','invalid-json','timeout'])('returns safe failure for %s',async(mode)=>{
    const r=await request();await db.exec('reset role');
    await db.query('insert into net._http_response values($1,$2,$3,$4,$5)',[r.requestId,mode==='provider-error'?503:200,mode==='timeout',mode==='provider-error'?'SECRET_TOKEN':null,'not json SECRET']);
    await login();const s=await status(r.requestId);expect(s.state).toBe('failed');expect(JSON.stringify(s)).not.toContain('SECRET');
  });
  it('expires missing responses and permits a new check after the deadline',async()=>{
    const r=await request();await db.exec("reset role; update battle_pass_private.readiness_requests set requested_at=clock_timestamp()-interval '181 seconds'");await login();
    expect((await status(r.requestId)).code).toBe('readiness_result_unavailable');expect((await request()).requestId).not.toBe(r.requestId);
  });
});

async function page(reply:(name:string,args:any)=>any) {
  const w:any=new Window({url:'http://localhost/home/battle-pass-status.html'});
  w.document.write(readFileSync('home/battle-pass-status.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
  w.document.getElementById('monitor').hidden=false;
  const calls:any[]=[];w.flowmateSupabase={rpc:async(name:string,args:any)=>{calls.push({name,args});return reply(name,args);}};
  w.eval(source);await new Promise(r=>setTimeout(r,10));return {w,calls};
}
describe('Readiness UI requests and recovery',()=>{
  it('only reads on load; click starts a check once and renders its result',async()=>{
    let started=false;const p=await page((name)=>{
      if(name==='battle_pass_request_readiness'){started=true;return {data:{requestId:'1001'}};}
      return {data:started?complete:{state:'empty'}};
    });
    expect(p.calls.map(c=>c.name)).toEqual(['battle_pass_readiness_status']);
    const btn=p.w.document.getElementById('readiness-start');btn.click();btn.click();await new Promise(r=>setTimeout(r,10));
    expect(p.calls.filter(c=>c.name==='battle_pass_request_readiness')).toHaveLength(1);
    expect(p.w.document.getElementById('readiness-message').textContent).toContain('รอ Aof');
    expect(p.w.document.getElementById('readiness-meta').textContent).toContain(RUN);await p.w.happyDOM.close();
  });
  it('an uncertain start exposes read-only recovery instead of automatically dispatching again',async()=>{
    const p=await page(name=>name==='battle_pass_request_readiness'?{error:{code:'NETWORK',message:'SECRET'}}:{data:{state:'empty'}});
    p.w.document.getElementById('readiness-start').click();await new Promise(r=>setTimeout(r,10));
    expect(p.w.document.getElementById('readiness-start').disabled).toBe(true);expect(p.w.document.getElementById('readiness-recover').hidden).toBe(false);
    expect(p.w.document.body.textContent).not.toContain('SECRET');await p.w.happyDOM.close();
  });
  it('clears results and ignores a late response when access is revoked',async()=>{
    let finish:any;const pending=new Promise(r=>{finish=r;});const p=await page(()=>pending);
    p.w.dispatchEvent(new p.w.CustomEvent('flowmate:bp-monitor-access',{detail:false}));finish({data:complete});await new Promise(r=>setTimeout(r,10));
    expect(p.w.document.getElementById('readiness-meta').textContent).toBe('');expect(p.w.document.getElementById('readiness-start').disabled).toBe(true);await p.w.happyDOM.close();
  });
});
