import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const diagnosticPath = join(
  process.cwd(),
  "supabase",
  "diagnose_ploy_pointer_mag_assignment.sql",
);

const diagnosticSql = () =>
  existsSync(diagnosticPath)
    ? readFileSync(diagnosticPath, "utf8").replace(/\r\n/g, "\n")
    : "";

const stripSqlComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");

describe("Ploy / Pointer / Mag assignment diagnostic", () => {
  it("covers the five evidence sections and all named identities", () => {
    const source = diagnosticSql();

    for (const section of [
      "SECTION 1 - AFFECTED WORK AND LATEST ASSIGNMENT RUN",
      "SECTION 2 - MANUAL VERSUS AUTOMATIC ASSIGNMENT EVIDENCE",
      "SECTION 3 - MARKETING GD/VE CANDIDATE HEALTH",
      "SECTION 4 - REQUEST CONTEXT AND TEAM LINKAGE DRIFT",
      "SECTION 5 - DEPLOYED ASSIGNMENT FUNCTION FINGERPRINT",
    ]) {
      expect(source).toContain(section);
    }

    for (const identity of [
      "Ploy",
      "fco.thanyaporn@garena.com",
      "Pointer",
      "fco.run@garena.com",
      "Mag",
      "fco.thanatbhum@garena.com",
    ]) {
      expect(source).toContain(identity);
    }
  });

  it("distinguishes manual evidence, candidate health, context drift, and engine version", () => {
    const source = diagnosticSql();

    expect(source).toContain("manual_assignment_rpc");
    expect(source).toContain("assignee_changed");
    expect(source).toContain("assignment_ran");
    expect(source).toContain("public.assignment_runs");
    expect(source).toContain("public.work_item_events");

    for (const candidate of ["pond", "jo", "tong", "eye", "vee", "ploy"]) {
      expect(source).toContain(`'${candidate}'`);
    }
    expect(source).toContain("public.leave_requests");
    expect(source).toContain("public.flowmate_capacity_allocations");
    expect(source).toContain("public.user_team_memberships");
    expect(source).toContain("owning_team_code");
    expect(source).toContain("requester_team");
    expect(source).toContain("current-only");
    expect(source).toContain("cannot prove past eligibility");

    expect(source).toContain("pg_get_functiondef");
    expect(source).toContain("pg_get_function_identity_arguments");
    expect(source).toContain("md5(");
    expect(source).toContain("flowmate_run_assignment");
    expect(source).toMatch(/root cause[^\n]+not confirmed/i);
  });

  it("is strictly read-only after SQL comments are stripped", () => {
    const executableSql = stripSqlComments(diagnosticSql());
    const mutation = /\b(insert|update|delete|upsert|merge|truncate|alter|create|drop|grant|revoke|call|do|perform|begin|commit|rollback)\b/i;

    expect(executableSql).not.toMatch(mutation);
    expect(executableSql).not.toMatch(/\bselect\s+public\.flowmate_[a-z0-9_]+\s*\(/i);

    const statements = executableSql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(5);
    for (const statement of statements) {
      expect(statement).toMatch(/^(with\b|select\b)/i);
    }
  });
});
