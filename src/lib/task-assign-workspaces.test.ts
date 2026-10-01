import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ids = { mkt: "10000000-0000-4000-8000-000000000001", ops: "10000000-0000-4000-8000-000000000002", esports: "10000000-0000-4000-8000-000000000003", admin: "10000000-0000-4000-8000-000000000004", opsMember: "10000000-0000-4000-8000-000000000005" };
let db: PGlite;
let display: string;
let taskId: string;
const deadline = "2099-10-01";
const installer = read("supabase/task_assign_workspaces.sql");
async function actor(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function row() { const result = await db.query<any>("select public.task_assign_list(null,'detail',$1) items", [display]); return result.rows[0].items[0]; }
async function act(action: string, values: any = {}) {
  const current = await row();
  return db.query("select public.task_assign_action($1,$2,$3,$4,$5,$6,$7)", [display, action, values.assignee || null, values.deadline || null, values.reason || null, values.team || null, current.updated_at]);
}

describe("Task Assign workspace database integration (in-memory PostgreSQL only)", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    const schema = read("supabase/schema.sql");
    await db.exec(schema.slice(0, schema.indexOf("create or replace function public.set_updated_at")).replace("create extension if not exists pgcrypto;", ""));
    await db.exec(`alter table public.users add column role text default 'member';
      create table public.work_item_links(id uuid primary key default gen_random_uuid(),work_item_id uuid references public.work_items(id),deleted_at timestamptz);
      create table public.work_item_watchers(id uuid primary key default gen_random_uuid(),work_item_id uuid references public.work_items(id),removed_at timestamptz);
      create table public.work_item_ai_tags(id uuid primary key default gen_random_uuid(),work_item_id uuid references public.work_items(id));
      create table public.flowmate_capacity_allocations(id uuid primary key default gen_random_uuid(),work_item_id uuid references public.work_items(id));
      create function public.current_app_user_id() returns uuid language sql stable as $$ select auth.uid() $$;
      create function public.is_active_app_user() returns boolean language sql stable security definer as $$ select exists(select 1 from public.users where id=auth.uid() and is_active) $$;
      create function public.is_admin_app_user() returns boolean language sql stable security definer as $$ select exists(select 1 from public.users where id=auth.uid() and is_active and role='admin') $$;
      create function public.can_update_work_item(target_work_item_id uuid) returns boolean language sql stable as $$ select true $$;`);
    await db.exec(read("supabase/workflow_team_workspaces.sql"));
    const rpc = read("supabase/rpc_quick_task.sql");
    const start = rpc.indexOf("create or replace function public.flowmate_actor_user_id()");
    const end = rpc.indexOf("drop function if exists public.create_quick_task(", start);
    await db.exec(rpc.slice(start, end));
    await db.exec(read("supabase/task_assign_module.sql"));
    await db.exec(`create schema flowmate_members_private;
      create table flowmate_members_private.lifecycle(email text primary key,disabled boolean default false,deactivate_at timestamptz,stop_assign_at timestamptz,last_working_day date);
      create function public.flowmate_member_access_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.users u left join flowmate_members_private.lifecycle l on l.email=lower(u.email)
          where u.id=p_user and u.is_active and not coalesce(l.disabled,false) and (l.deactivate_at is null or statement_timestamp()<l.deactivate_at)) $$;
      create function public.flowmate_member_can_assign(p_member uuid,p_end date) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.team_members tm join public.users u on u.id=tm.user_id
          left join flowmate_members_private.lifecycle l on l.email=lower(u.email)
          where tm.id=p_member and tm.active and public.flowmate_member_access_allowed(u.id)
          and (l.stop_assign_at is null or statement_timestamp()<l.stop_assign_at)
          and (l.last_working_day is null or (p_end is not null and p_end<=l.last_working_day))
          and (l.deactivate_at is null or (p_end is not null and ((p_end+1)::timestamp at time zone 'Asia/Bangkok')<=l.deactivate_at))) $$;
      create function flowmate_members_private.guard_assignment() returns trigger language plpgsql security definer set search_path='' as $$
        begin if new.assignee_user_id is not null and exists(select 1 from public.team_members tm where tm.user_id=new.assignee_user_id and not public.flowmate_member_can_assign(tm.id,new.due_date)) then raise exception 'Member unavailable'; end if; return new; end $$;
      create trigger fixture_member_assignment before insert or update of assignee_user_id on public.work_items for each row execute function flowmate_members_private.guard_assignment();`);
    // Minimal fixture for the installed notification entry point/trigger. The
    // installer must preserve its signature and suppress duplicate legacy events.
    await db.exec(`alter table public.notifications add column metadata jsonb, add column dedupe_key text unique;
      alter table public.notifications enable row level security;
      create policy owner_notifications on public.notifications for select to authenticated using(user_id=auth.uid());
      grant select on public.notifications to authenticated;
      create function public.flowmate_create_notification(p_user_id uuid,p_type text,p_title text,p_body text default null,
        p_work_item_id uuid default null,p_actor_user_id uuid default null,p_event_id uuid default null,p_metadata jsonb default '{}',p_dedupe_key text default null)
      returns uuid language plpgsql security definer as $$ declare result uuid; begin
        insert into public.notifications(user_id,type,title,body,work_item_id,metadata,dedupe_key)
          values(p_user_id,p_type,p_title,p_body,p_work_item_id,p_metadata,p_dedupe_key) on conflict(dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id into result;
        return result; end $$;
      revoke all on function public.flowmate_create_notification(uuid,text,text,text,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
      create function public.flowmate_notify_work_item_event() returns trigger language plpgsql security definer as $$ begin
        perform public.flowmate_create_notification((select requester_user_id from public.work_items where id=new.work_item_id),'status_changed','Legacy',null,new.work_item_id);
        return new; end $$;
      create trigger fixture_notify after insert on public.work_item_events for each row execute function public.flowmate_notify_work_item_event();`);
    // Optional local replay of the read-only production snapshot. It never connects to production.
    if (process.env.TASK_ASSIGN_LIVE_SCHEMA_FIXTURE) {
      const snapshot = JSON.parse(read(process.env.TASK_ASSIGN_LIVE_SCHEMA_FIXTURE));
      const triggerFile = read("output/task-assign-workspaces/live-trigger-functions.json");
      const triggerSnapshot = JSON.parse(triggerFile.slice(triggerFile.indexOf("{"))).rows;
      await db.exec(`alter table public.notifications add column actor_user_id uuid, add column event_id uuid;
        alter table public.work_item_watchers add column watcher_user_id uuid;`);
      for (const name of ["flowmate_notification_recipients", "task_assign_function_for_user"]) {
        await db.exec(triggerSnapshot.find((f: any) => f.signature.startsWith(name + "("))!.definition);
      }
      await db.exec(triggerSnapshot.find((f: any) => f.signature === "flowmate_members_private.guard_assignment()")!.definition);
      const assignmentFile = read("output/task-assign-workspaces/live-assignment-functions.json");
      const assignmentSnapshot = JSON.parse(assignmentFile.slice(assignmentFile.indexOf("{"))).rows;
      await db.exec(assignmentSnapshot.find((f: any) => f.signature === "flowmate_member_can_assign(uuid,date)")!.definition);
      for (const name of ["flowmate_actor_user_id", "flowmate_user_is_team_member", "flowmate_user_can_access_team", "flowmate_user_has_all_team_access", "flowmate_normalize_team_code", "flowmate_user_can_access_work_item", "flowmate_user_can_read_work_item", "flowmate_current_user_can_mutate_work_item", "can_update_work_item", "flowmate_guard_work_item_team", "flowmate_create_notification", "flowmate_notify_work_item_event", "flowmate_notify_collaboration_event"]) {
        await db.exec(snapshot.functions.find((f: any) => f.signature.startsWith(name + "("))!.definition);
      }
      await db.exec("create trigger fixture_collaboration_notify after insert on public.work_item_events for each row execute function public.flowmate_notify_collaboration_event()");
    }
    await db.exec(installer);
    for (const [key, id] of Object.entries(ids)) {
      const team = key === "opsMember" ? "ops" : key === "esports" ? "esport" : key === "admin" ? "mkt" : key;
      await db.query("insert into public.users(id,email,display_name,requester_team,role) values($1,$2,$3,$4,$5)", [id, key + "@example.test", key, team, key === "admin" ? "admin" : "member"]);
      await db.query("insert into public.user_team_memberships(user_id,team_code,is_primary) values($1,$2,true)", [id, team]);
    }
    await actor(ids.admin);
    await db.query("select public.task_assign_set_dispatcher('ops',$1,true)", [ids.ops]);
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it("creates a cross-team request without project/review, and retries do not duplicate it", async () => {
    await actor(ids.mkt);
    const args = ["mkt", "ops", "Prepare event venue", "Deliver venue plan and equipment list", deadline, "20000000-0000-4000-8000-000000000001"];
    const first = await db.query<any>("select public.task_assign_create($1,$2,$3,$4,$5,$6) result", args);
    const retry = await db.query<any>("select public.task_assign_create($1,$2,$3,$4,$5,$6) result", args);
    expect(retry.rows[0].result.id).toBe(first.rows[0].result.id);
    display = first.rows[0].result.display_id; taskId = first.rows[0].result.id;
    const item = await row();
    expect(item.task_request_state).toBe("pending"); expect(item.assignee_user_id).toBeNull(); expect(item.due_date).toBeNull();
    expect(item.requester_team).toBe("mkt"); expect(item.owning_team_code).toBe("ops");
    await actor(ids.ops);
    const notifications = await db.query<any>("select * from public.notifications where work_item_id=$1", [taskId]);
    expect(notifications.rows).toHaveLength(1);
    expect(notifications.rows[0].title).not.toBe("Legacy");
  });
  it("shows the same task in outgoing and incoming; unrelated team cannot read it directly or via permissive policy", async () => {
    await actor(ids.mkt);
    const outgoing = await db.query<any>("select public.task_assign_list('mkt','outgoing') items");
    expect(outgoing.rows[0].items[0].id).toBe(taskId);
    await actor(ids.ops);
    const incoming = await db.query<any>("select public.task_assign_list('ops','incoming') items");
    expect(incoming.rows[0].items[0].id).toBe(taskId);
    await actor(ids.esports);
    expect(await row()).toBeUndefined();
    expect((await db.query("select * from public.work_items where id=$1", [taskId])).rows).toHaveLength(0);
    expect((await db.query("select * from public.work_item_events where work_item_id=$1", [taskId])).rows).toHaveLength(0);
    await expect(db.query("select public.task_assign_list('mkt','team')")).rejects.toThrow(/Workspace/);
  });
  it("only dispatchers accept and only active receiving-team members can be assigned", async () => {
    await actor(ids.opsMember);
    await expect(act("accept", { assignee: ids.opsMember, deadline })).rejects.toThrow(/dispatcher/);
    await actor(ids.ops);
    await expect(act("accept", { assignee: ids.mkt, deadline })).rejects.toThrow(/receiving-team/);
    await act("accept", { assignee: ids.opsMember, deadline: "2099-10-03" });
    const item = await row();
    expect(item.task_requested_deadline).toBe(deadline); expect(item.task_committed_deadline).toBe("2099-10-03");
    expect(item.task_request_state).toBe("accepted");
  });
  it("uses the committed deadline for optional-review work and rejects commitment past the member's last working day", async () => {
    await db.exec("reset role");
    await db.query("insert into public.team_members(member_code,user_id,display_name,initials,discipline,discipline_short,skills) values('fixture-ops',$1,'Operations member','OP','Operations','OP',array['Operations'])", [ids.opsMember]);
    await db.exec("insert into flowmate_members_private.lifecycle(email,last_working_day) values('opsmember@example.test','2099-10-02')");
    await actor(ids.ops);
    await expect(act("reassign", { assignee: ids.opsMember, deadline: "2099-10-03" })).rejects.toThrow(/available/);
    await act("reassign", { assignee: ids.opsMember, deadline });
    expect((await row()).due_date).toBeNull();
    await db.exec("reset role");
    await db.exec("delete from flowmate_members_private.lifecycle; delete from public.team_members where member_code='fixture-ops'");
  });
  it("prevents requester execution and stale concurrent changes; assignee submits and requester confirms", async () => {
    await actor(ids.mkt);
    await expect(act("start")).rejects.toThrow(/assignee/);
    await actor(ids.opsMember);
    const stale = (await row()).updated_at;
    await act("start");
    await expect(db.query("select public.task_assign_action($1,'submit',null,null,null,null,$2)", [display, stale])).rejects.toThrow(/changed/);
    await act("submit");
    await expect(act("approve")).rejects.toThrow(/Requester/);
    await actor(ids.mkt); await act("request_changes", { reason: "Please add the stage plan" });
    await actor(ids.opsMember); await act("submit");
    await actor(ids.mkt); await act("approve"); expect((await row()).status).toBe("delivered");
    await act("reopen", { reason: "Scope needs another review" }); expect((await row()).task_request_state).toBe("pending");
  });
  it("returns requests for clarification and keeps edits/comments/history on the same task", async () => {
    await actor(ids.ops); await act("need_information", { reason: "Provide equipment quantities" });
    await actor(ids.mkt); const current = await row();
    await db.query("select public.task_assign_edit_brief($1,$2,$3,null,$4)", [display, current.title, "Equipment quantities: 10 PCs", current.updated_at]);
    await db.query("select public.task_assign_comment($1,'Quantities supplied')", [display]);
    await act("resubmit"); expect((await row()).id).toBe(taskId);
    await actor(ids.esports);
    expect((await db.query("select * from public.comments where work_item_id=$1", [taskId])).rows).toHaveLength(0);
    await expect(db.query("select public.task_assign_comment($1,'Unauthorized')", [display])).rejects.toThrow(/unavailable/);
  });
  it("enforces source identity, urgent/review/link rules and bans direct writes", async () => {
    await actor(ids.mkt);
    await expect(db.query("select public.task_assign_create('ops','ops','A','B',$1,gen_random_uuid(),null,null,$2)", [deadline, ids.ops])).rejects.toThrow(/authorized/);
    await expect(db.query("select public.task_assign_create('mkt','ops','A','B',$1,gen_random_uuid(),null,null,null,'urgent')", [deadline])).rejects.toThrow(/reason/);
    await expect(db.query("select public.task_assign_create('mkt','ops','A','B',$1,gen_random_uuid(),date '2100-01-01')", [deadline])).rejects.toThrow(/Review/);
    await expect(db.query("select public.task_assign_create('mkt','ops','A','B',$1,gen_random_uuid(),null,null,null,'normal',null,array['javascript:alert(1)'])", [deadline])).rejects.toThrow(/HTTP/);
    await expect(db.query("update public.work_items set owning_team_code='esport' where id=$1", [taskId])).rejects.toThrow(/permission denied/);
  });
  it("restricts confidential work to selected people and revokes former assignee membership", async () => {
    await actor(ids.mkt);
    await expect(db.query("select public.task_assign_create('mkt','ops','Secret','Private',$1,gen_random_uuid(),null,null,null,'normal',null,'{}',true)", [deadline])).rejects.toThrow(/dispatcher/);
    const created = await db.query<any>("select public.task_assign_create('mkt','ops','Secret','Private',$1,gen_random_uuid(),null,null,null,'normal',null,'{}',true,array[$2::uuid]) result", [deadline, ids.ops]);
    const secretId = created.rows[0].result.id;
    await db.exec("reset role");
    await db.query("insert into public.flowmate_capacity_allocations(work_item_id) values($1)", [secretId]);
    await db.exec("create policy fixture_permissive_capacity on public.flowmate_capacity_allocations for select to authenticated using(true)");
    await db.exec("reset role");
    await db.query("update public.users set can_access_all_teams=true where id=$1", [ids.esports]);
    await actor(ids.esports);
    expect((await db.query("select * from public.work_items where id=$1", [taskId])).rows).toHaveLength(1);
    expect((await db.query("select * from public.work_items where id=$1", [secretId])).rows).toHaveLength(0);
    expect((await db.query("select * from public.flowmate_capacity_allocations where work_item_id=$1", [secretId])).rows).toHaveLength(0);
    const current = await row();
    await expect(db.query("select public.task_assign_action($1,'accept',$2,$3,null,null,$4)", [display,ids.opsMember,deadline,current.updated_at])).rejects.toThrow(/dispatcher/);
    await expect(db.query("select public.task_assign_set_dispatcher('ops',$1,true)", [ids.esports])).rejects.toThrow(/Administrator/);
    await db.exec("reset role");
    await db.query("update public.users set can_access_all_teams=false where id=$1", [ids.esports]);
    await actor(ids.opsMember); expect((await db.query("select * from public.work_items where id=$1", [secretId])).rows).toHaveLength(0);
    await actor(ids.ops); expect((await db.query("select * from public.work_items where id=$1", [secretId])).rows).toHaveLength(1);
    await db.exec("reset role"); await db.query("delete from public.user_team_memberships where user_id=$1", [ids.ops]);
    await actor(ids.ops); expect((await db.query("select * from public.work_items where id=$1", [secretId])).rows).toHaveLength(0);
    await db.exec("reset role"); await db.query("insert into public.user_team_memberships(user_id,team_code,is_primary) values($1,'ops',true)", [ids.ops]);
  });
  it("reruns safely, keeps the installed creative helper and revokes private helper execution", async () => {
    await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.exec(installer);
    const permissions = await db.query<any>("select has_function_privilege('authenticated','public.task_assign_can_read(uuid,uuid)','EXECUTE') allowed");
    expect(permissions.rows[0].allowed).toBe(false);
    const guard = await db.query<any>("select pg_get_functiondef('public.flowmate_guard_work_item_team()'::regprocedure) body");
    expect(guard.rows[0].body.match(/perform public.task_assign_validate_write/g)).toHaveLength(1);
    expect(guard.rows[0].body).toContain("v_gdve_assignee_same_workspace");
  });
  it("denies suspended accounts, hides their directory entry and honors scheduled suspension", async () => {
    await db.exec("reset role");
    await db.exec("insert into flowmate_members_private.lifecycle(email,deactivate_at) values('ops@example.test',now()-interval '1 minute')");
    await actor(ids.ops);
    await expect(row()).rejects.toThrow(/suspended/);
    await expect(db.query("select public.task_assign_comment($1,'Suspended write')", [display])).rejects.toThrow(/suspended/);
    expect((await db.query("select * from public.work_items where id=$1", [taskId])).rows).toHaveLength(0);
    await actor(ids.mkt);
    const directory = await db.query<any>("select public.task_assign_members('ops') members");
    expect(directory.rows[0].members.some((m: any) => m.userId === ids.ops)).toBe(false);
    await db.exec("reset role");
    await db.exec("delete from flowmate_members_private.lifecycle");
  });
  it("returns an active assignee's work to the queue when their account is deactivated", async () => {
    await actor(ids.ops); await act("accept", { assignee: ids.opsMember, deadline });
    await db.exec("reset role");
    await db.query("update public.users set is_active=false where id=$1", [ids.opsMember]);
    await actor(ids.mkt);
    const item = await row();
    expect(item.assignee_user_id).toBeNull(); expect(item.task_request_state).toBe("pending");
    expect(item.task_committed_deadline).toBeNull(); expect(item.status).toBe("queued");
    await db.exec("reset role");
    await db.query("update public.users set is_active=true where id=$1", [ids.opsMember]);
  });
  it("returns an active assignee's work to the queue when membership is removed", async () => {
    await actor(ids.ops); await act("accept", { assignee: ids.opsMember, deadline });
    await actor(ids.admin);
    await db.exec("reset role");
    await db.query("delete from public.user_team_memberships where user_id=$1 and team_code='ops'", [ids.opsMember]);
    await actor(ids.mkt);
    const item = await row();
    expect(item.assignee_user_id).toBeNull(); expect(item.task_request_state).toBe("pending");
    expect(item.task_committed_deadline).toBeNull(); expect(item.status).toBe("queued");
    await actor(ids.opsMember);
    expect((await db.query("select * from public.work_items where id=$1", [taskId])).rows).toHaveLength(0);
    expect((await db.query("select * from public.notifications where work_item_id=$1", [taskId])).rows).toHaveLength(0);
  });
});
