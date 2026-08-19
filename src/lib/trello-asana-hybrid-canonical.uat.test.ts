import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const schema = read("supabase/schema.sql");
const assignment = read("supabase/rpc_assignment.sql");
const quickTask = read("supabase/rpc_quick_task.sql");
const collaboration = read("supabase/collaboration_admin.sql");
const readme = read("supabase/README.md");
const approvedBackend = read("supabase/trello_asana_hybrid_backend.sql");
const teamSchedule = read("supabase/team_schedule_weekly_capacity.sql");

function finalFunction(sql: string, name: string): string {
  const createMarker = `create or replace function public.${name}(`;
  const start = sql.lastIndexOf(createMarker);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);

  const revokeMarker = `revoke all on function public.${name}`;
  const end = sql.indexOf(revokeMarker, start);
  expect(end, `${name} must end with an explicit revoke`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function functionHeader(sql: string, name: string): string {
  const definition = finalFunction(sql, name);
  const end = definition.indexOf(") returns");
  expect(end, `${name} signature must have a returns clause`).toBeGreaterThan(0);
  return definition.slice(0, end + 1);
}

describe("Trello + Asana hybrid canonical SQL", () => {
  it("keeps the approved backend delta as the exact final canonical override", () => {
    const marker = "-- FlowMate Trello + Asana hybrid: existing-database backend delta.";
    const canonicalTail = assignment.slice(assignment.lastIndexOf(marker)).trim();

    expect(assignment).toContain("FINAL CANONICAL OVERRIDE - Trello + Asana hybrid assignment contract");
    expect(canonicalTail).toBe(approvedBackend.trim());
    expect(assignment).not.toMatch(/^\s*\\i\s+/m);
  });

  it("uses a final assignment engine that never writes Queued and returns only the locked outcomes", () => {
    const engine = finalFunction(assignment, "flowmate_run_assignment");
    const resultLiterals = [...engine.matchAll(/'result'\s*,\s*'([^']+)'/g)].map((match) => match[1]);

    expect(assignment.lastIndexOf("create or replace function public.flowmate_run_assignment("))
      .toBeGreaterThan(assignment.indexOf("FINAL CANONICAL OVERRIDE"));
    expect(engine).not.toMatch(/set\s+status\s*=\s*'queued'/i);
    expect(engine).not.toContain("'result', 'queued'");
    expect(engine).toContain("set status = 'need_brief'");
    expect(engine).toContain("set status = 'unassigned'");
    expect(engine).toContain("set status = 'assigned'");
    expect(new Set(resultLiterals)).toEqual(new Set(["need_brief", "unassigned", "assigned"]));
  });

  it("has no capacity-release queue-drain callers and leaves only a write-free compatibility function", () => {
    const compatibility = finalFunction(assignment, "flowmate_rerun_queued_creative_requests");

    expect(quickTask).not.toContain("flowmate_rerun_queued_creative_requests");
    expect(collaboration).not.toContain("flowmate_rerun_queued_creative_requests");
    expect(quickTask).not.toContain("v_queue_drain");
    expect(collaboration).not.toContain("v_queue_drain");
    expect(compatibility).not.toContain("flowmate_run_assignment");
    expect(compatibility).not.toMatch(/\b(update|insert\s+into|delete\s+from)\s+public\./i);
    expect(compatibility).toContain("'checked', 0");
    expect(compatibility).toContain("'assigned', 0");
  });

  it("publishes no-actor reassignment and reschedule signatures", () => {
    const reassignmentHeader = functionHeader(assignment, "flowmate_change_creative_assignee");
    const rescheduleHeader = functionHeader(assignment, "flowmate_reschedule_capacity_allocation");
    const reassignment = finalFunction(assignment, "flowmate_change_creative_assignee");
    const reschedule = finalFunction(assignment, "flowmate_reschedule_capacity_allocation");

    expect(reassignmentHeader).not.toContain("p_actor_user_id");
    expect(rescheduleHeader).not.toContain("p_actor_user_id");
    expect(reassignment).toContain("v_actor_id uuid := auth.uid()");
    expect(reschedule).toContain("v_actor_id uuid := auth.uid()");
    expect(assignment).toContain("drop function if exists public.flowmate_change_creative_assignee(uuid, text, uuid, text)");
    expect(assignment).toContain("drop function if exists public.flowmate_reschedule_capacity_allocation(uuid, text, jsonb, text)");
  });

  it("keeps capacity allocations positive-only and removes legacy upper-bound checks by definition", () => {
    expect(assignment).toContain("add constraint flowmate_capacity_allocations_capacity_point_check check (capacity_point > 0)");
    expect(assignment).toContain("pg_get_constraintdef(c.oid) ilike '%capacity_point%'");
    expect(assignment).toContain("public.flowmate_hybrid_rebuild_allocation");
    expect(assignment).not.toMatch(/add\s+constraint\s+\w*capacity\w*\s+check\s*\([^)]*capacity_point[^)]*<=\s*4/i);
  });

  it("documents and implements the safe enum upgrade commit boundary", () => {
    const upgradeStart = schema.indexOf("-- Existing-database enum upgrade contract.");
    const upgradeEnd = schema.indexOf("create table if not exists public.users", upgradeStart);
    const upgrade = schema.slice(upgradeStart, upgradeEnd);

    expect(schema).toContain("'unassigned'");
    expect(schema).toContain("'capacity_changed'");
    expect(upgrade).toContain("trello_asana_hybrid_prepare.sql");
    expect(upgrade).toContain("alter type public.work_status");
    expect(upgrade).toContain("alter type public.assignment_result");
    expect(upgrade).toContain("alter type public.event_type");
    expect(upgrade).toContain("commit;");
  });

  it("keeps Need Brief ownerless and excluded from capacity, WIP, and workload totals", () => {
    const engine = finalFunction(assignment, "flowmate_run_assignment");
    const needBriefStart = engine.indexOf("if v_brief_missing is not null then");
    const needBriefEnd = engine.indexOf("end if;", needBriefStart);
    const needBrief = engine.slice(needBriefStart, needBriefEnd);

    expect(needBrief).toContain("delete from public.flowmate_capacity_allocations");
    expect(needBrief).toContain("final_owner_member_id = null");
    expect(needBrief).toContain("wip_counted = false");
    expect(schema).toContain("wi.status in ('assigned', 'in_progress', 'review', 'blocked')");
    expect(schema).not.toMatch(/wi\.status\s+in\s*\([^)]*'need_brief'[^)]*\)\s*\n\s*\), 0\) as assigned_effort/i);
  });

  it("adds a security-invoker Team Schedule read model and counts Review capacity", () => {
    expect(teamSchedule).toContain("create table if not exists public.flowmate_non_working_days");
    expect(teamSchedule).toContain("alter table public.flowmate_non_working_days enable row level security");
    expect(teamSchedule).toContain("create or replace view public.flowmate_team_schedule_v");
    expect(teamSchedule).toContain("with (security_invoker = true)");
    expect(teamSchedule).toContain("wi.status in ('assigned', 'in_progress', 'review', 'blocked')");
    expect(teamSchedule).toContain("idx_flowmate_capacity_allocations_bucket_member");
    expect(teamSchedule).toContain("final_owner_member_id,\n  capacity_snapshot");
  });

  it("preserves GD/VE assignee status authority, Marketing Sub PIC parity, and release order", () => {
    expect(collaboration).toContain("create or replace function public.flowmate_can_status_transition_work_item(");
    expect(collaboration).toContain("or tm.user_id = p_user_id");
    expect(quickTask).toContain("v_marketing_sub_pic boolean := false;");
    expect(quickTask).toContain("mci.sub_pic_user_id = v_actor_id");
    expect(quickTask).toContain("if not v_marketing_sub_pic and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then");
    expect(quickTask).toContain("Only owner can start this work");
    expect(quickTask).toContain("Only owner can submit this work for review");
    expect(quickTask).toContain("Only owner can block this work");
    expect(quickTask).toContain("Only owner can resume this work");

    const release = readme.slice(readme.indexOf("## Trello + Asana Hybrid Release Order"));
    const prepare = release.indexOf("supabase/trello_asana_hybrid_prepare.sql");
    const backend = release.indexOf("supabase/trello_asana_hybrid_backend.sql");
    const migrate = release.indexOf("supabase/trello_asana_hybrid_migrate_queued.sql");
    const verify = release.indexOf("supabase/trello_asana_hybrid_verify.sql");

    expect(release).toContain("Back up the Supabase database before starting");
    expect(release).toMatch(/base prerequisites only if they have not already\s+been deployed/);
    expect(release).toContain("Run without RLS");
    expect(release).toContain("manage their own RLS, policies, grants, and security-definer functions");
    expect(release).toContain("data-changing");
    expect(prepare).toBeGreaterThanOrEqual(0);
    expect(backend).toBeGreaterThan(prepare);
    expect(migrate).toBeGreaterThan(backend);
    expect(verify).toBeGreaterThan(migrate);
  });
});
