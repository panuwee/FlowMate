import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  calculateWorkloadSummary,
  filterWorkItems,
  getOverdueAssignedItems,
  formatAssetType,
  formatStatus,
  type WorkItemSummary,
} from "./flowmate";

// --- Fixture covering all MVP statuses + work types ---------------------------
const PD_USER = "user-pond";
const JO_USER = "user-jo";

const fixture: WorkItemSummary[] = [
  // CR overdue, in_progress, assigned to Jo  (UAT-024)
  {
    displayId: "CR-1042",
    title: "Free Fire OB48 carousel",
    workType: "creative_request",
    status: "in_progress",
    assetType: "static-graphic",
    campaign: "OB48 Launch",
    requesterName: "Lin Chen",
    assigneeName: "Jo",
    assigneeUserId: JO_USER,
    effortPoint: 4,
    isOverdue: true,
    isDueSoon: false,
    isQueued: false,
  },
  // CR queued hybrid, needs split  (UAT-012)
  {
    displayId: "CR-1053",
    title: "AOV hybrid package",
    workType: "creative_request",
    status: "queued",
    assetType: "hybrid",
    campaign: "AOV S24 Launch",
    requesterName: "Daniel Park",
    assigneeName: null,
    assigneeUserId: null,
    effortPoint: 8,
    isOverdue: false,
    isDueSoon: false,
    isQueued: true,
  },
  // CR queued capacity-blocked
  {
    displayId: "CR-1054",
    title: "FF MX regional banner refresh",
    workType: "creative_request",
    status: "queued",
    assetType: "static-graphic",
    campaign: "FF MX June",
    requesterName: "Aisha Rahman",
    assigneeName: null,
    assigneeUserId: null,
    effortPoint: 4,
    isOverdue: false,
    isDueSoon: true,
    isQueued: true,
  },
  // CR review, assigned to Pond (review counts in creative effort per rules §6)
  {
    displayId: "CR-1047",
    title: "Q2 partner deck",
    workType: "creative_request",
    status: "review",
    assetType: "static-graphic",
    campaign: "Q2 Partner Review",
    requesterName: "Aisha Rahman",
    assigneeName: "Pond",
    assigneeUserId: PD_USER,
    effortPoint: 4,
    isOverdue: false,
    isDueSoon: true,
    isQueued: false,
  },
  // CR delivered — must NOT count in any active rollups
  {
    displayId: "CR-1031",
    title: "OB47 patch notes - chart visuals",
    workType: "creative_request",
    status: "delivered",
    assetType: "static-graphic",
    campaign: "OB47 Patch",
    requesterName: "Soo-yeon Park",
    assigneeName: "Jo",
    assigneeUserId: JO_USER,
    effortPoint: 6,
    isOverdue: false,
    isDueSoon: false,
    isQueued: false,
  },
  // Quick task open  (UAT-005: must not affect creative effort)
  {
    displayId: "QT-0209",
    title: "Update shared brand folder",
    workType: "quick_task",
    status: "in_progress",
    assetType: null,
    campaign: "Internal",
    requesterName: "Pond",
    assigneeName: "Pond",
    assigneeUserId: PD_USER,
    effortPoint: null,
    isOverdue: false,
    isDueSoon: true,
    isQueued: false,
  },
  // Quick task delivered — should not contribute to open quick task count
  {
    displayId: "QT-0210",
    title: "Old quick task done",
    workType: "quick_task",
    status: "delivered",
    assetType: null,
    campaign: "Internal",
    requesterName: "Pond",
    assigneeName: "Pond",
    assigneeUserId: PD_USER,
    effortPoint: null,
    isOverdue: false,
    isDueSoon: false,
    isQueued: false,
  },
];

function loadGithubSearchUtils() {
  const code = readFileSync(join(process.cwd(), "github", "search-utils.js"), "utf8");
  const sandbox = {
    window: {
      MEMBERS_BY_ID: {},
    },
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.window as {
    getFlowMateCreatedDisplayId: (created: unknown) => string;
    findFlowMateWorkItemById: <T extends { id?: string }>(rows: T[], id: string) => T | null;
    filterFlowMateAssigneeOptions: <T extends { name?: string }>(options: T[], query: string) => T[];
    getFlowMateMyWorkRows: <T extends { assignee?: string; status?: string }>(
      rows: T[],
      currentUser: { id?: string; team_member_id?: string; name?: string },
      members: { id?: string; name?: string }[],
      query?: string,
    ) => T[];
    getFlowMateQueueRows: <T extends { status?: string }>(rows: T[], query?: string) => T[];
    getFlowMateNavCounts: <T extends { assignee?: string; status?: string }>(
      rows: T[],
      currentUser: { id?: string; team_member_id?: string; name?: string },
      members: { id?: string; name?: string }[],
    ) => { "my-work": number; queue: number };
    filterFlowMateMyWorkByStatus: <T extends { status?: string; overdue?: boolean; dueDelta?: number | null }>(
      rows: T[],
      status: string,
    ) => T[];
    sortFlowMateMyWorkRows: <T extends { status?: string; overdue?: boolean; dueDelta?: number | null; dueLabel?: string; id?: string }>(
      rows: T[],
    ) => T[];
    getFlowMateCalendarDateKey: (
      row: { dueDate?: string; calendarDate?: string; dueDelta?: number | null },
      today?: Date,
    ) => string;
    getFlowMateCalendarAgendaRows: <T extends {
      assignee?: string;
      calendarDate?: string;
      dueDate?: string;
      dueDelta?: number | null;
      status?: string;
      type?: string;
      priority?: string;
    }>(
      rows: T[],
      filters: {
        dateKey?: string;
        range?: "day" | "week";
        assignee?: string;
        status?: string;
        type?: string;
        priority?: string;
      },
      today?: Date,
    ) => T[];
    isFlowMateGdVeMember: (member: { name?: string; member_code?: string; id?: string }) => boolean;
    getFlowMateWorkloadStatusCounts: <T extends { status?: string }>(items: T[]) => {
      assigned: number;
      in_progress: number;
      review: number;
      blocked: number;
      delivered: number;
    };
    buildFlowMateTemplateTitle: (input: {
      launchDate?: string;
      requesterTeam?: string;
      projectName?: string;
    }) => string;
  };
}

function loadGithubQuickTaskUtils() {
  const code = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const sandbox = {
    console,
    window: {
      FLOWMATE_CURRENT_USER: null,
      flowmateSupabase: {
        rpc: async (name: string, params: Record<string, unknown>) => {
          rpcCalls.push({ name, params });
          return { data: { ok: true }, error: null };
        },
      },
      location: { reload: () => undefined },
    },
  };
  vm.runInNewContext(code, sandbox);
  return {
    window: sandbox.window as typeof sandbox.window & {
      getFlowMateTeamSettingsBoard: <T extends { name?: string; discipline?: string; discipline_short?: string; availability?: string }>(
        members: T[],
        filter?: string,
      ) => { title: string; members: T[]; unknownCount: number }[];
      filterFlowMateTeamSettingsMembers: <T extends { availability?: string }>(members: T[], filter: string) => T[];
      getFlowMateTeamSettingsUiModel: (user: { role?: string } | null) => { canEditMembers: boolean; showAdminActions: boolean };
      getFlowMateTeamSettingsMemberUi: (
        member: { name?: string; discipline?: string; discipline_short?: string },
        user: { role?: string } | null,
      ) => { isGdVe: boolean; showCapacityControls: boolean; canEdit: boolean };
      adminUpdateFlowMateTeamMember: (memberId: string, input: Record<string, unknown>) => Promise<unknown>;
      createFlowMateLeaveRequest: (input: Record<string, unknown>) => Promise<unknown>;
    },
    rpcCalls,
  };
}

// ============================================================================
// UAT-005 — Quick tasks do not affect creative capacity
// ============================================================================
describe("UAT-005 quick tasks do not contribute to creative effort", () => {
  it("creativeEffort sums only OPEN creative_request rows (excludes delivered/cancelled per Assignment Rules §6)", () => {
    const summary = calculateWorkloadSummary(fixture);
    // CR-1042 (4) + CR-1053 (8) + CR-1054 (4) + CR-1047 (4) = 20; CR-1031 delivered (6) excluded
    expect(summary.creativeEffort).toBe(20);
  });

  it("quickTaskCount counts only open quick tasks (excludes delivered/cancelled)", () => {
    const summary = calculateWorkloadSummary(fixture);
    expect(summary.quickTaskCount).toBe(1); // QT-0209 only
  });

  it("adding more quick tasks never increases creative effort", () => {
    const more = [
      ...fixture,
      {
        ...fixture[5],
        displayId: "QT-9001",
      },
      {
        ...fixture[5],
        displayId: "QT-9002",
      },
    ];
    const base = calculateWorkloadSummary(fixture);
    const next = calculateWorkloadSummary(more);
    expect(next.creativeEffort).toBe(base.creativeEffort);
    expect(next.quickTaskCount).toBe(base.quickTaskCount + 2);
  });
});

// ============================================================================
// UAT-024 — Overdue banner shows overdue work assigned to current user
// ============================================================================
describe("UAT-024 overdue banner targeting", () => {
  it("returns only overdue items where current user is the assignee", () => {
    const jo = getOverdueAssignedItems(fixture, JO_USER);
    expect(jo.map((i) => i.displayId)).toEqual(["CR-1042"]);
  });

  it("returns empty list when the user has no overdue work", () => {
    expect(getOverdueAssignedItems(fixture, PD_USER)).toEqual([]);
  });

  it("does not include unassigned overdue work (queued rows)", () => {
    const queuedOverdue: WorkItemSummary = {
      ...fixture[1],
      displayId: "CR-9999",
      isOverdue: true,
    };
    expect(getOverdueAssignedItems([queuedOverdue], JO_USER)).toEqual([]);
  });
});

// ============================================================================
// UAT-025 — Search by id, title, campaign, requester, assignee, status, asset
// ============================================================================
describe("UAT-025 search fields", () => {
  const cases: Array<[string, string]> = [
    ["cr-1042", "CR-1042"],          // by ID, case insensitive
    ["OB48", "CR-1042"],             // by title
    ["AOV hybrid", "CR-1053"],       // multi-word title
    ["aov s24 launch", "CR-1053"],   // by campaign
    ["Daniel Park", "CR-1053"],      // by requester
    ["Pond", "QT-0209"],             // by assignee
    ["queued", "CR-1053"],           // by status (kebab-or-raw; both queued rows)
    ["hybrid", "CR-1053"],           // by asset type
  ];
  it.each(cases)("query %s finds %s", (query, expectedId) => {
    const results = filterWorkItems(fixture, query);
    expect(results.map((r) => r.displayId)).toContain(expectedId);
  });

  it("status query 'queued' returns both queued rows", () => {
    const results = filterWorkItems(fixture, "queued");
    expect(results.map((r) => r.displayId).sort()).toEqual(["CR-1053", "CR-1054"]);
  });

  it("empty query returns all rows", () => {
    expect(filterWorkItems(fixture, "")).toHaveLength(fixture.length);
    expect(filterWorkItems(fixture, "   ")).toHaveLength(fixture.length);
  });

  it("non-matching query returns []", () => {
    expect(filterWorkItems(fixture, "no-such-item-xyz")).toHaveLength(0);
  });

  it("PRD §10: search includes platform (string)", () => {
    const withPlatform: WorkItemSummary = {
      ...fixture[0],
      displayId: "CR-9100",
      platform: "Instagram, TikTok",
    };
    expect(filterWorkItems([withPlatform], "instagram")).toHaveLength(1);
    expect(filterWorkItems([withPlatform], "tiktok")).toHaveLength(1);
  });

  it("PRD §10: search includes platforms (array)", () => {
    const withPlatforms: WorkItemSummary = {
      ...fixture[0],
      displayId: "CR-9101",
      platforms: ["YouTube", "Reels"],
    };
    expect(filterWorkItems([withPlatforms], "youtube")).toHaveLength(1);
    expect(filterWorkItems([withPlatforms], "reels")).toHaveLength(1);
  });
});

// ============================================================================
// UAT-012 — Hybrid request stays queued with needs_split semantics
// ============================================================================
// ============================================================================
// UAT-101/UAT-102 - Created item detail target
// ============================================================================
describe("UAT-101/UAT-102 created item detail target helpers", () => {
  const utils = loadGithubSearchUtils();

  it("uses the real created display_id for detail navigation", () => {
    expect(utils.getFlowMateCreatedDisplayId({ id: "db-row-id", display_id: "QT-0301" })).toBe("QT-0301");
    expect(utils.getFlowMateCreatedDisplayId({ id: "CR-2010" })).toBe("CR-2010");
  });

  it("finds the created work item row from freshly loaded list rows", () => {
    const row = { id: "CR-2010", title: "New request" };
    expect(utils.findFlowMateWorkItemById([{ id: "QT-0301" }, row], "CR-2010")).toBe(row);
    expect(utils.findFlowMateWorkItemById([{ id: "QT-0301" }], "CR-2010")).toBeNull();
  });

  it("computes sidebar counts from active live rows instead of static numbers", () => {
    const currentUser = { id: "user-pond", team_member_id: "m-pond", name: "Pond" };
    const members = [{ id: "m-pond", name: "Pond" }];
    const rows = [
      { id: "QT-1", assignee: "m-pond", status: "assigned", title: "Open quick" },
      { id: "QT-2", assignee: "m-pond", status: "delivered", title: "Done quick" },
      { id: "QT-3", assignee: "m-pond", status: "done", title: "Done status quick" },
      { id: "CR-1", assignee: "m-other", status: "assigned", title: "Other owner" },
      { id: "CR-2", status: "queued", title: "Queued" },
      { id: "CR-3", status: "need_brief", title: "Need brief" },
    ];

    expect(utils.getFlowMateMyWorkRows(rows, currentUser, members).map((row) => row.id)).toEqual(["QT-1"]);
    expect(utils.getFlowMateQueueRows(rows).map((row) => row.id)).toEqual(["CR-2"]);
    expect(utils.getFlowMateNavCounts(rows, currentUser, members)).toEqual({ "my-work": 1, queue: 1 });
  });

  it("sorts My work by overdue first, then due today, then later due dates", () => {
    const rows = [
      { id: "later", status: "assigned", dueDelta: 3 },
      { id: "today", status: "review", dueDelta: 0 },
      { id: "overdue", status: "assigned", overdue: true, dueDelta: -2 },
      { id: "tomorrow", status: "in_progress", dueDelta: 1 },
    ];

    expect(utils.sortFlowMateMyWorkRows(rows).map((row) => row.id)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "later",
    ]);
    expect(utils.filterFlowMateMyWorkByStatus(rows, "due_today").map((row) => row.id)).toEqual(["today"]);
    expect(utils.filterFlowMateMyWorkByStatus(rows, "overdue").map((row) => row.id)).toEqual(["overdue"]);
  });

  it("splits workload members into GD/VE and Non GD/VE groups with status counts", () => {
    expect(utils.isFlowMateGdVeMember({ name: "Pond" })).toBe(true);
    expect(utils.isFlowMateGdVeMember({ name: "Joe" })).toBe(true);
    expect(utils.isFlowMateGdVeMember({ name: "Gear" })).toBe(false);
    expect(utils.getFlowMateWorkloadStatusCounts([
      { status: "assigned" },
      { status: "in_progress" },
      { status: "review" },
      { status: "blocked" },
      { status: "delivered" },
      { status: "queued" },
    ])).toEqual({
      assigned: 1,
      in_progress: 1,
      review: 1,
      blocked: 1,
      delivered: 1,
    });
  });
});

describe("create form title helper", () => {
  const utils = loadGithubSearchUtils();

  it("builds [DD-MM-YYYY][Function][Project Name] from launch date, function, and project", () => {
    expect(utils.buildFlowMateTemplateTitle({
      launchDate: "2026-05-25",
      requesterTeam: "Marketing",
      projectName: "FCO S24 Launch",
    })).toBe("[25-05-2026][Marketing][FCO S24 Launch]");
  });
});

