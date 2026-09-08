import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const installerPath = join(process.cwd(), "supabase", "creative_monthly_kpi_data_foundation.sql");
const verifierPath = join(process.cwd(), "supabase", "creative_monthly_kpi_data_foundation_verify.sql");
const readSql = (path: string) => (
  existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : ""
);

describe("FlowMate Creative monthly KPI data foundation", () => {
  it("fails closed when workflow, calendar, or authorization prerequisites are absent", () => {
    const sql = readSql(installerPath);

    expect(sql).toContain("FlowMate Creative KPI prerequisites are missing");
    [
      "public.work_items",
      "public.work_item_events",
      "public.assignment_runs",
      "public.comments",
      "public.team_members",
      "public.users",
      "public.creative_request_details",
      "public.flowmate_non_working_days",
    ].forEach((relation) => expect(sql).toContain(`to_regclass('${relation}')`));
    expect(sql).toContain("to_regprocedure('public.flowmate_current_user_has_all_team_access()')");
  });

  it("adds isolated Bangkok working-calendar helpers without changing milestone scheduling", () => {
    const sql = readSql(installerPath);

    expect(sql).toContain("create or replace function public.flowmate_kpi_working_duration_days(");
    expect(sql).toContain("create or replace function public.flowmate_kpi_working_date_gap(");
    expect(sql).toContain("at time zone 'Asia/Bangkok'");
    expect(sql).toContain("h.scope = 'all'");
    expect(sql).toContain("p_calendar_scope = 'gdve' and h.scope = 'gdve'");
    expect(sql).not.toContain("create or replace function public.flowmate_subtract_working_days");
  });

  it("builds one security-invoker fact row per Creative Request from canonical history", () => {
    const sql = readSql(installerPath);

    expect(sql).toContain("create or replace view public.flowmate_creative_kpi_facts_v\nwith (security_invoker = true) as");
    expect(sql).toContain("wi.work_type = 'creative_request'");
    expect(sql).toContain("e.to_status = 'assigned'");
    expect(sql).toContain("e.to_status = 'in_progress'");
    expect(sql).toContain("e.from_status = 'in_progress'");
    expect(sql).toContain("e.to_status = 'review'");
    expect(sql).toContain("c.author_user_id = wi.requester_user_id");
    expect(sql).toContain("e.actor_user_id = wi.requester_user_id");
    expect(sql).toContain("ar.final_owner_member_id");
    expect(sql).toContain("owner_member_id_at_start");
    expect(sql).toContain("blocked_during_production_working_days");
    expect(sql).toContain("when named.started_at is null or named.review_submitted_at is null then null");
    expect(sql).toContain("data_quality_flags");
    expect(sql).toContain("exception_flags");
    expect(sql).not.toMatch(/\b(c\.body|wi\.description|crd\.brief_link)\b/);
  });

  it("publishes GD/VE and Requester monthly rows with stable IDs and required statistics", () => {
    const sql = readSql(installerPath);

    expect(sql).toContain("create or replace view public.flowmate_creative_kpi_gdve_monthly_v");
    expect(sql).toContain("create or replace view public.flowmate_creative_kpi_requester_monthly_v");
    expect(sql).toContain("review_month");
    expect(sql).toContain("owner_member_id_at_start as person_id");
    expect(sql).toContain("requester_user_id as person_id");
    expect(sql).toContain("percentile_cont(0.5)");
    expect(sql).toContain("percentile_cont(0.85)");
    expect(sql).toContain("avg(");
    expect(sql).toContain("missing_n");
    expect(sql).toContain("exception_n");
    expect(sql).toContain("n < 5 as small_sample");
    expect(sql).toContain("'team'::text as scope");
    expect(sql).toContain("'person'::text as scope");
  });

  it("enforces all-team authorization and explicit least-privilege grants", () => {
    const sql = readSql(installerPath);

    expect(sql).toContain("create or replace function public.flowmate_kpi_can_view()");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("public.flowmate_current_user_has_all_team_access()");
    expect(sql).toContain("public.flowmate_kpi_can_view()");
    expect(sql).toContain("revoke all on function public.flowmate_kpi_can_view() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.flowmate_kpi_can_view() to authenticated");
    [
      "flowmate_creative_kpi_facts_v",
      "flowmate_creative_kpi_gdve_monthly_v",
      "flowmate_creative_kpi_requester_monthly_v",
    ].forEach((view) => {
      expect(sql).toContain(`revoke all privileges on public.${view} from public, anon, authenticated`);
      expect(sql).toContain(`grant select on public.${view} to authenticated`);
    });
    expect(sql).not.toMatch(/grant select on public\.flowmate_creative_kpi_\w+ to anon/);
  });

  it("ships a read-only verifier for schema, privileges, data quality, and plans", () => {
    const sql = readSql(verifierPath);

    expect(sql).toContain("begin read only;");
    expect(sql).toContain("rollback;");
    expect(sql).toContain("security_invoker=true");
    expect(sql).toContain("information_schema.role_table_grants");
    expect(sql).toContain("pg_catalog.has_table_privilege");
    expect(sql).toContain("pg_catalog.has_function_privilege");
    expect(sql).toContain("set local role authenticated;");
    expect(sql).toContain("KPI verifier requires one active Supervisor/Admin user");
    expect(sql).toContain("data_quality_flags");
    expect(sql).toContain("explain (costs, verbose, format json)");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i);
  });
});
