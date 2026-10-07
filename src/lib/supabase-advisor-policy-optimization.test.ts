import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = 'supabase/advisor-optimization-20261007/';
const baseline = JSON.parse(readFileSync(root + 'policy-baseline.json', 'utf8'));
const apply = readFileSync(root + 'apply-policies.sql', 'utf8');
const rollback = readFileSync(root + 'rollback-policies.sql', 'utf8');
const ident = (v: string) => '"' + v.replaceAll('"', '""') + '"';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function public.is_active_app_user() returns boolean language sql stable as
      $$select current_setting('test.active',true) = 'true'$$;
    create function public.is_admin_app_user() returns boolean language sql stable as
      $$select current_setting('test.admin',true) = 'true'$$;
    create table public.marketing_content_items(id int primary key, pic_user_id uuid, sub_pic_user_id uuid, note text);
    create table public.marketing_channel_placements(id int primary key, content_item_id int, note text);
    insert into marketing_content_items values
      (1,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','one'),
      (2,null,null,'unassigned');
    insert into marketing_channel_placements values(1,1,'one'),(2,2,'two');
    alter table marketing_content_items enable row level security;
    alter table marketing_channel_placements enable row level security;
    create policy read_active on marketing_content_items for select using(is_active_app_user());
    create policy read_active on marketing_channel_placements for select using(is_active_app_user());
    grant usage on schema auth,public to authenticated;
    grant select,update,delete on marketing_content_items,marketing_channel_placements to authenticated;
  `);
  for (const p of baseline) await db.exec(`create policy ${ident(p.policyname)} on public.${ident(p.tablename)}
    for ${p.cmd} to public using (${p.qual}) ${p.with_check ? `with check (${p.with_check})` : ''};`);
}, 30000);
afterAll(async () => { await db?.close(); });

async function snapshot() {
  return (await db.query(`select tablename,policyname,cmd,roles,permissive,qual,with_check from pg_policies
    where policyname like 'pic or sub pic%' order by tablename,policyname`)).rows;
}
async function matrix() {
  const cases = [
    {name:'PIC',id:'00000000-0000-0000-0000-000000000001',active:true,admin:false},
    {name:'sub-PIC',id:'00000000-0000-0000-0000-000000000002',active:true,admin:false},
    {name:'other member',id:'00000000-0000-0000-0000-000000000003',active:true,admin:false},
    {name:'admin',id:'00000000-0000-0000-0000-000000000003',active:true,admin:true},
    {name:'inactive PIC',id:'00000000-0000-0000-0000-000000000001',active:false,admin:false},
    {name:'no identity',id:'',active:false,admin:false},
  ];
  const result: any[] = [];
  for (const actor of cases) for (const table of ['marketing_content_items','marketing_channel_placements']) {
    for (const action of ['update','delete']) {
      await db.exec('begin; set local role authenticated;');
      await db.query("select set_config('test.uid',$1,true),set_config('test.active',$2,true),set_config('test.admin',$3,true)",
        [actor.id, String(actor.active), String(actor.admin)]);
      const q = action === 'update' ? `update ${table} set note='changed' returning id` : `delete from ${table} returning id`;
      const ids = (await db.query<{id:number}>(q)).rows.map(r=>r.id).sort();
      await db.exec('rollback');
      result.push({actor:actor.name,table,action,ids});
    }
  }
  return result;
}

describe('Advisor policy optimization (local fixture only)', () => {
  it('preserves all 24 actor/table/action outcomes including NULL owners and exact rollback', async () => {
    const policies = await snapshot(); const before = await matrix();
    for (const item of before) expect(item.ids).toEqual(
      item.actor === 'admin' ? [1,2] : ['PIC','sub-PIC'].includes(item.actor) ? [1] : []);
    await db.exec(apply);
    const afterPolicies: any[] = await snapshot();
    expect(afterPolicies).toHaveLength(4);
    for (let i=0;i<4;i++) {
      expect(afterPolicies[i].qual).toContain('SELECT auth.uid()');
      expect({...afterPolicies[i],qual:null}).toEqual({...policies[i] as any,qual:null});
    }
    expect(await matrix()).toEqual(before);
    await db.exec(rollback);
    expect(await snapshot()).toEqual(policies);
  },30000);
  it('refuses to overwrite policy drift and rolls back the whole apply', async () => {
    const p = baseline[3];
    await db.exec(`alter policy ${ident(p.policyname)} on ${ident(p.tablename)} using(false);`);
    await expect(db.exec(apply)).rejects.toThrow(/Policy drift/);
    await db.exec('rollback');
    expect((await snapshot() as any[])[0].qual).not.toContain('SELECT auth.uid()');
    await db.exec(`alter policy ${ident(p.policyname)} on ${ident(p.tablename)} using(${p.qual});`);
  });
  it('refuses rollback if another change alters authorization after apply', async () => {
    await db.exec(apply);
    const p=baseline[0];
    await db.exec(`alter policy ${ident(p.policyname)} on ${ident(p.tablename)} using(false);`);
    await expect(db.exec(rollback)).rejects.toThrow(/Policy drift/);
    await db.exec('rollback');
    await db.exec(`alter policy ${ident(p.policyname)} on ${ident(p.tablename)} using(${p.qual.replaceAll('auth.uid()','(select auth.uid())')});`);
    await db.exec(rollback);
  });
  it('removes only redundant indexes, preserves uniqueness, and restores them on rollback', async () => {
    await db.exec(`
      create schema private;
      create table assignment_runs(work_item_id uuid, ran_at timestamptz);
      create index idx_assignment_runs_item_ran on assignment_runs(work_item_id,ran_at desc);
      create index idx_assignment_runs_work_item on assignment_runs(work_item_id,ran_at desc);
      create table private.creative_seatalk_threads(group_id text,thread_id text,
        constraint creative_seatalk_threads_group_id_thread_id_key unique(group_id,thread_id));
      create unique index creative_seatalk_thread_group_thread_key on private.creative_seatalk_threads(group_id,thread_id);
      insert into private.creative_seatalk_threads values('group','thread');
    `);
    await db.exec(readFileSync(root+'apply-duplicate-indexes.sql','utf8'));
    const q = await db.query<any>(`select to_regclass('public.idx_assignment_runs_item_ran') dropped,
      to_regclass('public.idx_assignment_runs_work_item') kept,
      to_regclass('private.creative_seatalk_threads_group_id_thread_id_key') unique_kept`);
    expect(q.rows[0]).toMatchObject({dropped:null});
    expect(q.rows[0].kept).toBeTruthy(); expect(q.rows[0].unique_kept).toBeTruthy();
    await expect(db.exec("insert into private.creative_seatalk_threads values('group','thread')")).rejects.toThrow(/duplicate key/);
    await db.exec(readFileSync(root+'rollback-duplicate-indexes.sql','utf8'));
    expect((await db.query<any>("select to_regclass('public.idx_assignment_runs_item_ran') restored")).rows[0].restored).toBeTruthy();
  });
  it('refuses index cleanup when definitions differ and rolls back preceding drops', async () => {
    await db.exec(`drop index private.creative_seatalk_thread_group_thread_key;
      create unique index creative_seatalk_thread_group_thread_key on private.creative_seatalk_threads(thread_id,group_id);`);
    await expect(db.exec(readFileSync(root+'apply-duplicate-indexes.sql','utf8'))).rejects.toThrow(/Index differs/);
    await db.exec('rollback');
    expect((await db.query<any>("select to_regclass('public.idx_assignment_runs_item_ran') retained")).rows[0].retained).toBeTruthy();
  });
});