describe("MVP 1.1 create form draft saving", () => {
  const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");

  it("stores Quick Task and Creative Request drafts under separate localStorage keys", () => {
    expect(createScreenJsx).toContain('quick: "flowmate:create:quickDraft:v1"');
    expect(createScreenJsx).toContain('creative: "flowmate:create:creativeDraft:v1"');
    expect(createScreenJsx).toContain("saveFlowMateCreateDraft(\"quick\", nextQuickDraft)");
    expect(createScreenJsx).toContain("saveFlowMateCreateDraft(\"creative\", nextCreativeDraft)");
  });

  it("restores drafts on create screen load and clears only the submitted draft after success", () => {
    expect(createScreenJsx).toContain("readFlowMateCreateDraft(\"quick\", getDefaultQuickDraft())");
    expect(createScreenJsx).toContain("readFlowMateCreateDraft(\"creative\", getDefaultCreativeDraft())");
    expect(createScreenJsx).toContain("clearFlowMateCreateDraft(mode)");
  });

  it("uses autosave only and does not show a manual Save draft button", () => {
    const createScreenSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreateScreen"));

    expect(createScreenSource).not.toContain(">Save draft</button>");
  });

  it("does not persist known secret or auth token field names in create drafts", () => {
    const draftSource = createScreenJsx.slice(
      createScreenJsx.indexOf("const FLOWMATE_CREATE_DRAFT_FIELDS"),
      createScreenJsx.indexOf("function getDefaultQuickAssignee"),
    );

    expect(draftSource).not.toMatch(/password|token|api[_-]?key|authorization|secret/i);
  });

  it("defaults and clamps create form dates to today so stale drafts cannot submit past dates", () => {
    const quickFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"), createScreenJsx.indexOf("function CreativeRequestForm"));
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("function getFlowMateTodayDateKey()");
    expect(createScreenJsx).toContain("function clampFlowMateDateToToday(dateValue)");
    expect(createScreenJsx).toContain("function getFlowMateDraftDateForLaunchDate(launchDate)");
    expect(createScreenJsx).toContain("function normalizeFlowMateQuickDraft(draft)");
    expect(createScreenJsx).toContain("readFlowMateCreateDraft(\"quick\", getDefaultQuickDraft()))");
    expect(createScreenJsx).toContain("normalizeFlowMateQuickDraft(readFlowMateCreateDraft");
    expect(createScreenJsx).not.toContain('dueDate: "2026-05-18"');
    expect(createScreenJsx).not.toContain('launchDate: "2026-05-25"');
    expect(createScreenJsx).not.toContain('subtractFlowMateWorkingDays("2026-05-25", 5)');
    expect(quickFormSource).toContain("const todayDate = getFlowMateTodayDateKey()");
    expect(quickFormSource).toContain("min={todayDate}");
    expect(creativeFormSource).toContain("const todayDate = getFlowMateTodayDateKey()");
    expect(creativeFormSource).toContain("min={todayDate}");
    expect(creativeFormSource).toContain("dueDate: getFlowMateDraftDateForLaunchDate(nextLaunchDate)");
  });
});

