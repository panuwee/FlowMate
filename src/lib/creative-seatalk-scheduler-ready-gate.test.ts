import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// In-memory Postgres only. net.http_post records a row; it cannot send HTTP.
const install = readFileSync('supabase/creative_seatalk_scheduler_ready_gate.sql', 'utf8');
const rollback = readFileSync('supabase/creative_seatalk_scheduler_ready_gate_rollback.sql', 'utf8');
const original = "select net.http_post(url := 'https://test.invalid/functions/v1/seatalk-creative-dispatch', headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-token', (select decrypted_secret from vault.decrypted_secrets where name = 'synthetic-test-only')), body := '{}'::jsonb);";
let db: PGlite;
async function job() {
  return (await db.query<{ jobid: number; command: string; schedule: string; active: boolean; username: string }>('select jobid,command,schedule,active,username from cron.job where jobid=1')).rows[0];
}
async function requests() { return (await db.query<{ n: number }>('select count(*)::int n from net.requests')).rows[0].n; }
async function tick() { await db.exec((await job()).command); }

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create schema cron; create schema private; create schema net; create schema vault;
    create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,active boolean,username text);
    create table private.creative_seatalk_outbox(id bigint generated always as identity,status text,available_at timestamptz);
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    insert into vault.decrypted_secrets values('synthetic-test-only','TEST_ONLY');
    create table net.requests(url text,headers jsonb,body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language plpgsql as $$
      begin insert into net.requests values($1,$2,$3); return 1; end $$;
    create function cron.alter_job(job_id bigint,schedule text default null,command text default null,
      database text default null,username text default null,active boolean default null)
      returns void language sql as $$update cron.job set command=coalesce($3,cron.job.command),
      schedule=coalesce($2,cron.job.schedule),username=coalesce($5,cron.job.username),active=coalesce($6,cron.job.active) where jobid=$1$$;`);
  await db.query('insert into cron.job values(1,$1,$2,$3,true,$4)', ['creativebot-dispatch-every-minute', '* * * * *', original, 'test_scheduler']);
}, 15_000);
afterEach(async () => db.close());

describe('CreativeBot scheduler ready gate', () => {
  it('does not invoke HTTP when the queue is empty, leaving the job enabled every minute', async () => {
    await db.exec(install); await tick();
    expect(await requests()).toBe(0);
    expect(await job()).toMatchObject({ jobid: 1, schedule: '* * * * *', active: true, username: 'test_scheduler' });
  });

  it('detects a new item on the next tick after an empty tick', async () => {
    await db.exec(install); await tick(); expect(await requests()).toBe(0);
    await db.exec("insert into private.creative_seatalk_outbox(status,available_at) values('pending',now())");
    await tick(); expect(await requests()).toBe(1);
  });

  it.each(['pending', 'retry'])('invokes HTTP once for due %s rows without claiming or editing them', async status => {
    await db.query("insert into private.creative_seatalk_outbox(status,available_at) values($1,now()-interval '1 minute'),($1,now()-interval '2 minutes')", [status]);
    await db.exec(install); await tick();
    expect(await requests()).toBe(1);
    expect((await db.query('select status from private.creative_seatalk_outbox')).rows).toEqual([{ status }, { status }]);
    expect((await db.query<{ value: string }>("select headers->>'x-dispatch-token' value from net.requests")).rows[0].value).toBe('TEST_ONLY');
  });

  it('does not call before available_at, then calls when the same retry becomes due', async () => {
    await db.exec("insert into private.creative_seatalk_outbox(status,available_at) values('pending',now()+interval '1 hour'),('retry',now()+interval '1 hour')");
    await db.exec(install); await tick();
    expect(await requests()).toBe(0);
    await db.exec("update private.creative_seatalk_outbox set available_at=now()-interval '1 second' where status='retry'");
    await tick(); expect(await requests()).toBe(1);
  });

  it('ignores terminal/sending rows even when their available_at is in the past', async () => {
    for (const status of ['sent', 'failed', 'cancelled', 'sending'])
      await db.query("insert into private.creative_seatalk_outbox(status,available_at) values($1,now()-interval '1 day')", [status]);
    await db.exec(install); await tick(); expect(await requests()).toBe(0);
  });

  it('is idempotent and restores the original command on rollback', async () => {
    await db.exec(install); const gated = (await job()).command;
    await db.exec(install); expect((await job()).command).toBe(gated);
    await db.exec(rollback); expect((await job()).command).toBe(original);
    await db.exec(rollback); expect((await job()).command).toBe(original);
    await tick(); expect(await requests()).toBe(1);
  });

  it('retains a paused job and leaves all other scheduler jobs untouched', async () => {
    await db.exec("update cron.job set active=false where jobid=1; insert into cron.job values(2,'unrelated','*/30 * * * *','select 1',true,'other_user')");
    await db.exec(install);
    expect((await job()).active).toBe(false);
    expect((await db.query('select command from cron.job where jobid=2')).rows).toEqual([{ command: 'select 1' }]);
  });

  it.each(['select 1;', original + ' select 2;', original.replace('body :=', 'timeout_milliseconds := 10, body :=')])
    ('rejects unfamiliar commands without overwriting the job', async command => {
      await db.query('update cron.job set command=$1', [command]);
      await expect(db.exec(install)).rejects.toThrow('command differs');
      await db.exec('rollback');
      expect((await job()).command).toBe(command);
    });

  it('refuses duplicate named jobs', async () => {
    await db.query("insert into cron.job select 2,jobname,schedule,command,active,username from cron.job where jobid=1");
    await expect(db.exec(install)).rejects.toThrow('exactly one');
    await db.exec('rollback');
  });

  it('refuses to undo an edited gate rather than discarding another change', async () => {
    await db.exec(install);
    await db.query('update cron.job set command=command || $1', [' -- unrelated edit']);
    await expect(db.exec(rollback)).rejects.toThrow('gate differs');
    await db.exec('rollback');
  });
});
