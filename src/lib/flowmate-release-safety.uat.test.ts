import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const transactionStatements = (sql: string, statement: "begin" | "commit") =>
  sql.match(new RegExp(`^${statement};$`, "gim")) || [];

describe("FlowMate production release safety", () => {
  it("documents the post-backfill installer path without authorizing another Apply", () => {
    const readme = repo("supabase", "README.md");
    const start = readme.indexOf("Post-backfill canonical backend installation");
    const end = readme.indexOf("For the Pond manual-skill assignment hotfix", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const release = readme.slice(start, end);
    for (const file of [
      "workflow_no_tag_channel.sql",
      "rpc_assignment.sql",
      "creative_request_launch_milestones.sql",
      "trello_asana_hybrid_backend.sql",
      "marketing_plan.sql",
      "flowmate_production_insights.sql",
      "flowmate_production_insights_verify.sql",
    ]) {
      expect(release, file).toContain(`supabase/${file}`);
    }

    expect(release).toMatch(
      /Do not rerun\s+`supabase\/creative_request_date_led_apply\.sql`/,
    );
    expect(release).toContain("read-only prerequisite preflight");
    expect(release).toContain("post-backfill audit");
    expect(release).toContain("work_status.unassigned");
    expect(release).toContain("assignment_result.unassigned");
    expect(release).toContain("event_type.capacity_changed");
  });

  it("keeps every canonical installer in one explicit transaction", () => {
    for (const file of [
      "rpc_assignment.sql",
      "marketing_plan.sql",
      "flowmate_production_insights.sql",
    ]) {
      const sql = repo("supabase", file);
      const firstMutation = sql.search(/^\s*(?:alter|create|drop|insert|update|delete|revoke|grant)\b/im);
      const firstBegin = sql.search(/^begin;$/im);

      expect(firstMutation, file).toBeGreaterThanOrEqual(0);
      expect(firstBegin, file).toBeGreaterThanOrEqual(0);
      expect(firstBegin, file).toBeLessThan(firstMutation);
      expect(transactionStatements(sql, "begin"), file).toHaveLength(1);
      expect(transactionStatements(sql, "commit"), file).toHaveLength(1);
      expect(sql.trimEnd(), file).toMatch(/commit;$/i);
    }
  });

  it("verifies invoker security and grants for all Production Insights views", () => {
    const verify = repo("supabase", "flowmate_production_insights_verify.sql");

    for (const view of [
      "flowmate_production_samples_v",
      "flowmate_production_operations_v",
      "flowmate_legacy_capacity_warning_v",
    ]) {
      expect(verify, view).toContain(`'${view}'`);
    }

    expect(verify).toContain("security_invoker=true");
    expect(verify).toContain("has_table_privilege('anon', v_relation_name, 'select')");
    expect(verify).toContain("has_table_privilege('authenticated', v_relation_name, 'select')");
  });

  it("labels the canonical milestone bundle as T-4/T-2", () => {
    const header = repo("supabase", "creative_request_launch_milestones.sql")
      .split("\n")
      .slice(0, 10)
      .join("\n");

    expect(header).toContain("minus 4 Thai working days");
    expect(header).toContain("minus 2 Thai working days");
    expect(header).not.toContain("minus 5 Thai working days");
    expect(header).not.toContain("minus 1 Thai working day");
  });

  it("keeps unrelated Board, SeaTalk, and CreativeBot artifacts out of the release slice", () => {
    for (const file of [
      "workflow_no_tag_channel.sql",
      "rpc_assignment.sql",
      "creative_request_launch_milestones.sql",
      "trello_asana_hybrid_backend.sql",
      "marketing_plan.sql",
      "flowmate_production_insights.sql",
      "flowmate_production_insights_verify.sql",
    ]) {
      expect(repo("supabase", file), file).not.toMatch(/\bboard\b|seatalk|creative[_ ]?bot/i);
    }
  });
});
