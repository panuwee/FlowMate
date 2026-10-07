import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// No network/client/production credentials. HTTP is a local row insertion.
const install = readFileSync('supabase/battle_pass_seatalk_idle_gate.sql', 'utf8');
const rollback = readFileSync('supabase/battle_pass_seatalk_idle_gate_rollback.sql', 'utf8');
const source = readFileSync('supabase/battle_pass_seatalk.sql', 'utf8').replace(/\r\n/g, '\n');
const original = source.match(/create or replace function battle_pass_private\.seatalk_dispatch\(\)[\s\S]*?end \$\$;/)![0];
let db: PGlite;
const tick = () => db.query('select battle_pass_private.seatalk_dispatch() as id');
async function requests() { return (await db.query<{ n: number }>('select count(*)::int n from net.requests')).rows[0].n; }
async function body() { return (await db.query<{ body: string }>("select prosrc body from pg_proc where oid='battle_pass_private.seatalk_dispatch()'::regprocedure")).rows[0].body; }
async function metadata() { return (await db.query("select proowner,proacl::text,prosecdef,proconfig from pg_proc where oid='battle_pass_private.seatalk_dispatch()'::regprocedure")).rows[0]; }
async function row(status: string, attempts = 0, due = true, started = false) {
  await db.query(`insert into battle_pass_private.seatalk_notifications
    (status,attempt_count,eligible_at,next_attempt_at,lease_expires_at,send_started_at)
    values($1,$2,now()-interval '1 hour',now()+case when $3 then interval '-1 minute' else interval '1 hour' end,
    now()+case when $3 then interval '-1 minute' else interval '1 hour' end,
    case when $4 then now()-interval '2 minutes' else null end)`, [status, attempts, due, started]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema battle_pass_private; create schema net; create schema vault;
    create table battle_pass_private.monthly_settings(singleton boolean,seatalk_enabled boolean,
      seatalk_activation_cutoff timestamptz,scheduler_secret_id integer);
    insert into battle_pass_private.monthly_settings values(true,true,now()-interval '1 day',1);
    create table battle_pass_private.seatalk_notifications(status text,attempt_count integer,
      eligible_at timestamptz,next_attempt_at timestamptz,lease_expires_at timestamptz,send_started_at timestamptz);
    create table vault.decrypted_secrets(id integer,decrypted_secret text);
    insert into vault.decrypted_secrets values(1,repeat('TEST_ONLY_',5));
    create table net.requests(url text,headers jsonb,body jsonb,timeout_milliseconds integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
    returns bigint language plpgsql as $$ begin
      insert into net.requests values($1,$2,$3,$4); return 17; end $$;`);
  await db.exec(original);
  await db.exec('revoke all on function battle_pass_private.seatalk_dispatch() from public');
}, 20_000);
beforeEach(async () => {
  await db.exec(original);
  await db.exec(`truncate battle_pass_private.seatalk_notifications,net.requests;
    update battle_pass_private.monthly_settings set seatalk_enabled=true,seatalk_activation_cutoff=now()-interval '1 day';
    update vault.decrypted_secrets set decrypted_secret=repeat('TEST_ONLY_',5);`);
});
afterAll(async () => db.close());

describe('Battle Pass idle dispatcher gate', () => {
  it('uses the exact body fingerprint inspected on production', async () => {
    expect((await db.query<{ hash: string }>("select md5(prosrc) hash from pg_proc where oid='battle_pass_private.seatalk_dispatch()'::regprocedure")).rows[0].hash)
      .toBe('b508cf2f8a07c304a0dd031da13463a8');
  });
  it('skips an empty queue before resolving credentials', async () => {
    await db.exec(install); await db.exec('update vault.decrypted_secrets set decrypted_secret=null');
    expect((await tick()).rows).toEqual([{ id: null }]); expect(await requests()).toBe(0);
  });
  it('notices work inserted after an idle tick on the next tick', async () => {
    await db.exec(install); await tick(); await row('pending'); await tick(); expect(await requests()).toBe(1);
  });
  it.each(['pending','failed'])('dispatches due %s once without modifying the queue', async status => {
    await row(status,4); await row(status,1);
    const before = (await db.query('select * from battle_pass_private.seatalk_notifications')).rows;
    await db.exec(install); expect((await tick()).rows).toEqual([{ id: 17 }]);
    expect(await requests()).toBe(1);
    expect((await db.query('select * from battle_pass_private.seatalk_notifications')).rows).toEqual(before);
    expect((await db.query('select url,body,timeout_milliseconds from net.requests')).rows).toEqual([{
      url:'https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/battle-pass-seatalk',body:{limit:10},timeout_milliseconds:120000
    }]);
  });
  it.each(['pending','failed'])('waits until %s is due', async status => {
    await row(status,1,false); await db.exec(install); await tick(); expect(await requests()).toBe(0);
    await db.exec("update battle_pass_private.seatalk_notifications set next_attempt_at=now()-interval '1 second'");
    await tick(); expect(await requests()).toBe(1);
  });
  it('uses eligible_at when next_attempt_at is null', async () => {
    await row('pending'); await db.exec('update battle_pass_private.seatalk_notifications set next_attempt_at=null');
    await db.exec(install); await tick(); expect(await requests()).toBe(1);
  });
  it.each(['pending','failed','dispatching'])('does not retry exhausted %s before send start', async status => {
    await row(status,5); await db.exec(install); await tick(); expect(await requests()).toBe(0);
  });
  it.each([false,true])('wakes expired dispatches, send_started=%s', async started => {
    await row('dispatching',started?5:4,true,started); await db.exec(install); await tick(); expect(await requests()).toBe(1);
  });
  it('leaves an active lease alone', async () => {
    await row('dispatching',1,false,true); await db.exec(install); await tick(); expect(await requests()).toBe(0);
  });
  it.each(['sent','cancelled','delivery_unknown'])('does not resend terminal %s', async status => {
    await row(status); await db.exec(install); await tick(); expect(await requests()).toBe(0);
  });
  it.each(['seatalk_enabled=false','seatalk_enabled=null','seatalk_activation_cutoff=null'])('respects %s', async change => {
    await row('pending'); await row('dispatching',4,true,true); await db.exec(install);
    await db.exec(`update battle_pass_private.monthly_settings set ${change}`);
    await tick(); expect(await requests()).toBe(0);
  });
  it('still reports credential errors when work is due', async () => {
    await row('pending'); await db.exec(install); await db.exec('update vault.decrypted_secrets set decrypted_secret=null');
    await expect(tick()).rejects.toThrow('Scheduler credential unavailable');
  });
  it('is idempotent and exactly reversible while retaining ACL and security settings', async () => {
    const initial = await body(), acl = await metadata();
    await db.exec(install); const gated = await body(); await db.exec(install);
    expect(await body()).toBe(gated); expect(await metadata()).toEqual(acl);
    await db.exec(rollback); await db.exec(rollback);
    expect(await body()).toBe(initial); expect(await metadata()).toEqual(acl);
    await tick(); expect(await requests()).toBe(1);
  });
  it('refuses baseline drift atomically', async () => {
    await db.exec(original.replace('return v_request;', 'return v_request + 1;'));
    const changed = await body(); await expect(db.exec(install)).rejects.toThrow('dispatcher differs');
    await db.exec('rollback'); expect(await body()).toBe(changed);
  });
  it.each(['install','rollback'])('refuses an edited gate on %s', async action => {
    await db.exec(install);
    const definition = (await db.query<{ ddl: string }>("select pg_get_functiondef('battle_pass_private.seatalk_dispatch()'::regprocedure) ddl")).rows[0].ddl;
    await db.exec(definition.replace('n.attempt_count<5','n.attempt_count<6'));
    const changed = await body();
    await expect(db.exec(action==='install'?install:rollback)).rejects.toThrow('idle gate differs');
    await db.exec('rollback'); expect(await body()).toBe(changed);
  });
});
