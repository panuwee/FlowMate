import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

function functionRegion(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

describe("Team Schedule all-team GD/VE visibility", () => {
  it("loads a cross-team schedule projection without changing the active workspace", () => {
    const source = repo("supabase-list-data.js");
    const loader = functionRegion(
      source,
      "async function loadFlowMateTeamScheduleRows()",
      "async function loadFlowMateCapacityAllocationRows(",
    );

    expect(loader).toContain('.rpc("flowmate_list_team_schedule")');
    expect(loader).not.toContain("getFlowMateActiveTeam");
    expect(loader).not.toContain("FLOWMATE_ACTIVE_TEAM");
    expect(loader).toContain('.from("flowmate_team_schedule_v")');
  });

  it("exposes only active Creative Request schedule fields to active authenticated users", () => {
    const sqlPath = join(process.cwd(), "supabase", "team_schedule_all_gdve_visibility.sql");
    expect(existsSync(sqlPath)).toBe(true);
    if (!existsSync(sqlPath)) return;

    const sql = repo("supabase", "team_schedule_all_gdve_visibility.sql");
    expect(sql).toContain("create or replace function public.flowmate_list_team_schedule()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("public.is_active_app_user()");
    expect(sql).toContain("wi.work_type = 'creative_request'");
    expect(sql).toContain("wi.status in ('assigned', 'in_progress', 'review', 'blocked')");
    expect(sql).toContain("tm.active = true");
    expect(sql).toMatch(/public\.flowmate_normalize_team_code\([\s\S]*tm\.discipline[\s\S]*\) = 'gdve'/);
    expect(sql).not.toContain("owning_team_code");
    expect(sql).not.toMatch(/create policy|alter table public\.work_items/i);
    expect(sql).toContain("revoke all on function public.flowmate_list_team_schedule() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.flowmate_list_team_schedule() to authenticated");
  });

  it("moves Function selection to the Sidebar and keeps Creative Gantt cross-function", () => {
    const app = repo("app.jsx");
    const screens = repo("screens-c.jsx");
    const schedule = functionRegion(screens, "function TeamGanttScreen", "function CalendarScreen");

    expect(app).toContain('route === "gantt"');
    expect(app).not.toContain("function TeamWorkspaceSelector");
    expect(app).not.toContain('data-testid": "team-workspace-switcher"');
    expect(app).toContain("function SidebarTeamSectionHeader");
    expect(app).toContain('data-testid": "sidebar-team-workspace-switcher"');
    expect(app).toContain('activeLabel ? `Team - ${activeLabel}` : "Team"');
    expect(app).toContain("if (left.key === requesterTeamKey) return -1");
    expect(app).toContain('group: "Creative"');
    expect(app).toContain('label: "Creative Gantt"');
    expect(app).toContain('"gantt": "Creative Gantt"');
    expect(schedule).toContain('const scheduleName = isTaskAssignProduct ? "Team Schedule" : "Creative Gantt"');
    expect(schedule).toContain("All teams can see active GD/VE workload");
    expect(schedule).toContain("All assignees");
    expect(schedule).toContain("All active statuses");
    expect(schedule).toContain("All skills");
    expect(schedule).not.toContain("teamGroups");
    expect(schedule).not.toContain("teamFilter");
  });
});
