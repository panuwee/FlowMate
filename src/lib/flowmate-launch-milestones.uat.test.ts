import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");
const functionBody = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const end = source.indexOf("$$;", start);
  return source.slice(start, end + 3);
};

const subtractMondayToFriday = (date: string, workingDays: number) => {
  const cursor = new Date(`${date}T00:00:00Z`);
  let remaining = workingDays;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) remaining -= 1;
  }

  return cursor.toISOString().slice(0, 10);
};

it("stores both Creative Request milestones and generates them from Launch Date", () => {
  const schema = repo("supabase", "schema.sql");
  const assignment = repo("supabase", "rpc_assignment.sql");

  expect(schema).toContain("add column if not exists final_approved_due_date date");
  expect(assignment).toContain("public.flowmate_subtract_working_days(v_launch_date, 7)");
  expect(assignment).toContain("public.flowmate_subtract_working_days(v_launch_date, 5)");
});

it("defines weekdays as Monday through Friday with no public-holiday calendar", () => {
  const assignment = repo("supabase", "rpc_assignment.sql");

  expect(assignment).toContain("extract(isodow from v_cursor) between 1 and 5");
  expect(assignment).not.toContain("public_holidays");
});

it("maps a Monday Launch Date to fixed T-7 and T-5 Creative Request milestones", () => {
  const assignment = repo("supabase", "rpc_assignment.sql");
  const createCreativeRequest = functionBody(
    assignment,
    "create or replace function public.create_creative_request("
  );

  expect(subtractMondayToFriday("2026-08-17", 7)).toBe("2026-08-06");
  expect(subtractMondayToFriday("2026-08-17", 5)).toBe("2026-08-10");
  expect(createCreativeRequest).toContain(
    "v_due_date := public.flowmate_subtract_working_days(v_launch_date, 7);"
  );
  expect(createCreativeRequest).toContain(
    "v_final_approved_due_date := public.flowmate_subtract_working_days(v_launch_date, 5);"
  );
  expect(createCreativeRequest).toMatch(
    /due_date, final_approved_due_date, launch_date,[\s\S]*?v_due_date, v_final_approved_due_date, v_launch_date/
  );
});

it("keeps milestone generation isolated to Creative Requests and mirrors the T-7 guard", () => {
  const assignment = repo("supabase", "rpc_assignment.sql");
  const mirror = repo("supabase", "trello_asana_hybrid_backend.sql");
  const quickTask = repo("supabase", "rpc_quick_task.sql");
  const weekdayHelper = functionBody(
    assignment,
    "create or replace function public.flowmate_subtract_working_days("
  );
  const creativeRequest = functionBody(
    assignment,
    "create or replace function public.create_creative_request("
  );
  const quickTaskCreate = functionBody(
    quickTask,
    "create or replace function public.create_quick_task("
  );
  const t7Guard =
    "v_work.work_type = 'creative_request'\n                  and v_work.launch_date is not null\n                  and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 7)";

  expect(creativeRequest).toContain("'creative_request'");
  expect(quickTaskCreate).toContain("'quick_task'");
  expect(quickTaskCreate).not.toContain("final_approved_due_date");
  expect(quickTaskCreate).not.toContain("flowmate_subtract_working_days");
  expect(assignment).toContain(t7Guard);
  expect(mirror).toContain(t7Guard);
  expect(weekdayHelper).toContain("extract(isodow from v_cursor) between 1 and 5");
  expect(weekdayHelper).toContain(
    "Monday-Friday are working days; Thai public holidays on weekdays count."
  );
  expect(weekdayHelper).not.toMatch(/\b(?:from|join)\s+[^\n;]*(?:holiday|holidays)\b/i);
});

