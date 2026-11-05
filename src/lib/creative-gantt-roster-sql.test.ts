import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
let db: PGlite;
const read = (p: string) => readFileSync(p, 'utf8');
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema flowmate_members_private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table users(id uuid primary key,email text,is_active boolean);
    create table user_whitelist(email text primary key);
    create table flowmate_members_private.lifecycle(email text primary key,disabled boolean,deactivate_at timestamptz);
    create function flowmate_members_private.email_allowed(text) returns boolean language sql as $$select $1 like '%@garena.com'$$;
    create table team_members(id uuid primary key,user_id uuid,member_code text,display_name text,active boolean);
    create function flowmate_is_gdve_member_code(text) returns boolean language sql as $$select $1 <> 'ops'$$;
    create function flowmate_check_member_access() returns void language plpgsql as $$begin
      if current_setting('request.path',true) <> all(array['flowmate_board_summary']) then raise exception 'denied'; end if;
    end$$;
    grant usage on schema public,auth to authenticated;
    grant select on team_members to authenticated;
    alter table team_members enable row level security;
    create policy roster_scope on team_members for select to authenticated using (member_code <> 'hidden');`);
  const access = read('supabase/team_members_access_management.sql');
  const start = access.indexOf('create or replace function public.flowmate_member_access_allowed(');
  await db.exec(access.slice(start, access.indexOf('$$;', start) + 3));
  await db.exec(`revoke all on function flowmate_member_access_allowed(uuid) from public;
    grant execute on function flowmate_member_access_allowed(uuid) to authenticated;
    create function is_active_app_user() returns boolean language sql as $$select public.flowmate_member_access_allowed(auth.uid())$$;`);
  for (let n = 1; n <= 9; n++) {
    await db.query('insert into users values($1,$2,$3)', [uid(n), `member${n}@garena.com`, n !== 2]);
    if (n !== 5) await db.query('insert into user_whitelist values($1)', [`member${n}@garena.com`]);
    await db.query('insert into team_members values($1,$1,$2,$2,$3)', [uid(n), n === 8 ? 'ops' : n === 9 ? 'hidden' : `gd${n}`, n !== 3]);
  }
  await db.exec(`insert into flowmate_members_private.lifecycle values
    ('member4@garena.com',true,null),('member6@garena.com',false,now()-interval '1 day'),
    ('member7@garena.com',false,now()+interval '1 day');`);
  await db.exec(read('supabase/creative_gantt_access_roster.sql'));
  await db.exec(read('supabase/creative_gantt_access_roster.sql'));
});
afterAll(async () => { await db?.close(); });
it('uses Access including whitelist/lifecycle, retains paused profiles and scheduled future departures', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid(1)}',false)`);
  const result = await db.query('select member_code from flowmate_gantt_members()');
  expect(result.rows.map((r: any) => r.member_code)).toEqual(['gd1', 'gd3', 'gd7']);
  await db.exec('reset role');
});
it('keeps existing row visibility, rejects anonymous execution and returns no roster to inactive actors', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid(2)}',false)`);
  expect((await db.query('select * from flowmate_gantt_members()')).rows).toEqual([]);
  await db.exec('reset role; set role anon');
  await expect(db.query('select * from flowmate_gantt_members()')).rejects.toThrow('permission denied');
  await db.exec('reset role');
});
it('extends Viewer read guards on server and client', async () => {
  await db.exec("select set_config('request.path','flowmate_gantt_members',false); select flowmate_check_member_access()");
  expect(read('supabase-client.js').split('window.flowmateViewerRequestAllowed')[0]).toContain('"flowmate_gantt_members"');
});
