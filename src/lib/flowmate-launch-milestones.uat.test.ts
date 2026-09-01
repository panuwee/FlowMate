import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");
const functionBody = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const end = source.indexOf("$$;", start);
  return source.slice(start, end + 3);
};
const functionRegion = (source: string, signature: string) => {
  const start = source.lastIndexOf(signature);
  if (start === -1) return "";
  const nextFunction = source.indexOf("create or replace function public.", start + signature.length);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
};

it("installs reviewed 2025 through 2027 Thai holiday coverage as authenticated read-only data", () => {
  const installer = repo("supabase", "creative_request_thai_business_days.sql");

  expect(installer).toContain("create table if not exists public.flowmate_th_holidays");
  expect(installer).toContain("holiday_date date primary key");
  expect(installer).toContain("name_th text not null");
  expect(installer).toContain("name_en text");
  expect(installer).toContain("create table if not exists public.flowmate_th_calendar_years");
  expect(installer).toContain("calendar_year integer primary key");
  expect(installer).toContain("source_url text not null");
  expect(installer).toContain("source_note text not null");
  expect(installer).toContain("is_complete boolean not null default false");
  expect(installer).toMatch(/\(2025,\s*false,/);
  expect(installer).toMatch(/\(2026,\s*false,/);
  expect(installer).toMatch(/\(2027,\s*false,/);
  expect(installer).toMatch(/update public\.flowmate_th_calendar_years[\s\S]*set is_complete = true[\s\S]*where calendar_year in \(2025, 2026, 2027\)/);
  expect(installer).toContain("enable row level security");
  expect(installer).toMatch(/create policy[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?using \(true\)/i);
  expect(installer).toMatch(/revoke all on table public\.flowmate_th_holidays from anon, authenticated/i);
  expect(installer).toMatch(/grant select on table public\.flowmate_th_holidays to authenticated/i);
  expect(installer).not.toMatch(/grant (insert|update|delete|all)[\s\S]*authenticated/i);
  expect(installer).toMatch(/update public\.flowmate_th_holidays[\s\S]*set is_active = false[\s\S]*2025, 2026, 2027/);

  const expectedHolidayDates = [
    "2025-01-01", "2025-02-12", "2025-04-07", "2025-04-14", "2025-04-15",
    "2025-05-01", "2025-05-05", "2025-05-12", "2025-06-02", "2025-06-03",
    "2025-07-10", "2025-07-28", "2025-08-11", "2025-08-12", "2025-10-13",
    "2025-10-23", "2025-12-05", "2025-12-10", "2025-12-31",
    "2026-01-01", "2026-01-02", "2026-03-03", "2026-04-06", "2026-04-13",
    "2026-04-14", "2026-04-15", "2026-05-01", "2026-05-04", "2026-06-01",
    "2026-06-03", "2026-07-28", "2026-07-29", "2026-08-12", "2026-10-13",
    "2026-10-23", "2026-12-07", "2026-12-10", "2026-12-31",
    "2027-01-01", "2027-02-22", "2027-04-06", "2027-04-13", "2027-04-14",
    "2027-04-15", "2027-05-03", "2027-05-04", "2027-05-20", "2027-06-03",
    "2027-07-19", "2027-07-28", "2027-08-12", "2027-10-13", "2027-10-25",
    "2027-12-06", "2027-12-10", "2027-12-31",
  ];
  for (const holidayDate of expectedHolidayDates) {
    expect(installer, holidayDate).toContain(`date '${holidayDate}'`);
  }
  expect(installer).not.toContain("date '2026-10-16'");
});

it("keeps the full reviewed holiday batch identical between SQL and the UI preview", () => {
  const installer = repo("supabase", "creative_request_thai_business_days.sql");
  const screenA = repo("screens-a.jsx");
  const sqlBatch = installer.slice(
    installer.indexOf("insert into public.flowmate_th_holidays"),
    installer.indexOf("on conflict (holiday_date)"),
  );
  const uiBatch = screenA.slice(
    screenA.indexOf("const FLOWMATE_TH_HOLIDAY_DATES"),
    screenA.indexOf("const FLOWMATE_CREATIVE_UNIT_EFFORT"),
  );
  const sqlDates = [...sqlBatch.matchAll(/date '(\d{4}-\d{2}-\d{2})'/g)].map((match) => match[1]);
  const uiDates = [...uiBatch.matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((match) => match[1]);

  expect(new Set(sqlDates).size).toBe(56);
  expect(new Set(uiDates).size).toBe(56);
  expect([...new Set(uiDates)].sort()).toEqual([...new Set(sqlDates)].sort());
});

it("implements coverage-aware Thai business-day helpers and deterministic verification cases", () => {
  const installer = repo("supabase", "creative_request_thai_business_days.sql");
  const isBusinessDay = functionRegion(installer, "create or replace function public.flowmate_is_th_business_day(");
  const subtractBusinessDays = functionRegion(installer, "create or replace function public.flowmate_subtract_th_business_days(");

  expect(isBusinessDay).toContain("extract(isodow from p_date) between 1 and 5");
  expect(isBusinessDay).toContain("h.holiday_date = p_date");
  expect(isBusinessDay).toContain("h.is_active");
  expect(subtractBusinessDays).toContain("Thai business-day date is required");
  expect(subtractBusinessDays).toContain("Thai business-day count cannot be negative");
  expect(subtractBusinessDays).toContain("flowmate_th_calendar_years");
  expect(subtractBusinessDays).toContain("Thai business-day calendar is incomplete for year %");
  expect(subtractBusinessDays).toContain("v_cursor := v_cursor - 1");
  expect(subtractBusinessDays).toContain("public.flowmate_is_th_business_day(v_cursor)");
  expect(installer).toContain("public.flowmate_subtract_th_business_days(date '2026-04-16', 1) <> date '2026-04-10'");
  expect(installer).toContain("public.flowmate_subtract_th_business_days(date '2026-04-16', 5) <> date '2026-04-03'");
  expect(installer).toContain("public.flowmate_subtract_th_business_days(date '2026-01-05', 1) <> date '2025-12-30'");
  expect(installer).toContain("position('2028' in v_incomplete_year_error) = 0");
  expect(installer).toContain("if v_incomplete_year_error = '' then");
});

it("pins the search path for every Thai business-day helper definition", () => {
  for (const sqlFile of [
    "creative_request_thai_business_days.sql",
    "creative_request_launch_milestones.sql",
    "rpc_assignment.sql",
  ]) {
    const sql = repo("supabase", sqlFile);
    const isBusinessDay = functionRegion(sql, "create or replace function public.flowmate_is_th_business_day(");
    const subtractBusinessDays = functionRegion(sql, "create or replace function public.flowmate_subtract_th_business_days(");

    expect(isBusinessDay, sqlFile).toContain("set search_path = ''");
    expect(subtractBusinessDays, sqlFile).toContain("set search_path = ''");
  }
});

it("stores both Creative Request milestones and generates them from Thai business days", () => {
  const schema = repo("supabase", "schema.sql");
  const assignment = repo("supabase", "rpc_assignment.sql");
  const isBusinessDayHelper = functionRegion(assignment, "create or replace function public.flowmate_is_th_business_day(");
  const businessDayHelper = functionRegion(assignment, "create or replace function public.flowmate_subtract_th_business_days(");
  const creativeRequest = functionRegion(assignment, "create or replace function public.create_creative_request(");

  expect(schema).toContain("add column if not exists final_approved_due_date date");
  expect(isBusinessDayHelper).toContain("flowmate_th_holidays");
  expect(businessDayHelper).toContain("flowmate_th_calendar_years");
  expect(businessDayHelper).toContain("flowmate_is_th_business_day");
  expect(businessDayHelper).toContain("flowmate_subtract_th_business_days");
  expect(creativeRequest).toMatch(/flowmate_subtract_th_business_days\([^)]*,\s*5\)/);
  expect(creativeRequest).toMatch(/flowmate_subtract_th_business_days\([^)]*,\s*1\)/);
});

it("defines Thai business days with the holiday and calendar-year helpers", () => {
  const assignment = repo("supabase", "rpc_assignment.sql");
  const isBusinessDayHelper = functionRegion(assignment, "create or replace function public.flowmate_is_th_business_day(");
  const businessDayHelper = functionRegion(assignment, "create or replace function public.flowmate_subtract_th_business_days(");

  expect(isBusinessDayHelper).toContain("flowmate_th_holidays");
  expect(businessDayHelper).toContain("flowmate_th_calendar_years");
  expect(businessDayHelper).toContain("flowmate_is_th_business_day");
  expect(businessDayHelper).toContain("flowmate_subtract_th_business_days");
});

it("maps Launch Date to the approved T-5 and T-1 Creative Request milestones", () => {
  const assignment = repo("supabase", "rpc_assignment.sql");
  const createCreativeRequest = functionBody(
    assignment,
    "create or replace function public.create_creative_request("
  );

  expect(createCreativeRequest).toContain("flowmate_subtract_th_business_days");
  expect(createCreativeRequest).toMatch(/flowmate_subtract_th_business_days\([^)]*,\s*5\)/);
  expect(createCreativeRequest).toMatch(/flowmate_subtract_th_business_days\([^)]*,\s*1\)/);
  expect(createCreativeRequest).toMatch(
    /due_date, final_approved_due_date, launch_date,[\s\S]*?v_due_date, v_final_approved_due_date, v_launch_date/
  );
});

it("does not rebase calculated Creative Request milestones to today", () => {
  const screenA = repo("screens-a.jsx");
  const draftCalculator = functionRegion(screenA, "function getFlowMateDraftDateForLaunchDate(");
  const finalCalculator = functionRegion(screenA, "function getFlowMateFinalApprovedDateForLaunchDate(");
  const timePressureCalculator = functionRegion(screenA, "function getFlowMateCreativeTimePressure(");

  expect(draftCalculator).toContain("subtractFlowMateWorkingDays");
  expect(finalCalculator).toContain("subtractFlowMateWorkingDays");
  expect(draftCalculator).not.toContain("clampFlowMateDateToToday(draftDate)");
  expect(finalCalculator).not.toContain("clampFlowMateDateToToday(finalApprovedDate)");
  expect(timePressureCalculator).toContain("const launchDate = clampFlowMateDateToToday(draft?.launchDate)");
  expect(timePressureCalculator).toContain("const dueDate = draft?.dueDate || getFlowMateAutoCreativeDraftDate(draft)");
  expect(timePressureCalculator).not.toContain("clampFlowMateDateToToday(draft?.dueDate");
});

it("mirrors Thai business-day milestones across assignment SQL, hybrid SQL, and visible copy", () => {
  const assignment = repo("supabase", "rpc_assignment.sql");
  const launchMilestones = repo("supabase", "creative_request_launch_milestones.sql");
  const mirror = repo("supabase", "trello_asana_hybrid_backend.sql");
  const quickTask = repo("supabase", "rpc_quick_task.sql");
  const screenA = repo("screens-a.jsx");

  for (const [fileName, sql, signatures] of [
    ["rpc_assignment.sql", assignment, ["create or replace function public.create_creative_request(", "create or replace function public.flowmate_run_assignment(", "create or replace function public.flowmate_change_creative_assignee("]],
    ["creative_request_launch_milestones.sql", launchMilestones, ["create or replace function public.create_creative_request(", "create or replace function public.flowmate_run_assignment(", "create or replace function public.flowmate_change_creative_assignee("]],
    ["trello_asana_hybrid_backend.sql", mirror, ["create or replace function public.flowmate_run_assignment(", "create or replace function public.flowmate_change_creative_assignee("]],
  ] as const) {
    for (const signature of signatures) {
      const region = functionRegion(sql, signature);
      expect(region, `${fileName}: ${signature}`).toMatch(/flowmate_subtract_th_business_days\([^)]*,\s*5\)/);
      expect(region, `${fileName}: ${signature}`).toMatch(/flowmate_subtract_th_business_days\([^)]*,\s*1\)/);
    }
  }

  const quickTaskCreate = functionBody(quickTask, "create or replace function public.create_quick_task(");
  expect(quickTaskCreate).toContain("'quick_task'");
  expect(quickTaskCreate).not.toContain("final_approved_due_date");
  expect(quickTaskCreate).not.toContain("flowmate_subtract_th_business_days");

  expect(screenA).toMatch(/Asset First Draft Due[\s\S]{0,300}T-5/);
  expect(screenA).toMatch(/Asset Final\/Approved Due[\s\S]{0,300}T-1/);
  expect(screenA).toContain("FLOWMATE_TH_HOLIDAY_DATES");
  expect(screenA).toContain("FLOWMATE_TH_COMPLETE_CALENDAR_YEARS");
  expect(screenA).toContain("Thai holiday calendar for ${launchCalendarYear} is not available.");
  expect(screenA).toContain("!FLOWMATE_TH_HOLIDAY_DATES.has(dateKey)");
  expect(screenA).toContain('"2026-04-06"');
  expect(screenA).toContain('"2026-04-13"');
  expect(screenA).toContain('"2026-04-14"');
  expect(screenA).toContain('"2026-04-15"');
});

it("verifies T-5 and T-1 independently for automatic and manual assignment", () => {
  const migration = repo("supabase", "creative_request_launch_milestones.sql");
  const automaticVerification = migration.slice(
    migration.indexOf("'public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure"),
    migration.indexOf("'public.flowmate_change_creative_assignee(text,uuid,text)'::regprocedure"),
  );
  const manualVerification = migration.slice(
    migration.indexOf("'public.flowmate_change_creative_assignee(text,uuid,text)'::regprocedure"),
    migration.indexOf("select count(distinct table_name)"),
  );
  for (const verification of [automaticVerification, manualVerification]) {
    expect(verification).toContain("flowmate_subtract_th_business_days(v_work.launch_date, 5)");
    expect(verification).toContain("flowmate_subtract_th_business_days(v_work.launch_date, 1)");
  }
  expect(migration).not.toContain("monday_launch_t_minus_7");
  expect(migration).not.toContain("monday_launch_t_minus_5");
  expect(migration).toContain("thai_milestone_math_ok");
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
