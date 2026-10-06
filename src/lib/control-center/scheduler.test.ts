import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema wcc_private;create schema vault;create schema net;
 create table wcc_private.settings(singleton boolean primary key,runtime_enabled boolean);
 insert into wcc_private.settings values(true,false);
 create table wcc_private.deliveries(status text,available_at timestamptz,lease_until timestamptz);
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table net.calls(url text,body jsonb,headers jsonb,timeout_milliseconds integer);
 create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ begin insert into net.calls values(url,body,headers,timeout_milliseconds);return 42;end $$;`);
 const source=readFileSync('supabase/workgrid_control_center_scheduler.sql','utf8');
 const start=source.indexOf('create or replace function');
 const end=source.indexOf('do $$ begin',start);
 await db.exec(source.slice(start,end));
});
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec("reset role;delete from net.calls;delete from wcc_private.deliveries;delete from vault.decrypted_secrets;update wcc_private.settings set runtime_enabled=false where singleton=true;");});
async function invoke(){return (await db.query<{id:number|null}>('select wcc_private.request_dispatch() id')).rows[0].id;}
async function ready(){await db.exec("update wcc_private.settings set runtime_enabled=true where singleton=true;insert into wcc_private.deliveries(status,available_at) values('pending',now());insert into vault.decrypted_secrets values('wcc_dispatch_secret',repeat('x',64));");}
it('paused runtime does not invoke HTTP even with queued delivery',async()=>{await ready();await db.exec('update wcc_private.settings set runtime_enabled=false where singleton=true');expect(await invoke()).toBeNull();expect((await db.query('select * from net.calls')).rows).toHaveLength(0);});
it('empty queue does not invoke HTTP',async()=>{await db.exec('update wcc_private.settings set runtime_enabled=true where singleton=true');expect(await invoke()).toBeNull();});
it('due work invokes only the WCC endpoint with dispatch authentication',async()=>{await ready();expect(await invoke()).toBe(42);const calls=(await db.query<any>('select * from net.calls')).rows;expect(calls).toHaveLength(1);expect(calls[0].url).toBe('https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/workgrid-control-center');expect(calls[0].body).toEqual({action:'dispatch'});expect(calls[0].headers['x-wcc-dispatch-secret']).toBe('x'.repeat(64));expect(calls[0].timeout_milliseconds).toBe(10000);});
it('missing credential fails closed without HTTP',async()=>{await ready();await db.exec('delete from vault.decrypted_secrets');await expect(invoke()).rejects.toThrow('secret unavailable');expect((await db.query('select * from net.calls')).rows).toHaveLength(0);});
it('future retries and finished deliveries do not invoke HTTP',async()=>{await ready();await db.exec("delete from wcc_private.deliveries;insert into wcc_private.deliveries(status,available_at) values('retryable',now()+interval '1 hour'),('provider_accepted',now());");expect(await invoke()).toBeNull();});
it('expired sending leases invoke recovery even while paused',async()=>{await ready();await db.exec("update wcc_private.settings set runtime_enabled=false where singleton=true;delete from wcc_private.deliveries;insert into wcc_private.deliveries values('sending',now(),now()-interval '1 minute');");expect(await invoke()).toBe(42);});
it('live sending leases do not invoke redundant dispatch',async()=>{await ready();await db.exec("delete from wcc_private.deliveries;insert into wcc_private.deliveries values('sending',now(),now()+interval '1 minute');");expect(await invoke()).toBeNull();});
it('browser and worker roles cannot invoke the scheduler function',async()=>{await ready();for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await expect(invoke()).rejects.toThrow('permission denied');await db.exec('reset role');}});
