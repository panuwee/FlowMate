import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = (name: string) => {
  const path = join(process.cwd(), "supabase", name);
  return existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : "";
};

const featureSql = () => sql("board_delivered_archive.sql");
const schemaSql = () => sql("schema.sql");
const adminSql = () => sql("collaboration_admin.sql");
const workflowSql = () => sql("rpc_quick_task.sql");
const urgentInstallerSql = () => sql("board_urgent_wip_override.sql");

const functionBlock = (source: string, signature: string, endMarker: string) => {
  const start = source.indexOf(signature);
  return source.slice(start, source.indexOf(endMarker, start)).trim();
};

describe("FlowMate Board delivered/archive SQL lifecycle", () => {
  it("adds the grace-period field, internal run audit, and query-shaped partial indexes", () => {
    const feature = featureSql();
    const canonical = schemaSql();

    for (const source of [feature, canonical]) {
      expect(source).toContain("archive_exempt_until timestamptz");
      expect(source).toContain("create table if not exists public.flowmate_archive_job_runs");
      expect(source).toContain("idx_work_items_board_active");
      expect(source).toContain("on public.work_items(owning_team_code, status, priority");
      expect(source).toContain("status in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked')");
      expect(source).toContain("idx_work_items_delivered_recent");
      expect(source).toContain("on public.work_items(owning_team_code, delivered_at desc, id desc)");
      expect(source).toContain("where status = 'delivered' and archived_at is null");
      expect(source).toContain("idx_work_items_delivered_archived");
      expect(source).toContain("on public.work_items(owning_team_code, archived_at desc, id desc)");
      expect(source).toContain("where archived_at is not null");
    }

    expect(feature).toContain("alter table public.flowmate_archive_job_runs enable row level security");
    expect(feature).toContain("revoke all privileges on public.flowmate_archive_job_runs from public, anon, authenticated");
    expect(feature).not.toMatch(/grant\s+(select|insert|update|delete|all)[\s\S]{0,100}flowmate_archive_job_runs[\s\S]{0,40}(anon|authenticated)/i);
  });

  it("exposes RLS-invoker delivered history and archived search with server filters and keyset cursors", () => {
    const feature = featureSql();
    const canonical = schemaSql();

    expect(feature).toContain("create or replace view public.flowmate_delivered_history_v\nwith (security_invoker = true) as");
    for (const source of [feature, canonical]) {
      expect(source).toContain("create or replace view public.flowmate_kpi_work_items_v\nwith (security_invoker = true) as");
      expect(source).toContain("where wi.archived_at is null or wi.status = 'delivered'");
      const kpiView = source.slice(
        source.indexOf("create or replace view public.flowmate_kpi_work_items_v"),
        source.indexOf("where wi.archived_at is null or wi.status = 'delivered'")
          + "where wi.archived_at is null or wi.status = 'delivered'".length,
      );
      for (const field of [
        "wi.title", "wi.status", "wi.priority", "wi.created_at", "assigned_at",
        "owner_member_id", "owner_name", "final_owner_name", "wi.assignee_other_name",
        "requester_name", "wi.requester_team", "wi.review_round", "wi.project_name",
        "platform", "size_format", "ai_tags",
      ]) {
        expect(kpiView).toContain(field);
      }
    }
    expect(feature).toContain("create or replace function public.flowmate_list_delivered_history(");
    expect(feature).toContain("p_scope text default 'recent'");
    expect(feature).toContain("p_delivered_month date default null");
    expect(feature).toContain("p_owner_member_id uuid default null");
    expect(feature).toContain("p_cursor_delivered_at timestamptz default null");
    expect(feature).toContain("p_cursor_id uuid default null");
    expect(feature).toContain("greatest(1, least(coalesce(p_page_size, 50), 100))");
    expect(feature).toContain("(h.delivered_at, h.id) < (p_cursor_delivered_at, p_cursor_id)");
    expect(feature).toContain("order by h.delivered_at desc nulls last, h.id desc");
    expect(feature).toContain("'next_cursor'");
    expect(feature).toContain("as legacy_missing_delivered_at");
    expect(feature).toContain("create or replace function public.flowmate_search_archived_work_items(");
    expect(feature).toContain("(h.archived_at, h.id) < (p_cursor_archived_at, p_cursor_id)");
    expect(feature).toContain("security invoker");
    expect(feature).not.toMatch(/p_(user|team)(_id)?\s/i);
  });

  it("previews evidence-based delivered_at backfill and archives eligible rows in bounded locked batches", () => {
    const feature = featureSql();

    expect(feature).toContain("create or replace function public.flowmate_preview_delivered_at_backfill()");
    expect(feature).toContain("create or replace function public.flowmate_backfill_delivered_at(");
    expect(feature).toContain("e.to_status = 'delivered'");
    expect(feature.match(/e\.from_status is distinct from 'delivered'/g)?.length).toBe(2);
    expect(feature).toContain("max(e.created_at)");
    expect(feature).toContain("'exception_ids'");
    expect(feature).not.toMatch(/delivered_at\s*=\s*(?:wi\.)?updated_at/i);

    expect(feature).toContain("create or replace function public.flowmate_archive_expired_deliveries(");
    expect(feature).toContain("p_dry_run boolean default true");
    expect(feature).toContain("p_as_of timestamptz default now()");
    expect(feature).toContain("delivered_at <= p_as_of - interval '60 days'");
    expect(feature).toMatch(/archive_exempt_until is null or (?:wi\.)?archive_exempt_until <= p_as_of/);
    expect(feature).toContain("for update skip locked");
    expect(feature).toContain("limit 500");
    expect(feature).toContain("archive_reason = 'auto_delivered_retention_60d'");
    expect(feature).toContain("'source', 'scheduler'");
    expect(feature).toContain("'retention_days', 60");
    expect(feature).toContain("insert into public.flowmate_archive_job_runs");
    expect(feature).toContain("'candidate_count'");
    expect(feature).toContain("'archived_count'");
    expect(feature).toContain("'skipped_count'");
    expect(feature).toContain("'candidate_ids'");
    expect(feature).not.toMatch(/delete\s+from\s+public\.(work_items|comments|checklist_items|notifications|work_item_events)/i);
  });

  it("keeps restore admin-only, audited, status-preserving, and protected by a seven-day grace period", () => {
    const feature = featureSql();
    const canonicalAdmin = adminSql();

    for (const source of [feature, canonicalAdmin]) {
      expect(source).toContain("create or replace function public.flowmate_admin_restore_work_item(");
      expect(source).toContain("if not public.is_admin_app_user(v_actor_id) then");
      expect(source).toContain("Restore reason is required");
      expect(source).toContain("Work item is not archived");
      expect(source).toContain("archive_exempt_until = case");
      expect(source).toContain("now() + interval '7 days'");
      expect(source).toContain("'previous_archived_at'");
      expect(source).toContain("v_previous_wip_counted boolean;");
      expect(source).toContain("v_previous_wip_counted := v_work.wip_counted;");
      expect(source).toContain("wip_counted = (v_work.status = 'in_progress')");
      expect(source).toContain("'previous_wip_counted', v_previous_wip_counted");
      expect(source).toContain("'restore_reason'");
      expect(source).toContain("revoke all on function public.flowmate_admin_restore_work_item(text, text) from public, anon, authenticated");
      expect(source).toContain("grant execute on function public.flowmate_admin_restore_work_item(text, text) to authenticated");
    }

    const restoreBody = feature.slice(
      feature.indexOf("create or replace function public.flowmate_admin_restore_work_item("),
      feature.indexOf("revoke all on function public.flowmate_admin_restore_work_item"),
    );
    expect(restoreBody).not.toMatch(/\bset\s+status\s*=/i);
    expect(restoreBody).not.toMatch(/\bset\s+delivered_at\s*=/i);
  });

  it("keeps archived child history readable within the existing workspace while mutations stay blocked", () => {
    const feature = featureSql();
    const canonicalAdmin = adminSql();
    const readHelper = canonicalAdmin.slice(
      canonicalAdmin.indexOf("create or replace function public.flowmate_can_read_work_item("),
      canonicalAdmin.indexOf("create or replace function public.flowmate_can_collaborate_on_work_item("),
    );
    const mutationHelper = canonicalAdmin.slice(
      canonicalAdmin.indexOf("create or replace function public.flowmate_can_collaborate_on_work_item("),
      canonicalAdmin.indexOf("create or replace function public.flowmate_can_status_transition_work_item("),
    );

    expect(feature).toContain('create policy "team members can read archived board links"');
    expect(feature).toContain('create policy "team members can read archived board watchers"');
    expect(feature).toContain('create policy "team members can read archived board ai tags"');
    expect(feature.match(/flowmate_current_user_can_read_work_item\(work_item_id\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(readHelper).not.toContain("wi.archived_at is null");
    expect(mutationHelper).toContain("wi.archived_at is null");
  });

  it("bypasses full WIP only for urgent work with audit context", () => {
    const workflow = workflowSql();
    const transition = workflow.slice(
      workflow.indexOf("create or replace function public.transition_creative_work_status"),
      workflow.indexOf("drop function if exists public.transition_creative_work_status"),
    );

    expect(transition).toContain("v_wip_override boolean := false;");
    expect(transition).toContain("v_work.priority = 'urgent'");
    expect(transition).toContain("length(trim(coalesce(v_work.urgent_reason, ''))) > 0");
    expect(transition).toContain("v_wip_override := true;");
    expect(transition).toContain("'wip_override', v_wip_override");
    expect(transition).toContain("'wip_snapshot', v_wip_now");
    expect(transition).toContain("'wip_limit', v_wip_limit");
    expect(transition).toContain("'urgent_reason', case when v_wip_override then v_work.urgent_reason else null end");
    expect(transition.match(/v_wip_now >= v_wip_limit/g)?.length).toBe(3);
    expect(transition).toContain("Only owner can start this work");
    expect(transition).toContain("Only requester can request changes");
    expect(transition).toContain("Only owner can resume this work");
    expect(transition).toContain("review_round = review_round + 1");
    expect(transition).toContain("update public.marketing_channel_placements mcp");

    const installer = urgentInstallerSql();
    const installerTransition = functionBlock(
      installer,
      "create or replace function public.transition_creative_work_status",
      "drop function if exists public.transition_creative_work_status",
    );
    expect(installerTransition).toBe(transition.trim());
  });

  it("resets the retention clock on every transition into Delivered", () => {
    const admin = adminSql();
    const adminTransition = functionBlock(
      admin,
      "create or replace function public.flowmate_admin_transition_work_status",
      "revoke all on function public.flowmate_admin_transition_work_status",
    );
    const userTransition = functionBlock(
      workflowSql(),
      "create or replace function public.transition_creative_work_status",
      "drop function if exists public.transition_creative_work_status",
    );

    expect(adminTransition).toContain("when p_next_status = 'delivered' then now()");
    expect(adminTransition).not.toContain("when p_next_status = 'delivered' then coalesce(delivered_at, now())");
    expect(userTransition).toContain("set status = 'delivered',\n        delivered_at = now()");
  });

  it("resolves Delivered owners for creative, internal quick-task, and named external assignees", () => {
    const feature = featureSql();
    const canonical = schemaSql();

    for (const source of [feature, canonical]) {
      const historyView = functionBlock(
        source,
        "create or replace view public.flowmate_delivered_history_v",
        "create or replace view public.flowmate_kpi_work_items_v",
      );
      expect(historyView).toContain("coalesce(wi.final_owner_member_id, wi.assignee_user_id) as owner_member_id");
      expect(historyView).toContain("left join public.users assignee on assignee.id = wi.assignee_user_id");
      expect(historyView).toContain("assignee.display_name");
      expect(historyView).toContain("nullif(trim(wi.assignee_other_name), '')");
    }

    expect(feature).toContain("p_owner_member_id is null or h.owner_member_id = p_owner_member_id");
    expect(feature).toContain("jsonb_build_object('id', o.owner_member_id, 'name', o.owner_name)");
  });

  it("keeps archived child reads workspace-scoped while archived mutations stay blocked", () => {
    const feature = featureSql();
    const admin = adminSql();
    const aiTags = sql("ai_tags.sql");

    const readHelper = functionBlock(
      admin,
      "create or replace function public.flowmate_can_read_work_item(",
      "revoke all on function public.flowmate_can_read_work_item",
    );
    expect(readHelper).not.toContain("wi.archived_at is null");

    for (const helper of ["flowmate_can_collaborate_on_work_item", "flowmate_can_status_transition_work_item"]) {
      const body = functionBlock(admin, `create or replace function public.${helper}(`, `revoke all on function public.${helper}`);
      expect(body).toContain("wi.archived_at is null");
    }

    for (const policy of [
      "team members can read archived board links",
      "team members can read archived board watchers",
      "team members can read archived board ai tags",
    ]) {
      expect(feature).toContain(`create policy "${policy}"`);
    }
    expect(feature).toContain("public.flowmate_current_user_can_read_work_item(work_item_id)");
    expect(aiTags).toContain("if v_work.id is null or v_work.archived_at is not null then");
  });

  it("provides an RLS-invoker board summary without caller identity parameters", () => {
    for (const source of [featureSql(), schemaSql()]) {
      expect(source).toContain("create or replace function public.flowmate_board_summary()");
      const summary = functionBlock(
        source,
        "create or replace function public.flowmate_board_summary()",
        "\n$$;",
      );
      expect(summary).toContain("security invoker");
      expect(summary).toContain("status in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked')");
      for (const key of ["'unassigned'", "'assigned'", "'in_progress'", "'review'", "'blocked'", "'in_progress_by_owner'", "'review_team_count'", "'review_team_limit'"]) {
        expect(summary).toContain(key);
      }
      const signature = summary.slice(0, summary.indexOf("returns jsonb"));
      expect(signature).not.toMatch(/p_(user|team)/i);
      expect(source).toContain("grant execute on function public.flowmate_board_summary() to authenticated");
    }
  });

  it("aggregates KPI AI tags on fresh installs without requiring table creation order", () => {
    for (const source of [featureSql(), schemaSql()]) {
      expect(source).toContain("create or replace function public.flowmate_kpi_ai_tags(");
      expect(source).toContain("to_regclass('public.work_item_ai_tags')");
      expect(source).toContain("array_agg(t.tag order by t.created_at, t.id)");
      expect(source).toContain("public.flowmate_kpi_ai_tags(wi.id) as ai_tags");
    }
  });

  it("ships rollback-safe verification and keeps scheduler activation separate from core SQL", () => {
    const feature = featureSql();
    const verify = sql("board_delivered_archive_verify.sql");
    const schedule = sql("board_delivered_archive_schedule.sql");
    const unschedule = sql("board_delivered_archive_unschedule.sql");

    expect(verify).toContain("-- READ-ONLY CHECKS");
    expect(verify).toContain("-- TRANSACTION FIXTURES");
    expect(verify).toContain("-- Expected: 59 days = false, 60 days = true, 61 days = true");
    expect(verify).toContain("requester_team, owning_team_code");
    expect(verify).toContain("set local role authenticated");
    expect(verify).toContain("workspace_isolation");
    expect(verify).toContain("non_admin_restore_denied");
    expect(verify).toContain("empty_restore_reason_denied");
    expect(verify).toContain("flowmate_archive_expired_deliveries(false");
    expect(verify).toContain("live_run_idempotent");
    expect(verify).toContain("previous_wip_counted");
    expect(verify).toContain("archive_exempt_until");
    expect(verify).toContain("child_rows_unchanged");
    expect(verify).toContain("has_function_privilege('anon'");
    expect(verify).toContain("has_function_privilege('authenticated'");
    expect(verify).toContain("prosecdef");
    expect(verify).toContain("proconfig");
    expect(verify).toContain("rollback;");
    expect(verify).toContain("cron.job");

    expect(feature).not.toContain("cron.schedule");
    expect(feature).not.toContain("create extension if not exists pg_cron");
    expect(schedule).toContain("to_regnamespace('cron')");
    expect(schedule).toContain("flowmate-archive-expired-deliveries-daily");
    expect(schedule).toContain("30 19 * * *");
    expect(schedule).toContain("flowmate_archive_expired_deliveries(false");
    expect(unschedule).toContain("flowmate-archive-expired-deliveries-daily");
    expect(unschedule).toContain("cron.unschedule");
    expect(unschedule).toMatch(/count\(\*\)[\s\S]{0,100}<> 0/);
  });
});