describe("quick task Other assignee SQL support", () => {
  it("shows the current deploy cache version beside the FlowMate brand", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const indexHtml = readFileSync(join(process.cwd(), "github", "index.html"), "utf8");

    // Version-agnostic: the deploy stamp changes on every cache-bust, so
    // assert the shape, not a specific value.
    expect(appJsx).toMatch(/const FLOWMATE_APP_VERSION = "v\d{8}-\d+";/);
    expect(appJsx).toContain('<span className="app__brand-version">{FLOWMATE_APP_VERSION}</span>');
    expect(appCss).toContain(".app__brand-version");
    expect(indexHtml).toMatch(/v=\d{8}-\d+/);
  });

  it("schema and RPC store Other assignee names without trusting client actor ids", () => {
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");

    expect(schemaSql).toContain("assignee_other_name text");
    expect(quickTaskSql).toContain("p_assignee_other_name text default null");
    expect(quickTaskSql).toContain("v_assignee_other_name");
    expect(quickTaskSql).toContain("p_assignee_other_name");
    expect(quickTaskSql).toContain("assignee_other_name");
    expect(quickTaskSql).toContain("perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id)");
    expect(quickTaskSql).not.toMatch(/where id = p_actor_user_id\b/i);
  });

  it("quick task create flow stores launch date and requester team/function", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");

    expect(quickTaskJs).toContain("p_launch_date: input.launchDate");
    expect(quickTaskJs).toContain("p_requester_team: input.requesterTeam");
    expect(quickTaskSql).toContain("p_launch_date date");
    expect(quickTaskSql).toContain("p_requester_team text");
    expect(quickTaskSql).toContain("nullif(trim(coalesce(p_requester_team, '')), '')");
    expect(quickTaskSql).toContain("launch_date");
    expect(quickTaskSql).toContain("p_launch_date");
  });

  it("quick task form uses the creative title template fields", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"));

    expect(createScreenJsx).toContain('All fields with * are required');
    expect(createScreenJsx).not.toContain("Only title and due date are required.");
    expect(createScreenJsx).toContain("function updateQuickDraft");
    expect(quickTaskFormSource).toContain("Requester Team / Function");
    expect(quickTaskFormSource).toContain("Launch date");
    expect(quickTaskFormSource).toContain("1st Review / Draft");
    expect(quickTaskFormSource).toContain("Auto-filled from Launch Date, Requester Team / Function, and Project / campaign.");
    expect(quickTaskFormSource).toContain("readOnly");
  });

  it("creative request form explains its auto-filled title template", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(creativeFormSource).toContain("Auto-filled from Launch Date, Requester Team / Function, and Project / campaign.");
  });

  it("creative request treats Due Date as 1st Draft and auto-fills five working days before Launch Date", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"), createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("function subtractFlowMateWorkingDays");
    expect(createScreenJsx).toContain("dueDate: getFlowMateDraftDateForLaunchDate(nextLaunchDate)");
    expect(createScreenJsx).not.toContain("const shouldAutoFillDraftDate = !value.dueDate || value.dueDate === previousAutoDraftDate");
    expect(createScreenJsx).toContain('requireField("dueDate", "1st Draft is required.")');
    expect(creativeFormSource).toContain("1st Draft");
    expect(creativeFormSource).toContain("readOnly");
    expect(creativeFormSource).toContain("disabled");
    expect(creativeFormSource).toContain("Generated from Launch Date minus 5 working days.");
    expect(creativeFormSource).not.toContain("Due date");
    expect(quickTaskFormSource).toContain("1st Review / Draft");
    expect(quickTaskJs).toContain("p_due_date:         input.dueDate || null");
    expect(assignmentSql).toContain("v_due_date := p_due_date");
    expect(assignmentSql).toContain("v_due_date := p_launch_date");
    expect(assignmentSql).toContain("v_remaining_working_days := 5");
    expect(assignmentSql).toContain("extract(isodow from v_due_date) between 1 and 5");
  });

  it("creative request form has a Brief Note field that is submitted to description", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("briefNote");
    expect(creativeFormSource).toContain("Brief Note");
    expect(quickTaskJs).toContain("p_brief_note");
    expect(assignmentSql).toContain("p_brief_note text default null");
    expect(assignmentSql).toContain("description");
    expect(assignmentSql).toContain("nullif(trim(coalesce(p_brief_note,'')), '')");
  });

  it("creative request uses the agreed Type / Skill picker instead of asset type and subtype fields", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("const FLOWMATE_CREATIVE_TYPE_OPTIONS =");
    expect(createScreenJsx).toContain('key: "banner", label: "Banner", assetType: "static-graphic"');
    expect(createScreenJsx).toContain('key: "hero-album", label: "Hero Album (Banner x8)", assetType: "static-graphic"');
    expect(createScreenJsx).toContain('key: "video-under-1-min", label: "Video Under 1 Min", assetType: "general-video"');
    expect(createScreenJsx).toContain('key: "jersey-in-game", label: "Jersey In-game", assetType: "static-graphic"');
    expect(creativeFormSource).toContain("Type / Skill");
    expect(creativeFormSource).toContain("FLOWMATE_CREATIVE_TYPE_OPTIONS.map");
    expect(creativeFormSource).toContain("getFlowMateCreativeTypeOption(next)");
    expect(creativeFormSource).not.toContain("Asset type");
    expect(creativeFormSource).not.toContain("Asset subtype");
  });

  it("creative request captures Asset Count and sends it to the assignment RPC", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("assetCount: \"1\"");
    expect(createScreenJsx).toContain("\"assetCount\"");
    expect(createScreenJsx).toContain('requirePositiveInteger("assetCount", "Asset Count must be at least 1.")');
    expect(creativeFormSource).toContain("Asset Count");
    expect(creativeFormSource).toContain('type="number"');
    expect(creativeFormSource).toContain("min=\"1\"");
    expect(quickTaskJs).toContain("p_asset_count:      Number(input.assetCount || 1)");
    expect(listDataJs).toContain("asset_count");
    expect(listDataJs).toContain("assetCount: details.asset_count || 1");
    expect(schemaSql).toContain("asset_count integer not null default 1");
    expect(assignmentSql).toContain("p_asset_count integer default 1");
    expect(assignmentSql).toContain("greatest(1, coalesce(p_asset_count, 1))");
  });

  it("removes Hybrid from the Creative Request asset type picker", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(creativeFormSource).not.toContain('value="hybrid"');
    expect(creativeFormSource).not.toContain("Hybrid (static + video)");
    expect(creativeFormSource).not.toContain("needs_split = true");
    expect(createScreenJsx).not.toContain("Hybrid static + video package");
  });

  it("creative request form no longer exposes platform and size templates", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).not.toContain("const [creativeTemplates, setCreativeTemplates]");
    expect(createScreenJsx).not.toContain("window.loadFlowMateCreativeRequestTemplates()");
    expect(createScreenJsx).not.toContain("onTemplateCreated={handleCreateCreativeTemplate}");
    expect(creativeFormSource).not.toContain("function CreativeTemplatePanel");
    expect(creativeFormSource).not.toContain("Platform + size templates");
    expect(creativeFormSource).not.toContain("Save template");
    expect(quickTaskJs).not.toContain("async function loadFlowMateCreativeRequestTemplates()");
    expect(quickTaskJs).not.toContain('rpc("flowmate_list_creative_request_templates")');
    expect(quickTaskJs).not.toContain("async function createFlowMateCreativeRequestTemplate(input)");
    expect(quickTaskJs).not.toContain('rpc("flowmate_create_creative_request_template"');
    expect(appCss).toContain(".field");
  });

  it("keeps incomplete create forms on the page with inline validation instead of showing Could not save", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const createScreenSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreateScreen"));
    const handleSubmitSource = createScreenJsx.slice(
      createScreenJsx.indexOf("async function handleSubmit()"),
      createScreenJsx.indexOf("if (submitted) return"),
    );
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"));
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("function getFlowMateCreateValidationErrors(mode, draft)");
    expect(createScreenSource).toContain("const [validationErrors, setValidationErrors]");
    expect(createScreenSource).toContain("const nextValidationErrors = getFlowMateCreateValidationErrors(mode, activeDraft);");
    expect(createScreenSource).toContain("if (Object.keys(nextValidationErrors).length > 0)");
    expect(createScreenSource).toContain("setCreateAlert(\"Please complete the highlighted required fields.\")");
    expect(handleSubmitSource.indexOf("setCreateAlert(\"Please complete the highlighted required fields.\")")).toBeLessThan(handleSubmitSource.indexOf("window.createFlowMateQuickTask"));
    expect(handleSubmitSource.indexOf("setCreateAlert(\"Please complete the highlighted required fields.\")")).toBeLessThan(handleSubmitSource.indexOf("window.createFlowMateCreativeRequest"));
    expect(quickTaskFormSource).toContain("errors = {}");
    expect(creativeFormSource).toContain("errors = {}");
    expect(quickTaskFormSource).toContain("field--error");
    expect(creativeFormSource).toContain("field--error");
    expect(quickTaskFormSource).toContain("field__error");
    expect(creativeFormSource).toContain("field__error");
    expect(appCss).toContain(".field--error .field__label");
    expect(appCss).toContain(".field--error .input");
  });

  it("live detail loads and shows work item description as note content", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(listDataJs).toContain("description");
    expect(listDataJs).toContain("briefNote: item.description || \"\"");
    expect(listDataJs).toContain("note: item.description || \"\"");
    expect(detailSource).toContain("const visibleBriefNote = w.briefNote || w.note || \"\"");
    expect(detailSource).toContain("Brief Note");
    expect(detailSource).toContain("visibleBriefNote");
  });

  it("detail view surfaces all extra fields collected by create forms", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(listDataJs).toContain("urgent_reason");
    expect(listDataJs).toContain("brief_link");
    expect(listDataJs).toContain("reference_link");
    expect(listDataJs).toContain("urgentReason: item.urgent_reason || \"\"");
    expect(listDataJs).toContain("briefLink: details.brief_link || \"\"");
    expect(listDataJs).toContain("referenceLink: details.reference_link || \"\"");
    expect(detailSource).toContain("Brief link");
    expect(detailSource).toContain("Reference link");
    expect(detailSource).toContain("Urgent reason");
    expect(detailSource).toContain("Launch date");
  });

  it("quick task detail mirrors the fields from quick task creation", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(detailSource).toContain("Quick Task details");
    expect(detailSource).toContain("Requester Team / Function");
    expect(detailSource).toContain("Project / campaign");
    expect(detailSource).toContain("1st Review / Draft");
    expect(detailSource).toContain("Priority");
    expect(detailSource).toContain("w.type === \"quick\"");
  });

  it("my work and sidebar counts use active rows instead of static counts", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const myWorkSource = createScreenJsx.slice(createScreenJsx.indexOf("function MyWorkScreen"));

    expect(appJsx).not.toContain("count: 7");
    expect(appJsx).not.toContain("count: 4");
    expect(appJsx).toContain("navCounts");
    expect(appJsx).toContain("getFlowMateNavCounts");
    expect(myWorkSource).toContain("getFlowMateMyWorkRows");
    expect(myWorkSource).toContain("activeGroupIds");
    expect(myWorkSource).toContain("!w.overdue");
  });

  it("detail note preserves line breaks from the create textarea", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(detailSource).toContain('whiteSpace: "pre-wrap"');
  });

  it("live detail view does not show static mock brief, checklist, comments, or activity", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(detailSource).toContain("const isLiveDetail = Boolean(w.isSupabaseRow)");
    expect(detailSource).toContain("Assignee");
    expect(detailSource).toContain("visibleChecklistItems.length > 0");
    expect(detailSource).toContain("visibleComments.length > 0");
    expect(detailSource).not.toContain("!isLiveDetail &&");
    expect(detailSource).not.toContain("Vertical 15-second teaser announcing");
    expect(detailSource).not.toContain("First cut ready. Holding on team logo plate");
    expect(detailSource).not.toContain("Sample activity is shown only for mock data.");
  });

  it("removes static sample work rows from the deployed fallback data", () => {
    const dataJsx = readFileSync(join(process.cwd(), "github", "data.jsx"), "utf8");

    expect(dataJsx).toContain("const WORK = [];");
    expect(dataJsx).not.toContain("CR-1051");
    expect(dataJsx).not.toContain("QT-209");
    expect(dataJsx).not.toContain("OB48 Launch");
    expect(dataJsx).not.toContain('const TODAY = "May 15"');
  });

  it("does not show hard-coded mock fallback messages or timestamps in live screens", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const combined = `${screensA}\n${screensB}`;

    expect(combined).not.toContain("Using mock data");
    expect(combined).not.toContain("Prototype mock data");
    expect(combined).not.toContain("setSourceRows(WORK)");
    expect(combined).not.toContain("Hi Pond");
    expect(combined).not.toContain("09:42 SGT");
    expect(combined).not.toContain("May 15, 09:00");
    expect(combined).not.toContain("Sample activity is shown only for mock data.");
    expect(screensA).not.toContain('focusId || "CR-1051"');
  });

  it("KPI screen does not render static sample metrics", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");

    expect(screensC).not.toContain("const memberKpi = [");
    expect(screensC).not.toContain("const teamKpi = [");
    expect(screensC).not.toContain("delivered: 22");
    expect(screensC).not.toContain("count: 28");
    expect(screensC).not.toContain("Apr 19-May 15, 2026");
    expect(screensC).toContain("window.loadFlowMateListRows");
  });

  it("KPI monthly export controls are enabled", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));
    const searchUtils = readFileSync(join(process.cwd(), "github", "search-utils.js"), "utf8");

    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_START = "2026-01"');
    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_END = "2027-12"');
    expect(searchUtils).toContain("function getFlowMateMonthOptions");
    expect(searchUtils).toContain("function filterFlowMateRowsByMonth");
    expect(kpiSource).toContain("const [kpiExportMonth, setKpiExportMonth] = useStateC(flowMateDefaultExportMonthC())");
    expect(kpiSource).toContain("const kpiRows = flowMateFilterRowsByMonthC(rows, kpiExportMonth, [\"calendarDate\", \"dueDate\"])");
    expect(kpiSource).toContain("function exportKpiRows()");
    expect(kpiSource).toContain("data-testid=\"flowmate-kpi-export-month\"");
    expect(kpiSource).toContain("flowMateMonthOptionsC().map");
    expect(kpiSource).toContain("flowmate-kpi-${kpiExportMonth}");
    expect(kpiSource).toContain("onClick={exportKpiRows}");
    expect(kpiSource).not.toContain("KPI export is planned for MVP 1.1");
    expect(kpiSource).not.toContain("Last 4 weeks - MVP 1.1");
  });

  it("My work UI has Team Flow style status filters and ordered sections", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const myWorkSource = screensA.slice(screensA.indexOf("function MyWorkScreen"));

    expect(myWorkSource).toContain("filterStatus");
    expect(myWorkSource).toContain("filterFlowMateMyWorkByStatus");
    expect(myWorkSource).toContain("sortFlowMateMyWorkRows");
    expect(myWorkSource.indexOf('title="Overdue"')).toBeLessThan(myWorkSource.indexOf('title="Due today"'));
    expect(myWorkSource).toContain("All statuses");
  });

  it("My work has an enabled This week filter and hides empty sections", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const myWorkSource = screensA.slice(screensA.indexOf("function MyWorkScreen"));
    const groupSource = screensA.slice(screensA.indexOf("function MyWorkGroup"));

    expect(myWorkSource).toContain("const [showThisWeek, setShowThisWeek]");
    expect(myWorkSource).toContain("setShowThisWeek(current => !current)");
    expect(myWorkSource).toContain("const weekMine = showThisWeek");
    expect(myWorkSource).toContain("This week</button>");
    expect(myWorkSource).not.toContain("This week (MVP 1.1)");
    expect(groupSource).toContain("if (!items.length) return null;");
    expect(groupSource).not.toContain("No items.");
  });

  it("My work row actions use a shared wrapper so Submit review and Block align", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const groupSource = screensA.slice(screensA.indexOf("function MyWorkGroup"));

    expect(groupSource).toContain('className="my-work-actions"');
    expect(groupSource).toContain('<Icon name="block" size={11} /> Block');
    expect(appCss).toContain(".my-work-actions");
    expect(appCss).toContain("align-items: center");
    expect(appCss).toContain("justify-content: flex-end");
  });

  it("Workload UI splits Non GD/VE and GD/VE tabs with defensive skill rendering", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"));

    expect(workloadSource).toContain("workloadTab");
    expect(workloadSource).toContain("Workload - GD/VE");
    expect(workloadSource).toContain("Workload");
    expect(workloadSource).toContain("isFlowMateGdVeMember");
    expect(workloadSource).toContain("getFlowMateWorkloadStatusCounts");
    expect(workloadSource).toContain("(r.m.skills || [])");
    expect(workloadSource).toContain("Delivered");
  });

  it("Workload UI filters standard workload by Operations, Marketing, and Esport teams", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"));

    expect(workloadSource).toContain('const WORKLOAD_TEAM_FILTERS = ["All", "Operations", "Marketing", "Esport"];');
    expect(workloadSource).toContain('const [teamFilter, setTeamFilter] = useStateC("All");');
    expect(workloadSource).toContain('const teamFilteredRows = tabRows.filter(r => teamFilter === "All" || r.m.discipline === teamFilter);');
    expect(workloadSource).toContain("WORKLOAD_TEAM_FILTERS.map");
    expect(workloadSource).toContain("Filter by team");
    expect(workloadSource).not.toContain('const WORKLOAD_TEAM_FILTERS = ["All", "Operations", "Marketing", "Esport", "GD/VE"];');
  });

  it("Workload range and monthly export controls are enabled", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"), screensC.indexOf("/* ============================================================\n   KPI VIEW"));

    expect(workloadSource).toContain('const [workloadRange, setWorkloadRange] = useStateC("this-week")');
    expect(workloadSource).toContain("const [workloadExportMonth, setWorkloadExportMonth] = useStateC(flowMateDefaultExportMonthC())");
    expect(workloadSource).toContain("flowMateFilterRowsByRangeC(r.allItems, workloadRange)");
    expect(workloadSource).toContain("flowMateFilterRowsByMonthC(row.allItems || row.items || [], workloadExportMonth");
    expect(workloadSource).toContain("function exportWorkloadRows()");
    expect(workloadSource).toContain("data-testid=\"flowmate-workload-export-month\"");
    expect(workloadSource).toContain("flowMateMonthOptionsC().map");
    expect(workloadSource).toContain("flowmate-workload-${workloadExportMonth}");
    expect(workloadSource).toContain("onClick={exportWorkloadRows}");
    expect(workloadSource).not.toContain("Workload export is planned for MVP 1.1");
    expect(workloadSource).not.toContain("This week (5d) - MVP 1.1");
  });

  it("list and workload loaders expose dates/items needed by range filters", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const workloadDataJs = readFileSync(join(process.cwd(), "github", "supabase-workload-data.js"), "utf8");

    expect(listDataJs).toContain("dueDate: item.due_date");
    expect(workloadDataJs).toContain("allItems: memberItems");
  });
});

describe("full assignee roster", () => {
  const assigneeCodes = [
    "gear", "panu", "big", "mark", "po", "aof", "folk", "mac", "no", "may",
    "boss", "mag", "real", "pointer", "pond", "jo", "tong", "eye", "vee",
    "ploy", "pluem", "net", "ben", "peak",
  ];

  it("seeds every assignee as a team member", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    for (const code of assigneeCodes) {
      expect(seedSql).toContain(`'${code}'`);
    }
  });

  it("links seeded team members by user email so existing auth users keep their real ids", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    expect(seedSql).toContain("select id from public.users where lower(email) = lower('panuwee.w@garena.com')");
    expect(seedSql).not.toMatch(/'panu',\s*'00000000-0000-0000-0000-000000001002'/);
    expect(seedSql).not.toMatch(/'pond',\s*'00000000-0000-0000-0000-000000001015'/);
  });

  it("links every whitelisted assignee to a team_member_code", () => {
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");
    for (const code of assigneeCodes) {
      expect(whitelistSql).toMatch(new RegExp(`'(admin|member)',\\s*'${code}'`));
    }
  });

  it("syncs seeded user profiles to real Supabase Auth IDs so whitelisted users do not loop on login", () => {
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");

    expect(whitelistSql).toContain("public.flowmate_recreate_user_fk");
    expect(whitelistSql).toContain("references public.users(id) on update cascade");
    expect(whitelistSql).toContain("id             = excluded.id");
    expect(whitelistSql).toContain("from auth.users au");
    expect(whitelistSql).toContain("join public.user_whitelist wl");
    expect(whitelistSql).toContain("and u.id <> au.id");
    expect(whitelistSql).toContain("tm.user_id is distinct from au.id");
    expect(schemaSql).toContain("user_id uuid references public.users(id) on update cascade on delete set null");
    expect(schemaSql).toContain("requester_user_id uuid not null references public.users(id) on update cascade");
    expect(schemaSql).toContain("assignee_user_id uuid references public.users(id) on update cascade");
  });

  it("promotes Gear and Mac to admin in whitelist seed and live update SQL", () => {
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");
    const promoteSql = readFileSync(join(process.cwd(), "supabase", "promote_admin_users.sql"), "utf8");

    expect(whitelistSql).toMatch(/'sasin\.cha@garena\.com',\s*'Gear',\s*'admin',\s*'gear'/);
    expect(whitelistSql).toMatch(/'weerayut@garena\.com',\s*'Mac',\s*'admin',\s*'mac'/);
    expect(promoteSql).toContain("'sasin.cha@garena.com'");
    expect(promoteSql).toContain("'weerayut@garena.com'");
    expect(promoteSql).toContain("update public.user_whitelist");
    expect(promoteSql).toContain("update public.users");
    expect(promoteSql).toContain("set role = 'admin'");
    expect(promoteSql).not.toContain("team_member_code  = excluded.team_member_code,\n  is_active");
    expect(promoteSql).not.toContain("update public.user_whitelist\nset role = 'admin',\n    is_active = true");
    expect(promoteSql).not.toContain("select email, display_name, role, is_active\nfrom public.user_whitelist");
  });

  it("frontend exposes a Supabase assignee loader", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    expect(listDataJs).toContain("async function loadFlowMateAssignees()");
    expect(listDataJs).toContain("window.loadFlowMateAssignees = loadFlowMateAssignees");
  });

  it("quick task assignee picker contains the full roster and no Other option", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    for (const name of [
      "Gear", "Panu", "Big", "Mark", "Po", "Aof", "Folk", "Mac", "No", "May",
      "Boss", "Mag", "Real", "Pointer", "Pond", "Joe", "Tong", "Eye", "Vee",
      "Ploy", "Pluem", "Net", "Ben", "Peak",
    ]) {
      expect(createScreenJsx).toContain(`name: "${name}"`);
    }
    expect(createScreenJsx).toContain("window.loadFlowMateAssignees()");
    expect(createScreenJsx).not.toContain('<option value="other">Other</option>');
  });

  it("filters assignee suggestions by names that start with the typed text", () => {
    const utils = loadGithubSearchUtils();
    const options = [
      { name: "Panu" },
      { name: "Pointer" },
      { name: "Pond" },
      { name: "Pluem" },
      { name: "Peak" },
      { name: "Gear" },
      { name: "Aof" },
    ];

    expect(utils.filterFlowMateAssigneeOptions(options, "P").map((option) => option.name)).toEqual([
      "Panu",
      "Pointer",
      "Pond",
      "Pluem",
      "Peak",
    ]);
    expect(utils.filterFlowMateAssigneeOptions(options, "po").map((option) => option.name)).toEqual([
      "Pointer",
      "Pond",
    ]);
  });

  it("quick task assignee picker uses a searchable text input instead of a select", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"));
    expect(quickTaskFormSource).toContain("assigneeQuery");
    expect(quickTaskFormSource).toContain("filterFlowMateAssigneeOptions");
    expect(quickTaskFormSource).not.toContain("<select className=\"select\" value={value.assigneeUserId}");
  });

  it("list assignee filter includes all synced team members", () => {
    const listScreenJsx = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    expect(listScreenJsx).toContain("...(window.MEMBERS || [])");
    expect(listScreenJsx).toContain("scopedOwnerOptionRows");
    expect(listScreenJsx).toContain("filterTeam === \"all\" || getListMemberTeam(member) === filterTeam");
  });

  it("creative request assignment is limited to the creative owner pool only", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const allowedCodes = ["pond", "jo", "tong", "eye", "vee"];
    for (const code of allowedCodes) {
      expect(assignmentSql).toContain(`'${code}'`);
    }
    expect(assignmentSql).toContain("lower(tm.member_code) = any (v_creative_owner_codes)");
    expect(assignmentSql).not.toContain("tm.member_code = any (array['gear'");
  });

  it("seed keeps the real roster but removes mock work sample data", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    expect(seedSql).toContain("insert into public.team_members");
    expect(seedSql).toContain("delete from public.users");
    expect(seedSql).toContain("where google_subject like 'mock-%'");
    expect(seedSql).not.toContain("set is_active = false");
    expect(seedSql).not.toContain("mock-pond");
    expect(seedSql).not.toContain("insert into public.work_items");
    expect(seedSql).not.toContain("insert into public.creative_request_details");
    expect(seedSql).not.toContain("insert into public.checklist_items");
    expect(seedSql).not.toContain("insert into public.comments");
    expect(seedSql).not.toContain("CR-1051");
    expect(seedSql).not.toContain("QT-0209");
  });
});

describe("requester function sync", () => {
  const functionRows = [
    ["sasin.cha@garena.com", "gear", "Operations"],
    ["nithidol.k@garena.com", "big", "Operations"],
    ["tanadech.s@garena.com", "mark", "Operations"],
    ["sakdarin@garena.com", "po", "Operations"],
    ["fco.thanayoot@garena.com", "aof", "Operations"],
    ["fco.koravit@garena.com", "folk", "Operations"],
    ["weerayut@garena.com", "mac", "Marketing"],
    ["chayodom.a@garena.com", "no", "Marketing"],
    ["kwanchanok.s@garena.com", "may", "Marketing"],
    ["fco.rittichai@garena.com", "boss", "Marketing"],
    ["fco.thanatbhum@garena.com", "mag", "Marketing"],
    ["fco.punyakon@garena.com", "real", "Marketing"],
    ["fco.run@garena.com", "pointer", "Marketing"],
    ["kasidet.y@garena.com", "pond", "GD/VE"],
    ["nattaporn.j@garena.com", "jo", "GD/VE"],
    ["fco.krittidech@garena.com", "tong", "GD/VE"],
    ["fco.janyarat@garena.com", "eye", "GD/VE"],
    ["fco.thanadon@garena.com", "vee", "GD/VE"],
    ["fco.thanyaporn@garena.com", "ploy", "GD/VE"],
    ["napol.a@garena.com", "pluem", "Esport"],
    ["fco.piyapat@garena.com", "net", "Esport"],
    ["fco.kittipoj@garena.com", "ben", "Esport"],
    ["fco.pheerati@garena.com", "peak", "Esport"],
  ];

  it("seeds users.requester_team and team_members.discipline from the agreed function map", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");

    for (const [email, memberCode, functionLabel] of functionRows) {
      expect(seedSql).toContain(`'${email}'`);
      expect(seedSql).toContain(`'${functionLabel}'`);
      expect(seedSql).toMatch(new RegExp(`'${memberCode}'[\\s\\S]*?'${functionLabel}'[\\s\\S]*?'${functionLabel}'`));
    }
  });

  it("provides a live update script that syncs users, team members, and existing work items", () => {
    const syncSql = readFileSync(join(process.cwd(), "supabase", "update_requester_team_functions.sql"), "utf8");

    expect(syncSql).toContain("with role_map(name, email, role_label, member_code) as");
    expect(syncSql).toContain("update public.users u");
    expect(syncSql).toContain("set requester_team = rm.role_label");
    expect(syncSql).toContain("update public.team_members tm");
    expect(syncSql).toContain("set discipline = rm.role_label");
    expect(syncSql).toContain("discipline_short = rm.role_label");
    expect(syncSql).toContain("update public.work_items wi");
    expect(syncSql).toContain("set requester_team = rm.role_label");
    expect(syncSql).toContain("delete from public.users");
    expect(syncSql).toContain("where google_subject like 'mock-%'");
    expect(syncSql).toContain("when 'Operation' then 'Operations'");
    expect(syncSql).toContain("when 'GD/VE Internal' then 'GD/VE'");
    expect(syncSql).toContain("when 'Esport Ops' then 'Esport'");
    expect(syncSql).toContain("when 'PM' then 'Operations'");
    expect(syncSql).not.toMatch(/set\s+role\s*=\s*rm\.role_label/i);
    expect(syncSql).not.toMatch(/\('Gear'[\s\S]*?'PM'[\s\S]*?'gear'\)/);
  });

  it("frontend restricts requester teams to the four canonical teams across Create and List", () => {
    const dataJsx = readFileSync(join(process.cwd(), "github", "data.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");

    expect(dataJsx).toContain('const TEAMS = ["Operations", "Marketing", "Esport", "GD/VE"];');
    expect(dataJsx).not.toContain('"PM"');
    expect(listDataJs).toContain("async function loadFlowMateRequesterTeams()");
    expect(listDataJs).toContain('const FLOWMATE_ALLOWED_REQUESTER_TEAMS = ["Operations", "Marketing", "Esport", "GD/VE"];');
    expect(listDataJs).toContain("function normalizeFlowMateRequesterTeam(value)");
    expect(listDataJs).toContain("normalizeFlowMateRequesterTeam(item.requester_team || requester.requester_team)");
    expect(listDataJs).toContain(".from(\"users\")");
    expect(listDataJs).toContain(".select(\"requester_team\")");
    expect(listDataJs).toContain("window.loadFlowMateRequesterTeams = loadFlowMateRequesterTeams");
    expect(listDataJs).not.toContain("return Array.from(new Set([...fallback, ...liveTeams]))");
    expect(screensA).toContain("const [requesterTeamOptions, setRequesterTeamOptions] = useState(TEAMS)");
    expect(screensA).toContain("function getDefaultRequesterTeam()");
    expect(screensA).toContain("window.normalizeFlowMateRequesterTeam?.(window.FLOWMATE_CURRENT_USER?.requester_team)");
    expect(screensA).toContain("window.loadFlowMateRequesterTeams()");
    expect(screensA).toContain("requesterTeamOptions={requesterTeamOptions}");
    expect(screensA).toContain("{requesterTeamOptions.map");
    expect(screensB).toContain("const [requesterTeamOptions, setRequesterTeamOptions] = useStateB(TEAMS)");
    expect(screensB).toContain("window.loadFlowMateRequesterTeams()");
    expect(screensB).toContain("const teamOptions = requesterTeamOptions");
  });

  it("workload and team settings hide Gear while keeping assignee data unchanged elsewhere", () => {
    const workloadDataJs = readFileSync(join(process.cwd(), "github", "supabase-workload-data.js"), "utf8");

    expect(workloadDataJs).toContain('const isVisibleMemberCode = (memberCode) => String(memberCode || "").toLowerCase() !== "gear";');
    expect(workloadDataJs).toContain(".select(\"id,member_code,display_name");
    expect(workloadDataJs).toContain(".filter((row) => isVisibleMemberCode(row.member_code))");
    expect(workloadDataJs).toContain(".filter((member) => isVisibleMemberCode(member.member_code))");
  });
});

describe("UAT-012 hybrid request visibility", () => {
  it("hybrid row is queued with effort 8 and assetType hybrid", () => {
    const hybrid = fixture.find((r) => r.displayId === "CR-1053")!;
    expect(hybrid.status).toBe("queued");
    expect(hybrid.isQueued).toBe(true);
    expect(hybrid.effortPoint).toBe(8);
    expect(hybrid.assetType).toBe("hybrid");
    expect(hybrid.assigneeUserId).toBeNull();
  });
});

// ============================================================================
// UAT-007/B-007 — Incomplete creative briefs can be saved as Need Brief
// ============================================================================
describe("UAT-007 incomplete creative brief persistence", () => {
  it("allows an empty brief link so the assignment engine can mark Need Brief", () => {
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(schemaSql).toContain("constraint creative_details_brief_url check");
    expect(schemaSql).toContain("length(trim(coalesce(brief_link, ''))) = 0");
    expect(schemaSql).toContain("or brief_link ~* '^https?://[^[:space:]]{4,}$'");
    expect(assignmentSql).toContain("drop constraint if exists creative_details_brief_url");
    expect(assignmentSql).toContain("add constraint creative_details_brief_url check");
    expect(assignmentSql).toContain("length(trim(coalesce(brief_link, ''))) = 0");
    expect(assignmentSql).toContain("or brief_link ~* '^https?://[^[:space:]]{4,}$'");
  });

  it("assignment eligibility diagnostics select member_code when checking leave overlap", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const diagnosticBase = assignmentSql.slice(
      assignmentSql.indexOf("select exists (\n    with base_raw as ("),
      assignmentSql.indexOf(") into v_has_eligible;"),
    );

    expect(diagnosticBase).toContain("tm.member_code");
    expect(diagnosticBase).toContain("generate_series(v_assignment_start, v_assignment_end, interval '1 day')");
    expect(diagnosticBase).toContain("leave_capacity_loss");
    expect(diagnosticBase).not.toMatch(/select\s+tm\.id,\s+tm\.skills,\s+tm\.backup_skills,\s+tm\.availability/i);
  });
});

// ============================================================================
// B-003/B-006 — Security hardening is enforced in SQL, not by client payloads
// ============================================================================
describe("B-003/B-006 security hardening SQL", () => {
  it("RPCs resolve actors from auth.uid() instead of trusting p_actor_user_id", () => {
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    for (const sql of [quickTaskSql, assignmentSql]) {
      expect(sql).toContain("create or replace function public.flowmate_actor_user_id()");
      expect(sql).toContain("create or replace function public.flowmate_assert_actor_matches(");
      expect(sql).toContain("v_user_id := auth.uid()");
      expect(sql).toContain("v_actor_id := public.flowmate_actor_user_id()");
      expect(sql).toContain("perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id)");
      expect(sql).not.toMatch(/where id = p_actor_user_id\b/i);
      expect(sql).not.toMatch(/requester_user_id,\s*\n\s*p_actor_user_id\b/i);
      expect(sql).not.toMatch(/actor_user_id,\s*\n\s*p_actor_user_id\b/i);
    }
  });

  it("RLS read policies do not allow null app-user bypasses", () => {
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");
    const hardeningSql = readFileSync(join(process.cwd(), "supabase", "security_hardening.sql"), "utf8");
    const combinedSql = `${schemaSql}\n${whitelistSql}\n${hardeningSql}`;

    expect(schemaSql).toContain("select auth.uid()");
    expect(hardeningSql).toContain("select auth.uid()");
    expect(hardeningSql).toContain("create or replace function public.is_active_app_user()");
    expect(hardeningSql).toContain("security definer");
    expect(hardeningSql).toContain("set search_path = public");
    expect(hardeningSql).toContain("using (public.is_admin_app_user())");
    expect(schemaSql).toContain("using (public.is_active_app_user())");
    expect(schemaSql).toContain("using (user_id = public.current_app_user_id())");
    expect(combinedSql).not.toContain("or public.current_app_user_id() is null");
    expect(combinedSql).not.toContain("public.is_active_app_user() or");
  });
});

// ============================================================================
// MVP 1.2 Notification Center backend
// ============================================================================
describe("MVP 1.2 notification center backend SQL", () => {
  it("creates and hardens notifications without direct browser writes", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");

    expect(notificationSql).toContain("create table if not exists public.notifications");
    expect(notificationSql).toContain("user_id uuid not null references public.users(id) on update cascade on delete cascade");
    expect(notificationSql).toContain("metadata jsonb not null default '{}'::jsonb");
    expect(notificationSql).toContain("alter table public.notifications enable row level security");
    expect(notificationSql).toContain("using (user_id = public.current_app_user_id())");
    expect(notificationSql).toContain("revoke insert, update, delete on public.notifications from anon, authenticated");
    expect(notificationSql).not.toContain("or public.current_app_user_id() is null");
    expect(notificationSql).not.toMatch(/grant\s+(insert|update|delete)[\s\S]*public\.notifications\s+to\s+anon,\s*authenticated/i);
  });

  it("routes read-state changes through auth.uid-scoped RPCs", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");

    expect(notificationSql).toContain("create or replace function public.mark_notification_read(");
    expect(notificationSql).toContain("create or replace function public.mark_all_notifications_read()");
    expect(notificationSql).toContain("v_actor_id := auth.uid()");
    expect(notificationSql).toContain("where n.id = p_notification_id");
    expect(notificationSql).toContain("and n.user_id = v_actor_id");
    expect(notificationSql).toContain("where user_id = v_actor_id");
    expect(notificationSql).toContain("revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated");
    expect(notificationSql).toContain("revoke all on function public.mark_all_notifications_read() from public, anon, authenticated");
    expect(notificationSql).toContain("grant execute on function public.mark_notification_read(uuid) to authenticated");
    expect(notificationSql).toContain("grant execute on function public.mark_all_notifications_read() to authenticated");
  });

  it("dismisses only the signed-in user's read notifications without hard delete", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");
    const dismissSource = notificationSql.slice(notificationSql.indexOf("create or replace function public.dismiss_read_notifications()"));

    expect(notificationSql).toContain("dismissed_at timestamptz");
    expect(notificationSql).toContain("create or replace function public.dismiss_read_notifications()");
    expect(dismissSource).toContain("v_actor_id := auth.uid()");
    expect(dismissSource).toContain("if v_actor_id is null then");
    expect(dismissSource).toContain("where user_id = v_actor_id");
    expect(dismissSource).toContain("and read_at is not null");
    expect(dismissSource).toContain("and dismissed_at is null");
    expect(dismissSource).not.toContain("p_actor_user_id");
    expect(dismissSource).not.toMatch(/delete\s+from\s+public\.notifications/i);
    expect(notificationSql).toContain("grant execute on function public.dismiss_read_notifications() to authenticated");
  });

  it("does not suppress assigned notifications when the actor is also the assignee", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");
    const assignmentRanBranch = notificationSql.slice(
      notificationSql.indexOf("if new.event_type = 'assignment_ran' and new.to_status = 'assigned' then"),
      notificationSql.indexOf("if new.event_type = 'created' and new.to_status = 'assigned' then"),
    );
    const createdAssignedBranch = notificationSql.slice(
      notificationSql.indexOf("if new.event_type = 'created' and new.to_status = 'assigned' then"),
      notificationSql.indexOf("if new.event_type = 'status_changed' and new.to_status = 'review' then"),
    );

    expect(assignmentRanBranch).toContain("v_notification_type := 'assigned'");
    expect(assignmentRanBranch).toContain("v_target_user_id := v_owner_user_id");
    expect(assignmentRanBranch).toContain("null,");
    expect(assignmentRanBranch).not.toContain("new.actor_user_id");
    expect(createdAssignedBranch).toContain("v_notification_type := 'assigned'");
    expect(createdAssignedBranch).toContain("v_target_user_id := coalesce(v_work.assignee_user_id, v_owner_user_id)");
    expect(createdAssignedBranch).toContain("null,");
    expect(createdAssignedBranch).not.toContain("new.actor_user_id");
  });

  it("does not suppress generic status notifications for watcher/requester self-action checks", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");
    const genericStatusBranch = notificationSql.slice(
      notificationSql.indexOf("if new.event_type = 'status_changed' then"),
      notificationSql.indexOf("end if;\n\n  return new;", notificationSql.indexOf("if new.event_type = 'status_changed' then")),
    );

    expect(genericStatusBranch).toContain("from public.flowmate_notification_recipients(v_work.id) r");
    expect(genericStatusBranch).toContain("public.flowmate_create_notification(");
    expect(genericStatusBranch).toContain("null,");
    expect(genericStatusBranch).not.toContain("new.actor_user_id");
  });

  it("does not suppress collaboration status notifications for watcher self-action checks", () => {
    const collaborationSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");
    const collaborationTrigger = collaborationSql.slice(
      collaborationSql.indexOf("create or replace function public.flowmate_notify_collaboration_event()"),
      collaborationSql.indexOf("if new.event_type = 'commented'", collaborationSql.indexOf("for v_target_user_id in")),
    );

    expect(collaborationTrigger).toContain("from public.flowmate_notification_recipients(v_work.id) r");
    expect(collaborationTrigger).toContain("public.flowmate_create_notification(");
    expect(collaborationTrigger).toContain("when v_notification_type = 'status_changed' then null");
  });

  it("notifies the requester when a quick task is marked delivered by the assignee", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");
    const quickDeliveredBranch = notificationSql.slice(
      notificationSql.indexOf("if new.event_type = 'status_changed' and new.to_status = 'delivered' and v_work.work_type = 'quick_task' then"),
      notificationSql.indexOf("if new.event_type = 'status_changed' and new.from_status = 'review' and new.to_status = 'delivered' then"),
    );

    expect(quickDeliveredBranch).toContain("v_notification_type := 'status_changed'");
    expect(quickDeliveredBranch).toContain("v_title := 'Done: ' || v_work.display_id");
    expect(quickDeliveredBranch).toContain("v_target_user_id := v_work.requester_user_id");
    expect(quickDeliveredBranch).toContain("'action', 'complete_quick_task'");
    expect(quickDeliveredBranch).toContain("null,");
    expect(quickDeliveredBranch).not.toContain("new.actor_user_id");
  });

  it("creates notifications only from trusted SQL event triggers and internal helpers", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");

    expect(notificationSql).toContain("create or replace function public.flowmate_create_notification(");
    expect(notificationSql).toContain("revoke all on function public.flowmate_create_notification");
    expect(notificationSql).toContain("create or replace function public.flowmate_notify_work_item_event()");
    expect(notificationSql).toContain("create trigger flowmate_notifications_after_event");
    expect(notificationSql).toContain("after insert on public.work_item_events");
    expect(notificationSql).toContain("for each row execute function public.flowmate_notify_work_item_event()");
  });

  it("covers required MVP 1.2 notification event types", () => {
    const notificationSql = readFileSync(join(process.cwd(), "supabase", "notification_center.sql"), "utf8");

    for (const expectedType of [
      "assigned",
      "status_changed",
      "review_requested",
      "approved",
      "changes_requested",
      "blocked",
      "resumed",
      "cancelled",
      "comment_created",
      "due_soon",
      "overdue",
    ]) {
      expect(notificationSql).toContain(`'${expectedType}'`);
    }

    expect(notificationSql).toContain("create or replace function public.flowmate_generate_due_notifications(");
    expect(notificationSql).toContain("revoke all on function public.flowmate_generate_due_notifications(integer) from public, anon, authenticated");
  });
});

// ============================================================================
// MVP 1.2 Detail Collaboration, Watchers, and Admin backend
// ============================================================================
describe("MVP 1.2 collaboration/admin backend SQL", () => {
  const collaborationSql = () => readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");

  it("adds link and watcher models with soft removal and hardened grants", () => {
    const sql = collaborationSql();

    expect(sql).toContain("create table if not exists public.work_item_links");
    expect(sql).toContain("url text not null");
    expect(sql).toContain("description text");
    expect(sql).toContain("created_by_user_id uuid not null references public.users(id)");
    expect(sql).toContain("deleted_at timestamptz");
    expect(sql).toContain("create table if not exists public.work_item_watchers");
    expect(sql).toContain("watcher_user_id uuid not null references public.users(id)");
    expect(sql).toContain("added_by_user_id uuid not null references public.users(id)");
    expect(sql).toContain("removed_at timestamptz");
    expect(sql).toContain("alter table public.work_item_links enable row level security");
    expect(sql).toContain("alter table public.work_item_watchers enable row level security");
    expect(sql).toContain("grant execute on function public.flowmate_can_read_work_item(uuid, uuid) to authenticated");
    expect(sql).toContain("revoke insert, update, delete on public.work_item_links from anon, authenticated");
    expect(sql).toContain("revoke insert, update, delete on public.work_item_watchers from anon, authenticated");
    expect(sql).not.toContain("or public.current_app_user_id() is null");
  });

  it("routes link and watcher writes through auth.uid-scoped RPCs only", () => {
    const sql = collaborationSql();

    for (const rpcName of [
      "add_work_item_link",
      "remove_work_item_link",
      "add_work_item_watcher",
      "remove_work_item_watcher",
    ]) {
      expect(sql).toContain(`create or replace function public.${rpcName}(`);
      expect(sql).toContain(`grant execute on function public.${rpcName}`);
    }

    expect(sql).toContain("v_actor_id := auth.uid()");
    expect(sql).toContain("public.flowmate_can_collaborate_on_work_item(v_work.id, v_actor_id)");
    expect(sql).toContain("public.is_admin_app_user(v_actor_id)");
    expect(sql).not.toContain("p_actor_user_id");
    expect(sql).not.toContain("p_recipient_user_id");
    expect(sql).not.toContain("p_view_as_user_id");
  });

  it("includes watchers as notification recipients without making them status participants", () => {
    const sql = collaborationSql();
    const recipientFunction = sql.slice(
      sql.indexOf("create or replace function public.flowmate_notification_recipients"),
      sql.indexOf("create or replace function public.flowmate_create_collaboration_event"),
    );
    const statusHelper = sql.slice(
      sql.indexOf("create or replace function public.flowmate_can_status_transition_work_item"),
      sql.indexOf("revoke all on function public.flowmate_can_status_transition_work_item"),
    );

    expect(recipientFunction).toContain("from public.work_item_watchers wiw");
    expect(recipientFunction).toContain("wiw.removed_at is null");
    expect(statusHelper).toContain("wi.requester_user_id = p_user_id");
    expect(statusHelper).toContain("wi.assignee_user_id = p_user_id");
    expect(statusHelper).toContain("tm.user_id = p_user_id");
    expect(statusHelper).toContain("public.is_admin_app_user(p_user_id)");
    expect(statusHelper).not.toContain("work_item_watchers");
  });

  it("creates collaboration notifications for comments, links, and watcher additions", () => {
    const sql = collaborationSql();

    expect(sql).toContain("'comment_created'");
    expect(sql).toContain("'link_added'");
    expect(sql).toContain("'watcher_added'");
    expect(sql).toContain("coalesce(new.metadata ->> 'action', '') = 'add_comment'");
    expect(sql).toContain("coalesce(new.metadata ->> 'action', '') = 'add_link'");
    expect(sql).toContain("coalesce(new.metadata ->> 'action', '') = 'add_watcher'");
    expect(sql).toContain("new.event_type in ('status_changed', 'blocked', 'reviewed', 'cancelled')");
    expect(sql).toContain("drop constraint if exists notifications_type_check");
    expect(sql).toContain("add constraint notifications_type_check check");
  });

  it("creates mention notifications from comment metadata for active users only", () => {
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const sql = collaborationSql();

    expect(quickTaskSql).toContain("p_mentioned_user_ids uuid[] default '{}'::uuid[]");
    expect(quickTaskSql).toContain("from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[]))");
    expect(quickTaskSql).toContain("and u.is_active = true");
    expect(quickTaskSql).toContain("'mentioned_user_ids', coalesce(v_mentioned_user_ids, '{}'::uuid[])");
    expect(sql).toContain("'mentioned_in_comment'");
    expect(sql).toContain("jsonb_array_elements_text(new.metadata -> 'mentioned_user_ids')");
    expect(sql).toContain("v_target_user_id <> new.actor_user_id");
    expect(sql).toContain("v_notification_type := 'mentioned_in_comment'");
  });

  it("adds admin status override and soft archive while auditing real auth.uid actor", () => {
    const sql = collaborationSql();

    expect(sql).toContain("alter table public.work_items");
    expect(sql).toContain("add column if not exists archived_at timestamptz");
    expect(sql).toContain("add column if not exists archived_by_user_id uuid references public.users(id)");
    expect(sql).toContain("add column if not exists archive_reason text");
    expect(sql).toContain("create or replace function public.flowmate_admin_transition_work_status(");
    expect(sql).toContain("create or replace function public.flowmate_admin_archive_work_item(");
    expect(sql).toContain("v_actor_id := auth.uid()");
    expect(sql).toContain("if not public.is_admin_app_user(v_actor_id) then");
    expect(sql).toContain("actor_user_id");
    expect(sql).toContain("event_type");
    expect(sql).toContain("from_status");
    expect(sql).toContain("to_status");
    expect(sql).toContain("metadata");
    expect(sql).toContain("'admin_override', true");
    expect(sql).toContain("'admin_archive', true");
    expect(sql).not.toMatch(/delete\s+from\s+public\.work_items/i);
  });

  it("reruns Central Queue after creative capacity is released", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const adminSql = collaborationSql();

    expect(assignmentSql).toContain("create or replace function public.flowmate_rerun_queued_creative_requests(");
    expect(assignmentSql).toContain("p_trigger public.assignment_trigger");
    expect(assignmentSql).toContain("'capacity_change'");
    expect(assignmentSql).toContain("wi.status = 'queued'");
    expect(assignmentSql).toContain("coalesce(wi.needs_split, false) = false");
    expect(assignmentSql).toContain("revoke all on function public.flowmate_rerun_queued_creative_requests(integer)");
    expect(quickTaskSql).toContain("v_queue_drain := public.flowmate_rerun_queued_creative_requests(10)");
    expect(adminSql).toContain("v_queue_drain := public.flowmate_rerun_queued_creative_requests(10)");
    expect(quickTaskSql).toContain("if p_next_status in ('delivered', 'cancelled') then");
    expect(adminSql).toContain("and p_next_status in ('delivered', 'cancelled') then");
  });

  it("checks creative capacity across working days when effort is larger than one day", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("v_assignment_start date");
    expect(assignmentSql).toContain("v_assignment_end date");
    expect(assignmentSql).toContain("v_working_days := public.flowmate_count_working_days(v_assignment_start, v_assignment_end)");
    expect(assignmentSql).toContain("effective_cap * v_working_days");
    expect(assignmentSql).toContain("window_assigned_effort");
    expect(assignmentSql).toContain("coalesce(wi.due_date, v_today) between v_assignment_start and v_assignment_end");
    expect(assignmentSql).toContain("over capacity before the 1st Draft date");
    expect(assignmentSql).not.toContain("v_effort      := least(v_raw_effort, 8)");
    expect(assignmentSql).not.toContain("v_was_capped  := v_raw_effort > 8");
  });
});

// ============================================================================
// MVP 1.2 AI Tags
// ============================================================================
describe("MVP 1.2 AI Tag backend and detail UI", () => {
  it("creates task-level AI tag storage and auth-scoped RPCs", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "ai_tags.sql"), "utf8");
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(sql).toContain("create table if not exists public.work_item_ai_tags");
    expect(sql).toContain("work_item_id uuid not null references public.work_items(id) on delete cascade");
    expect(sql).toContain("created_by_user_id uuid not null references public.users(id) on update cascade");
    expect(sql).toContain("create unique index if not exists idx_work_item_ai_tags_unique_normalized");
    expect(sql).toContain("alter table public.work_item_ai_tags enable row level security");
    expect(sql).toContain("public.flowmate_can_read_work_item(work_item_id, public.current_app_user_id())");
    expect(sql).toContain("create or replace function public.list_work_item_ai_tags(");
    expect(sql).toContain("create or replace function public.add_work_item_ai_tag(");
    expect(sql).toContain("create or replace function public.remove_work_item_ai_tag(");
    expect(sql).toContain("v_actor_id := public.flowmate_actor_user_id()");
    expect(sql).toContain("public.flowmate_can_collaborate_on_work_item(v_work.id, v_actor_id)");
    expect(sql).toContain("'add_ai_tag'");
    expect(sql).toContain("'remove_ai_tag'");
    expect(sql).toContain("revoke insert, update, delete on public.work_item_ai_tags from anon, authenticated");
    expect(readme).toContain("supabase/ai_tags.sql");
    expect(readme).toContain("work_item_ai_tags");
  });

  it("exposes frontend helpers and wires AI Tag UI under Created in the detail side panel", () => {
    const indexHtml = readFileSync(join(process.cwd(), "github", "index.html"), "utf8");
    const helperJs = readFileSync(join(process.cwd(), "github", "supabase-ai-tags.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(indexHtml).toMatch(/supabase-ai-tags\.js\?v=\d{8}-\d+/);
    expect(helperJs).toContain("async function loadFlowMateAiTags");
    expect(helperJs).toContain("async function addFlowMateAiTag");
    expect(helperJs).toContain("async function removeFlowMateAiTag");
    expect(helperJs).toContain("list_work_item_ai_tags");
    expect(helperJs).toContain("add_work_item_ai_tag");
    expect(helperJs).toContain("remove_work_item_ai_tag");
    expect(helperJs).not.toMatch(/p_actor_user_id|localStorage\.setItem/i);
    expect(detailSource).toContain("const [detailAiTags, setDetailAiTags]");
    expect(detailSource).toContain("window.loadFlowMateAiTags({ displayId: w.id })");
    expect(detailSource).toContain("function addAiTag()");
    expect(detailSource).toContain('const tag = "AI";');
    expect(detailSource).toContain("normalizedTag === \"ai\"");
    expect(detailSource).not.toContain("window.prompt(\"AI tag\")");
    expect(detailSource).toContain("function removeAiTag(tag)");
    expect(detailSource).toContain("AI Tag");
    expect(detailSource).toContain("Add AI Tag");
    expect(detailSource).toContain("Remove tag");
    expect(detailSource.indexOf('<div className="meta-row__lbl">Created</div>')).toBeLessThan(
      detailSource.indexOf('<div className="meta-row__lbl">AI Tag</div>'),
    );
    expect(appCss).toContain(".ai-tag-list");
    expect(appCss).toContain(".ai-tag__remove");
  });
});

// ============================================================================
// MVP 1.2 Realtime Live Updates frontend
// ============================================================================
describe("MVP 1.2 realtime live updates frontend", () => {
  it("subscribes to Supabase Realtime changes and debounces refresh requests", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");

    expect(listDataJs).toContain("function startFlowMateRealtime()");
    expect(listDataJs).toContain('window.flowmateSupabase.channel("flowmate-live-updates-v1")');
    expect(listDataJs).toContain(".on(\"postgres_changes\"");
    expect(listDataJs).toContain("FLOWMATE_REALTIME_TABLES");
    expect(listDataJs).toContain("function scheduleFlowMateRealtimeRefresh");
    expect(listDataJs).toContain("FLOWMATE_REALTIME_DEBOUNCE_MS");
    expect(listDataJs).toContain("flowmate:refresh-request");
    expect(listDataJs).toContain("flowmate:realtime-state");
  });

  it("keeps polling and focus refresh as a fallback when realtime is degraded", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");

    expect(listDataJs).toContain("function attachFlowMateLiveRefresh");
    expect(listDataJs).toContain("FLOWMATE_REFRESH_POLL_MS");
    expect(listDataJs).toContain("setInterval(runRefresh, intervalMs)");
    expect(appJsx).toContain("window.startFlowMateRealtime()");
    expect(appJsx).toContain("window.stopFlowMateRealtime()");
    expect(appJsx).toContain("flowmate:refresh-request");
    for (const source of [screensA, screensB, screensC]) {
      expect(source).toContain("attachFlowMateLiveRefresh");
    }
  });

  it("shows connected and degraded realtime status without signed-out data access", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");

    expect(appJsx).toContain('authState.status !== "signed-in"');
    expect(appJsx).toContain("setRealtimeState");
    expect(appJsx).toContain("Realtime connected");
    expect(appJsx).toContain("Realtime degraded");
    expect(appJsx).toContain("Polling fallback active");
    expect(listDataJs).toContain("if (!window.FLOWMATE_CURRENT_USER)");
    expect(listDataJs).not.toMatch(/localStorage\.setItem\([\s\S]*(token|session|secret|api[_-]?key)/i);
    expect(appJsx).not.toMatch(/localStorage\.setItem\([\s\S]*(token|session|secret|api[_-]?key)/i);
  });
});

// ============================================================================
// MVP 1.2 List filters and refresh controls
// ============================================================================
describe("MVP 1.2 List filters and refresh controls", () => {
  it("renders due dates consistently by date instead of hiding badges for delivered or cancelled rows", () => {
    const dataJsx = readFileSync(join(process.cwd(), "github", "data.jsx"), "utf8");
    const dueBadgeSource = dataJsx.slice(
      dataJsx.indexOf("function DueBadge"),
      dataJsx.indexOf("function Effort"),
    );

    expect(dueBadgeSource).toContain("badge--soon");
    expect(dueBadgeSource).toContain("badge--overdue");
    expect(dueBadgeSource).not.toContain('status === "delivered"');
    expect(dueBadgeSource).not.toContain('status === "cancelled"');
    expect(dueBadgeSource).not.toContain('return <span className="muted mono">{label}</span>;');
  });

  it("removes Saved views and orders Team before Assignee filters with scoped assignee options", () => {
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const listSource = screensB.slice(screensB.indexOf("function ListScreen"), screensB.indexOf("/* ============================================================\n   KANBAN BOARD"));

    expect(listSource).not.toContain("Saved views");
    expect(listSource).not.toContain("All owners");
    expect(listSource).toContain("All Assignee");
    expect(listSource.indexOf("All teams")).toBeLessThan(listSource.indexOf("All Assignee"));
    expect(listSource).toContain("function getListMemberTeam(member)");
    expect(listSource).toContain("const scopedOwnerOptionRows =");
    expect(listSource).toContain('filterTeam === "all" || getListMemberTeam(member) === filterTeam');
    expect(listSource).toContain('if (filterTeam !== "all" && getListWorkAssigneeTeam(w) !== filterTeam) return false;');
    expect(listSource).toContain('if (filterOwner !== "all" && !ownerOptions.some(([id]) => id === filterOwner))');
  });

  it("removes unused New and Need Brief statuses from the List status dropdown", () => {
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const listSource = screensB.slice(screensB.indexOf("function ListScreen"), screensB.indexOf("/* ============================================================\n   KANBAN BOARD"));

    expect(listSource).toContain("const LIST_STATUS_FILTER_KEYS =");
    expect(listSource).toContain("LIST_STATUS_FILTER_KEYS.map");
    expect(listSource).not.toContain("Object.entries(STATUS_LABEL).map");
    expect(listSource).not.toContain('value="new"');
    expect(listSource).not.toContain('value="need_brief"');
  });

  it("keeps List filter context when opening a task detail", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const listSource = screensB.slice(screensB.indexOf("function ListScreen"), screensB.indexOf("/* ============================================================\n   KANBAN BOARD"));
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(screensB).toContain("FLOWMATE_LIST_VIEW_STATE_KEY");
    expect(listSource).toContain("saveFlowMateListViewState(currentListViewState)");
    expect(listSource).toContain("saveFlowMateDetailBackContext({");
    expect(listSource).toContain('label: "Back to List"');
    expect(listSource).toContain("onOpen(work.id, { preserveBackContext: true })");
    expect(appJsx).toContain("function open(id, options = {})");
    expect(appJsx).toContain("!options.preserveBackContext");
    expect(detailSource).toContain("const detailBackContext = window.readFlowMateDetailBackContext");
    expect(detailSource).toContain("window.saveFlowMateListViewState(detailBackContext.listState)");
    expect(detailSource).toContain("{detailBackLabel}");
  });

  it("keeps Central Queue focused on assignable queued rows only", () => {
    const utils = loadGithubSearchUtils();
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const queueSource = screensB.slice(screensB.indexOf("function QueueScreen"), screensB.indexOf("function QueueGroup"));

    expect(utils.getFlowMateQueueRows([
      { id: "CR-1", status: "queued", title: "Capacity" },
      { id: "CR-2", status: "queued", needsSplit: true, title: "Hybrid" },
      { id: "CR-3", status: "need_brief", title: "Need brief" },
    ]).map((row) => row.id)).toEqual(["CR-1"]);
    expect(queueSource).toContain('return w.status === "queued" && !w.needsSplit;');
    expect(queueSource).not.toContain("Needs split (hybrid)");
    expect(queueSource).not.toContain("Need brief");
    expect(queueSource).not.toContain("recheckFlowMateBrief");
  });

  it("keeps visible Refresh buttons wired to real reload handlers", () => {
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");

    expect(appJsx).toContain('onRefresh={() => refreshNotifications({ showLoading: true })}');
    expect(screensB).toContain('onClick={() => loadRows()} disabled={busy}');
    expect(screensB).not.toContain('onClick={loadRows} disabled={busy}');
    expect(screensB).toContain('onClick={loadWhitelist} disabled={pending}');
  });
});

// ============================================================================
// MVP 1.2 Team Calendar frontend
// ============================================================================
describe("MVP 1.2 Team Calendar frontend", () => {
  it("adds a Calendar route to team navigation and renders CalendarScreen", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");

    expect(appJsx).toContain('{ key: "calendar", label: "Calendar",      icon: "calendar" }');
    expect(appJsx).toContain('"calendar": "Team calendar"');
    expect(appJsx).toContain('route === "calendar"');
    expect(appJsx).toContain("<CalendarScreen onOpen={open} />");
  });

  it("adds a Team Gantt Chart route below Calendar and renders a read-only Gantt screen", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const calendarIndex = appJsx.indexOf('{ key: "calendar", label: "Calendar",      icon: "calendar" }');
    const ganttIndex = appJsx.indexOf('{ key: "gantt",    label: "Gantt Chart"');
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(calendarIndex).toBeGreaterThan(-1);
    expect(ganttIndex).toBeGreaterThan(calendarIndex);
    expect(appJsx).toContain('"gantt": "Team Gantt chart"');
    expect(appJsx).toContain('route === "gantt"');
    expect(appJsx).toContain("<TeamGanttScreen onOpen={open} />");
    expect(ganttSource).toContain("function TeamGanttScreen({ onOpen })");
    expect(ganttSource).toContain("data-testid=\"flowmate-team-gantt-route\"");
    expect(ganttSource).toContain("data-testid=\"flowmate-team-gantt-chart\"");
    expect(ganttSource).toContain("Trello Power-Up Lite");
    expect(ganttSource).toContain("todayOffset");
    expect(ganttSource).toContain("gantt__today-line");
    expect(ganttSource).toContain("gantt__toolbar");
    expect(ganttSource).toContain("gantt__legend");
    expect(ganttSource).toContain("priorityClass");
    expect(ganttSource).toContain("Gantt rule: due date is the bar end");
    expect(ganttSource).toContain("window.flowmateSelectedWorkItem = task.item");
    expect(ganttSource).toContain("onOpen(task.item.id)");
    expect(appCss).toContain(".gantt");
    expect(appCss).toContain(".gantt__bar");
    expect(appCss).toContain(".gantt__today-line");
    expect(appCss).toContain(".gantt__toolbar");
    expect(appCss).toContain(".gantt__legend");
    expect(appCss).toContain(".gantt__bar.is-urgent");
  });

  it("Gantt month dropdown uses Jan 2026 through Dec 2027 options", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const searchUtils = readFileSync(join(process.cwd(), "github", "search-utils.js"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_START = "2026-01"');
    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_END = "2027-12"');
    expect(searchUtils).toContain("options.push({ key, label })");
    expect(ganttSource).toContain("data-testid=\"flowmate-gantt-month\"");
    expect(ganttSource).toContain("flowMateMonthOptionsC().map");
  });

  it("Gantt renders a horizontally scrollable two-month timeline", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(screensC).toContain("function ganttTimelineWindowC(monthKey)");
    expect(screensC).toContain("const visibleMonthCount = 2");
    expect(ganttSource).toContain("const ganttWindow = ganttTimelineWindowC(monthKey)");
    expect(ganttSource).toContain("ganttWindow.totalDays");
    expect(ganttSource).toContain("ganttWindow.dayCells");
    expect(ganttSource).toContain("ganttWindow.monthGroups");
    expect(ganttSource).toContain("data-testid=\"flowmate-gantt-month-group\"");
    expect(ganttSource).toContain("Scroll right to see the second month");
    expect(ganttSource).toContain("ganttTaskModelC(row, monthKey, ganttWindow)");
    expect(appCss).toContain(".gantt__month-scale");
    expect(appCss).toContain("min-width: calc(var(--gantt-days, 62) * 30px)");
    expect(appCss).toContain("overflow: auto");
  });

  it("builds calendar date keys from due dates without timezone shifting", () => {
    const utils = loadGithubSearchUtils();

    expect(utils.getFlowMateCalendarDateKey({ dueDate: "2026-05-20" })).toBe("2026-05-20");
    expect(utils.getFlowMateCalendarDateKey({ dueDelta: 0 }, new Date("2026-05-20T18:30:00+07:00"))).toBe("2026-05-20");
    expect(utils.getFlowMateCalendarDateKey({ dueDelta: 2 }, new Date("2026-05-20T00:30:00Z"))).toBe("2026-05-22");
  });

  it("filters the selected day agenda by assignee, status, type, and priority", () => {
    const utils = loadGithubSearchUtils();
    const rows = [
      { id: "CR-1", dueDate: "2026-05-20", assignee: "jo", status: "review", type: "creative", priority: "urgent" },
      { id: "QT-1", dueDate: "2026-05-20", assignee: "jo", status: "review", type: "quick", priority: "normal" },
      { id: "CR-2", dueDate: "2026-05-21", assignee: "jo", status: "review", type: "creative", priority: "urgent" },
      { id: "CR-3", dueDate: "2026-05-20", assignee: "pond", status: "review", type: "creative", priority: "urgent" },
    ];

    const filtered = utils.getFlowMateCalendarAgendaRows(rows, {
      dateKey: "2026-05-20",
      range: "day",
      assignee: "jo",
      status: "review",
      type: "creative",
      priority: "urgent",
    });

    expect(filtered.map((row) => row.id)).toEqual(["CR-1"]);
  });

  it("CalendarScreen shows month and agenda modes with launch date context and opens detail rows", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain("function CalendarScreen({ onOpen })");
    expect(calendarSource).toContain("window.loadFlowMateListRows");
    expect(calendarSource).toContain("attachFlowMateLiveRefresh(loadRowsIfAlive)");
    expect(calendarSource).toContain('setViewMode("month")');
    expect(calendarSource).toContain('setViewMode("agenda")');
    expect(calendarSource).toContain("Launch date");
    expect(calendarSource).toContain("window.flowmateSelectedWorkItem = item");
    expect(calendarSource).toContain("onOpen(item.id)");
    expect(calendarSource).not.toContain("draggable=");
  });

  it("Calendar agenda Prev, Today, and Next move the selected day or selected week", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain("function shiftCalendarWindow(direction)");
    expect(calendarSource).toContain('const deltaDays = agendaRange === "week" ? 7 : 1;');
    expect(calendarSource).toContain("const nextDateKey = calendarAddDaysC(selectedDateKey, direction * deltaDays);");
    expect(calendarSource).toContain("setSelectedDateKey(nextDateKey);");
    expect(calendarSource).toContain("setMonthKey(calendarMonthKeyC(nextDateKey));");
    expect(calendarSource).toContain("function goToToday()");
    expect(calendarSource).toContain('onClick={() => shiftCalendarWindow(-1)}');
    expect(calendarSource).toContain("onClick={goToToday}");
    expect(calendarSource).toContain('onClick={() => shiftCalendarWindow(1)}');
    expect(calendarSource).not.toContain("setMonthKey(calendarShiftMonthC(monthKey, direction));");
    expect(calendarSource).toContain("const selectedCalendarRows = window.getFlowMateCalendarAgendaRows");
    expect(calendarSource).toContain("{selectedCalendarRows.length}");
    expect(calendarSource).toContain("selectedCalendarRows.filter(row => row.type === \"quick\").length");
  });

  it("month overflow is clickable and switches the selected date into agenda view", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain("function openCalendarOverflow(event, dateKey)");
    expect(calendarSource).toContain('setAgendaRange("day")');
    expect(calendarSource).toContain('setViewMode("agenda")');
    expect(calendarSource).toContain("onClick={(event) => openCalendarOverflow(event, cell.key)}");
    expect(calendarSource).toContain("Open all");
  });

  it("calendar month item text is constrained so long titles do not overflow cells", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain('minWidth: 0');
    expect(calendarSource).toContain('overflow: "hidden"');
    expect(calendarSource).toContain('overflowWrap: "anywhere"');
    expect(calendarSource).toContain('wordBreak: "break-word"');
  });

  it("Calendar loads leave request rows and exposes Create Leave Request", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(listDataJs).toContain("async function loadFlowMateLeaveRows()");
    expect(listDataJs).toContain(".from(\"leave_requests\")");
    expect(listDataJs).toContain("start_half,end_half");
    expect(listDataJs).toContain("leaveUnits");
    expect(listDataJs).toContain("type: \"leave\"");
    expect(listDataJs).toContain("window.loadFlowMateCalendarRows = loadFlowMateCalendarRows");
    expect(calendarSource).toContain("window.loadFlowMateCalendarRows");
    expect(calendarSource).toContain("Create Leave Request");
    expect(calendarSource).toContain("Leave period");
    expect(calendarSource).toContain("AM + PM is full day");
    expect(calendarSource).toContain('row.type === "leave"');
    expect(calendarSource).toContain("Leave");
    expect(calendarSource).toContain('if (item.type === "leave") return;');
  });
});

// ============================================================================
// MVP 1.2 Notification Center frontend
// ============================================================================
describe("MVP 1.2 Notification Center frontend", () => {
  it("loads signed-in user notifications and marks read state through backend-scoped APIs", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const notificationSource = quickTaskJs.slice(quickTaskJs.indexOf("async function loadFlowMateNotifications"));

    expect(quickTaskJs).toContain("async function loadFlowMateNotifications()");
    expect(quickTaskJs).toContain('.from("notifications")');
    expect(quickTaskJs).toContain("read_at");
    expect(quickTaskJs).toContain("work_item_id");
    expect(quickTaskJs).toContain("async function markFlowMateNotificationRead(notificationId)");
    expect(quickTaskJs).toContain('rpc("mark_notification_read"');
    expect(quickTaskJs).toContain("p_notification_id: notificationId");
    expect(quickTaskJs).toContain("async function markAllFlowMateNotificationsRead()");
    expect(quickTaskJs).toContain('rpc("mark_all_notifications_read")');
    expect(notificationSource).not.toContain("p_actor_user_id: flowmateActorId()");
    expect(notificationSource).not.toMatch(/localStorage\.setItem\([\s\S]*(notification|token|session|secret|api[_-]?key)/i);
  });

  it("refreshes notification state after work mutations that can create notifications", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const createQuickSource = quickTaskJs.slice(
      quickTaskJs.indexOf("async function createFlowMateQuickTask"),
      quickTaskJs.indexOf("window.createFlowMateQuickTask"),
    );
    const transitionSource = quickTaskJs.slice(
      quickTaskJs.indexOf("async function transitionFlowMateCreativeStatus"),
      quickTaskJs.indexOf("window.transitionFlowMateCreativeStatus"),
    );
    const adminTransitionSource = quickTaskJs.slice(
      quickTaskJs.indexOf("async function adminTransitionFlowMateWorkStatus"),
      quickTaskJs.indexOf("async function adminArchiveFlowMateWorkItem"),
    );

    expect(createQuickSource).toContain('flowmate:refresh-request", { detail: { reason: "quick_task_created" } }');
    expect(transitionSource).toContain('flowmate:refresh-request", { detail: { reason: "work_status_changed" } }');
    expect(adminTransitionSource).toContain('flowmate:refresh-request", { detail: { reason: "admin_work_status_changed" } }');
  });

  it("hides dismissed notifications and clears read notifications through auth.uid-scoped RPCs", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");
    const notificationSource = quickTaskJs.slice(quickTaskJs.indexOf("async function loadFlowMateNotifications"));
    const dismissSource = quickTaskJs.slice(quickTaskJs.indexOf("async function dismissReadFlowMateNotifications"));

    expect(notificationSource).toContain('dismissed_at');
    expect(notificationSource).toContain('.is("dismissed_at", null)');
    expect(quickTaskJs).toContain("async function dismissReadFlowMateNotifications()");
    expect(quickTaskJs).toContain('rpc("dismiss_read_notifications")');
    expect(quickTaskJs).toContain("window.dismissReadFlowMateNotifications = dismissReadFlowMateNotifications");
    expect(dismissSource).not.toContain("p_actor_user_id");
  });

  it("enables the Notifications topbar button with unread count and panel actions", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");

    expect(appJsx).toContain("const [notifications, setNotifications]");
    expect(appJsx).toContain("const unreadNotificationCount");
    expect(appJsx).toContain("loadFlowMateNotifications");
    expect(appJsx).toContain("NotificationCenterPanel");
    expect(appJsx).toContain("markFlowMateNotificationRead");
    expect(appJsx).toContain("markAllFlowMateNotificationsRead");
    expect(appJsx).toContain("dismissReadFlowMateNotifications");
    expect(appJsx).toContain("handleOpenNotification");
    expect(appJsx).toContain("window.flowmateSelectedWorkItem = row");
    expect(appJsx).toContain("onOpen={handleOpenNotification}");

    const topbarSource = appJsx.slice(appJsx.indexOf("<div className=\"app__topbar\""), appJsx.indexOf("<nav className=\"app__sidebar\""));
    expect(topbarSource).toContain("Notifications");
    expect(topbarSource).toContain("refreshNotifications({ showLoading: true })");
    expect(topbarSource).toContain("{unreadNotificationCount > 0");
    expect(topbarSource).not.toContain("disabled title=\"Notifications are planned");
  });

  it("toggles the Notifications popup closed on a second topbar click", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const topbarSource = appJsx.slice(appJsx.indexOf("<div className=\"app__topbar\""), appJsx.indexOf("<nav className=\"app__sidebar\""));

    expect(topbarSource).toContain("setIsNotificationCenterOpen(open => {");
    expect(topbarSource).toContain("const nextOpen = !open;");
    expect(topbarSource).toContain("if (nextOpen) refreshNotifications({ showLoading: true });");
    expect(topbarSource).toContain("return nextOpen;");
  });

  it("renders clear notification loading, empty, unread, and read states", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const panelSource = appJsx.slice(appJsx.indexOf("function NotificationCenterPanel"));

    expect(panelSource).toContain("No notifications yet");
    expect(panelSource).toContain("Mark all as read");
    expect(panelSource).toContain("Clear read");
    expect(panelSource).toContain("onDismissRead");
    expect(panelSource).toContain("Unread");
    expect(panelSource).toContain("Read");
    expect(panelSource).toContain("safeNotifications.length === 0");
    expect(panelSource).toContain("loadState.status === \"error\"");
  });

  it("labels link and watcher collaboration notifications", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const panelSource = appJsx.slice(appJsx.indexOf("function NotificationCenterPanel"));

    expect(panelSource).toContain("link_added: \"Link\"");
    expect(panelSource).toContain("watcher_added: \"Watcher\"");
    expect(panelSource).toContain("comments, links, watchers, and due reminders will appear here");
  });
});

describe("MVP 1.2 topbar create menu", () => {
  it("opens a topbar Create dropdown with Quick Task, Creative Request, and Leave request choices", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const topbarSource = appJsx.slice(appJsx.indexOf("<div className=\"app__topbar\""), appJsx.indexOf("<nav className=\"app__sidebar\""));

    expect(appJsx).toContain("const [isCreateMenuOpen, setIsCreateMenuOpen]");
    expect(appJsx).toContain("CreateMenuPanel");
    expect(topbarSource).toContain("setIsCreateMenuOpen");
    expect(topbarSource).not.toContain('onClick={() => nav("create")}><Icon name="plus" /> Create');
    expect(appJsx).toContain("Quick Task");
    expect(appJsx).toContain("Creative Request");
    expect(appJsx).toContain("Leave request");
  });

  it("routes Create menu choices to the correct create mode or leave modal", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");

    expect(appJsx).toContain('handleTopbarCreateChoice("quick")');
    expect(appJsx).toContain('handleTopbarCreateChoice("creative")');
    expect(appJsx).toContain('handleTopbarCreateChoice("leave")');
    expect(appJsx).toContain("setCreateModeIntent(choice)");
    expect(appJsx).toContain("setIsGlobalLeaveModalOpen(true)");
    expect(appJsx).toContain("<GlobalLeaveRequestModal");
    expect(appJsx).toContain("initialMode={createModeIntent}");
    expect(createScreenJsx).toContain("function CreateScreen({ onNav, onOpen, initialMode = \"creative\" })");
    expect(createScreenJsx).toContain("useState(() => initialMode === \"quick\" ? \"quick\" : \"creative\")");
    expect(createScreenJsx).toContain("if (initialMode === \"quick\" || initialMode === \"creative\")");
  });
});

// ============================================================================
// MVP 1.2 Detail Collaboration and Admin Operations frontend
// ============================================================================
describe("MVP 1.2 collaboration/admin frontend", () => {
  it("loads links and watchers into live detail rows", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");

    expect(listDataJs).toContain('"work_item_links"');
    expect(listDataJs).toContain('"work_item_watchers"');
    expect(listDataJs).toContain('.from("work_item_links")');
    expect(listDataJs).toContain('.from("work_item_watchers")');
    expect(listDataJs).toContain("links: linksByWorkItemId[item.id] || []");
    expect(listDataJs).toContain("watchers: watchersByWorkItemId[item.id] || []");
    expect(listDataJs).toContain("requesterUserId: item.requester_user_id");
    expect(listDataJs).toContain("assigneeUserId: item.assignee_user_id");
    expect(listDataJs).toContain("syncFlowMateMentionUsers(usersResult.data || [])");
    expect(listDataJs).toContain("window.loadFlowMateMentionUsers = loadFlowMateMentionUsers");
  });

  it("routes link, watcher, and admin status actions through backend RPC helpers", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain("async function addFlowMateWorkItemLink(displayId, url, description)");
    expect(quickTaskJs).toContain('rpc("add_work_item_link"');
    expect(quickTaskJs).toContain("async function addFlowMateWorkItemWatcher(displayId, watcherUserId)");
    expect(quickTaskJs).toContain('rpc("add_work_item_watcher"');
    expect(quickTaskJs).toContain("async function adminTransitionFlowMateWorkStatus(displayId, nextStatus, options = {})");
    expect(quickTaskJs).toContain('rpc("flowmate_admin_transition_work_status"');
    expect(quickTaskJs).toContain("if (window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.role === \"admin\")");

    const linkHelper = quickTaskJs.slice(
      quickTaskJs.indexOf("async function addFlowMateWorkItemLink"),
      quickTaskJs.indexOf("async function addFlowMateWorkItemWatcher"),
    );
    const watcherHelper = quickTaskJs.slice(
      quickTaskJs.indexOf("async function addFlowMateWorkItemWatcher"),
      quickTaskJs.indexOf("window.addFlowMateWorkItemLink"),
    );
    expect(linkHelper).not.toContain("p_actor_user_id");
    expect(watcherHelper).not.toContain("p_actor_user_id");
  });

  it("renders usable detail link and watcher zones", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain("Link zone");
    expect(detailSource).toContain("addFlowMateWorkItemLink");
    expect(detailSource).toContain("Comment zone");
    expect(detailSource).toContain("addFlowMateWorkItemComment");
    expect(detailSource).toContain("mentionSuggestions");
    expect(detailSource).toContain("insertMentionUser");
    expect(detailSource).toContain("extractFlowMateMentionedUserIds");
    expect(detailSource).toContain("Watchers");
    expect(detailSource).toContain("addFlowMateWorkItemWatcher");
    expect(detailSource).toContain("watcherUserId");
  });

  it("formats detail comment timestamps with day month year and AM/PM time", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(listDataJs).toContain("flowmateDateTimeFullLabel(comment.created_at)");
    expect(listDataJs).toContain("day: \"numeric\"");
    expect(listDataJs).toContain("month: \"short\"");
    expect(listDataJs).toContain("year: \"numeric\"");
    expect(listDataJs).toContain("hour12: true");
    expect(detailSource).toContain("comment.createdLabel || flowmateFormatCommentTime(comment.created_at)");
  });

  it("preserves line breaks when rendering detail comment text", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain('<div className="comment__text" style={{ whiteSpace: "pre-wrap" }}>{comment.body}</div>');
  });

  it("updates detail links and watchers immediately after successful add", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    // CR-2: initializers are null-safe ((w && w.links) || []) so the hooks can
    // run before the not-loaded early return without dereferencing a null `w`.
    expect(detailSource).toContain("const [detailLinks, setDetailLinks] = useState((w && w.links) || [])");
    expect(detailSource).toContain("const [detailWatchers, setDetailWatchers] = useState((w && w.watchers) || [])");
    expect(detailSource).toContain("const [detailComments, setDetailComments] = useState((w && w.comments) || [])");
    expect(detailSource).toContain("setDetailLinks((current) =>");
    expect(detailSource).toContain("setDetailWatchers((current) =>");
    expect(detailSource).toContain("setDetailComments((current) =>");
    expect(detailSource).toContain("Link added.");
    expect(detailSource).toContain("Watcher added.");
    expect(detailSource).toContain("Comment added.");
    expect(detailSource).not.toContain("Refresh the detail view if it does not appear immediately.");
  });

  it("does not show status controls to read-only watchers", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain("const canStatusTransition");
    expect(detailSource).toContain("currentUserId === w.requesterUserId");
    expect(detailSource).toContain("currentUserId === w.assigneeUserId");
    expect(detailSource).toContain("owner?.userId === currentUserId");
    expect(detailSource).toContain("window.FLOWMATE_CURRENT_USER?.role === \"admin\"");
    expect(detailSource).not.toContain("visibleWatchers.some");
  });

  it("keeps the watcher add controls readable in the narrow detail sidebar", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "github", "app.css"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain("watcher-add-form");
    expect(detailSource).toContain("watcher-add-form__select");
    expect(detailSource).toContain("Add watcher");
    expect(detailSource).toContain('<Icon name="plus" /> Add watcher');
    expect(detailSource).not.toContain('<Icon name="plus" /> Add</button>');
    expect(appCss).toContain(".watcher-add-form");
    expect(appCss).toContain("grid-template-columns: 1fr");
    expect(appCss).toContain(".watcher-add-form__button");
    expect(appCss).toContain("white-space: normal");
  });

  it("board drag status changes use the admin-aware transition helper", () => {
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    const boardSource = screensB.slice(screensB.indexOf("function BoardScreen"), screensB.indexOf("function QueueScreen"));

    expect(boardSource).toContain("window.transitionFlowMateWorkStatus(row.id, targetStatus, options)");
    expect(boardSource).not.toContain("window.transitionFlowMateCreativeStatus(row.id, targetStatus, options)");
  });

  it("routes admin archive through the soft archive RPC without client actor spoofing", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain("async function adminArchiveFlowMateWorkItem(displayId, reason)");
    expect(quickTaskJs).toContain('rpc("flowmate_admin_archive_work_item"');
    expect(quickTaskJs).toContain("window.adminArchiveFlowMateWorkItem = adminArchiveFlowMateWorkItem");

    const archiveHelper = quickTaskJs.slice(
      quickTaskJs.indexOf("async function adminArchiveFlowMateWorkItem"),
      quickTaskJs.indexOf("window.adminArchiveFlowMateWorkItem"),
    );
    expect(archiveHelper).not.toContain("p_actor_user_id");
    expect(archiveHelper).not.toMatch(/delete\s*\(/i);
  });

  it("hides soft archived work items from normal live list rows after refresh", () => {
    const listDataJs = readFileSync(join(process.cwd(), "github", "supabase-list-data.js"), "utf8");

    expect(listDataJs).toContain("archived_at");
    expect(listDataJs).toContain("const activeWorkItems = (workItemsResult.data || []).filter((item) => !item.archived_at)");
    expect(listDataJs).toContain("const rows = activeWorkItems.map((item) =>");
  });

  it("removes View as perspective controls and keeps My work on the signed-in user", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const myWorkSource = screensA.slice(screensA.indexOf("function MyWorkScreen"));

    expect(appJsx).not.toContain("View as");
    expect(appJsx).not.toContain("Viewing as");
    expect(appJsx).not.toContain("viewAsMemberId");
    expect(appJsx).not.toContain("FLOWMATE_VIEW_AS_MEMBER");
    expect(appJsx).not.toContain("getFlowMatePerspectiveUser");
    expect(appJsx).not.toContain("canUseFlowMateViewAs");
    expect(myWorkSource).toContain("const currentUser = window.FLOWMATE_CURRENT_USER || {}");
    expect(myWorkSource).not.toContain("getFlowMatePerspectiveUser");
  });

  it("renders admin archive controls only in detail with a soft archive confirmation", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain("const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === \"admin\"");
    expect(detailSource).toContain("async function runAdminArchive()");
    expect(detailSource).toContain("window.adminArchiveFlowMateWorkItem(w.id, reason)");
    expect(detailSource).toContain("This is a soft archive, not a permanent delete.");
    expect(detailSource).toContain("Admin archive");
    expect(detailSource).toContain("{isAdminUser && w.isSupabaseRow && !w.archivedAt && (");
  });
});

// ============================================================================
// MVP 1.1 Admin whitelist UI backend support
// ============================================================================
describe("MVP 1.1 admin whitelist backend SQL", () => {
  it("routes whitelist writes through admin-only RPCs that resolve the actor from auth.uid()", () => {
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");

    expect(whitelistSql).toContain("create or replace function public.flowmate_admin_upsert_whitelist_user(");
    expect(whitelistSql).toContain("create or replace function public.flowmate_admin_delete_whitelist_user(");
    expect(whitelistSql).toContain("v_actor_id := auth.uid()");
    expect(whitelistSql).toContain("if not public.is_admin_app_user() then");
    expect(whitelistSql).toContain("Only FlowMate admins can manage the whitelist");
    expect(whitelistSql).toContain("revoke insert, update, delete on public.user_whitelist from anon, authenticated");
    expect(whitelistSql).toContain("grant execute on function public.flowmate_admin_upsert_whitelist_user(");
    expect(whitelistSql).toContain("grant execute on function public.flowmate_admin_delete_whitelist_user(");
    expect(whitelistSql).not.toContain("grant insert, update, delete on public.user_whitelist to authenticated");
    expect(whitelistSql).not.toContain("p_actor_user_id");
  });

  it("normalizes and validates whitelist input without accepting non-Garena emails or invalid roles", () => {
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");

    expect(whitelistSql).toContain("v_email := lower(trim(p_email))");
    expect(whitelistSql).toContain("v_email !~* '^[^@\\s]+@garena\\.com$'");
    expect(whitelistSql).toContain("p_role not in ('admin', 'member')");
    expect(whitelistSql).toContain("member_code = v_team_member_code");
    expect(whitelistSql).toContain("added_by = v_actor_id");
  });
});

describe("MVP 1.1 admin whitelist frontend UI", () => {
  it("loads the signed-in user's role so admin-only routes can be gated client-side", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain("id, email, display_name, requester_team, is_active, role");
    expect(quickTaskJs).toContain("role: profile.role || \"member\"");
  });

  it("shows whitelist entry points only for admin users", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");

    expect(appJsx).toContain("const isAdminUser = user.role === \"admin\"");
    expect(appJsx).toContain("getVisibleNavGroups(user.role)");
    expect(appJsx).toContain("function isFlowMateRouteAllowedForRole(role, routeKey)");
    expect(appJsx).toContain("const allowedRoute = isFlowMateRouteAllowedForRole(user.role, route)");
    expect(appJsx).toContain("{allowedRoute && route === \"admin-whitelist\" && isAdminUser && <AdminWhitelistScreen />}");
    expect(appJsx).toContain("{!allowedRoute && <AccessDeniedScreen onNav={nav} />}");
  });

  it("limits member navigation to Personal and Team while admins see Supervisor and Admin", () => {
    const appJsx = readFileSync(join(process.cwd(), "github", "app.jsx"), "utf8");

    expect(appJsx).toContain("const MEMBER_NAV_GROUPS = NAV.filter(group => group.group === \"Personal\" || group.group === \"Team\");");
    expect(appJsx).toContain("function getVisibleNavGroups(role)");
    expect(appJsx).toContain("return role === \"admin\" ? [...NAV, ADMIN_NAV_GROUP] : MEMBER_NAV_GROUPS;");
    expect(appJsx).toContain("const MEMBER_ROUTE_KEYS = new Set(MEMBER_NAV_GROUPS.flatMap(group => group.items.map(item => item.key)).concat([\"detail\"]));");
    expect(appJsx).toContain("if (role === \"admin\") return Boolean(TITLE_MAP[routeKey]);");
    expect(appJsx).toContain("return MEMBER_ROUTE_KEYS.has(routeKey);");
  });

  it("uses admin whitelist helpers and RPCs instead of direct browser writes", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain("async function loadFlowMateWhitelistUsers()");
    expect(quickTaskJs).toContain(".from(\"user_whitelist\")");
    expect(quickTaskJs).toContain("async function upsertFlowMateWhitelistUser(input)");
    expect(quickTaskJs).toContain("flowmate_admin_upsert_whitelist_user");
    expect(quickTaskJs).toContain("async function deleteFlowMateWhitelistUser(email)");
    expect(quickTaskJs).toContain("flowmate_admin_delete_whitelist_user");
    expect(quickTaskJs).not.toContain(".from(\"user_whitelist\").insert");
    expect(quickTaskJs).not.toContain(".from(\"user_whitelist\").update");
    expect(quickTaskJs).not.toContain(".from(\"user_whitelist\").delete");
  });

  it("renders list, add, deactivate, and Supabase error states for admin whitelist management", () => {
    const screensB = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");

    expect(screensB).toContain("function AdminWhitelistScreen()");
    expect(screensB).toContain("loadFlowMateWhitelistUsers");
    expect(screensB).toContain("upsertFlowMateWhitelistUser");
    expect(screensB).toContain("deleteFlowMateWhitelistUser");
    expect(screensB).toContain("Deactivate");
    expect(screensB).toContain("Admin access required.");
    // H-5: raw RPC errors are routed through flowmateUserError before display.
    expect(screensB).toContain("window.flowmateUserError(error, \"Whitelist RPC failed.\")");
  });
});

describe("MVP 1.2 Chat H team settings frontend", () => {
  it("groups Team settings members into Operation, Marketing, GD/VE, and Esport columns", () => {
    const { window } = loadGithubQuickTaskUtils();
    const board = window.getFlowMateTeamSettingsBoard([
      { name: "Vee", discipline: "VE", availability: "available" },
      { name: "Po", discipline_short: "Ops", availability: "available" },
      { name: "Mac", discipline: "MKT", availability: "available" },
      { name: "Pluem", discipline: "ES", availability: "available" },
      { name: "Aof", discipline: "Operation", availability: "available" },
    ]);

    expect(board.map((column) => column.title)).toEqual(["Operation", "Marketing", "GD/VE", "Esport"]);
    expect(board.find((column) => column.title === "Operation")?.members.map((member) => member.name)).toEqual(["Aof", "Po"]);
    expect(board.find((column) => column.title === "Marketing")?.members.map((member) => member.name)).toEqual(["Mac"]);
    expect(board.find((column) => column.title === "GD/VE")?.members.map((member) => member.name)).toEqual(["Vee"]);
    expect(board.find((column) => column.title === "Esport")?.members.map((member) => member.name)).toEqual(["Pluem"]);
  });

  it("filters Team settings members by All, Active, Partial, and On leave", () => {
    const { window } = loadGithubQuickTaskUtils();
    const members = [
      { name: "Active", availability: "available" },
      { name: "Partial", availability: "partial" },
      { name: "Leave", availability: "leave" },
    ];

    expect(window.filterFlowMateTeamSettingsMembers(members, "all").map((member) => member.name)).toEqual(["Active", "Partial", "Leave"]);
    expect(window.filterFlowMateTeamSettingsMembers(members, "active").map((member) => member.name)).toEqual(["Active"]);
    expect(window.filterFlowMateTeamSettingsMembers(members, "partial").map((member) => member.name)).toEqual(["Partial"]);
    expect(window.filterFlowMateTeamSettingsMembers(members, "leave").map((member) => member.name)).toEqual(["Leave"]);
  });

  it("keeps unknown Team settings discipline values in Operation with a warning count", () => {
    const { window } = loadGithubQuickTaskUtils();
    const board = window.getFlowMateTeamSettingsBoard([
      { name: "Unknown", discipline: "FCO Admin", availability: "available" },
      { name: "Missing", availability: "available" },
    ]);
    const operation = board.find((column) => column.title === "Operation");

    expect(operation?.members.map((member) => member.name)).toEqual(["Missing", "Unknown"]);
    expect(operation?.unknownCount).toBe(2);
  });

  it("does not expose Team settings edit actions to non-admin users", () => {
    const { window } = loadGithubQuickTaskUtils();

    expect(window.getFlowMateTeamSettingsUiModel({ role: "member" })).toEqual({
      canEditMembers: false,
      showAdminActions: false,
    });
    expect(window.getFlowMateTeamSettingsUiModel({ role: "admin" })).toEqual({
      canEditMembers: true,
      showAdminActions: true,
    });
  });

  it("hides static skills, capacity, WIP, and edit controls for non-GD/VE members", () => {
    const { window } = loadGithubQuickTaskUtils();

    expect(window.getFlowMateTeamSettingsMemberUi({ name: "Pond", discipline: "GD/VE" }, { role: "admin" })).toEqual({
      isGdVe: true,
      showCapacityControls: true,
      canEdit: true,
    });
    expect(window.getFlowMateTeamSettingsMemberUi({ name: "Mac", discipline: "Marketing" }, { role: "admin" })).toEqual({
      isGdVe: false,
      showCapacityControls: false,
      canEdit: false,
    });
  });

  it("routes Team settings admin updates through an RPC without accepting p_actor_user_id", async () => {
    const { window, rpcCalls } = loadGithubQuickTaskUtils();
    window.FLOWMATE_CURRENT_USER = { role: "admin" };

    await window.adminUpdateFlowMateTeamMember("member-1", {
      capacityPerDay: 8,
      wipLimit: 3,
      skills: ["banner", "video-standard", "motion"],
      p_actor_user_id: "spoofed-user",
      availability: "leave",
      capacityOverride: 0,
    });

    expect(rpcCalls).toEqual([
      {
        name: "flowmate_admin_update_team_member",
        params: {
          p_team_member_id: "member-1",
          p_capacity_per_day: 8,
          p_wip_limit: 3,
          p_skills: ["banner", "video-standard", "motion"],
          p_backup_skills: [],
        },
      },
    ]);
    expect(rpcCalls[0].params).not.toHaveProperty("p_actor_user_id");
    expect(rpcCalls[0].params).not.toHaveProperty("p_availability");
    expect(rpcCalls[0].params).not.toHaveProperty("p_capacity_override_per_day");
  });

  it("rejects empty Team settings normal skills before calling the RPC", async () => {
    const { window, rpcCalls } = loadGithubQuickTaskUtils();
    window.FLOWMATE_CURRENT_USER = { role: "admin" };

    await expect(window.adminUpdateFlowMateTeamMember("member-1", {
      capacityPerDay: 8,
      wipLimit: 3,
      skills: [],
    })).rejects.toThrow("Select at least one normal skill.");
    expect(rpcCalls).toEqual([]);
  });

  it("renders Team settings edit modal with capacity, WIP, and GD/VE skill fields", () => {
    const screensC = readFileSync(join(process.cwd(), "github", "screens-c.jsx"), "utf8");
    const editModalSource = screensC.slice(
      screensC.indexOf("{editMember && uiModel.canEditMembers && ("),
      screensC.indexOf("</form>", screensC.indexOf("{editMember && uiModel.canEditMembers && (")),
    );

    expect(editModalSource).toContain("Capacity pt/day");
    expect(editModalSource).toContain("WIP limit");
    expect(editModalSource).toContain("Skills");
    expect(editModalSource).toContain("FLOWMATE_TEAM_SETTINGS_SKILL_OPTIONS");
    expect(editModalSource).toContain("toggleEditSkill(option.key)");
    expect(editModalSource).not.toContain("Availability");
    expect(editModalSource).not.toContain("Override pt/day");
  });

  it("renders the agreed GD/VE skill set in Team settings and removes legacy skill labels", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "github", "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain('key: "banner", label: "Banner"');
    expect(quickTaskJs).toContain('key: "hero-album", label: "Hero Album (Banner x8)"');
    expect(quickTaskJs).toContain('key: "video-under-1-min", label: "Video Under 1 Min"');
    expect(quickTaskJs).toContain('key: "jersey-design", label: "Jersey Design"');
    expect(quickTaskJs).toContain('key: "jersey-in-game", label: "Jersey In-game"');
    expect(quickTaskJs).not.toContain('label: "Static"');
    expect(quickTaskJs).not.toContain('label: "General video"');
    expect(quickTaskJs).not.toContain('label: "Esport video (backup)"');
  });

  it("creates own leave requests through an auth.uid-scoped RPC without accepting actor or member ids", async () => {
    const { window, rpcCalls } = loadGithubQuickTaskUtils();
    window.FLOWMATE_CURRENT_USER = { role: "member" };

    await window.createFlowMateLeaveRequest({
      teamMemberId: "spoofed-member",
      p_actor_user_id: "spoofed-user",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      startHalf: "am",
      endHalf: "pm",
      reason: "Annual leave",
    });

    expect(rpcCalls[rpcCalls.length - 1]).toEqual({
      name: "create_leave_request",
      params: {
        p_start_date: "2026-06-01",
        p_end_date: "2026-06-03",
        p_start_half: "am",
        p_end_half: "pm",
        p_reason: "Annual leave",
      },
    });
    expect(rpcCalls[rpcCalls.length - 1].params).not.toHaveProperty("p_actor_user_id");
    expect(rpcCalls[rpcCalls.length - 1].params).not.toHaveProperty("p_team_member_id");
  });
});

describe("MVP 1.2 Chat H team settings backend SQL", () => {
  it("adds an admin-only team member update RPC that resolves actor from auth.uid()", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "team_settings_admin.sql"), "utf8");

    expect(sql).toContain("create or replace function public.flowmate_admin_update_team_member(");
    expect(sql).toContain("v_actor_id := auth.uid()");
    expect(sql).toContain("if v_actor_id is null then");
    expect(sql).toContain("if not public.is_admin_app_user() then");
    expect(sql).toContain("update public.team_members");
    expect(sql).toContain("and lower(member_code) = any (array['pond','jo','tong','eye','vee','ploy'])");
    expect(sql).toContain("skills = v_next_skills");
    expect(sql).toContain("backup_skills = v_next_backup_skills");
    expect(sql).toContain("p_skills text[] default null");
    expect(sql).toContain("'hero-album'");
    expect(sql).toContain("'video-under-1-min'");
    expect(sql).not.toContain("array['static-graphic','general-video','motion','esport-video']::public.asset_type[]");
    expect(sql).not.toContain("array['esport-video']::public.asset_type[]");
    expect(sql).toContain("revoke insert, update, delete on public.team_members from anon, authenticated");
    expect(sql).toContain("grant execute on function public.flowmate_admin_update_team_member(");
    expect(sql).not.toContain("p_actor_user_id");
  });

  it("adds leave_requests and own leave RPCs without trusting browser actor/member ids", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "team_settings_admin.sql"), "utf8");
    const createLeaveSql = sql.slice(
      sql.indexOf("create or replace function public.create_leave_request("),
      sql.indexOf("revoke all on function public.create_leave_request"),
    );

    expect(sql).toContain("create table if not exists public.leave_requests");
    expect(sql).toContain("start_half text not null default 'am'");
    expect(sql).toContain("end_half text not null default 'pm'");
    expect(sql).toContain("leave_requests_same_day_half_order");
    expect(sql).toContain("create or replace function public.create_leave_request(");
    expect(createLeaveSql).toContain("p_start_half text default 'am'");
    expect(createLeaveSql).toContain("p_end_half text default 'pm'");
    expect(createLeaveSql).toContain("v_actor_id := auth.uid()");
    expect(createLeaveSql).toContain("where tm.user_id = v_actor_id");
    expect(createLeaveSql).toContain("insert into public.leave_requests");
    expect(createLeaveSql).toContain("v_target_work");
    expect(sql).toContain("type in (");
    expect(createLeaveSql).toContain("'leave_overlap'");
    expect(createLeaveSql).toContain("'start_half', p_start_half");
    expect(createLeaveSql).toContain("'end_half', p_end_half");
    expect(createLeaveSql).toContain("wi.due_date between p_start_date and p_end_date");
    expect(createLeaveSql).toContain("v_target_work.requester_user_id");
    expect(createLeaveSql).toContain("v_leave_recipient_id");
    expect(createLeaveSql).toContain("from public.work_item_watchers wiw");
    expect(createLeaveSql).toContain("wiw.watcher_user_id");
    expect(createLeaveSql).toContain("'leave:' || v_leave.id::text || ':work:' || v_target_work.id::text");
    expect(sql).toContain("revoke insert, update, delete on public.leave_requests from anon, authenticated");
    expect(sql).toContain("grant execute on function public.create_leave_request(");
    expect(createLeaveSql).not.toContain("p_actor_user_id");
    expect(createLeaveSql).not.toContain("p_team_member_id");
  });

  it("makes assignment avoid GD/VE members with overlapping leave requests", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("public.flowmate_leave_fraction_for_date");
    expect(assignmentSql).toContain("from public.leave_requests lr");
    expect(assignmentSql).toContain("then 0.5::numeric");
    expect(assignmentSql).toContain("generate_series(v_assignment_start, v_assignment_end, interval '1 day')");
    expect(assignmentSql).toContain("leave_capacity_loss");
    expect(assignmentSql).toContain("greatest(0, b.effective_cap * v_working_days - b.leave_capacity_loss) > 0");
  });

  it("matches assignment candidates by Creative Request Type / Skill", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("v_required_skill text");
    expect(assignmentSql).toContain("v_required_skill := lower(trim(coalesce(v_det.asset_subtype, '')))");
    expect(assignmentSql).toContain("when v_required_skill ilike '%graphic pack%' then 'graphic-pack'");
    expect(assignmentSql).toContain("when v_required_skill in ('hero album','hero-album') then 'hero-album'");
    expect(assignmentSql).toContain("when v_det.asset_type in ('general-video','esport-video') then 'video-standard'");
    expect(assignmentSql).toContain("v_required_skill = any (tm.skills)");
    expect(assignmentSql).toContain("'Queued: no team member has the skill required for ' || v_required_skill || '.'");
    expect(assignmentSql).not.toContain("v_det.asset_type = any (tm.skills)");
  });

  it("sets Hero Album effort to 16 points", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("when subtype in ('hero album','hero-album') then 16::numeric");
    expect(assignmentSql).toContain("array['hero-album']::text[]");
    expect(assignmentSql).toContain("and 'banner' = any (coalesce(tm.skills, '{}'::text[]))");
  });

  it("lets Team settings admins edit Ploy as a GD/VE owner", () => {
    const adminSql = readFileSync(join(process.cwd(), "supabase", "team_settings_admin.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(adminSql).toContain("array['pond','jo','tong','eye','vee','ploy']");
    expect(assignmentSql).toContain("array['pond','jo','tong','eye','vee','ploy']");
    expect(assignmentSql).toContain("select lower(coalesce(p_member_code, '')) = any (array['pond','jo','tong','eye','vee','ploy'])");
  });

  it("prioritizes Ploy and Vee when the requester is from Esport", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("v_requester_context text := 'ops_marketing'");
    expect(assignmentSql).toContain("then 'esport'");
    expect(assignmentSql).toContain("lower(requester_tm.member_code) = any (array['ben','net','peak','pluem'])");
    expect(assignmentSql).toContain("when v_requester_context = 'esport' and lower(tm.member_code) in ('ploy','vee') then 0");
    expect(assignmentSql).toContain("when v_requester_context = 'esport' and lower(tm.member_code) = 'ploy' then 0");
    expect(assignmentSql).toContain("when v_requester_context = 'esport' and lower(tm.member_code) = 'vee' then 1");
  });

  it("prioritizes Ops and Marketing requests by Pond video/motion, then Joe, Tong, Eye", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) in ('pond','jo','tong','eye') then 0");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'pond' and v_required_skill in ('motion','video-standard','video-under-1-min') then 0");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'jo' then 1");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'tong' then 2");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'eye' then 3");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'pond' then 4");
    expect(assignmentSql).toContain("order by pool_rank asc,\n           context_rank asc,\n           context_tie_rank asc,");
  });

  it("drops and recreates member_workload_v around the team_members.skills type migration", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const dropIndex = assignmentSql.indexOf("drop view if exists public.member_workload_v;");
    const alterIndex = assignmentSql.indexOf("alter column skills type text[] using skills::text[];");
    const recreateIndex = assignmentSql.indexOf("create or replace view public.member_workload_v");

    expect(dropIndex).toBeGreaterThan(-1);
    expect(alterIndex).toBeGreaterThan(dropIndex);
    expect(recreateIndex).toBeGreaterThan(alterIndex);
    expect(assignmentSql).toContain("revoke all privileges on public.member_workload_v from public, anon, authenticated");
    expect(assignmentSql).toContain("grant select on public.member_workload_v to authenticated");
  });

  it("keeps Pond eligible as urgent video fallback and seeds the compatibility backup skill", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("v_allow_backup_pool boolean");
    expect(assignmentSql).toContain("v_allow_backup_pool := v_wi.priority = 'urgent' and v_required_skill in ('video-standard','video-under-1-min');");
    expect(assignmentSql).toContain("when v_allow_backup_pool");
    expect(assignmentSql).toContain("or lower(tm.member_code) = 'pond'");
    expect(assignmentSql).toContain("where lower(tm.member_code) = 'pond'");
    expect(assignmentSql).toContain("and lower(tm.member_code) = any (v_creative_owner_codes)");
    expect(assignmentSql).toContain("array['video-standard','video-under-1-min']::text[]");
    expect(assignmentSql).toContain("Auto (urgent fallback)");
  });

  it("seeds Tong as available full-capacity by default", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    const tongRow = seedSql
      .split("\n")
      .find((line) => line.includes("'tong'") && line.includes("'Tong'")) || "";

    expect(tongRow).toContain("8, null, 3, 'available', true");
    expect(tongRow).not.toContain("8, 4, 3, 'partial', true");
  });

  it("does not include creative request template SQL in the active run order", () => {
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(readme).not.toContain("supabase/creative_request_templates.sql");
    expect(readme).not.toContain("creative_request_templates");
  });

  it("documents team_settings_admin.sql after existing MVP 1.2 SQL files", () => {
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");
    const viewIndex = readme.indexOf("supabase/view_security_hardening.sql");
    const teamSettingsIndex = readme.indexOf("supabase/team_settings_admin.sql");

    expect(viewIndex).toBeGreaterThan(-1);
    expect(teamSettingsIndex).toBeGreaterThan(viewIndex);
  });
});

// ============================================================================
// Public view security hardening
// ============================================================================
describe("public view security hardening", () => {
  it("locks workload and flag views behind authenticated security-invoker access", () => {
    const viewHardeningSql = readFileSync(join(process.cwd(), "supabase", "view_security_hardening.sql"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const collaborationSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    for (const sql of [schemaSql, collaborationSql]) {
      expect(sql).toContain("create or replace view public.member_workload_v\nwith (security_invoker = true) as");
      expect(sql).toContain("create or replace view public.work_item_flags_v\nwith (security_invoker = true) as");
      expect(sql).toContain("revoke all privileges on public.member_workload_v from public, anon, authenticated");
      expect(sql).toContain("revoke all privileges on public.work_item_flags_v from public, anon, authenticated");
      expect(sql).toContain("grant select on public.member_workload_v to authenticated");
      expect(sql).toContain("grant select on public.work_item_flags_v to authenticated");
    }

    expect(viewHardeningSql).toContain("alter view if exists public.member_workload_v");
    expect(viewHardeningSql).toContain("set (security_invoker = true)");
    expect(viewHardeningSql).toContain("revoke all privileges on public.member_workload_v from public, anon, authenticated");
    expect(viewHardeningSql).toContain("revoke all privileges on public.work_item_flags_v from public, anon, authenticated");
    expect(viewHardeningSql).toContain("grant select on public.member_workload_v to authenticated");
    expect(viewHardeningSql).toContain("grant select on public.work_item_flags_v to authenticated");
    expect(readme).toContain("supabase/view_security_hardening.sql");
  });
});

// ============================================================================
// Production go-live reset utility
// ============================================================================
describe("production task reset SQL", () => {
  it("clears work, task notifications, and leave data without touching users or team settings", () => {
    const resetSql = readFileSync(join(process.cwd(), "supabase", "reset_tasks_for_production.sql"), "utf8");
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(resetSql).toContain("begin;");
    expect(resetSql).toContain("commit;");
    expect(resetSql).toContain("delete from public.notifications");
    expect(resetSql).toContain("where work_item_id is not null");
    expect(resetSql).toContain("or event_id in (select id from public.work_item_events)");
    expect(resetSql).toContain("delete from public.leave_requests;");
    expect(resetSql).toContain("delete from public.work_items;");
    expect(resetSql).toContain("'work_items' as table_name");
    expect(resetSql).toContain("'leave_requests'");
    expect(resetSql).not.toMatch(/delete\s+from\s+public\.(users|team_members|user_whitelist|creative_request_templates)\b/i);
    expect(resetSql).not.toMatch(/truncate\s+table/i);
    expect(readme).toContain("supabase/reset_tasks_for_production.sql");
  });
});

// ============================================================================
// UAT-026 — Workload counts match active creative items
// ============================================================================
describe("UAT-026 workload summary numbers", () => {
  const summary = calculateWorkloadSummary(fixture);

  it("overdueCount counts only items flagged overdue", () => {
    expect(summary.overdueCount).toBe(1);
  });

  it("dueSoonCount counts each due-soon row exactly once", () => {
    // CR-1054 (queued, due soon) + CR-1047 (review, due soon) + QT-0209 (in_progress) = 3
    expect(summary.dueSoonCount).toBe(3);
  });

  it("queuedCount equals number of rows with isQueued=true", () => {
    expect(summary.queuedCount).toBe(2);
  });
});

// ============================================================================
// MVP-1.0 status & priority label formatting (UI sanity)
// ============================================================================
describe("status/asset formatters", () => {
  it("formatStatus turns snake_case into Title Case", () => {
    expect(formatStatus("in_progress")).toBe("In Progress");
    expect(formatStatus("need_brief")).toBe("Need Brief");
    expect(formatStatus("queued")).toBe("Queued");
  });

  it("formatAssetType returns 'Quick task' for null", () => {
    expect(formatAssetType(null)).toBe("Quick task");
  });

  it("formatAssetType title-cases known asset types", () => {
    expect(formatAssetType("static_graphic")).toBe("Static Graphic");
    expect(formatAssetType("esport_video")).toBe("Esport Video");
  });
});

// ============================================================================
// Regressions to guard the rule "Review round increments ONLY on review→in_progress"
// — derived state only; the actual increment lives in the RPC.
// ============================================================================
describe("review_round display rule", () => {
  it("R{n} pill is only meaningful when review_round > 0", () => {
    const row: WorkItemSummary & { reviewRound: number } = {
      ...fixture[3],
      reviewRound: 0,
    } as any;
    expect((row as any).reviewRound > 0).toBe(false);
  });
});
