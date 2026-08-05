import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const prepare = read("supabase/trello_asana_hybrid_prepare.sql");
const backend = read("supabase/trello_asana_hybrid_backend.sql");
const migration = read("supabase/trello_asana_hybrid_migrate_queued.sql");
const verify = read("supabase/trello_asana_hybrid_verify.sql");

function block(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing block start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing block end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Trello + Asana hybrid backend SQL delta", () => {
  it("commits enum additions before backend use and keeps only capacity_point > 0", () => {
    const enumCommit = prepare.indexOf("commit;");
    expect(prepare.indexOf("add value if not exists 'unassigned'")).toBeGreaterThanOrEqual(0);
    expect(enumCommit).toBeGreaterThan(prepare.indexOf("alter type public.assignment_result"));
    expect(enumCommit).toBeGreaterThan(prepare.indexOf("alter type public.event_type"));
    expect(prepare).toContain("add value if not exists 'capacity_changed'");
    expect(prepare.indexOf("check (capacity_point > 0)")).toBeGreaterThan(enumCommit);
    expect(prepare).toContain("drop constraint if exists flowmate_capacity_allocations_capacity_point_check");
  });

  it("has no queued creation branch in the replacement assignment engine", () => {
    const engine = block(
      backend,
      "create or replace function public.flowmate_run_assignment(",
      "revoke all on function public.flowmate_run_assignment",
    );
    expect(engine).not.toMatch(/set\s+status\s*=\s*'queued'/i);
    expect(engine).not.toContain("'result', 'queued'");
    expect(engine).toContain("set status = 'need_brief'");
    expect(engine).toContain("set status = 'unassigned'");
    expect(engine).toContain("set status = 'assigned'");
  });

  it("uses only active linked GD/VE as hard candidates and deterministic soft ranking", () => {
    const engine = block(
      backend,
      "create or replace function public.flowmate_run_assignment(",
      "revoke all on function public.flowmate_run_assignment",
    );
    expect(engine).toContain("linked_user.is_active = true");
    expect(engine).toContain("tm.active = true");
    expect(engine).toContain("public.flowmate_is_gdve_member_code(tm.member_code)");
    expect(engine).toContain("from public.leave_requests active_leave");
    expect(engine).toContain("active_leave.cancelled_at is null");
    expect(engine).toContain("metrics.leave_bucket_count > 0");
    expect(engine).toContain("metrics.full_leave_bucket_count = metrics.window_bucket_count");
    expect(engine).toContain("v_full_leave_bucket_count > 0");
    expect(engine).toContain("v_leave_bucket_count > 0 and v_full_leave_bucket_count = 0");

    const rankingClause = block(engine, "from candidates c", "limit 1;");
    const order = [
      "c.context_rank",
      "c.skill_rank",
      "c.availability_rank",
      "c.projected_ratio",
      "c.allocated_points",
      "c.wip_now",
      "c.overdue_count",
      "lower(c.member_code)",
    ];
    for (let index = 1; index < order.length; index += 1) {
      expect(rankingClause.indexOf(order[index])).toBeGreaterThan(
        rankingClause.indexOf(order[index - 1]),
      );
    }
  });

  it("emits every supported warning code in result, event, and audit snapshot", () => {
    const warningCodes = [
      "over_capacity",
      "wip_exceeded",
      "skill_mismatch",
      "backup_skill",
      "member_partial",
      "member_on_leave",
      "deadline_capacity_gap",
      "review_buffer_risk",
      "needs_split",
    ];
    for (const code of warningCodes) expect(backend).toContain(`'code', '${code}'`);
    expect(backend.match(/'warnings', v_warnings/g)?.length).toBeGreaterThanOrEqual(3);
    expect(backend).toContain("'warnings', '[]'::jsonb");
  });

  it("persists truthful overload and enforces allocation total equals effort", () => {
    const allocation = block(
      backend,
      "create or replace function public.flowmate_hybrid_rebuild_allocation(",
      "revoke all on function public.flowmate_hybrid_rebuild_allocation",
    );
    expect(allocation).toContain("overload_share");
    expect(allocation).toContain("if v_total <> v_effort then");
    expect(allocation).toContain("Allocation total % must equal effort %");
    expect(backend).toContain("perform public.flowmate_hybrid_rebuild_allocation(p_work_item_id, v_owner_id)");
  });

  it("turns queue drain into a write-free compatibility no-op", () => {
    const compatibility = block(
      backend,
      "create or replace function public.flowmate_rerun_queued_creative_requests(",
      "revoke all on function public.flowmate_rerun_queued_creative_requests",
    );
    expect(compatibility).toContain("'deprecated', true");
    expect(compatibility).toContain("'no_op', true");
    expect(compatibility).not.toMatch(/\b(update|insert|delete)\b/i);
    expect(compatibility).not.toContain("flowmate_run_assignment");
  });

  it("locks down internal functions and grants only authenticated public RPCs", () => {
    expect(backend).toMatch(/revoke all on function public\.flowmate_run_assignment[\s\S]*?from public, anon, authenticated;/);
    expect(backend).toMatch(/revoke all on function public\.flowmate_rerun_queued_creative_requests[\s\S]*?from public, anon, authenticated;/);
    expect(backend).toMatch(/revoke all on function public\.flowmate_change_creative_assignee[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to authenticated;/);
    expect(backend).toMatch(/revoke all on function public\.flowmate_reschedule_capacity_allocation[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to authenticated;/);
    expect(backend).not.toMatch(/grant execute[\s\S]*?to anon/);
    expect(backend).toContain("drop function if exists public.flowmate_change_creative_assignee(uuid, text, uuid, text)");
    expect(backend).toContain("drop function if exists public.flowmate_reschedule_capacity_allocation(uuid, text, jsonb, text)");
    expect(backend).toContain("revoke all on function public.flowmate_change_creative_assignee(text, uuid, text)");
    expect(backend).toContain("grant execute on function public.flowmate_change_creative_assignee(text, uuid, text)");
    expect(backend).toContain("revoke all on function public.flowmate_reschedule_capacity_allocation(text, jsonb)");
    expect(backend).toContain("grant execute on function public.flowmate_reschedule_capacity_allocation(text, jsonb)");
  });

  it("uses the client-safe reassignment signature and audits fresh target warnings", () => {
    const rpc = block(
      backend,
      "create or replace function public.flowmate_change_creative_assignee(",
      "revoke all on function public.flowmate_change_creative_assignee",
    );
    expect(rpc).toContain("p_display_id text");
    expect(rpc).toContain("p_target_member_id uuid default null");
    expect(rpc).toContain("p_reason text default null");
    expect(rpc).not.toContain("p_actor_user_id");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("v_actor_id uuid := auth.uid()");
    const advisoryLock = rpc.indexOf("perform pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'))");
    const workRowLock = rpc.indexOf("select * into v_work");
    expect(advisoryLock).toBeGreaterThanOrEqual(0);
    expect(workRowLock).toBeGreaterThan(advisoryLock);
    expect(rpc).toContain("v_target.user_id = v_actor_id");
    expect(rpc).toContain("v_work.status = 'unassigned'");
    expect(rpc).toContain("v_is_admin or v_is_requester or v_is_self_gdve");
    expect(rpc).toContain("Assignment reason is required");
    expect(rpc).toContain("if p_target_member_id is null then");
    expect(rpc).toContain("if not (v_is_admin or v_is_requester) then");
    expect(rpc).toContain("v_next_status := 'unassigned'");
    expect(rpc).toContain("delete from public.flowmate_capacity_allocations");
    expect(rpc).toContain("insert into public.assignment_runs");
    expect(rpc).toContain("'source', 'manual_assignment_rpc'");
    expect(rpc).toContain("'warnings', v_warnings");
    expect(rpc).toContain("'window_start', v_start");
    expect(rpc).toContain("'window_end', v_end");
    expect(rpc).toContain("assignment_reason = v_assignment_reason");
    expect(rpc).toContain("from public.leave_requests active_leave");
    expect(rpc).toContain("'action', 'assignee_changed'");
  });

  it("uses direct JSON parsing with the no-actor reschedule signature and one owner declaration", () => {
    const rpc = block(
      backend,
      "create or replace function public.flowmate_reschedule_capacity_allocation(",
      "revoke all on function public.flowmate_reschedule_capacity_allocation",
    );
    expect(rpc).toContain("p_display_id text");
    expect(rpc).toContain("p_allocations jsonb");
    expect(rpc).not.toContain("p_actor_user_id");
    expect(rpc).not.toContain("p_reason");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("v_actor_id uuid := auth.uid()");
    expect(rpc).toContain("jsonb_typeof(p_allocations) <> 'array'");
    expect(rpc).toContain("with parsed_allocations as");
    expect(rpc).toContain("from jsonb_to_recordset(p_allocations)");
    expect(rpc).toContain("from public.assignment_runs assignment");
    expect(rpc).toContain("assignment.capacity_snapshot ->> 'window_start'");
    expect(rpc).toContain("order by assignment.ran_at desc, assignment.id desc");
    expect(rpc).not.toMatch(/min\s*\(\s*[a-z_]+\.bucket_date/i);
    expect(rpc).toContain("v_window_end := greatest(");
    expect(rpc).toContain("coalesce(v_work.due_date, v_window_start)");
    expect(rpc).not.toMatch(/create\s+(temporary|temp)\s+/i);
    expect(rpc).not.toMatch(/\bpg_temp\b/i);
    expect(rpc).not.toContain("flowmate_reschedule_input");
    expect(rpc).not.toMatch(/\btruncate\b/i);

    const declarations = block(rpc, "declare", "begin");
    expect(declarations.match(/\bv_owner_user_id\b/g)).toHaveLength(1);
    expect(rpc).toContain("bucket_date/bucket_half pairs must be unique");
    expect(rpc).toContain("working days (Monday-Friday)");
    expect(rpc).toContain("inside the production window");
    expect(rpc).toContain("if v_total <> v_work.effort_point::numeric then");
    expect(rpc.indexOf("delete from public.flowmate_capacity_allocations")).toBeLessThan(
      rpc.indexOf("insert into public.flowmate_capacity_allocations"),
    );
    expect(rpc).toContain("'action', 'capacity_changed'");
    expect(rpc).toContain("v_work.id, v_actor_id, 'capacity_changed'");
  });

  it("archives before migration, preserves reasons, reruns the engine, and gates commit on queued=0", () => {
    const archive = migration.indexOf("insert into public.flowmate_queued_migration_archive");
    const rerun = migration.indexOf("v_result := public.flowmate_run_assignment");
    const originalReason = migration.indexOf("'original_assignment_reason'");
    const zeroGate = migration.indexOf("do $assert_zero_active_queued$");
    const commit = migration.lastIndexOf("commit;");
    expect(archive).toBeGreaterThanOrEqual(0);
    expect(rerun).toBeGreaterThan(archive);
    expect(originalReason).toBeGreaterThan(archive);
    expect(zeroGate).toBeGreaterThan(rerun);
    expect(commit).toBeGreaterThan(zeroGate);
    expect(migration).not.toMatch(/delete\s+from\s+public\.work_items/i);
    expect(migration).toContain("needs_split = v_row.original_needs_split");
  });

  it("keeps verification read-only except for probes that always roll back", () => {
    const readOnlyEnd = verify.indexOf("commit;");
    const probeStart = verify.indexOf("begin;", readOnlyEnd);
    expect(verify).toContain("begin transaction read only;");
    expect(verify.slice(0, readOnlyEnd)).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(probeStart).toBeGreaterThan(readOnlyEnd);
    expect(verify.trim().endsWith("rollback;")).toBe(true);
    expect(verify).toContain("public.flowmate_change_creative_assignee(text,uuid,text)");
    expect(verify).toContain("public.flowmate_reschedule_capacity_allocation(text,jsonb)");
    expect(verify).not.toContain("spoofed_actor_rejected");
    expect(verify).toContain("unrelated_user_reassignment_rejected");
    expect(verify).toContain("unrelated_user_reschedule_rejected");
  });
});
