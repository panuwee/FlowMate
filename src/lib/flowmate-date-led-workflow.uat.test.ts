import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const functionRegion = (source: string, signature: string) => {
  const start = source.lastIndexOf(signature);
  expect(start, `missing function marker: ${signature}`).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf(
    "create or replace function public.",
    start + signature.length,
  );
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
};

describe("date-led Creative workflow", () => {
  it("uses authoritative T-4/T-2 Thai business-day milestones", () => {
    for (const file of ["rpc_assignment.sql", "creative_request_launch_milestones.sql"]) {
      const sql = repo("supabase", file);
      const create = functionRegion(
        sql,
        "create or replace function public.create_creative_request(",
      );

      expect(create, file).toMatch(
        /v_due_date\s*:=\s*public\.flowmate_subtract_th_business_days\(v_launch_date,\s*4\)/i,
      );
      expect(create, file).toMatch(
        /v_final_approved_due_date\s*:=\s*case[\s\S]*?when\s+v_is_no_tag\s+then\s+null[\s\S]*?public\.flowmate_subtract_th_business_days\(v_launch_date,\s*2\)/i,
      );
      expect(create, file).not.toMatch(/subtract_th_business_days\([^,]+,\s*(?:5|1)\)/i);
    }

    for (const file of [
      "rpc_assignment.sql",
      "creative_request_launch_milestones.sql",
      "trello_asana_hybrid_backend.sql",
    ]) {
      const sql = repo("supabase", file);

      expect(sql, file).toContain("flowmate_subtract_th_business_days(v_work.launch_date, 4)");
      expect(sql, file).toContain("flowmate_subtract_th_business_days(v_work.launch_date, 2)");
      expect(sql, file).not.toContain("flowmate_subtract_th_business_days(v_work.launch_date, 5)");
      expect(sql, file).not.toContain("flowmate_subtract_th_business_days(v_work.launch_date, 1)");
    }
  });

  it("keeps the approved 4 September example in SQL verification", () => {
    const sql = repo("supabase", "creative_request_launch_milestones.sql");
    expect(sql).toContain("date '2026-09-04'");
    expect(sql).toContain("date '2026-08-31'");
    expect(sql).toContain("date '2026-09-02'");
  });

  it("does not make priority urgent from Effort or capacity pressure", () => {
    const sql = repo("supabase", "rpc_assignment.sql");
    const createStart = sql.lastIndexOf(
      "create or replace function public.create_creative_request",
    );
    const runAssignmentStart = sql.lastIndexOf(
      "create or replace function public.flowmate_run_assignment",
    );

    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(runAssignmentStart).toBeGreaterThanOrEqual(0);
    expect(runAssignmentStart).toBeGreaterThan(createStart);

    const create = sql.slice(createStart, runAssignmentStart);
    expect(create).not.toContain("v_time_pressure_effort");
    expect(create).not.toContain("v_earliest_feasible_due_date");
    expect(create).not.toContain("Auto urgent:");
  });

  it("normalizes No Tag publishing-only values to null in backend SQL", () => {
    const assignment = repo("supabase", "rpc_assignment.sql");
    const noTag = repo("supabase", "workflow_no_tag_channel.sql");
    const marketingPlan = repo("supabase", "marketing_plan.sql");
    expect(assignment).toContain("v_is_no_tag");
    expect(assignment).toMatch(/v_final_approved_due_date\s*:=\s*case[\s\S]*when\s+v_is_no_tag\s+then\s+null/i);
    expect(assignment).toContain("v_publish_time := case when v_is_no_tag then null else p_publish_time end");
    expect(noTag).toContain("new.publish_time := null");
    expect(noTag).toContain("before insert or update of content_item_id, channel, publish_time");
    expect(marketingPlan).toContain("new.publish_time := null");
    expect(marketingPlan).toContain("final_approved_due_date = case");
    expect(marketingPlan).toContain("publish_time = v_effective_publish_time");
  });

  it("skips missing Publish Time in brief completeness only for exclusive No Tag", () => {
    const assignment = repo("supabase", "rpc_assignment.sql");
    const missing = functionRegion(
      assignment,
      "create or replace function public.flowmate_brief_missing_reason(",
    );

    expect(missing).toContain("public.workflow_normalize_creative_channels(");
    expect(missing).toContain("= array['no_tag']::text[]");
    expect(missing).toContain("if v_det.platforms is null or array_length(v_det.platforms, 1) is null then");
    expect(missing).toContain("if v_wi.publish_time is null and not v_is_no_tag then v_missing := array_append(v_missing, 'publish time'); end if;");
    expect(missing).not.toContain("if v_wi.publish_time is null then v_missing := array_append(v_missing, 'publish time'); end if;");
  });

  it("clears UI publishing-only fields during No Tag transitions without restoring stale time", () => {
    const app = repo("app.jsx");
    const create = repo("screens-a.jsx");

    expect(app).toContain("function isMarketingPlanNoTagSelection(channels)");
    expect(app).toContain('publishTime: nextIsNoTag ? "" : current.publishTime');
    expect(create).toContain("function isFlowMateNoTagDraft(draft)");
    expect(create).toContain('publishTime: nextIsNoTag ? "" : value.publishTime');
    expect(create).toContain('finalApprovedDueDate: nextIsNoTag ? "" : getFlowMateFinalApprovedDateForLaunchDate');
  });

  it("keeps Working Sheet sync authoritative for T-4/T-2 and No Tag", () => {
    const sql = repo("supabase", "marketing_plan.sql");
    const sync = functionRegion(
      sql,
      "create or replace function public.marketing_plan_sync_flowmate_schedule(",
    );
    const updateTime = functionRegion(
      sql,
      "create or replace function public.marketing_plan_update_working_row_time(",
    );
    const duplicate = functionRegion(
      sql,
      "create or replace function public.marketing_plan_duplicate_working_row(",
    );

    expect(sync).toContain("public.flowmate_subtract_th_business_days(p_launch_date, 4)");
    expect(sync).toContain("public.flowmate_subtract_th_business_days(p_launch_date, 2)");
    expect(sync).toContain("when work_type = 'creative_request' and v_has_no_tag then");
    expect(sync).toContain("when work_type = 'creative_request' and p_launch_date is not null then");
    expect(sync).toContain("else final_approved_due_date");
    expect(updateTime).toContain("v_effective_publish_time := case");
    expect(updateTime).toContain("when channel = 'no_tag' then null");
    expect(duplicate).toContain("when v_source_placement.channel = 'no_tag' then null");
  });

  it("separates read-only preview from guarded apply and verify", () => {
    const preview = repo("supabase", "creative_request_date_led_preview.sql");
    const apply = repo("supabase", "creative_request_date_led_apply.sql");
    const verify = repo("supabase", "creative_request_date_led_verify.sql");
    expect(preview).not.toMatch(/\b(?:update|delete|insert|truncate|alter|drop|create)\b/i);
    expect(apply).toContain("private.flowmate_creative_date_led_backfill_20260902");
    expect(apply).toContain("is not distinct from b.old_due_date");
    expect(apply).toContain("is not distinct from b.old_final_approved_due_date");
    expect(apply).toContain("is not distinct from b.old_publish_time");
    expect(verify).toContain("Changed after backfill; rollback skipped");
    expect(verify).toContain("legacy_candidate_count = 0");
  });

  it("reports every active exclusive No Tag row with either stale publishing field", () => {
    const preview = repo("supabase", "creative_request_date_led_preview.sql");
    const statements = preview.split(/;\n\s*\n/);
    const summary = statements.find((statement) =>
      statement.includes("'active_no_tag_stale_publishing_summary' as check_name"),
    );
    const detail = statements.find((statement) =>
      statement.includes("'active_no_tag_stale_publishing_detail' as check_name"),
    );

    expect(summary).toBeTruthy();
    expect(detail).toBeTruthy();
    for (const statement of [summary || "", detail || ""]) {
      expect(statement).toContain("public.workflow_normalize_creative_channels(");
      expect(statement).toContain("= array['no_tag']::text[]");
      expect(statement).toContain("wi.status not in ('delivered', 'cancelled')");
      expect(statement).toContain("wi.archived_at is null");
      expect(statement).toContain("wi.publish_time is not null");
      expect(statement).toContain("wi.final_approved_due_date is not null");
      expect(statement).not.toContain("flowmate_subtract_th_business_days");
    }
    expect(summary).toContain("stale_publish_time_count");
    expect(summary).toContain("stale_final_approved_count");
    expect(detail).toContain("wi.publish_time as stale_publish_time");
    expect(detail).toContain("wi.final_approved_due_date as stale_final_approved_due_date");
  });

  it("guards helper-dependent preview result sets behind the calendar gate", () => {
    const preview = repo("supabase", "creative_request_date_led_preview.sql");
    const helperStatements = preview
      .split(/;\n\s*\n/)
      .filter((statement) => statement.includes("public.flowmate_subtract_th_business_days"));

    expect(helperStatements).toHaveLength(3);
    for (const statement of helperStatements) {
      expect(statement).toContain("calendar_gate as materialized");
      expect(statement).toContain("where missing_year_count = 0");
      expect(statement).toMatch(/from\s+calendar_gate\s+gate[\s\S]*cross join lateral/i);

      const lateralMatch = statement.match(
        /cross join lateral\s*\(([\s\S]*?)\)\s+(?:candidate_rows|skipped_rows)/i,
      );
      expect(lateralMatch, statement).not.toBeNull();
      expect(lateralMatch?.[1], statement).toMatch(/\bgate\./i);
    }
  });

  it("fails verification when apply recorded any concurrent skip", () => {
    const verify = repo("supabase", "creative_request_date_led_verify.sql");

    expect(verify).toContain("concurrent_skip_count = 0 as concurrent_skip_count_is_zero");
    expect(verify).toContain("if v_concurrent_skip_count > 0 then");
    expect(verify).toContain("Concurrent skip requires reviewed preview evidence");
  });
});
