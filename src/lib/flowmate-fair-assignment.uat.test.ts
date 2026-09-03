import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const assignmentBlock = (sql: string) => {
  const start = sql.lastIndexOf("create or replace function public.flowmate_run_assignment(");
  const end = sql.indexOf(
    "revoke all on function public.flowmate_run_assignment(uuid, public.assignment_trigger)",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

const manualAssignmentBlock = (sql: string) => {
  const start = sql.lastIndexOf("create or replace function public.flowmate_change_creative_assignee(");
  const end = sql.indexOf(
    "revoke all on function public.flowmate_change_creative_assignee(text, uuid, text)",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

const skillRankCase = (sql: string) => {
  const start = sql.indexOf("when v_required_skill_2 is not null");
  const namedEnd = sql.indexOf("end as skill_rank", start);
  const end = namedEnd >= 0 ? namedEnd : sql.indexOf("end;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

describe("fair GD/VE assignment", () => {
  const canonicalFiles = [
    ["supabase", "rpc_assignment.sql"],
    ["supabase", "creative_request_launch_milestones.sql"],
    ["supabase", "trello_asana_hybrid_backend.sql"],
  ];

  it("chooses the emptiest state-count load before availability tie-breakers", () => {
    const candidates = [
      { code: "A", inProgress: 0, assigned: 1, availability: 1 },
      { code: "B", inProgress: 1, assigned: 0, availability: 1 },
      { code: "C", inProgress: 0, assigned: 3, availability: 1 },
      { code: "D", inProgress: 0, assigned: 1, availability: 0.5 },
    ];
    const score = (row: (typeof candidates)[number]) =>
      (row.inProgress + row.assigned * 0.5) / row.availability;

    expect(candidates.map(score)).toEqual([0.5, 1, 1.5, 1]);
    expect([...candidates].sort((a, b) => score(a) - score(b)).map((row) => row.code)).toEqual([
      "A",
      "B",
      "D",
      "C",
    ]);
    expect(candidates[0].code).toBe("A");

    for (const path of canonicalFiles) {
      const sql = assignmentBlock(repo(...path));
      expect(sql).toContain(
        "metrics.in_progress_count * 1.0 + metrics.assigned_count * 0.5 as assignment_load",
      );
      expect(sql).toContain(
        "((metrics.in_progress_count * 1.0 + metrics.assigned_count * 0.5)",
      );
      expect(sql).toContain("/ nullif(metrics.availability_fraction, 0)) as adjusted_load");
    }
  });

  it("uses status counts and leave-adjusted availability, never Effort, to rank", () => {
    for (const path of canonicalFiles) {
      const sql = repo(...path);
      expect(sql).toContain("in_progress_count");
      expect(sql).toContain("assigned_count");
      expect(sql).toContain("availability_fraction");
      expect(sql).toMatch(/adjusted_load[\s\S]*\(\s*\(\s*metrics\.in_progress_count\s*\*\s*1(?:\.0)?\s*\+\s*metrics\.assigned_count\s*\*\s*0\.5\s*\)\s*\/\s*nullif\(\s*metrics\.availability_fraction\s*,\s*0\s*\)\s*\)/i);
      expect(sql).not.toContain("(metrics.allocated_points + v_effort) / metrics.window_capacity");
    }
  });

  it("keeps skill, leave, WIP, deterministic tie order, and advisory lock", () => {
    const sql = assignmentBlock(repo("supabase", "rpc_assignment.sql"));
    const lockIndex = sql.indexOf("pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'))");
    const candidateIndex = sql.indexOf("with candidate_rows as");
    const rankedIndex = sql.indexOf("from ranked_candidates c");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(candidateIndex).toBeGreaterThan(lockIndex);
    expect(rankedIndex).toBeGreaterThan(lockIndex);
    expect(sql).toMatch(/where\s+c\.availability_fraction\s*>\s*0/i);
    expect(sql).toMatch(/v_work\.priority\s*=\s*'urgent'\s+or\s+c\.in_progress_count\s*<\s*c\.wip_limit/i);
    expect(sql).toMatch(/v_work\.priority\s*=\s*'urgent'\s+and\s+c\.skill_rank\s*=\s*2/i);

    const orderMatch = sql.match(/row_number\(\)\s+over\s*\(\s*order by([\s\S]*?)\)\s+as winner_rank/i);
    expect(orderMatch).not.toBeNull();
    expect(orderMatch?.[1].replace(/\s+/g, " ").trim()).toBe(
      "c.skill_rank asc, c.adjusted_load asc, c.in_progress_count asc, c.assigned_count asc, c.overdue_count asc, c.last_auto_assigned_at asc, c.context_rank asc, lower(c.member_code) asc",
    );
    expect(orderMatch?.[1]).not.toContain("eligible_for_assignment");
  });

  it("treats dual-asset mixed primary and backup coverage as urgent rank 2", () => {
    for (const path of canonicalFiles) {
      const automatic = assignmentBlock(repo(...path));
      const manual = manualAssignmentBlock(repo(...path));
      for (const sql of [automatic, manual]) {
        const rankCase = skillRankCase(sql);
        const backupRank = rankCase.indexOf("then 2");
        const partialPrimaryRank = rankCase.indexOf("then 1");
        expect(backupRank).toBeGreaterThanOrEqual(0);
        expect(partialPrimaryRank).toBeGreaterThanOrEqual(0);
        expect(backupRank).toBeLessThan(partialPrimaryRank);
        const memberPrefix = sql === automatic ? "tm" : "v_target";
        expect(rankCase).toContain(
          `coalesce(${memberPrefix}.skills, '{}'::text[]) || coalesce(${memberPrefix}.backup_skills, '{}'::text[])`,
        );
        if (sql === automatic) {
          expect(sql).toMatch(/v_work\.priority\s*=\s*'urgent'\s+and\s+c\.skill_rank\s*=\s*2/i);
        } else {
          expect(sql).toMatch(/v_work\.priority\s*=\s*'urgent'[\s\S]*v_skill_rank\s*=\s*2/i);
        }
      }
    }
  });

  it("warns when an eligible winner has a fractional availability window", () => {
    for (const path of canonicalFiles) {
      const sql = assignmentBlock(repo(...path));
      const warningStart = sql.indexOf("select coalesce(jsonb_agg(w.warning");
      const warningEnd = sql.indexOf("where w.warning is not null", warningStart);
      expect(warningStart).toBeGreaterThanOrEqual(0);
      expect(warningEnd).toBeGreaterThan(warningStart);
      const warnings = sql.slice(warningStart, warningEnd);
      expect(warnings).toMatch(/v_availability_fraction\s*>\s*0\s+and\s+v_availability_fraction\s*<\s*1/i);
    }
  });

  it("stops generating the two legacy capacity warnings", () => {
    for (const path of canonicalFiles) {
      const sql = repo(...path);
      const functionStart = sql.lastIndexOf("create or replace function public.flowmate_run_assignment");
      expect(functionStart).toBeGreaterThanOrEqual(0);
      const activeAssignment = sql.slice(functionStart);
      expect(activeAssignment).not.toContain("'over_capacity'");
      expect(activeAssignment).not.toContain("'deadline_capacity_gap'");
    }
  });

  it("keeps the no-candidate reason actionable when the winner query returns no rows", () => {
    for (const path of canonicalFiles) {
      const sql = repo(...path);
      const activeAssignment = sql.slice(
        sql.lastIndexOf("create or replace function public.flowmate_run_assignment"),
      );
      expect(activeAssignment).toMatch(/if\s+coalesce\(v_candidate_count,\s*0\)\s*=\s*0/i);
    }
  });

  it("allows manual reassignment without Effort and clears stale allocations", () => {
    for (const path of canonicalFiles) {
      const sql = manualAssignmentBlock(repo(...path));

      expect(sql).not.toMatch(
        /if\s+v_work\.effort_point\s+is\s+null\s+or\s+v_work\.effort_point\s*<=\s*0\s+then[\s\S]*?raise exception/i,
      );
      expect(sql).toMatch(
        /if\s+p_target_member_id\s+is\s+not\s+null\s+and\s+v_next_status\s+in\s*\('assigned',\s*'in_progress',\s*'review',\s*'blocked'\)\s+and\s+v_work\.effort_point\s*>\s*0\s+then\s+v_allocation_total\s*:=\s*public\.flowmate_hybrid_rebuild_allocation\(v_work\.id,\s*v_target\.id\);\s+else\s+delete\s+from\s+public\.flowmate_capacity_allocations\s+where\s+work_item_id\s*=\s*v_work\.id;\s+end\s+if;/i,
      );
      const nullableAuditEfforts =
        sql.match(
          /case\s+when\s+v_work\.effort_point\s*>\s*0\s+then\s+v_work\.effort_point\s+else\s+null\s+end/gi,
        ) ?? [];
      expect(nullableAuditEfforts).toHaveLength(3);
      expect(sql).not.toMatch(/coalesce\(\s*v_work\.effort_point\s*,\s*0\s*\)/i);
    }
  });

  it("keeps unknown Effort nullable in fresh and existing-database persistence", () => {
    const schema = repo("supabase", "schema.sql");
    const assignmentRunsStart = schema.indexOf("create table if not exists public.assignment_runs (");
    const assignmentRunsEnd = schema.indexOf(");", assignmentRunsStart);
    expect(assignmentRunsStart).toBeGreaterThanOrEqual(0);
    expect(assignmentRunsEnd).toBeGreaterThan(assignmentRunsStart);
    const assignmentRuns = schema.slice(assignmentRunsStart, assignmentRunsEnd);
    const installer = repo("supabase", "rpc_assignment.sql");

    expect(schema).not.toContain("constraint work_items_effort_for_creative_after_brief");
    expect(assignmentRuns).toMatch(/effort_point\s+integer\s+check\s*\(/i);
    expect(assignmentRuns).not.toMatch(/effort_point\s+integer\s+not\s+null/i);
    expect(installer).toMatch(
      /alter table\s+public\.work_items\s+drop constraint if exists\s+work_items_effort_for_creative_after_brief/i,
    );
    expect(installer).toMatch(
      /alter table\s+public\.assignment_runs\s+alter column\s+effort_point\s+drop not null/i,
    );
  });
});