it("renders Creative Request milestones without relabelling Quick Task due dates", () => {
  const screenA = repo("screens-a.jsx");
  const screenB = repo("screens-b.jsx");
  const screenC = repo("screens-c.jsx");

  expect(screenA).toContain("Asset First Draft Due");
  expect(screenA).toContain("Asset Final/Approved Due");
  expect(screenB).toContain('"Due / First Draft"');
  expect(screenB).toContain('"Final / Approved"');
  expect(screenB).toContain('w.type === "creative" ? "First Draft" : "Due"');
  expect(screenB).toContain("w.finalApprovedDueFullLabel || w.finalApprovedDueLabel || w.finalApprovedDueDate || \"\"");
  expect(screenC).toContain("finalApprovedDueDate: item.final_approved_due_date || \"\"");
  expect(screenC).toContain("const finalApprovedLabel = row.finalApprovedDueFullLabel || row.finalApprovedDueLabel || row.finalApprovedDueDate || \"-\";");
  expect(screenC).toContain("<span>Final / Approved</span><strong>{finalApprovedLabel}</strong>");
  expect(screenC).toContain('item.type === "creative" && item.finalApprovedDueLabel');
  expect(screenC).toContain("finalApprovedKey");
  expect(screenC).toContain('title={`Final/Approved: ${calendarDateLabelC(task.finalApprovedKey)}`}');
  expect(screenC).toContain("team-schedule__final-approved-marker");
  expect(screenC).not.toContain("Launch Readiness");
});

it("keeps Creative Request launch milestones aligned across Calendar compact cards, agenda rows, and Gantt tooltips", () => {
  const screenC = repo("screens-c.jsx");
  const calendar = screenC.slice(
    screenC.indexOf("function CalendarScreen"),
    screenC.indexOf("/* ============================================================", screenC.indexOf("function CalendarScreen") + 1),
  );
  const agenda = calendar.slice(calendar.indexOf('{viewMode === "agenda" &&'), calendar.indexOf("</table>") + "</table>".length);
  const agendaItemRow = agenda.slice(agenda.indexOf("{agendaRows.map(item => ("), agenda.indexOf("))}"));
  const gantt = screenC.slice(screenC.indexOf("function TeamGanttScreen"), screenC.indexOf("function CalendarScreen"));

  expect(agenda.match(/<th>/g)?.length).toBe(9);
  expect(agendaItemRow.match(/<td(?: |>| className)/g)?.length).toBe(9);
  expect(agenda).toContain('<td className="mono">{item.type === "creative" ? (item.finalApprovedDueFullLabel || item.finalApprovedDueLabel || "-") : "-"}</td>');
  expect(agenda).toContain('<td className="mono">{item.id}</td>');
  expect(agenda.indexOf('item.finalApprovedDueFullLabel')).toBeLessThan(agenda.indexOf('<td className="mono">{item.id}</td>'));
  expect(calendar).toContain('item.type === "creative" && item.finalApprovedDueLabel && <span className="muted" style={{ fontSize: 11 }}>Final / Approved: {item.finalApprovedDueFullLabel || item.finalApprovedDueLabel}</span>');
  expect(calendar).not.toContain('!compact && item.type === "creative" && item.finalApprovedDueLabel');
  expect(gantt).toContain('Asset First Draft Due: ${calendarDateLabelC(task.dueKey)}');
  expect(gantt).toContain('Asset Final/Approved Due: ${task.finalApprovedKey ? calendarDateLabelC(task.finalApprovedKey) : "-"}');
  expect(gantt).toContain('Launch: ${task.launchKey ? calendarDateLabelC(task.launchKey) : "-"}');
});

it("keeps Team Schedule legend markers from reusing absolute task-bar marker styles", () => {
  const screenC = repo("screens-c.jsx");
  const css = repo("app.css");
  const teamSchedule = screenC.slice(screenC.indexOf("function TeamGanttScreen"), screenC.indexOf("function CalendarScreen"));
  const legend = teamSchedule.slice(teamSchedule.indexOf('<div className="team-schedule__legend"'), teamSchedule.indexOf('<div className="gantt team-schedule__timeline"'));

  expect(legend).toContain("team-schedule__legend-draft-marker");
  expect(legend).toContain("Asset First Draft");
  expect(legend).not.toContain(">1st Draft<");
  expect(legend).not.toContain('<i className="team-schedule__draft-marker"></i>');
  expect(css).toContain(".team-schedule__legend-draft-marker");
  expect(css).toContain(".team-schedule__draft-marker { position: absolute;");
});
