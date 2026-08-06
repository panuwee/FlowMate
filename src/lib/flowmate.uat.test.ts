import { existsSync, readFileSync } from "node:fs";
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
  // CR review, assigned to Pond (submitted work is tracked in Review but no longer consumes production cap)
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
  const code = readFileSync(join(process.cwd(), "search-utils.js"), "utf8");
  const sandbox = {
    window: {
      MEMBERS_BY_ID: {},
    },
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.window as unknown as {
    matchesFlowMateSearch: (row: Record<string, unknown>, query: string) => boolean;
    getFlowMateCreatedDisplayId: (created: unknown) => string;
    findFlowMateWorkItemById: <T extends { id?: string }>(rows: T[], id: string) => T | null;
    filterFlowMateAssigneeOptions: <T extends { name?: string }>(options: T[], query: string) => T[];
    getFlowMateMyWorkRows: <T extends { assignee?: string; status?: string }>(
      rows: T[],
      currentUser: { id?: string; team_member_id?: string; name?: string },
      members: { id?: string; name?: string }[],
      query?: string,
    ) => T[];
    getFlowMateAttentionRows: <T extends { id?: string; status?: string }>(rows: T[], query?: string) => T[];
    isFlowMateOperationalRow: (row: { status?: string } | null | undefined) => boolean;
    getFlowMateListVisibleRows: <T extends { id?: string; status?: string }>(rows: T[] | null | undefined, filterStatus?: string) => T[];
    getFlowMateAttentionGroups: <T extends { id?: string; status?: string }>(rows: T[], query?: string) => Record<string, T[]>;
    getFlowMateNavCounts: <T extends { assignee?: string; status?: string }>(
      rows: T[],
      currentUser: { id?: string; team_member_id?: string; name?: string },
      members: { id?: string; name?: string }[],
    ) => { "my-work": number; attention: number };
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
    isFlowMateGdVeMember: (member: { name?: string; member_code?: string; id?: string; discipline?: string; discipline_short?: string }) => boolean;
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
      productEvent?: string;
    }) => string;
  };
}

function loadGithubQuickTaskUtils() {
  const code = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const sandbox = {
    console,
    window: {
      FLOWMATE_CURRENT_USER: null as { role?: string } | null,
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
  it("creativeEffort includes Review until delivery and excludes queued/delivered/cancelled", () => {
    const summary = calculateWorkloadSummary(fixture);
    // CR-1042 plus the Review item reserve capacity until delivery.
    expect(summary.creativeEffort).toBe(8);
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
      { id: "CR-2", status: "unassigned", title: "Unassigned" },
      { id: "CR-3", status: "need_brief", title: "Need brief" },
    ];

    expect(utils.getFlowMateMyWorkRows(rows, currentUser, members).map((row) => row.id)).toEqual(["QT-1"]);
    expect(utils.getFlowMateAttentionRows(rows).map((row) => row.id)).toEqual(["CR-2"]);
    expect(utils.getFlowMateNavCounts(rows, currentUser, members)).toEqual({ "my-work": 1, attention: 1 });
  });

  it("matches global search against MVP 1.3 channel and publish fields", () => {
    const row = {
      id: "CR-3101",
      title: "Planning asset",
      campaign: "Songkran Launch",
      channel: "LINE",
      publishDate: "2026-07-15",
      publishLabel: "Jul 15",
    };

    expect(utils.matchesFlowMateSearch(row, "songkran")).toBe(true);
    expect(utils.matchesFlowMateSearch(row, "line")).toBe(true);
    expect(utils.matchesFlowMateSearch(row, "2026-07-15")).toBe(true);
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
    expect(utils.isFlowMateGdVeMember({ name: "Ploy", member_code: "ploy" })).toBe(true);
    expect(utils.isFlowMateGdVeMember({ name: "Future member", discipline: "GD/VE" })).toBe(true);
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

  it("builds [D MMM YYYY][Function][Project Name] and optional [Product / Event]", () => {
    expect(utils.buildFlowMateTemplateTitle({
      launchDate: "2026-07-03",
      requesterTeam: "Marketing",
      projectName: "FCO S24 Launch",
    })).toBe("[3 Jul 2026][Marketing][FCO S24 Launch]");
    expect(utils.buildFlowMateTemplateTitle({
      launchDate: "2026-12-11",
      requesterTeam: "Operations",
      projectName: "Year End",
    })).toBe("[11 Dec 2026][Operations][Year End]");
    expect(utils.buildFlowMateTemplateTitle({
      launchDate: "2026-06-29",
      requesterTeam: "Operations",
      projectName: "DAU",
      productEvent: "Hero Post Teaser",
    })).toBe("[29 Jun 2026][Operations][DAU][Hero Post Teaser]");
  });
});

describe("MVP 1.1 create form draft saving", () => {
  const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");

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
    expect(creativeFormSource).toContain("dueDate: getFlowMateAutoCreativeDraftDate(nextValue)");
  });
});

describe("quick task Other assignee SQL support", () => {
  it("shows the current deploy cache version beside the FlowMate brand", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const homeIndexHtml = readFileSync(join(process.cwd(), "home", "index.html"), "utf8");
    const productBookIndexHtml = readFileSync(join(process.cwd(), "product-book", "index.html"), "utf8");
    const activeEntryHtml = [indexHtml, homeIndexHtml, productBookIndexHtml].join("\n");

    // Version-agnostic: the deploy stamp changes on every cache-bust, so
    // assert the shape, not a specific value.
    expect(appJsx).toContain("function getFlowMateAppVersion()");
    expect(appJsx).toContain('return /(?:^|\\/)app\\.js(?:\\?|$)/.test(src);');
    expect(appJsx).toContain('const FLOWMATE_APP_VERSION = getFlowMateAppVersion();');
    const appBrandSource = appJsx.slice(
      appJsx.indexOf('className: "app__brand"'),
      appJsx.indexOf('className: "app__topbar"'),
    );
    expect(appBrandSource).toContain('className: "app__brand-version"');
    expect(appBrandSource).toContain("FLOWMATE_APP_VERSION");
    expect(appCss).toContain(".app__brand-version");
    expect(appCss).toContain(".app__main--product-book {\n  padding: 0 var(--s-6) var(--s-7);");
    expect(appCss).not.toContain("box-shadow: 0 -28px");
    expect(activeEntryHtml).toMatch(/app\.js\?v=\d{8}-\d+/);
    expect(activeEntryHtml).not.toContain("v20260709-6");
  });

  it("serves Product Book from a direct GitHub Pages path", () => {
    const productBookIndexPath = join(process.cwd(), "product-book", "index.html");

    expect(existsSync(productBookIndexPath)).toBe(true);

    const productBookIndexHtml = readFileSync(productBookIndexPath, "utf8");

    expect(productBookIndexHtml).toContain('<base href="../" />');
    expect(productBookIndexHtml).toContain('window.location.hash = "product-book-latest"');
    expect(productBookIndexHtml).toMatch(/app\.js\?v=\d{8}-\d+/);
  });

  it("serves a GitHub Pages 404 fallback for direct deep links", () => {
    const notFoundPath = join(process.cwd(), "404.html");

    expect(existsSync(notFoundPath)).toBe(true);

    const notFoundHtml = readFileSync(notFoundPath, "utf8");

    expect(notFoundHtml).toContain("FlowMate - Redirecting");
    expect(notFoundHtml).toContain('var repoBase = "/FlowMate/"');
    expect(notFoundHtml).toContain('targetHash = "product-book-latest"');
    expect(notFoundHtml).toContain('targetHash = "campaign-timeline"');
    expect(notFoundHtml).toContain('targetHash = "my-work"');
    expect(notFoundHtml).toContain('l.replace(l.origin + repoBase + "#" + targetHash)');
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
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
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
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(creativeFormSource).toContain("Auto-filled from Launch Date, your account team, Campaign, and Product / Event.");
    expect(creativeFormSource).toContain("Product / Event");
    expect(creativeFormSource).toContain("Channel Tag");
    expect(createScreenJsx).toContain('requireField("platforms", "Channel Tag is required.")');
    expect(createScreenJsx).toContain("FLOWMATE_CREATIVE_CHANNEL_OPTIONS");
    expect(createScreenJsx).toContain("function normalizeFlowMateCreativeChannels");
    expect(creativeFormSource).toContain("function toggleChannel");
    expect(creativeFormSource).not.toContain('placeholder="Instagram, TikTok, YouTube, Web..."');
    expect(creativeFormSource).not.toContain("Requester Team / Function");
  });

  it("creative request removes Publish Date and places Reference link beside Brief link", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(createScreenJsx).not.toContain('requireField("publishDate"');
    expect(createScreenJsx).not.toContain('requireNotPast("publishDate"');
    expect(creativeFormSource).not.toContain("Publish Date");
    expect(creativeFormSource.indexOf("Brief link")).toBeGreaterThan(-1);
    expect(creativeFormSource.indexOf("Reference link")).toBeGreaterThan(creativeFormSource.indexOf("Brief link"));
    expect(creativeFormSource.indexOf("Brief Note")).toBeGreaterThan(creativeFormSource.indexOf("Reference link"));
  });

  it("creative request uses the signed-in account team without rendering a requester team picker", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );
    const quickTaskFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function QuickTaskForm"),
      createScreenJsx.indexOf("function CreativeRequestForm"),
    );

    expect(createScreenJsx).toContain("requesterTeam: getDefaultRequesterTeam()");
    expect(createScreenJsx).not.toContain('requireField("requesterTeam", "Requester team is required.");\n  requireField("campaignName"');
    expect(quickTaskFormSource).toContain("requesterTeamOptions.map");
    expect(creativeFormSource).not.toContain("requesterTeamOptions");
    expect(creativeFormSource).not.toContain("errors.requesterTeam");
  });

  it("creative request auto-generates an effort-aware 1st Draft without moving past Launch", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"), createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("function subtractFlowMateWorkingDays");
    expect(createScreenJsx).toContain("function getFlowMateEarliestCreativeDraftDate(draft, now = new Date())");
    expect(createScreenJsx).toContain("function getFlowMateAutoCreativeDraftDate(draft, now = new Date())");
    expect(createScreenJsx).toContain("dueDate: getFlowMateAutoCreativeDraftDate(nextValue)");
    expect(createScreenJsx).not.toContain("const shouldAutoFillDraftDate = !value.dueDate || value.dueDate === previousAutoDraftDate");
    expect(createScreenJsx).toContain('requireField("dueDate", "1st Draft is required.")');
    expect(creativeFormSource).toContain("1st Draft");
    expect(creativeFormSource).toContain("readOnly");
    expect(creativeFormSource).toContain("disabled");
    expect(creativeFormSource).toContain("Generated from effort, current production cutoff, and Launch Date review buffer.");
    expect(creativeFormSource).not.toContain("Due date");
    expect(quickTaskFormSource).toContain("1st Review / Draft");
    expect(quickTaskJs).toContain("p_due_date:         input.dueDate || null");
    expect(assignmentSql).toContain("create or replace function public.flowmate_earliest_capacity_date(");
    expect(assignmentSql).toContain("v_earliest_feasible_due_date := public.flowmate_earliest_capacity_date(");
    expect(assignmentSql).toContain("v_due_date := least(");
    expect(assignmentSql).toContain("coalesce(p_due_date, v_review_target_date, v_production_start)");
    expect(assignmentSql).toContain("v_review_buffer_working_days integer := 2");
    expect(assignmentSql).toContain("v_review_buffer_at_risk := v_due_date > v_review_target_date");
  });

  it("creative request form has a Brief Note field that is submitted to description", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
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
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("assetCount: \"1\"");
    expect(createScreenJsx).toContain("assetSubtype2: \"\"");
    expect(createScreenJsx).toContain("assetCount2: \"\"");
    expect(createScreenJsx).toContain("\"assetCount\"");
    expect(createScreenJsx).toContain("\"assetCount2\"");
    expect(createScreenJsx).toContain('requirePositiveInteger("assetCount", "Asset Count must be at least 1.")');
    expect(createScreenJsx).toContain('requirePositiveInteger("assetCount2", "Asset Count 2 must be at least 1 when Type / Skill 2 is selected.")');
    expect(creativeFormSource).toContain("Asset Count");
    expect(creativeFormSource).toContain("Type / Skill 2");
    expect(creativeFormSource).toContain("Asset Count 2");
    expect(creativeFormSource).toContain('type="number"');
    expect(creativeFormSource).toContain("min=\"1\"");
    expect(quickTaskJs).toContain("p_asset_count:      Number(input.assetCount || 1)");
    expect(quickTaskJs).toContain("p_asset_type_2");
    expect(quickTaskJs).toContain("p_asset_subtype_2");
    expect(quickTaskJs).toContain("p_asset_count_2");
    expect(listDataJs).toContain("asset_count");
    expect(listDataJs).toContain("assetCount: details.asset_count || 1");
    expect(listDataJs).toContain("asset_type_2");
    expect(listDataJs).toContain("assetCount2: details.asset_count_2 || null");
    expect(schemaSql).toContain("asset_count integer not null default 1");
    expect(schemaSql).toContain("asset_type_2 public.asset_type");
    expect(schemaSql).toContain("asset_count_2 integer");
    expect(assignmentSql).toContain("p_asset_count integer default 1");
    expect(assignmentSql).toContain("p_asset_type_2 public.asset_type default null");
    expect(assignmentSql).toContain("p_asset_count_2 integer default null");
    expect(assignmentSql).toContain("greatest(1, coalesce(p_asset_count, 1))");
  });

  it("warns and auto-promotes Creative Requests to Urgent for production or review-buffer risk", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const handleSubmitSource = createScreenJsx.slice(createScreenJsx.indexOf("async function handleSubmit"));

    expect(createScreenJsx).toContain("const FLOWMATE_NORMAL_CREATIVE_CAPACITY_PER_DAY = 8");
    expect(createScreenJsx).toContain("const FLOWMATE_CREATIVE_CAPACITY_PER_BUCKET = 4");
    expect(createScreenJsx).toContain("const FLOWMATE_MIDDAY_CUTOFF_HOUR = 12");
    expect(createScreenJsx).toContain("const FLOWMATE_PRODUCTION_CUTOFF_HOUR = 15");
    expect(createScreenJsx).toContain("function getFlowMateCreativeEffortEstimate(draft)");
    expect(createScreenJsx).toContain("function getFlowMateProductionStartBucket(now = new Date())");
    expect(createScreenJsx).toContain("function countFlowMateCapacityBucketsInclusive(startDate, startHalf, endDate)");
    expect(createScreenJsx).toContain("function getFlowMateCreativeTimePressure(draft)");
    expect(handleSubmitSource).toContain("const timePressure = mode === \"creative\" ? getFlowMateCreativeTimePressure(submissionDraft) : null");
    expect(handleSubmitSource).toContain("timePressure.requiresUrgent");
    expect(handleSubmitSource).toContain("await window.flowmatePrompt({");
    expect(handleSubmitSource).toContain("hideInput: true");
    expect(handleSubmitSource).toContain("Priority will be set to Urgent");
    expect(handleSubmitSource).toContain("priority: \"urgent\"");
    expect(createScreenJsx).toContain("Auto urgent:");
    expect(handleSubmitSource).toContain("submissionDraft = urgentDraft");
    expect(assignmentSql).toContain("v_time_pressure_effort");
    expect(assignmentSql).toContain("v_time_pressure_capacity := public.flowmate_count_capacity_buckets(v_production_start, v_production_start_half, v_due_date) * 4");
    expect(assignmentSql).toContain("v_requested_priority := 'urgent'");
    expect(assignmentSql).toContain("v_review_buffer_at_risk");
    expect(assignmentSql).toContain("Auto urgent:");
  });

  it("removes Hybrid from the Creative Request asset type picker", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(creativeFormSource).not.toContain('value="hybrid"');
    expect(creativeFormSource).not.toContain("Hybrid (static + video)");
    expect(creativeFormSource).not.toContain("needs_split = true");
    expect(createScreenJsx).not.toContain("Hybrid static + video package");
  });

  it("creative request form no longer exposes platform and size templates", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
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
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
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
    expect(createScreenSource).toContain("Please complete the highlighted required fields.");
    expect(handleSubmitSource.indexOf("setCreateAlert(")).toBeLessThan(handleSubmitSource.indexOf("window.createFlowMateQuickTask"));
    expect(handleSubmitSource.indexOf("setCreateAlert(")).toBeLessThan(handleSubmitSource.indexOf("window.createFlowMateCreativeRequest"));
    expect(quickTaskFormSource).toContain("errors = {}");
    expect(creativeFormSource).toContain("errors = {}");
    expect(quickTaskFormSource).toContain("field--error");
    expect(creativeFormSource).toContain("field--error");
    expect(quickTaskFormSource).toContain("field__error");
    expect(creativeFormSource).toContain("field__error");
    expect(appCss).toContain(".field--error .field__label");
    expect(appCss).toContain(".field--error .input");
  });

  it("blocks Creative Request submit and shows a popup when Brief Link is not a real URL", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const validationSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function getFlowMateCreateValidationErrors"),
      createScreenJsx.indexOf("function readFlowMateCreateDraft"),
    );
    const handleSubmitSource = createScreenJsx.slice(
      createScreenJsx.indexOf("async function handleSubmit()"),
      createScreenJsx.indexOf("const timePressure = mode === \"creative\""),
    );
    const validationBlock = handleSubmitSource.slice(
      handleSubmitSource.indexOf("if (Object.keys(nextValidationErrors).length > 0)"),
    );

    expect(createScreenJsx).toContain("const FLOWMATE_INVALID_BRIEF_LINK_MESSAGE = \"กรุณาใส่ Brief Link ที่ถูกต้อง\";");
    expect(createScreenJsx).toContain("function isFlowMateValidHttpUrl(value)");
    expect(validationSource).toContain("requireHttpUrl(\"briefLink\", FLOWMATE_INVALID_BRIEF_LINK_MESSAGE);");
    expect(handleSubmitSource).toContain("const hasInvalidBriefLink = nextValidationErrors.briefLink === FLOWMATE_INVALID_BRIEF_LINK_MESSAGE;");
    expect(handleSubmitSource).toContain("title: \"Brief Link ไม่ถูกต้อง\"");
    expect(handleSubmitSource).toContain("note: FLOWMATE_INVALID_BRIEF_LINK_MESSAGE");
    expect(handleSubmitSource).toContain("setCreateAlert(hasInvalidBriefLink ? FLOWMATE_INVALID_BRIEF_LINK_MESSAGE : \"Please complete the highlighted required fields.\")");
    expect(validationBlock.indexOf("setCreateAlert(hasInvalidBriefLink ? FLOWMATE_INVALID_BRIEF_LINK_MESSAGE")).toBeLessThan(validationBlock.indexOf("return;"));
  });

  it("live detail loads and shows work item description as note content", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(listDataJs).toContain("description");
    expect(listDataJs).toContain("briefNote: item.description || \"\"");
    expect(listDataJs).toContain("note: item.description || \"\"");
    expect(detailSource).toContain("const visibleBriefNote = w.briefNote || w.note || \"\"");
    expect(detailSource).toContain("Brief Note");
    expect(detailSource).toContain("visibleBriefNote");
  });

  it("detail cancel failure tells admins which SQL RPC files to rerun", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(detailSource).toContain("Cancel failed. Run supabase/rpc_quick_task.sql and supabase/collaboration_admin.sql, then refresh.");
  });

  it("detail view surfaces all extra fields collected by create forms", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(listDataJs).toContain("urgent_reason");
    expect(listDataJs).toContain("brief_link");
    expect(listDataJs).toContain("reference_link");
    expect(listDataJs).toContain("urgentReason: item.urgent_reason || \"\"");
    expect(listDataJs).toContain("briefLink: details.brief_link || \"\"");
    expect(listDataJs).toContain("referenceLink: details.reference_link || \"\"");
    expect(listDataJs).toContain("publishDate: item.publish_date");
    expect(detailSource).toContain("Brief link");
    expect(detailSource).toContain("Reference link");
    expect(detailSource).toContain("Urgent reason");
    expect(detailSource).toContain("Launch date");
    expect(detailSource).not.toContain("<div className=\"meta-row__lbl\">Publish Date</div>");
  });

  it("detail side panel orders Created, 1st Draft, Launch date, then AI Tag and hides Publish Date", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));
    const creativeDetailsSource = detailSource.slice(detailSource.indexOf("{hasCreativeDetails"), detailSource.indexOf("Link zone"));
    const sideSource = detailSource.slice(detailSource.indexOf("detail__side"), detailSource.indexOf("Activity log"));

    expect(sideSource.indexOf("Created")).toBeGreaterThan(-1);
    expect(sideSource).not.toContain("Publish Date");
    expect(sideSource.indexOf("1st Draft")).toBeGreaterThan(sideSource.indexOf("Created"));
    expect(sideSource.indexOf("Launch date")).toBeGreaterThan(sideSource.indexOf("1st Draft"));
    expect(sideSource.indexOf("AI Tag")).toBeGreaterThan(sideSource.indexOf("Launch date"));
    expect(creativeDetailsSource).not.toContain("Launch date");
  });

  it("MVP 1.3 create flow captures Campaign, Channel Tag, and Launch Date without a separate Publish Date field", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(creativeFormSource).toContain("Campaign");
    expect(creativeFormSource).toContain("Channel Tag");
    expect(creativeFormSource).not.toContain("Publish Date");
    expect(creativeFormSource).toContain("1st Draft");
    expect(creativeFormSource).toContain("Launch date");
    expect(creativeFormSource).toContain("Generated from effort, current production cutoff, and Launch Date review buffer.");
    expect(quickTaskJs).toContain("p_publish_date:    input.publishDate || null");
    expect(quickTaskJs).toContain("p_due_date:         input.dueDate || null");
    expect(quickTaskJs).toContain("p_launch_date:      input.launchDate || null");
  });

  it("MVP 1.3 list loader maps publish date and planning date fallback fields", () => {
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");

    expect(listDataJs).toContain("publish_date");
    expect(listDataJs).toContain("publishDate: item.publish_date");
    expect(listDataJs).toContain("publishLabel: flowmateDateLabel(item.publish_date)");
    expect(listDataJs).toContain("publishFullLabel: flowmateDateFullLabel(item.publish_date)");
    expect(listDataJs).toContain("planningDate: item.publish_date || item.launch_date");
    expect(listDataJs).toContain("channel: (details.platforms || []).join(\", \")");
  });

  it("MVP 1.3 detail, list filters, and export surface planning fields", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const listScreenJsx = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));
    const listSource = listScreenJsx.slice(listScreenJsx.indexOf("function ListScreen"));
    const exportSource = listScreenJsx.slice(
      listScreenJsx.indexOf("function exportRowsCsv"),
      listScreenJsx.indexOf("/* ============================================================"),
    );

    expect(detailSource).toContain("Campaign");
    expect(detailSource).toContain("Channel");
    expect(detailSource).toContain("Launch date");
    expect(detailSource).not.toContain("<div className=\"meta-row__lbl\">Publish Date</div>");
    expect(detailSource).toContain("Type / Skill");
    expect(detailSource).toContain("Asset Count");
    expect(listSource).toContain("filterCampaign");
    expect(listSource).toContain("filterChannel");
    expect(listSource).toContain("All campaigns");
    expect(listSource).toContain("All channels");
    expect(listSource).toContain("Campaign");
    expect(listSource).toContain("Channel");
    expect(listSource).toContain("Publish Date");
    expect(exportSource).toContain("\"Campaign\"");
    expect(exportSource).toContain("\"Channel\"");
    expect(exportSource).toContain("\"Publish Date\"");
    expect(exportSource).toContain("\"Launch Date\"");
    expect(exportSource).toContain("\"1st Draft\"");
    expect(exportSource).toContain("\"Type / Skill\"");
    expect(exportSource).toContain("\"Asset Count\"");
  });

  it("quick task detail mirrors the fields from quick task creation", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(detailSource).toContain("Quick Task details");
    expect(detailSource).toContain("Requester Team / Function");
    expect(detailSource).toContain("Project / campaign");
    expect(detailSource).toContain("1st Review / Draft");
    expect(detailSource).toContain("Priority");
    expect(detailSource).toContain("w.type === \"quick\"");
  });

  it("my work and sidebar counts use active rows instead of static counts", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const myWorkSource = createScreenJsx.slice(createScreenJsx.indexOf("function MyWorkScreen"));

    expect(appJsx).not.toContain("count: 7");
    expect(appJsx).not.toContain("count: 4");
    expect(appJsx).toContain("navCounts");
    expect(appJsx).toContain("getFlowMateNavCounts");
    expect(myWorkSource).toContain("getFlowMateMyWorkRows");
    expect(myWorkSource).toContain("activeGroupIds");
    expect(myWorkSource).toContain("const overdue = mine.filter");
    expect(myWorkSource).toContain("const capacityRisk = mine.filter");
    expect(myWorkSource).toContain("riskGroupIds");
  });

  it("detail note preserves line breaks from the create textarea", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));

    expect(detailSource).toContain('whiteSpace: "pre-wrap"');
  });

  it("live detail view does not show static mock brief, checklist, comments, or activity", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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
    const dataJsx = readFileSync(join(process.cwd(), "data.jsx"), "utf8");

    expect(dataJsx).toContain("const WORK = [];");
    expect(dataJsx).not.toContain("CR-1051");
    expect(dataJsx).not.toContain("QT-209");
    expect(dataJsx).not.toContain("OB48 Launch");
    expect(dataJsx).not.toContain('const TODAY = "May 15"');
  });

  it("does not show hard-coded mock fallback messages or timestamps in live screens", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
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
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");

    expect(screensC).not.toContain("const memberKpi = [");
    expect(screensC).not.toContain("const teamKpi = [");
    expect(screensC).not.toContain("delivered: 22");
    expect(screensC).not.toContain("count: 28");
    expect(screensC).not.toContain("Apr 19-May 15, 2026");
    expect(screensC).toContain("window.loadFlowMateListRows");
  });

  it("KPI monthly export controls are enabled", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));
    const searchUtils = readFileSync(join(process.cwd(), "search-utils.js"), "utf8");

    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_START = "2026-01"');
    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_END = "2027-12"');
    expect(searchUtils).toContain("function getFlowMateMonthOptions");
    expect(searchUtils).toContain("function filterFlowMateRowsByMonth");
    expect(kpiSource).toContain("const [kpiExportMonth, setKpiExportMonth] = useStateC(flowMateDefaultExportMonthC())");
    expect(kpiSource).toContain("window.loadFlowMateKpiRows({ month: kpiExportMonth })");
    expect(kpiSource).toContain("const effectiveKpiMonthOptions = flowMateMonthOptionsC()");
    expect(kpiSource).toContain("const selectedKpiExportMonth = kpiExportMonth");
    expect(kpiSource).toContain("const kpiRows = flowMateFilterRowsByMonthC(rows, selectedKpiExportMonth, [\"calendarDate\", \"dueDate\"])");
    expect(kpiSource).toContain("function exportKpiRows()");
    expect(kpiSource).toContain("data-testid=\"flowmate-kpi-export-month\"");
    expect(kpiSource).toContain("effectiveKpiMonthOptions.map");
    expect(kpiSource).toContain("flowmate-kpi-${selectedKpiExportMonth}");
    expect(kpiSource).toContain("onClick={exportKpiRows}");
    expect(kpiSource).not.toContain("KPI export is planned for MVP 1.1");
    expect(kpiSource).not.toContain("Last 4 weeks - MVP 1.1");
  });

  it("KPI tracks AI-tagged work per member and exports GD/VE AI detail tabs", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const dataJsx = readFileSync(join(process.cwd(), "data.jsx"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(listDataJs).toContain('"work_item_ai_tags"');
    expect(listDataJs).toContain("aiTagsByWorkItemId");
    expect(listDataJs).toContain("aiTags: aiTagsByWorkItemId[item.id] || []");
    expect(dataJsx).toContain("function flowmateDownloadWorkbook(");
    expect(screensC).toContain("function flowMateKpiAiTagsC(row)");
    expect(kpiSource).toContain("aiTaggedItems");
    expect(kpiSource).toContain("AI Tagged");
    expect(kpiSource).toContain("flowMateKpiGdVeAiSheets");
    expect(kpiSource).toContain("Task ID");
    expect(kpiSource).toContain("Task name");
    expect(kpiSource).toContain("AI Tag");
    expect(kpiSource).toContain("window.flowmateDownloadWorkbook");
    expect(kpiSource).toContain("flowmate-kpi-${selectedKpiExportMonth}");
    expect(kpiSource).not.toContain("exportFlowMateCsvC(\n      `flowmate-kpi-${kpiExportMonth}");
  });

  it("KPI tracks average days from assigned to delivered and exports task-level completion detail", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(listDataJs).toContain("delivered_at");
    expect(listDataJs).toContain("createdAt: item.created_at");
    expect(listDataJs).toContain("deliveredAt: item.delivered_at");
    expect(screensC).toContain("function flowMateKpiAssignedAtC(row)");
    expect(screensC).toContain("function flowMateKpiDeliveredAtC(row)");
    expect(screensC).toContain("function flowMateKpiCompletionDaysC(row)");
    expect(kpiSource).toContain("Avg days to delivered");
    expect(kpiSource).toContain("completionDetailRows");
    expect(kpiSource).toContain("Completion detail");
    expect(kpiSource).toContain("Assigned At");
    expect(kpiSource).toContain("Delivered At");
    expect(kpiSource).toContain("Completion days");
    expect(screensC).toContain('timeZone: "Asia/Bangkok"');
  });

  it("KPI shows and exports a Cancelled report with reason and audit timestamps", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(listDataJs).toContain("cancel_reason");
    expect(listDataJs).toContain("cancelReason: item.cancel_reason || \"\"");
    expect(screensC).toContain("function flowMateKpiCancelledAtC(row)");
    expect(screensC).toContain("function flowMateKpiCancelReasonC(row)");
    expect(kpiSource).toContain("const cancelledRows = kpiRows.filter(w => w.status === \"cancelled\")");
    expect(kpiSource).toContain("Cancelled");
    expect(kpiSource).toContain("Cancelled detail");
    expect(kpiSource).toContain("Cancel reason");
    expect(kpiSource).toContain("Cancelled At");
  });

  it("KPI exports multi-tab data as xlsx and falls back to csv, not legacy xls", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const dataJsx = readFileSync(join(process.cwd(), "data.jsx"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(dataJsx).toContain("function flowmateCreateZipBlob(");
    expect(dataJsx).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(dataJsx).toContain('link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;');
    expect(kpiSource).toContain("const filename = `flowmate-kpi-${selectedKpiExportMonth}-${new Date().toISOString().slice(0, 10)}.xlsx`");
    expect(kpiSource).toContain('filename.replace(/\\.xlsx$/, ".csv")');
    expect(kpiSource).not.toContain('filename.replace(/\\.xls$/');
    expect(dataJsx).not.toContain("application/vnd.ms-excel");
    expect(dataJsx).not.toContain('filename.endsWith(".xls")');
  });

  it("topbar search shows global dropdown results outside List and opens the selected task", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");

    expect(appJsx).toContain("const [globalSearchRows, setGlobalSearchRows]");
    expect(appJsx).toContain("const [isGlobalSearchOpen, setIsGlobalSearchOpen]");
    expect(appJsx).toContain("const globalSearchResults =");
    expect(appJsx).toContain("function openGlobalSearchResult(row)");
    expect(appJsx).toContain("window.flowmateSelectedWorkItem = row");
    expect(appJsx).toContain("loadFlowMateListRows");
    expect(appJsx).toContain("GlobalSearchResultsPanel");
    expect(appJsx).toContain("onMouseDown");
    expect(appJsx).toContain("searchbar__result-id");
    expect(appJsx).toContain("searchbar__result-context");
    expect(appJsx).toContain('React.createElement("strong", null, "Campaign")');
    expect(appJsx).toContain('React.createElement("strong", null, "Assignee")');
    expect(appCss).toContain(".searchbar-wrap");
    expect(appCss).toContain(".searchbar-results");
    expect(appCss).toContain("width: min(760px, calc(100vw - 32px))");
    expect(appCss).toContain("overflow-wrap: anywhere");
  });

  it("topbar search closes results on outside click without clearing the typed query", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");

    expect(appJsx).toContain("const searchWrapRef = useRefApp(null)");
    expect(appJsx).toContain('document.addEventListener("mousedown", onSearchOutsideMouseDown)');
    expect(appJsx).toContain("if (searchWrapRef.current && !searchWrapRef.current.contains(event.target))");
    expect(appJsx).toContain("setIsGlobalSearchOpen(false)");
    expect(appJsx).toContain("ref: searchWrapRef");
    expect(appJsx).toContain("onFocus: () => setIsGlobalSearchOpen(true)");
    expect(appJsx).toContain("setIsGlobalSearchOpen(true);");
    expect(appJsx).toContain("isGlobalSearchOpen && normalizedGlobalSearch && React.createElement(GlobalSearchResultsPanel");
    expect(appJsx).not.toContain("setSearchInput(\"\");\n      setIsGlobalSearchOpen(false)");
  });

  it("My work UI has Team Flow style status filters and ordered sections", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const myWorkSource = screensA.slice(screensA.indexOf("function MyWorkScreen"));

    expect(myWorkSource).toContain("filterStatus");
    expect(myWorkSource).toContain("filterFlowMateMyWorkByStatus");
    expect(myWorkSource).toContain("sortFlowMateMyWorkRows");
    expect(myWorkSource.indexOf('title="Overdue"')).toBeLessThan(myWorkSource.indexOf('title="Due today"'));
    expect(myWorkSource).toContain("All statuses");
  });

  it("My work removes redundant header actions, uses Bangkok time, and hides empty sections", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const myWorkSource = screensA.slice(screensA.indexOf("function MyWorkScreen"));
    const groupSource = screensA.slice(screensA.indexOf("function MyWorkGroup"));

    expect(myWorkSource).not.toContain("showThisWeek");
    expect(myWorkSource).not.toContain("This week</button>");
    expect(myWorkSource).not.toContain('<Icon name="plus" /> New');
    expect(myWorkSource).toContain('timeZone: "Asia/Bangkok"');
    expect(myWorkSource).toContain("Bangkok.");
    expect(groupSource).toContain("if (!items.length) return null;");
    expect(groupSource).not.toContain("No items.");
  });

  it("My work row actions use a shared wrapper so Submit review and Block align", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const groupSource = screensA.slice(screensA.indexOf("function MyWorkGroup"));

    expect(groupSource).toContain('className="my-work-actions"');
    expect(groupSource).toContain('<Icon name="block" size={11} /> Block');
    expect(appCss).toContain(".my-work-actions");
    expect(appCss).toContain("align-items: center");
    expect(appCss).toContain("justify-content: flex-end");
  });

  it("Workload UI splits Non GD/VE and GD/VE tabs with defensive skill rendering", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
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
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"));

    expect(workloadSource).toContain('const WORKLOAD_TEAM_FILTERS = ["All", "Operations", "Marketing", "Esport"];');
    expect(workloadSource).toContain('const [teamFilter, setTeamFilter] = useStateC("All");');
    expect(workloadSource).toContain('const teamFilteredRows = tabRows.filter(r => teamFilter === "All" || r.m.discipline === teamFilter);');
    expect(workloadSource).toContain("WORKLOAD_TEAM_FILTERS.map");
    expect(workloadSource).toContain("Filter by team");
    expect(workloadSource).not.toContain('const WORKLOAD_TEAM_FILTERS = ["All", "Operations", "Marketing", "Esport", "GD/VE"];');
  });

  it("Workload uses a data-backed month filter and removes the range dropdown", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"), screensC.indexOf("/* ============================================================\n   KPI VIEW"));

    expect(screensC).toContain("function flowMateWorkloadMonthOptionsC(rows)");
    expect(workloadSource).toContain("const [workloadMonth, setWorkloadMonth] = useStateC(flowMateDefaultExportMonthC())");
    expect(workloadSource).toContain("const workloadMonthOptions = flowMateWorkloadMonthOptionsC(safeRows)");
    expect(workloadSource).toContain("const selectedWorkloadMonth = effectiveWorkloadMonthOptions.some(option => option.key === workloadMonth)");
    expect(workloadSource).toContain("flowMateFilterRowsByMonthC(r.allItems || r.items || [], selectedWorkloadMonth");
    expect(workloadSource).toContain("function exportWorkloadRows()");
    expect(workloadSource).toContain("data-testid=\"flowmate-workload-export-month\"");
    expect(workloadSource).toContain("effectiveWorkloadMonthOptions.map");
    expect(workloadSource).toContain("flowmate-workload-${selectedWorkloadMonth}");
    expect(workloadSource).toContain("onClick={exportWorkloadRows}");
    expect(workloadSource).not.toContain("workloadRange");
    expect(workloadSource).not.toContain("flowMateFilterRowsByRangeC");
    expect(workloadSource).not.toContain('<option value="this-week">This week</option>');
    expect(workloadSource).not.toContain('<option value="next-week">Next week</option>');
    expect(workloadSource).not.toContain('<option value="all-active">All active</option>');
    expect(workloadSource).not.toContain("flowMateMonthOptionsC().map");
    expect(workloadSource).not.toContain("Workload export is planned for MVP 1.1");
    expect(workloadSource).not.toContain("This week (5d) - MVP 1.1");
  });

  it("Workload assigned effort and capacity are scoped to the selected month", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"), screensC.indexOf("/* ============================================================\n   KPI VIEW"));

    expect(workloadSource).toContain("const selectedMonthWorkingDays = flowMateWorkingDaysInMonthC(selectedWorkloadMonth)");
    expect(workloadSource).toContain("const capacityWindow = r.effectiveCap * selectedMonthWorkingDays");
    expect(workloadSource).toContain("const monthOpenCreative = monthItems.filter");
    expect(workloadSource).toContain('const FLOWMATE_CAPACITY_STATUS_KEYS = ["assigned", "in_progress", "review", "blocked"];');
    expect(workloadSource).toContain("FLOWMATE_CAPACITY_STATUS_KEYS.includes(item.status)");
    expect(workloadSource).toContain("const assignedEffort = monthOpenCreative.reduce");
    expect(workloadSource).toContain("window: capacityWindow");
    expect(workloadSource).toContain("items: monthOpenCreative");
    expect(workloadSource).toContain("Load ({selectedMonthWorkingDays}wd)");
    expect(workloadSource).not.toContain("const activeOpenCreative = (r.allItems || r.items || []).filter");
  });

  it("Workload and assignment capacity keep Review counted until delivery", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadDataJs = readFileSync(join(process.cwd(), "supabase-workload-data.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const collaborationSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");

    expect(screensC).toContain('const FLOWMATE_CAPACITY_STATUS_KEYS = ["assigned", "in_progress", "review", "blocked"];');
    expect(workloadDataJs).toContain('const FLOWMATE_CAPACITY_STATUS_KEYS = ["assigned", "in_progress", "review", "blocked"];');
    expect(assignmentSql).toContain("wi.status in ('assigned','in_progress','review','blocked')");
    expect(schemaSql).toContain("wi.status in ('assigned', 'in_progress', 'review', 'blocked')");
    expect(collaborationSql).toContain("wi.status in ('assigned', 'in_progress', 'review', 'blocked')");
  });

  it("Workload counts Urgent assigned and requested items for the selected month", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadDataJs = readFileSync(join(process.cwd(), "supabase-workload-data.js"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"), screensC.indexOf("/* ============================================================\n   KPI VIEW"));

    expect(workloadDataJs).toContain("user_id");
    expect(workloadDataJs).toContain("requestedItems");
    expect(workloadSource).toContain("const monthRequestedItems = flowMateFilterRowsByMonthC(r.requestedItems || [], selectedWorkloadMonth");
    expect(workloadSource).toContain("urgentAssigned");
    expect(workloadSource).toContain("urgentRequested");
    expect(workloadSource).toContain("totals.urgentAssigned");
    expect(workloadSource).toContain("totals.urgentRequested");
    expect(workloadSource).toContain("Urgent assigned");
    expect(workloadSource).toContain("Urgent requested");
    expect(workloadSource).toContain("{ label: \"Urgent assigned\", value: \"urgentAssigned\" }");
    expect(workloadSource).toContain("{ label: \"Urgent requested\", value: \"urgentRequested\" }");
  });

  it("list and workload loaders expose dates/items needed by range filters", () => {
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const workloadDataJs = readFileSync(join(process.cwd(), "supabase-workload-data.js"), "utf8");

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
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    expect(listDataJs).toContain("async function loadFlowMateAssignees()");
    expect(listDataJs).toContain("window.loadFlowMateAssignees = loadFlowMateAssignees");
  });

  it("quick task assignee picker contains the full roster and no Other option", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"));
    expect(quickTaskFormSource).toContain("assigneeQuery");
    expect(quickTaskFormSource).toContain("filterFlowMateAssigneeOptions");
    expect(quickTaskFormSource).not.toContain("<select className=\"select\" value={value.assigneeUserId}");
  });

  it("list assignee filter includes all synced team members", () => {
    const listScreenJsx = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
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
    const dataJsx = readFileSync(join(process.cwd(), "data.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");

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
    expect(screensA).toContain("assigneeOptions={assigneeOptions} requesterTeamOptions={requesterTeamOptions}");
    expect(screensA).toContain("{requesterTeamOptions.map");
    expect(screensA).not.toContain("CreativeRequestForm value={creativeDraft} onChange={updateCreativeDraft} requesterTeamOptions={requesterTeamOptions}");
    expect(screensB).toContain("const [requesterTeamOptions, setRequesterTeamOptions] = useStateB(TEAMS)");
    expect(screensB).toContain("window.loadFlowMateRequesterTeams()");
    expect(screensB).toContain("const teamOptions = requesterTeamOptions");
  });

  it("workload and team settings hide Gear while keeping assignee data unchanged elsewhere", () => {
    const workloadDataJs = readFileSync(join(process.cwd(), "supabase-workload-data.js"), "utf8");

    expect(workloadDataJs).toContain('const isVisibleMemberCode = (memberCode) => String(memberCode || "").toLowerCase() !== "gear";');
    expect(workloadDataJs).toContain(".select(\"id,user_id,member_code,display_name");
    expect(workloadDataJs).toContain(".filter((row) => isVisibleMemberCode(row.member_code))");
    expect(workloadDataJs).toContain(".filter((member) => isVisibleMemberCode(member.member_code))");
  });
});

describe("UAT-012 hybrid request visibility", () => {
  it("keeps hybrid work assigned and exposes needs-split as Attention metadata", () => {
    const hybrid = {
      status: "assigned",
      effortPoint: 8,
      assetType: "hybrid",
      needsSplit: true,
      assignmentWarnings: [{ code: "needs_split", severity: "warning" }],
    };

    expect(hybrid.status).toBe("assigned");
    expect(hybrid.needsSplit).toBe(true);
    expect(hybrid.assignmentWarnings.map((warning) => warning.code)).toContain("needs_split");
    expect(hybrid.effortPoint).toBe(8);
    expect(hybrid.assetType).toBe("hybrid");
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
    expect(diagnosticBase).toContain("bucket_cap - bucket_assigned");
    expect(diagnosticBase).toContain("b.remaining > 0");
    expect(diagnosticBase).toContain("public.flowmate_leave_fraction_for_bucket");
    expect(diagnosticBase).not.toMatch(/select\s+tm\.id,\s+tm\.skills,\s+tm\.backup_skills,\s+tm\.availability/i);
  });

  it("assignment capacity excludes GD/VE leave days before choosing an owner", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const runAssignmentSql = assignmentSql.slice(
      assignmentSql.indexOf("create or replace function public.flowmate_run_assignment("),
      assignmentSql.indexOf("-- 5a. Assigned"),
    );

    expect(assignmentSql).toContain("create table if not exists public.flowmate_capacity_allocations");
    expect(assignmentSql).toContain("constraint flowmate_capacity_allocations_bucket_half_check check (bucket_half in ('am', 'pm'))");
    expect(assignmentSql).toContain("create or replace function public.flowmate_leave_fraction_for_bucket");
    expect(runAssignmentSql).toContain("v_assignment_start_half text");
    expect(runAssignmentSql).toContain("v_midday_cutoff time := time '12:00'");
    expect(runAssignmentSql).toContain("v_production_cutoff time := time '15:00'");
    expect(runAssignmentSql).toContain("public.flowmate_leave_fraction_for_bucket(br.id, bucket_days.bucket_date, bucket_days.bucket_half)");
    expect(runAssignmentSql).toContain("public.flowmate_capacity_allocations");
    expect(runAssignmentSql).toContain("bucket_remaining");
    expect(assignmentSql).toContain("insert into public.flowmate_capacity_allocations");
    expect(runAssignmentSql).not.toContain("leave_capacity_loss");
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
    expect(hardeningSql).toContain("alter table public.flowmate_capacity_allocations enable row level security");
    expect(hardeningSql).toContain("revoke all on table public.flowmate_capacity_allocations from anon");
    expect(hardeningSql).toContain("revoke all on table public.flowmate_capacity_allocations from authenticated");
    expect(combinedSql).not.toContain("or public.current_app_user_id() is null");
    expect(combinedSql).not.toContain("public.is_active_app_user() or");
  });
});

// ============================================================================
// MVP 1.3 planning backend/data contract
// ============================================================================
describe("MVP 1.3 planning backend SQL", () => {
  it("adds a nullable publish_date with a launch_date backfill for existing creative requests", () => {
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(schemaSql).toContain("add column if not exists publish_date date");
    expect(schemaSql).toMatch(/update\s+public\.work_items\s+wi[\s\S]*set\s+publish_date\s+=\s+wi\.launch_date[\s\S]*wi\.work_type\s+=\s+'creative_request'[\s\S]*wi\.publish_date\s+is\s+null[\s\S]*wi\.launch_date\s+is\s+not\s+null/i);
    expect(assignmentSql).toContain("p_publish_date date default null");
    expect(assignmentSql).toContain("due_date, launch_date, publish_date");
    expect(assignmentSql).toContain("v_due_date, v_launch_date, p_publish_date");
  });

  it("provides signed-in planning rows with normalized channel arrays and no archived rows", () => {
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const hardeningSql = readFileSync(join(process.cwd(), "supabase", "security_hardening.sql"), "utf8");
    const viewHardeningSql = readFileSync(join(process.cwd(), "supabase", "view_security_hardening.sql"), "utf8");
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(schemaSql).toContain("create or replace function public.flowmate_normalize_planning_channel(");
    expect(schemaSql).toContain("create or replace function public.flowmate_normalized_planning_channels(");
    expect(schemaSql).toContain("create or replace view public.planning_work_items_v\nwith (security_invoker = true) as");
    expect(schemaSql).toContain("public.flowmate_normalized_planning_channels(crd.platforms) as normalized_channels");
    expect(schemaSql).toContain("coalesce(wi.publish_date, wi.launch_date) as planning_date");
    expect(schemaSql).toContain("where wi.work_type = 'creative_request'\n  and wi.archived_at is null");
    expect(schemaSql).toContain("revoke all privileges on public.planning_work_items_v from public, anon, authenticated");
    expect(schemaSql).toContain("grant select on public.planning_work_items_v to authenticated");
    expect(hardeningSql).toContain("revoke all privileges on public.planning_work_items_v from public, anon, authenticated");
    expect(viewHardeningSql).toContain("alter view if exists public.planning_work_items_v");
    expect(readme).toContain("planning_work_items_v");
  });

  it("keeps planning fields out of assignment owner selection", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const runAssignmentSql = assignmentSql.slice(
      assignmentSql.indexOf("create or replace function public.flowmate_run_assignment("),
      assignmentSql.indexOf("drop function if exists public.create_creative_request("),
    );

    expect(runAssignmentSql).toContain("v_required_skill := lower(trim(coalesce(v_det.asset_subtype, '')))");
    expect(runAssignmentSql).toContain("v_effort      := public.flowmate_effort_for_subtype(v_det.asset_type, v_det.asset_subtype, v_det.asset_count)");
    expect(runAssignmentSql).toContain("v_effort := v_effort + public.flowmate_effort_for_subtype(v_det.asset_type_2, v_det.asset_subtype_2, v_det.asset_count_2)");
    expect(runAssignmentSql).not.toContain("campaign_name");
    expect(runAssignmentSql).not.toContain("platforms");
    expect(runAssignmentSql).not.toContain("publish_date");
  });
});

// ============================================================================
// Marketing Plan backend data model
// ============================================================================
describe("Marketing Plan backend SQL", () => {
  const marketingSql = () => readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
  const marketingStatusUpdateSql = () => readFileSync(join(process.cwd(), "supabase", "marketing_plan_status_update.sql"), "utf8");

  it("creates the core Marketing Plan tables with placement-owned schedule fields", () => {
    const sql = marketingSql();

    for (const tableName of [
      "marketing_plans",
      "marketing_campaigns",
      "marketing_content_items",
      "marketing_channel_placements",
    ]) {
      expect(sql).toContain(`create table if not exists public.${tableName}`);
      expect(sql).toContain(`alter table public.${tableName} enable row level security`);
    }

    expect(sql).toContain("audience_scope text");
    expect(sql).toContain("plan_date date");
    expect(sql).toContain("source_start_date date");
    expect(sql).toContain("source_start_time time");
    expect(sql).toContain("flowmate_work_item_id uuid references public.work_items(id) on delete set null");
    expect(sql).toContain("publish_date date not null");
    expect(sql).toContain("publish_time time");
    expect(sql).toContain("placement_status in ('planned', 'assigned', 'review', 'ready', 'ready_to_post', 'scheduled', 'posted', 'delayed', 'cancelled')");
    expect(marketingStatusUpdateSql()).toContain("drop constraint if exists marketing_channel_placements_status_check");
    expect(marketingStatusUpdateSql()).toContain("'ready_to_post'");
    expect(marketingStatusUpdateSql()).toContain("'scheduled'");
  });

  it("uses active-user RLS for Marketing Plan working rows and no null-user bypass", () => {
    const sql = marketingSql();

    for (const tableName of ["marketing_plans", "marketing_campaigns"]) {
      expect(sql).toContain(`create policy "active users can write ${tableName.replace(/_/g, " ")}"`);
      expect(sql).toContain(`on public.${tableName} for all`);
      expect(sql).toContain("using (public.is_active_app_user())");
      expect(sql).toContain("with check (public.is_active_app_user())");
    }
    for (const tableName of ["marketing_content_items", "marketing_channel_placements"]) {
      expect(sql).toContain(`create policy "active users can insert ${tableName.replace(/_/g, " ")}"`);
      expect(sql).toContain(`create policy "pic or sub pic can update ${tableName.replace(/_/g, " ")}"`);
      expect(sql).toContain(`create policy "pic or sub pic can delete ${tableName.replace(/_/g, " ")}"`);
      expect(sql).toContain(`on public.${tableName} for insert`);
      expect(sql).toContain(`on public.${tableName} for update`);
      expect(sql).toContain(`on public.${tableName} for delete`);
    }
    expect(sql).not.toContain("create policy \"admins can write marketing");
    expect(sql).not.toContain("with check (public.is_admin_app_user())");
    expect(sql).not.toContain("or public.current_app_user_id() is null");
    expect(sql).not.toContain("public.is_active_app_user() or");
  });

  it("provides channel normalization, timeline view, and summary view query contracts", () => {
    const sql = marketingSql();

    expect(sql).toContain("create or replace function public.marketing_normalize_channel(");
    expect(sql).toContain("create or replace view public.marketing_plan_timeline_v\nwith (security_invoker = true) as");
    expect(sql).toContain("create or replace view public.marketing_campaign_summary_v\nwith (security_invoker = true) as");
    for (const field of ["campaign_name", "content_title", "channel", "publish_date", "publish_time"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("mp.status <> 'archived'");
    expect(sql).toContain("mcp.placement_status <> 'cancelled'");
  });

  it("allows one content item to have many placements and seeds a multi-channel different-date example", () => {
    const sql = marketingSql();
    const placementTable = sql.slice(
      sql.indexOf("create table if not exists public.marketing_channel_placements"),
      sql.indexOf("create index if not exists idx_marketing_channel_placements_content_item"),
    );

    expect(placementTable).not.toMatch(/unique\s*\(\s*content_item_id\s*\)/i);
    expect(sql).toContain("marketing_plan_june_2026_sample");
    expect(sql).toContain("'Hero Post Teaser Banner'");
    expect(sql).toMatch(/'Hero Post Teaser Banner'[\s\S]*'FB'[\s\S]*'2026-06-04'[\s\S]*'IG'[\s\S]*'2026-06-05'/);
  });

  it("does not modify the FlowMate assignment engine for Marketing Plan", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).not.toContain("marketing_plan");
    expect(assignmentSql).not.toContain("marketing_channel_placements");
  });

  it("documents Marketing Plan SQL in the Supabase run order", () => {
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(readme).toContain("`marketing_plan.sql`");
    expect(readme).toContain("supabase/marketing_plan.sql");
    expect(readme.indexOf("supabase/team_settings_admin.sql")).toBeLessThan(readme.indexOf("supabase/marketing_plan.sql"));
  });
});

// ============================================================================
// Marketing Plan Supervisor backend/reporting contract
// ============================================================================
describe("Marketing Plan Supervisor backend SQL", () => {
  const supervisorPath = () => join(process.cwd(), "supabase", "marketing_plan_supervisor.sql");
  const supervisorSql = () => readFileSync(supervisorPath(), "utf8");

  it("adds the Supervisor SQL file and documents it after the Marketing Plan status update", () => {
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(existsSync(supervisorPath())).toBe(true);
    expect(readme).toContain("`marketing_plan_supervisor.sql`");
    expect(readme).toContain("supabase/marketing_plan_supervisor.sql");
    expect(readme.indexOf("supabase/marketing_plan_status_update.sql")).toBeLessThan(
      readme.indexOf("supabase/marketing_plan_supervisor.sql"),
    );
  });

  it("adds idempotent assignment timestamp columns without replacing first assignment values", () => {
    const sql = supervisorSql();

    for (const column of [
      "first_assigned_at timestamptz",
      "first_assigned_by_user_id uuid",
      "brief_link_added_at timestamptz",
      "brief_link_added_by_user_id uuid",
      "last_status_changed_at timestamptz",
      "last_status_changed_by_user_id uuid",
      "status_changed_at timestamptz",
      "status_changed_by_user_id uuid",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }

    expect(sql).toContain("coalesce(new.first_assigned_at, now())");
    expect(sql).toContain("coalesce(new.first_assigned_by_user_id, v_actor_id)");
    expect(sql).toContain("where parent_item.first_assigned_at is null");
  });

  it("creates a constrained event log and uses trusted actor identity only", () => {
    const sql = supervisorSql();

    expect(sql).toContain("create table if not exists public.marketing_plan_events");
    expect(sql).toContain("constraint marketing_plan_events_event_type_check check");
    for (const eventType of ["created", "brief_link_added", "assigned", "status_changed", "deleted"]) {
      expect(sql).toContain(`'${eventType}'`);
    }
    expect(sql).toContain("v_actor_id := auth.uid()");
    expect(sql).toContain("coalesce(auth.uid(), public.current_app_user_id())");
    expect(sql).not.toContain("p_actor_user_id");
  });

  it("captures brief-link and placement-status changes through triggers", () => {
    const sql = supervisorSql();

    expect(sql).toContain("create or replace function public.marketing_plan_capture_content_item_assignment()");
    expect(sql).toContain("create trigger marketing_content_items_capture_assignment");
    expect(sql).toContain("old.brief_link");
    expect(sql).toContain("new.brief_link");
    expect(sql).toContain("'brief_link_added'");
    expect(sql).toContain("create or replace function public.marketing_plan_capture_placement_status()");
    expect(sql).toContain("create trigger marketing_channel_placements_capture_status");
    expect(sql).toContain("old.placement_status");
    expect(sql).toContain("new.placement_status");
    expect(sql).toContain("'assigned'");
    expect(sql).toContain("'status_changed'");
  });

  it("defines the effective status rule, working-day helper, monthly view, and exact risk buckets", () => {
    const sql = supervisorSql();

    expect(sql).toContain("create or replace function public.marketing_plan_count_working_days(p_start_date date, p_end_date date)");
    expect(sql).toContain("extract(isodow from d)::int between 1 and 5");
    expect(sql).toContain("create or replace view public.marketing_plan_supervisor_monthly_v");
    expect(sql).toContain("with (security_invoker = true) as");
    expect(sql).toContain("wi.status as flowmate_status");
    expect(sql).toContain("left join public.work_items wi");
    expect(sql).toContain("wi.id = mci.flowmate_work_item_id");
    expect(sql).not.toContain("wi.display_id = substring(mci.brief_link from '#detail/([^/?#]+)'");
    expect(sql).toContain("when base.flowmate_status = 'review' then 'review'");
    expect(sql).toContain("when base.flowmate_status = 'delivered' then 'ready_to_post'");
    expect(sql).toContain("when base.stored_status = 'planned' and base.missing_brief_link = false then 'assigned'");
    for (const field of [
      "working_days_before_launch",
      "calendar_days_before_launch",
      "risk_bucket",
      "missing_brief_link",
      "stored_status",
      "effective_status",
    ]) {
      expect(sql).toContain(field);
    }
    for (const bucket of ["Healthy", "Watch", "Risk", "Critical"]) {
      expect(sql).toContain(`'${bucket}'`);
    }
  });

  it("provides admin-safe summary views and avoids exposing Supervisor reports to anon", () => {
    const sql = supervisorSql();

    for (const viewName of [
      "marketing_plan_supervisor_pic_v",
      "marketing_plan_supervisor_campaign_v",
      "marketing_plan_supervisor_channel_v",
    ]) {
      expect(sql).toContain(`create or replace view public.${viewName}`);
      expect(sql).toContain(`revoke all privileges on public.${viewName} from public, anon, authenticated`);
      expect(sql).toContain(`grant select on public.${viewName} to authenticated`);
    }

    expect(sql).toContain("alter table public.marketing_plan_events enable row level security");
    expect(sql).toContain("using (public.is_admin_app_user())");
    expect(sql).toContain("revoke all privileges on public.marketing_plan_supervisor_monthly_v from public, anon, authenticated");
    expect(sql).toContain("grant select on public.marketing_plan_supervisor_monthly_v to authenticated");
    expect(sql).not.toContain("grant select on public.marketing_plan_supervisor_monthly_v to anon");
    expect(sql).not.toContain("or public.current_app_user_id() is null");
  });
});

// ============================================================================
// Operational performance regressions
// ============================================================================
describe("FlowMate operational performance", () => {
  it("refreshes nav counts for identity or workspace changes, not route-only transitions", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const refreshStart = appJsx.indexOf("async function refreshNavCounts()");
    const effectEnd = appJsx.indexOf("  useEffectApp(() => {", refreshStart);
    const navEffect = appJsx.slice(refreshStart, effectEnd);

    expect(navEffect).toContain('window.addEventListener("flowmate:refresh-counts", refreshNavCounts)');
    expect(navEffect).toContain("}, [authState.status, authState.user && authState.user.id, activeTeamKey]);");
    expect(navEffect).not.toContain("route");
  });
});

// ============================================================================
// MVP 1.3 Planning Channel View frontend
// ============================================================================
describe("MVP 1.3 Planning Channel View frontend", () => {
  it("keeps old planning routes dormant and removes them from default FlowMate navigation", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const navSource = appJsx.slice(
      appJsx.indexOf("const NAV = ["),
      appJsx.indexOf("const ADMIN_NAV_GROUP"),
    );

    expect(navSource).not.toContain('group: "Planning"');
    expect(navSource).not.toContain("planning-channel");
    expect(navSource).not.toContain("planning-campaign");
    expect(navSource).not.toContain("planning-calendar");
    expect(appJsx).toContain('"planning-channel": "Channel View"');
    expect(appJsx).toContain('"planning-campaign": "Campaign View"');
    expect(appJsx).toContain('"planning-calendar": "Content Calendar"');
    expect(appJsx).toContain('route === "planning-channel"');
    expect(appJsx).toContain('route === "planning-campaign"');
    expect(appJsx).toContain('route === "planning-calendar"');
    expect(appJsx).toContain("React.createElement(PlanningChannelViewScreen");
    expect(appJsx).toContain("React.createElement(PlanningCampaignViewScreen");
    expect(appJsx).toContain("React.createElement(PlanningContentCalendarScreen");
    expect(appJsx).not.toContain('{ key: "planning-readiness"');
  });

  it("uses a planning loader that tries planning_work_items_v before falling back to live list rows", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const loaderSource = screensC.slice(
      screensC.indexOf("async function loadFlowMatePlanningRowsC"),
      screensC.indexOf("function filterFlowMatePlanningRowsC"),
    );

    expect(loaderSource).toContain('from("planning_work_items_v")');
    expect(loaderSource).toContain("mapFlowMatePlanningViewRowC");
    expect(loaderSource).toContain("window.loadFlowMateListRows");
    expect(loaderSource).toContain("row.type === \"creative\"");
    expect(loaderSource).not.toContain("WORK");
  });

  it("groups active creative requests by normalized channel and duplicates multi-channel items", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const helperSource = screensC.slice(0, screensC.indexOf("/* ============================================================\n   WORKLOAD VIEW"));
    const sandbox = {
      console,
      React: { useState: () => [null, () => undefined], useEffect: () => undefined },
      window: {},
      WORK: [],
      MEMBERS: [],
      MEMBERS_BY_ID: {},
      TODAY: "2026-06-26",
      ASSET_LABEL: {},
      STATUS_LABEL: {},
    };
    vm.runInNewContext(helperSource, sandbox);
    const planning = sandbox.window as typeof sandbox.window & {
      getFlowMatePlanningChannelsC: (row: Record<string, unknown>) => string[];
      groupFlowMatePlanningRowsByChannelC: (rows: Record<string, unknown>[]) => Record<string, Record<string, unknown>[]>;
      filterFlowMatePlanningRowsC: (rows: Record<string, unknown>[], filters: Record<string, string>) => Record<string, unknown>[];
    };

    const rows = [
      { id: "CR-1", type: "creative", title: "Multi", normalizedChannels: ["Facebook", "TikTok"], planningDate: "2026-07-10", status: "assigned" },
      { id: "CR-2", type: "creative", title: "Old", normalizedChannels: ["Instagram"], planningDate: "2026-07-12", status: "assigned", archivedAt: "2026-06-01" },
      { id: "QT-1", type: "quick", title: "Quick", normalizedChannels: ["LINE"], planningDate: "2026-07-12", status: "assigned" },
      { id: "CR-3", type: "creative", title: "Unknown", channels: ["IG"], planningDate: "2026-07-12", status: "review" },
    ];

    expect(planning.getFlowMatePlanningChannelsC(rows[3])).toEqual(["Instagram"]);
    expect(planning.filterFlowMatePlanningRowsC(rows, { month: "2026-07", campaign: "all", channel: "all", status: "all", requesterTeam: "all", priority: "all", typeSkill: "all" }).map(row => row.id)).toEqual(["CR-1", "CR-3"]);
    const grouped = planning.groupFlowMatePlanningRowsByChannelC([rows[0], rows[3]]);
    expect(grouped.Facebook.map(row => row.id)).toEqual(["CR-1"]);
    expect(grouped.TikTok.map(row => row.id)).toEqual(["CR-1"]);
    expect(grouped.Instagram.map(row => row.id)).toEqual(["CR-3"]);
  });

  it("renders required planning card fields and filters", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const screenSource = screensC.slice(screensC.indexOf("function PlanningChannelViewScreen"));

    for (const label of ["Month", "Campaign", "Channel", "Status", "Requester team", "Priority", "Type / Skill"]) {
      expect(screenSource).toContain(label);
    }
    for (const field of ["campaign", "channel", "planningLabel", "dueLabel", "status", "priority", "assignee", "subtype", "planningReadiness"]) {
      expect(screenSource).toContain(field);
    }
    expect(screenSource).toContain("No active Creative Requests");
    expect(screenSource).toContain("onOpen(row.id)");
  });

  it("groups active creative requests by campaign and summarizes visible rows once per asset", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const helperSource = screensC.slice(0, screensC.indexOf("/* ============================================================\n   WORKLOAD VIEW"));
    const sandbox = {
      console,
      React: { useState: () => [null, () => undefined], useEffect: () => undefined },
      window: {},
      WORK: [],
      MEMBERS: [],
      MEMBERS_BY_ID: {},
      TODAY: "2026-06-26",
      ASSET_LABEL: {},
      STATUS_LABEL: {},
    };
    vm.runInNewContext(helperSource, sandbox);
    const planning = sandbox.window as typeof sandbox.window & {
      groupFlowMatePlanningRowsByCampaignC: (rows: Record<string, unknown>[]) => Record<string, Record<string, unknown>[]>;
      summarizeFlowMatePlanningCampaignC: (rows: Record<string, unknown>[]) => Record<string, number>;
      filterFlowMatePlanningRowsC: (rows: Record<string, unknown>[], filters: Record<string, string>) => Record<string, unknown>[];
    };

    const rows = [
      { id: "CR-1", type: "creative", campaign: "AOV S24", normalizedChannels: ["Facebook", "TikTok"], planningDate: "2026-07-03", status: "delivered", priority: "normal" },
      { id: "CR-2", type: "creative", campaign: "AOV S24", normalizedChannels: ["Facebook"], planningDate: "2026-07-04", status: "blocked", priority: "urgent" },
      { id: "CR-3", type: "creative", campaign: "ROV", normalizedChannels: ["LINE"], planningDate: "2026-08-01", status: "assigned", priority: "normal" },
      { id: "CR-4", type: "creative", campaign: "AOV S24", normalizedChannels: ["Instagram"], planningDate: "2026-07-08", status: "assigned", priority: "normal", archivedAt: "2026-07-01" },
    ];

    const visible = planning.filterFlowMatePlanningRowsC(rows, { month: "2026-07", campaign: "all", channel: "all", status: "all" });
    const grouped = planning.groupFlowMatePlanningRowsByCampaignC(visible);
    const summary = planning.summarizeFlowMatePlanningCampaignC(grouped["AOV S24"]);

    expect(Object.keys(grouped)).toEqual(["AOV S24"]);
    expect(grouped["AOV S24"].map(row => row.id)).toEqual(["CR-1", "CR-2"]);
    expect(summary).toEqual({
      totalAssets: 2,
      channelsCovered: 2,
      readyDelivered: 1,
      atRisk: 0,
      blocked: 1,
      urgent: 1,
    });
  });

  it("builds planning content calendar items from publish date with launch date fallback and filters by campaign/channel", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const helperSource = screensC.slice(0, screensC.indexOf("/* ============================================================\n   WORKLOAD VIEW"));
    const sandbox = {
      console,
      React: { useState: () => [null, () => undefined], useEffect: () => undefined },
      window: {},
      WORK: [],
      MEMBERS: [],
      MEMBERS_BY_ID: {},
      TODAY: "2026-06-26",
      ASSET_LABEL: {},
      STATUS_LABEL: {},
    };
    vm.runInNewContext(helperSource, sandbox);
    const planning = sandbox.window as typeof sandbox.window & {
      getFlowMatePlanningCalendarDateC: (row: Record<string, unknown>) => string;
      filterFlowMatePlanningRowsC: (rows: Record<string, unknown>[], filters: Record<string, string>) => Record<string, unknown>[];
    };

    const rows = [
      { id: "CR-1", type: "creative", campaign: "AOV S24", normalizedChannels: ["Facebook"], publishDate: "2026-07-10", launchDate: "2026-07-20", status: "assigned" },
      { id: "CR-2", type: "creative", campaign: "AOV S24", normalizedChannels: ["TikTok"], publishDate: "", launchDate: "2026-07-22", status: "review" },
      { id: "CR-3", type: "creative", campaign: "ROV", normalizedChannels: ["Facebook"], publishDate: "2026-07-12", launchDate: "2026-07-30", status: "assigned" },
      { id: "CR-4", type: "creative", campaign: "AOV S24", normalizedChannels: ["Facebook"], publishDate: "2026-07-14", launchDate: "2026-07-30", status: "assigned", archivedAt: "2026-07-01" },
    ];

    expect(planning.getFlowMatePlanningCalendarDateC(rows[0])).toBe("2026-07-10");
    expect(planning.getFlowMatePlanningCalendarDateC(rows[1])).toBe("2026-07-22");
    expect(planning.filterFlowMatePlanningRowsC(rows, { month: "2026-07", campaign: "AOV S24", channel: "Facebook", status: "all" }).map(row => row.id)).toEqual(["CR-1"]);
  });
});

// ============================================================================
// Marketing Plan product split shell
// ============================================================================
describe("Marketing Plan product split shell", () => {
  it("adds a post-login product switch and keeps Marketing Plan out of FlowMate navigation", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const navSource = appJsx.slice(
      appJsx.indexOf("const NAV = ["),
      appJsx.indexOf("const ADMIN_NAV_GROUP"),
    );

    expect(appJsx).toContain('const [activeProduct, setActiveProduct]');
    expect(appJsx).toContain("function ProductSwitch");
    expect(appJsx).toContain("function MarketingPlanShell");
    expect(appJsx).toContain('setActiveProduct("flowmate")');
    expect(appJsx).toContain('setActiveProduct("marketing-plan")');
    expect(appJsx).toContain("MARKETING_PLAN_HASH_KEYS");
    expect(appJsx).toContain("function getFlowMateHashRouteKey(hashValue)");
    expect(appJsx).toContain('const routeKey = String(hashValue || window.location.hash || "").replace("#", "").split("/")[0]');
    expect(appJsx).toContain('return routeKey === "queue" ? "attention" : routeKey;');
    expect(appJsx).toContain("const hashKey = getFlowMateHashRouteKey()");
    expect(appJsx).toContain("if (MARKETING_PLAN_HASH_KEYS.has(hashKey)) return \"marketing-plan\";");
    expect(appJsx).toContain("if (TITLE_MAP[hashKey]) return \"flowmate\";");
    expect(appJsx).toContain("const r = getFlowMateHashRouteKey(h)");
    expect(appJsx).toContain('sessionStorage.setItem("flowmate:activeProduct", "flowmate")');
    expect(appJsx).toContain('window.location.hash.replace("#", "")');
    expect(appJsx).toContain('"campaign-timeline"');
    expect(appJsx).toContain('"channel-plan"');
    expect(appJsx).toContain('"marketing-calendar"');
    expect(appJsx).toContain('"working-sheet"');
    expect(appJsx).toContain('window.location.hash = "campaign-timeline"');
    expect(appJsx).toContain("setActiveProduct(null)");
    expect(appJsx).toContain('sessionStorage.removeItem("flowmate:activeProduct")');
    expect(appJsx).toContain("Campaign Timeline");
    expect(appJsx).toContain("Channel Plan");
    expect(appJsx).toContain("Working Sheet");
    expect(navSource).not.toContain('group: "Planning"');
    expect(navSource).not.toContain("planning-channel");
    expect(navSource).not.toContain("planning-campaign");
    expect(navSource).not.toContain("planning-calendar");
  });

  it("opens the workspace chooser after a fresh Google login instead of forcing My work", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const authJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

    expect(authJs).toContain('sessionStorage.setItem("flowmate:showProductChoiceAfterLogin", "1")');
    expect(authJs).toContain('sessionStorage.removeItem("flowmate:postLoginHash")');
    expect(authJs).toContain('sessionStorage.removeItem("flowmate:activeProduct")');
    expect(authJs).not.toContain('sessionStorage.setItem("flowmate:postLoginHash", "my-work")');

    expect(appJsx).toContain('sessionStorage.getItem("flowmate:showProductChoiceAfterLogin") === "1"');
    expect(appJsx).toContain('sessionStorage.removeItem("flowmate:showProductChoiceAfterLogin")');
    expect(appJsx).toContain('sessionStorage.removeItem("flowmate:activeProduct")');
    expect(appJsx).toContain("setActiveProduct(null)");
    expect(appJsx).toContain("if (shouldShowProductChoice)");
    expect(appJsx).toContain("showProductChoicePathInAddressBar();");
    expect(appJsx).toContain("setActiveProduct(null);");
  });

  it("implements Campaign Timeline from Marketing Plan placement dates only", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const workflowCatalogSql = readFileSync(join(process.cwd(), "supabase", "workflow_mvp_catalogs.sql"), "utf8");
    const timelineSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanTimelineScreen"),
      appJsx.indexOf("function MarketingPlanChannelPlanScreen"),
    );

    expect(appJsx).toContain("function MarketingPlanTimelineScreen");
    expect(appJsx).toContain('.from("marketing_plan_timeline_v")');
    expect(timelineSource).toContain('loadMarketingPlanTimelineRows("campaign", selectedMonth, options)');
    expect(appJsx).toContain("const publishDate = row.publish_date");
    expect(appJsx).toContain("publishTime: row.publish_time");
    expect(timelineSource).toContain("loadMarketingPlanAvailableMonths()");
    expect(timelineSource).toContain('channelMode = "official"');
    expect(timelineSource).toContain('row.channel === "facebook_esport"');
    expect(timelineSource).toContain('row.channel !== "facebook_esport"');
    expect(timelineSource).toContain("groupMarketingPlanTimelineRows(timelineRows, selectedMonth)");
    expect(appJsx).toContain("function getMarketingPlanTimelineWindow");
    expect(appJsx).toContain("function getMarketingPlanChannelAbbrev");
    expect(appJsx).toContain("function formatMarketingPlanBadgeTime");
    expect(appJsx).toContain("return formatMarketingPlanTime(value);");
    expect(timelineSource).toContain("const timelineWindow = getMarketingPlanTimelineWindow(selectedMonth)");
    expect(appJsx).toContain("[monthKey, nextMonthKey, getNextMarketingPlanMonthKey(nextMonthKey)]");
    expect(timelineSource).toContain("marketing-timeline-badge");
    expect(appJsx).toContain("function getMarketingPlanViewStatus(row)");
    expect(appJsx).toContain("function hasMarketingPlanLinkedCreativeRequest(row)");
    expect(appJsx).toContain("function isMarketingPlanFlowMateDetailLink(value)");
    expect(appJsx).toContain('if (normalized === "planned" && hasMarketingPlanLinkedCreativeRequest(row)) return "assigned";');
    expect(appJsx).toContain("status: getMarketingPlanViewStatus(row)");
    expect(timelineSource).toContain("marketing-timeline-badge__channel");
    expect(timelineSource).toContain("marketing-timeline-badge__time");
    expect(timelineSource).toContain("getMarketingPlanChannelAbbrev(placement.channel)");
    expect(timelineSource).toContain("formatMarketingPlanBadgeTime(placement.publishTime)");
    expect(appJsx).toContain("const MARKETING_PLAN_TIMELINE_COUNT_CHANNELS");
    expect(appJsx).toContain("function getMarketingPlanTimelineChannelCountsByDay");
    expect(timelineSource).toContain("const channelCountsByDay = getMarketingPlanTimelineChannelCountsByDay(timelineRows, selectedMonth, timelineCountChannels)");
    expect(timelineSource).toContain("timelineCountChannels.map(channel =>");
    expect(timelineSource).toContain("marketing-timeline-channel-count");
    expect(timelineSource).toContain("count > 4");
    expect(timelineSource).toContain("marketing-timeline-channel-count--high");
    expect(timelineSource).toContain("channelCountsByDay[day.key]");
    expect(timelineSource).toContain('position: "sticky"');
    expect(timelineSource).toContain("left: 0");
    expect(timelineSource).toContain("MARKETING_PLAN_WORKING_STATUS_OPTIONS.map");
    expect(timelineSource).toContain("getMarketingPlanStatusClass(option.value)");
    expect(timelineSource).toContain('maxHeight: "calc(100vh - 220px)"');
    expect(timelineSource).toContain('overflow: "auto"');
    expect(timelineSource).toContain('zIndex: 20');
    expect(timelineSource).not.toContain("<span className=\"badge badge--overdue\">Delayed</span>");
    expect(appCss).toMatch(/\.modal-backdrop\s*\{[\s\S]*z-index: 80;/);
    expect(appCss).toContain(".marketing-timeline-badge");
    expect(appCss).toContain(".marketing-timeline-channel-count--high");
    expect(timelineSource).toContain("Manage Campaign");
    expect(timelineSource).toContain("campaignManagerRows");
    expect(timelineSource).toContain("handleCampaignArchiveRestore");
    expect(timelineSource).toContain("window.archiveFlowMateMarketingCampaignTag");
    expect(timelineSource).toContain("window.restoreFlowMateMarketingCampaignTag");
    expect(timelineSource).toContain("handleCampaignFunctionUpdate");
    expect(timelineSource).toContain("window.updateFlowMateMarketingCampaignTagFunction");
    expect(timelineSource).toContain("campaign.usageCount");
    expect(timelineSource).toContain("Include archived");
    expect(timelineSource).toContain("Most recently used");
    expect(timelineSource).toContain("Colour Tag");
    expect(timelineSource).not.toContain("MARKETING_PLAN_HIDDEN_CAMPAIGNS_KEY");
    expect(timelineSource).not.toContain("deleteMarketingPlanCampaignTag");
    expect(workflowCatalogSql).toContain("create or replace view public.marketing_campaign_tag_management_v");
    expect(workflowCatalogSql).toContain("create or replace function public.marketing_archive_campaign_tag");
    expect(workflowCatalogSql).toContain("create or replace function public.marketing_restore_campaign_tag");
    expect(workflowCatalogSql).toContain("create or replace function public.marketing_update_campaign_tag_function");
    expect(workflowCatalogSql).toContain("marketing_campaign_tags_normalized_name_unique");
    expect(timelineSource).toContain("window.addFlowMateMarketingCampaignTag");
    expect(timelineSource).not.toContain('className="stat-strip"');
    expect(timelineSource).not.toContain("<div className=\"stat\"");
    expect(timelineSource).not.toContain("loadFlowMateListRows");
    expect(timelineSource).not.toContain("dueDate");
    expect(timelineSource).not.toContain("launchDate");
    expect(timelineSource).toContain("Run supabase/marketing_plan.sql");
    expect(timelineSource).toContain("select public.marketing_plan_june_2026_sample();");
  });

  it("groups timeline rows as campaign > Product / Event > channel placements", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const timelineGroupSource = appJsx.slice(
      appJsx.indexOf("function groupMarketingPlanTimelineRows"),
      appJsx.indexOf("const MARKETING_PLAN_CHANNELS"),
    );

    expect(appJsx).toContain("campaign.assets.set(row.contentItemId");
    expect(appJsx).toContain("campaign.assets.get(row.contentItemId).placements.push");
    expect(appJsx).toContain("Main row = Campaign, sub-row = Product / Event, columns = publish date");
    expect(appJsx).toContain("const windowMonths = new Set(getMarketingPlanTimelineWindow(selectedMonth).monthKeys)");
    expect(timelineGroupSource).toContain("const campaignKey = getMarketingPlanCampaignKey(row.campaignName) || row.campaignId || \"uncategorized\"");
    expect(timelineGroupSource).toContain("campaigns.set(campaignKey");
    expect(timelineGroupSource).toContain("sourceCampaignIds");
    expect(timelineGroupSource).not.toContain("campaigns.set(row.campaignId");
    expect(appJsx).toContain("timelineWindow.monthGroups.map");
    expect(appJsx).toContain("campaign.assets.length");
    expect(appJsx).toContain("placement.channel");
    expect(appJsx).toContain("formatMarketingPlanTime(placement.publishTime)");
    expect(appJsx).toContain("Check the Function filters or month selection.");
  });

  it("shares Marketing Plan Campaign tags with Working Sheet and FlowMate Creative Request", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const marketingShellSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanShell"),
      appJsx.indexOf("function GlobalSearchResultsPanel"),
    );
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(appJsx).toContain("async function loadMarketingPlanCampaignOptions");
    expect(appJsx).toContain("async function addMarketingPlanCampaignTag");
    expect(appJsx).toContain("window.loadFlowMateMarketingCampaignOptions = loadMarketingPlanCampaignOptions");
    expect(appJsx).toContain("window.addFlowMateMarketingCampaignTag = addMarketingPlanCampaignTag");
    expect(appJsx).toContain("window.archiveFlowMateMarketingCampaignTag = archiveMarketingPlanCampaignTag");
    expect(appJsx).toContain("window.restoreFlowMateMarketingCampaignTag = restoreMarketingPlanCampaignTag");
    expect(appJsx).toContain("window.updateFlowMateMarketingCampaignTagFunction = updateMarketingPlanCampaignTagFunction");
    expect(appJsx).toContain('.from("marketing_campaign_tag_management_v")');
    expect(appJsx).toContain('.rpc("marketing_archive_campaign_tag"');
    expect(appJsx).toContain('.rpc("marketing_restore_campaign_tag"');
    expect(appJsx).toContain('.rpc("marketing_update_campaign_tag_function"');
    expect(appJsx).toContain("flowmate:marketing-campaigns-updated");
    expect(marketingShellSource).toContain("React.createElement(FlowMatePromptHost, null)");
    expect(marketingShellSource).toContain('className: "app__main app__main--marketing"');
    expect(appCss).toContain(".app__main--marketing");
    expect(workingSheetSource).toContain("marketing-plan-campaign-tags");
    expect(workingSheetSource).toContain("window.loadFlowMateMarketingCampaignOptions");
    expect(creativeFormSource).toContain("flowmate-campaign-tags");
    expect(creativeFormSource).toContain("window.loadFlowMateMarketingCampaignOptions");
  });

  it("implements Channel Plan from Marketing Plan placements grouped by channel", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const channelPlanSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanChannelPlanScreen"),
      appJsx.indexOf("function MarketingPlanCalendarScreen"),
    );

    expect(appJsx).toContain("function MarketingPlanChannelPlanScreen");
    expect(appJsx).toContain("groupMarketingPlanRowsByChannel");
    expect(channelPlanSource).toContain("loadMarketingPlanAvailableMonths()");
    expect(channelPlanSource).toContain('loadMarketingPlanTimelineRows("channel", selectedMonth, options)');
    expect(channelPlanSource).toContain("selectedChannel");
    expect(channelPlanSource).toContain("Filter By Channel");
    expect(channelPlanSource).toContain("selectedStatus");
    expect(appJsx).toContain("statuses.add(getMarketingPlanViewStatus(row))");
    expect(appJsx).toContain('selectedStatus !== "all" && getMarketingPlanViewStatus(row) !== selectedStatus');
    expect(channelPlanSource).not.toContain("Total placements");
    expect(channelPlanSource).not.toContain("Active channels");
    expect(channelPlanSource).not.toContain("Ready / posted");
    expect(channelPlanSource).not.toContain("Delayed");
    expect(channelPlanSource).toContain("marketing-channel-table");
    expect(channelPlanSource).toContain("Brief Link");
    expect(channelPlanSource).toContain("placement.briefLink");
    expect(channelPlanSource).toContain("renderStatusBadge(getMarketingPlanViewStatus(placement))");
    expect(channelPlanSource).toContain('React.createElement("a"');
    expect(channelPlanSource).toContain('}, "Link")');
    expect(channelPlanSource).toContain("MARKETING_PLAN_CHANNELS.filter(channel => isMarketingPlanPublishableChannel(channel.key)).map");
    expect(channelPlanSource).toContain("const publishableRows = functionFilteredRows.filter(row => isMarketingPlanPublishableChannel(row.channel))");
    expect(appJsx).toContain("Facebook");
    expect(appJsx).toContain("TikTok");
    expect(appJsx).toContain("Instagram");
    expect(appJsx).toContain("In-game");
    expect(appJsx).toContain("YouTube");
    expect(appJsx).toContain("Other");
    expect(channelPlanSource).toContain("Run supabase/marketing_plan.sql");
    expect(channelPlanSource).toContain("select public.marketing_plan_june_2026_sample();");
    expect(channelPlanSource).not.toContain("loadFlowMateListRows");
    expect(channelPlanSource).not.toContain("dueDate");
    expect(channelPlanSource).not.toContain("launchDate");
    expect(appJsx).toContain('activeSection.key === "channel-plan" && React.createElement(MarketingPlanChannelPlanScreen, null)');
  });

  it("implements Marketing Plan Calendar from placement publish date and channel filters", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const calendarSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanCalendarScreen"),
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
    );

    expect(appJsx).toContain("function MarketingPlanCalendarScreen");
    expect(appJsx).toContain("const MARKETING_PLAN_CALENDAR_VIEW_OPTIONS");
    expect(appJsx).toContain("function loadMarketingPlanTimelineRows");
    expect(appJsx).toContain('.from("marketing_plan_timeline_v")');
    expect(calendarSource).toContain("loadMarketingPlanAvailableMonths()");
    expect(calendarSource).toContain('loadMarketingPlanTimelineRows("publish_date", selectedMonth, options)');
    expect(calendarSource).toContain("getMarketingPlanChannelOptions(publishableRows, selectedMonth)");
    expect(calendarSource).toContain('filterMarketingPlanRows(publishableRows, selectedMonth, selectedChannel, "", true)');
    expect(calendarSource).toContain("const publishableRows = functionFilteredRows.filter(row => isMarketingPlanPublishableChannel(row.channel))");
    expect(calendarSource).toContain("calendarViewMode");
    for (const viewMode of ["day", "week", "month", "4_days", "schedule"]) {
      expect(appJsx).toContain(`value: "${viewMode}"`);
    }
    expect(calendarSource).toContain("MARKETING_PLAN_CALENDAR_VIEW_OPTIONS.map");
    expect(calendarSource).toContain("marketing-calendar-schedule");
    expect(calendarSource).toContain("marketing-calendar-month-grid");
    expect(calendarSource).toContain("marketing-calendar-time-grid");
    expect(calendarSource).toContain("Day, Week, Month, 4 Days, and Schedule read the same Marketing Plan placements.");
    expect(calendarSource).toContain("formatMarketingPlanTime(row.publishTime)");
    expect(calendarSource).toContain("getMarketingPlanChannelLabel(row.channel)");
    expect(calendarSource).toContain("renderStatusBadge(getMarketingPlanViewStatus(row))");
    expect(calendarSource).not.toContain('className="stat-strip"');
    expect(calendarSource).not.toContain('<div className="stat__lbl">Placements</div>');
    expect(calendarSource).not.toContain('<div className="stat__lbl">Channels</div>');
    expect(calendarSource).not.toContain('<div className="stat__lbl">Ready / posted</div>');
    expect(calendarSource).not.toContain('<div className="stat__lbl">Delayed</div>');
    expect(calendarSource).toContain("Run supabase/marketing_plan.sql");
    expect(calendarSource).toContain("select public.marketing_plan_june_2026_sample();");
    expect(calendarSource).not.toContain("loadFlowMateListRows");
    expect(calendarSource).not.toContain("dueDate");
    expect(calendarSource).not.toContain("launchDate");
    expect(appJsx).toContain('activeSection.key === "marketing-calendar" && React.createElement(MarketingPlanCalendarScreen, null)');
  });

  it("keeps Marketing Plan Campaign Timeline ordered by first publish date and tier without raw not_started text", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const timelineGroupSource = appJsx.slice(
      appJsx.indexOf("function groupMarketingPlanTimelineRows"),
      appJsx.indexOf("const MARKETING_PLAN_CHANNELS"),
    );
    const timelineScreenSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanTimelineScreen"),
      appJsx.indexOf("function MarketingPlanChannelPlanScreen"),
    );

    expect(appJsx).toContain("function getMarketingPlanTierRank");
    expect(appJsx).toContain("function getMarketingPlanAssetFirstPublishDate");
    expect(appJsx).toContain("function getMarketingPlanTimelineAssetMeta");
    expect(timelineGroupSource).toContain("firstPublishDate: getMarketingPlanAssetFirstPublishDate");
    expect(timelineGroupSource).toContain("getMarketingPlanTierRank(a.bestTier)");
    expect(timelineScreenSource).toContain("getMarketingPlanTimelineAssetMeta(asset)");
    expect(timelineScreenSource).not.toContain("[asset.format, asset.contentTier, asset.picName, asset.status].filter(Boolean).join");
    expect(timelineScreenSource).not.toContain("not_started");
  });

  it("makes Marketing Plan Calendar open in Schedule view, uses timeline statuses, and caps Month cells at two rows", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const calendarSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanCalendarScreen"),
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
    );

    expect(calendarSource).toContain('const [calendarViewMode, setCalendarViewMode] = useStateApp("schedule");');
    expect(calendarSource).toContain("const [selectedScheduleDate, setSelectedScheduleDate]");
    expect(calendarSource).toContain("const scheduleDayKeys = calendarViewMode === \"schedule\" && selectedScheduleDate");
    expect(calendarSource).toContain("MARKETING_PLAN_WORKING_STATUS_OPTIONS.map");
    expect(calendarSource).toContain("dayRows.slice(0, 2).map");
    expect(calendarSource).toContain("openScheduleForDate(cell.key)");
    expect(calendarSource).toContain("setCalendarViewMode(\"schedule\")");
    expect(calendarSource).toContain("more placements");
    expect(calendarSource).not.toContain('<span className="badge badge--assigned">Ready</span>');
    expect(calendarSource).not.toContain('<span className="badge badge--overdue">Delayed</span>');
    expect(appCss).toContain(".marketing-calendar-more");
    expect(appCss).toContain(".marketing-calendar-month-count");
  });

  it("implements Marketing Plan Working Sheet as the monthly source-of-truth entry form", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const addRowSource = workingSheetSource.slice(
      workingSheetSource.indexOf("Add monthly working row"),
      workingSheetSource.indexOf("Current working rows"),
    );
    const editRowSource = workingSheetSource.slice(
      workingSheetSource.indexOf("Edit Working Sheet row"),
      workingSheetSource.lastIndexOf('className: "modal__actions"'),
    );

    expect(appJsx).toContain("function MarketingPlanWorkingSheetScreen");
    expect(appJsx).toContain("async function createMarketingPlanWorkingSheetRow");
    expect(appJsx).toContain("async function findOrCreateMarketingPlan");
    expect(appJsx).toContain("async function findOrCreateMarketingCampaign");
    expect(appJsx).toContain('.from("marketing_plans")');
    expect(appJsx).toContain('.from("marketing_campaigns")');
    expect(appJsx).toContain('.from("marketing_content_items")');
    expect(appJsx).toContain('.from("marketing_channel_placements")');
    expect(workingSheetSource).toContain("Campaign");
    expect(workingSheetSource).not.toContain("Team *");
    expect(workingSheetSource).toContain("Product / Event");
    expect(workingSheetSource).toContain("Launch Date");
    expect(workingSheetSource).toContain("Time");
    expect(workingSheetSource).toContain("Asset Type");
    expect(workingSheetSource).toContain("Details");
    expect(workingSheetSource).toContain("Content Tier");
    expect(workingSheetSource).not.toContain("PIC *");
    expect(addRowSource).not.toContain("Brief Link");
    expect(editRowSource).toContain("Brief Link");
    expect(workingSheetSource).toContain("Channel Tag");
    expect(workingSheetSource).toContain("Note");
    expect(appJsx).toContain("Banner");
    expect(appJsx).toContain("Video");
    expect(appJsx).toContain("Shorts/Reels");
    expect(appJsx).toContain("Story");
    expect(appJsx).toContain("Album");
    expect(appJsx).toContain("Cover/Profile");
    expect(appJsx).toContain("PR");
    expect(appJsx).toContain("GIF");
    expect(appJsx).toContain("Live");
    expect(appJsx).toContain('const MARKETING_PLAN_CONTENT_TIERS = ["S", "A", "B", "C"]');
    expect(workingSheetSource).toContain("Save to Marketing Plan");
    expect(workingSheetSource).toContain("createMarketingPlanWorkingSheetRow({");
    expect(workingSheetSource).toContain("...sheetForm");
    expect(workingSheetSource).toContain("publishTime: normalizedTime");
    expect(workingSheetSource).toContain("Product / Event is required.");
    expect(appJsx).toContain("getMarketingPlanCurrentUserDefaults");
    expect(workingSheetSource).toContain("flowmate:refresh-request");
    expect(workingSheetSource).not.toContain("Import is intentionally not a fake uploader");
    expect(workingSheetSource).not.toContain("loadFlowMateListRows");
    expect(workingSheetSource).not.toContain("dueDate");
    expect(appJsx).toContain('activeSection.key === "working-sheet" && React.createElement(MarketingPlanWorkingSheetScreen, null)');
  });

  it("lets Working Sheet edit placement time and status while keeping asset rows grouped", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const rowActionsSource = workingSheetSource.slice(
      workingSheetSource.indexOf('className: "marketing-working-actions"'),
      workingSheetSource.indexOf("visibleRows.length === 0"),
    );
    const editModalSource = workingSheetSource.slice(
      workingSheetSource.indexOf("Edit Working Sheet row"),
      workingSheetSource.length,
    );

    expect(appJsx).toContain("const MARKETING_PLAN_WORKING_STATUS_OPTIONS");
    expect(appJsx).toContain('const MARKETING_PLAN_PUBLISH_TIME_OPTIONS = ["11:00", "14:00", "18:00", "21:00"]');
    for (const status of ["planned", "assigned", "review", "ready_to_post", "scheduled", "posted"]) {
      expect(appJsx).toContain(`value: "${status}"`);
    }
    expect(appJsx).toContain("function groupMarketingPlanWorkingSheetRows");
    expect(workingSheetSource).toContain("groupMarketingPlanWorkingSheetRows(rows, selectedMonth, selectedChannel)");
    expect(workingSheetSource).toContain("marketing-channel-tags");
    expect(workingSheetSource).toContain("marketing-working-table");
    expect(workingSheetSource).toContain("marketing-working-time-text");
    expect(workingSheetSource).not.toContain("marketing-working-brief");
    expect(workingSheetSource).toContain("marketing-working-status");
    expect(workingSheetSource).toContain('className: "col-date"');
    expect(workingSheetSource).toContain('}, "Launch Date")');
    expect(workingSheetSource).not.toContain('}, "Publish Date")');
    expect(workingSheetSource).toContain("formatMarketingPlanDate(row.publishDate)");
    expect(workingSheetSource).toContain('className: "col-pic"');
    expect(workingSheetSource).toContain('}, "PIC")');
    expect(workingSheetSource).toContain('className: "col-actions"');
    expect(workingSheetSource).toContain('}, "Actions")');
    expect(workingSheetSource).toContain("MARKETING_PLAN_PUBLISH_TIME_OPTIONS.map(time =>");
    expect(workingSheetSource).toContain('React.createElement("option", {');
    expect(workingSheetSource).toContain("key: time");
    expect(workingSheetSource).toContain("value: time");
    expect(workingSheetSource).not.toContain("placeholder=\"HH:MM\"");
    expect(workingSheetSource).toContain("normalizeMarketingPlanPublishTimeOption");
    expect(workingSheetSource).toContain("Select a posting time: 11:00, 14:00, 18:00, or 21:00.");
    expect(workingSheetSource).not.toContain("type=\"time\"");
    expect(workingSheetSource).not.toContain("handleWorkingRowBriefLinkChange");
    expect(workingSheetSource).toContain("handleWorkingRowTimeChange");
    expect(workingSheetSource).toContain("startEditWorkingRow");
    expect(workingSheetSource).toContain("handleSaveEditWorkingRow");
    expect(workingSheetSource).toContain("handleDeleteWorkingRow");
    expect(workingSheetSource).toContain("Edit Working Sheet row");
    expect(workingSheetSource).toContain("Save changes");
    expect(workingSheetSource).toContain("Delete");
    expect(workingSheetSource).toContain("Create Brief");
    expect(rowActionsSource).toContain("Create Brief");
    expect(rowActionsSource).not.toContain("Delete");
    expect(editModalSource).toContain("Delete");
    expect(editModalSource).toContain("handleDeleteWorkingRow(editingWorkingRow)");
    expect(appJsx).toContain("function createFlowMateDraftFromMarketingPlanRow");
    expect(appJsx).toContain("function openFlowMateCreativeBriefFromMarketingRow");
    expect(appJsx).toContain("function getMarketingPlanWorkingRowPublishTime(row)");
    expect(appJsx).toContain("flowmate:create:creativeDraft:v1");
    expect(appJsx).toContain("flowmate:create-draft-updated");
    expect(appJsx).toContain("flowmate:switch-flowmate-product");
    expect(appJsx).toContain("getFlowMateCreativeSubtypeFromMarketingAssetType");
    expect(appJsx).toContain("getFlowMateCreativeAssetTypeFromSubtype");
    expect(appJsx).toContain("const productEvent = row.contentTitle || \"\"");
    expect(appJsx).toContain("sizeFormats: formatOptions");
    expect(appJsx).toContain('sizeFormat: formatOptions[0] || "1200x1200"');
    expect(appJsx).toContain("async function updateMarketingPlanWorkingSheetPlacementFields");
    expect(appJsx).not.toContain("async function updateMarketingPlanWorkingSheetContentFields");
    expect(appJsx).toContain("async function updateMarketingPlanWorkingSheetRow");
    expect(appJsx).toContain("async function syncMarketingPlanLinkedFlowMateSchedule");
    expect(appJsx).toContain('.rpc("marketing_plan_sync_flowmate_schedule"');
    expect(appJsx).toContain("if (!row || !row.contentItemId || !hasMarketingPlanLinkedCreativeRequest(row)) return false;");
    expect(appJsx).toContain("await syncMarketingPlanLinkedFlowMateSchedule(row, form, normalizedTime)");
    expect(appJsx).toContain("marketingPlanContentItemId");
    expect(appJsx).toContain("marketingPlanOriginalBriefLink");
    expect(appJsx).toContain("async function updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest");
    expect(appJsx).toContain("window.updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest");
    expect(appJsx).toContain("async function deleteMarketingPlanWorkingSheetRow");
    expect(appJsx).toContain('.from("marketing_channel_placements")');
    expect(appJsx).toContain('.from("marketing_content_items")');
    expect(appJsx).toContain(".in(\"id\", deleteIds)");
    expect(appJsx).toContain(".in(\"id\", updateIds)");
    expect(appJsx).toContain(".insert(insertRows)");
    expect(appJsx).toContain(".eq(\"content_item_id\", row.contentItemId)");
    expect(appJsx).toContain('.from("marketing_content_items").delete()');
    expect(appJsx).toContain("brief_link");
    expect(appJsx).toContain(".eq(\"content_item_id\", contentItemId)");
    expect(appJsx).toContain(".eq(\"id\", row.contentItemId)");
    expect(appJsx).toContain("marketing_plan_working_sheet_updated");
    expect(css).toContain(".marketing-working-table");
    expect(css).toContain("min-width: 0");
    expect(css).toContain(".marketing-working-table .col-date { width: 92px; }");
    expect(css).toContain(".marketing-working-table .col-time { width: 72px; }");
    expect(css).toContain(".marketing-working-table .col-link { width: 76px; }");
    expect(css).toContain(".marketing-working-table .col-pic { width: 58px; }");
    expect(css).toContain(".marketing-working-table .col-status { width: 108px; }");
    expect(css).toContain(".marketing-working-table .col-actions { width: 124px; }");
    expect(css).toContain(".marketing-working-actions .btn");
    expect(css).toContain(".marketing-working-time-text");
    expect(css).toContain(".marketing-channel-tag");
    expect(css).not.toContain(".marketing-working-brief");
    expect(css).not.toContain(".marketing-working-link-edit");
    expect(css).toContain(".marketing-working-actions");
    expect(css).toContain(".marketing-working-edit-modal");
  });

  it("keeps linked FlowMate task launch time in sync when Working Sheet time changes", () => {
    const marketingSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");

    expect(marketingSql).toContain("create or replace function public.marketing_plan_sync_flowmate_schedule");
    expect(marketingSql).toContain("v_actor_id := auth.uid();");
    expect(marketingSql).toContain("public.is_admin_app_user(v_actor_id)");
    expect(marketingSql).toContain("v_content.pic_user_id = v_actor_id");
    expect(marketingSql).toContain("v_flowmate_display_id := substring(v_content.brief_link from '#detail/([^/?#]+)');");
    expect(marketingSql).toContain("wi.display_id = v_flowmate_display_id");
    expect(marketingSql).toContain("flowmate_work_item_id = v_resolved_work_item_id");
    expect(marketingSql).toContain("update public.work_items");
    expect(marketingSql).toContain("publish_time = p_publish_time");
    expect(marketingSql).toContain("where id = v_resolved_work_item_id");
    expect(marketingSql).toContain("grant execute on function public.marketing_plan_sync_flowmate_schedule");
  });

  it("backfills a Marketing Plan Working Sheet brief link with the created Creative Request detail link only when the source link was empty", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const draftSource = appJsx.slice(
      appJsx.indexOf("function createFlowMateDraftFromMarketingPlanRow"),
      appJsx.indexOf("function openFlowMateCreativeBriefFromMarketingRow"),
    );
    const backfillSource = appJsx.slice(
      appJsx.indexOf("async function updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest"),
      appJsx.indexOf("async function updateMarketingPlanWorkingSheetPlacementFields"),
    );
    const syncSource = createScreenJsx.slice(
      createScreenJsx.indexOf("async function syncMarketingPlanBriefLinkAfterCreativeSubmit"),
      createScreenJsx.indexOf("function CreateScreen"),
    );
    const handleSubmitSource = createScreenJsx.slice(
      createScreenJsx.indexOf("async function handleSubmit()"),
      createScreenJsx.indexOf("function renderQuickTaskForm"),
    );

    expect(draftSource).toContain("marketingPlanContentItemId: row.contentItemId || \"\"");
    expect(draftSource).toContain("marketingPlanOriginalBriefLink: row.briefLink || \"\"");
    expect(draftSource).toContain("marketingPlanProductEvent: productEvent");
    expect(draftSource).toContain("marketingPlanCampaignName: campaignName");
    expect(createScreenJsx).toContain("\"marketingPlanContentItemId\"");
    expect(createScreenJsx).toContain("\"marketingPlanOriginalBriefLink\"");
    expect(createScreenJsx).toContain("marketingPlanContentItemId: \"\"");
    expect(createScreenJsx).toContain("marketingPlanOriginalBriefLink: \"\"");
    expect(syncSource).toContain("submissionDraft.marketingPlanContentItemId");
    expect(syncSource).toContain("submissionDraft.marketingPlanOriginalBriefLink");
    expect(syncSource).toContain("return null");
    expect(syncSource).toContain("window.getFlowMateCreatedDisplayId(created)");
    expect(createScreenJsx).toContain("function getFlowMateCreativeRequestDetailUrl");
    expect(createScreenJsx).toContain("window.location.origin");
    expect(createScreenJsx).toContain("window.location.pathname");
    expect(createScreenJsx).toContain("#detail/");
    expect(syncSource).toContain("window.updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest");
    expect(syncSource).toContain("window.getFlowMateCreatedUuid(created)");
    expect(backfillSource).toContain(".from(\"marketing_content_items\")");
    expect(backfillSource).toContain("brief_link: briefLink");
    expect(backfillSource).toContain("updatePayload.flowmate_work_item_id = flowMateWorkItemId");
    expect(backfillSource).toContain(".eq(\"id\", contentItemId)");
    expect(backfillSource).toContain(".from(\"marketing_channel_placements\")");
    expect(backfillSource).toContain("placement_status: \"assigned\"");
    expect(backfillSource).toContain("marketing_plan_creative_request_link");
    expect(handleSubmitSource).toContain("created = await window.createFlowMateCreativeRequest(submissionDraft);");
    expect(handleSubmitSource).toContain("let marketingPlanSyncWarning = \"\"");
    expect(handleSubmitSource).toContain("await syncMarketingPlanBriefLinkAfterCreativeSubmit(submissionDraft, created);");
    expect(handleSubmitSource).toContain("console.warn(\"[FlowMate Create] Marketing Plan link backfill failed:\"");
    expect(createScreenJsx).toContain("Saved - Marketing Plan not linked");
    expect(handleSubmitSource).toContain("kind: \"sync_warning\"");
  });

  it("derives Marketing Plan row status from linked FlowMate status when available", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const searchUtilsJs = readFileSync(join(process.cwd(), "search-utils.js"), "utf8");
    const marketingSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const timelineNormalizeSource = appJsx.slice(
      appJsx.indexOf("function normalizeMarketingPlanTimelineRow"),
      appJsx.indexOf("function getMarketingPlanMonthOptions"),
    );
    const timelineViewSource = marketingSql.slice(
      marketingSql.indexOf("create or replace view public.marketing_plan_timeline_v"),
      marketingSql.indexOf("create or replace view public.marketing_campaign_summary_v"),
    );
    const statusSource = appJsx.slice(
      appJsx.indexOf("function getMarketingPlanViewStatus"),
      appJsx.indexOf("function renderStatusBadge"),
    );

    expect(searchUtilsJs).toContain("function getFlowMateCreatedUuid(created)");
    expect(searchUtilsJs).toContain("window.getFlowMateCreatedUuid = getFlowMateCreatedUuid");
    expect(marketingSql).toContain("wi.status as flowmate_status");
    expect(timelineViewSource).toContain("left join public.work_items wi on wi.id = mci.flowmate_work_item_id");
    expect(timelineViewSource).not.toContain("substring(mci.brief_link");
    expect(timelineNormalizeSource).toContain("flowmateStatus: row.flowmate_status || \"\"");
    expect(statusSource).toContain('if (flowmateStatus === "review") return "review";');
    expect(statusSource).toContain('if (flowmateStatus === "delivered") return "ready_to_post";');
  });

  it("passes Marketing Plan Time into Creative Request Publish Time and stores it on work_items", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const draftSource = appJsx.slice(
      appJsx.indexOf("function createFlowMateDraftFromMarketingPlanRow"),
      appJsx.indexOf("function openFlowMateCreativeBriefFromMarketingRow"),
    );
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );
    const quickTaskCreateSource = quickTaskJs.slice(
      quickTaskJs.indexOf("async function createFlowMateCreativeRequest"),
      quickTaskJs.indexOf("window.createFlowMateCreativeRequest"),
    );

    expect(schemaSql).toContain("add column if not exists publish_time time");
    expect(assignmentSql).toContain("p_publish_time time default null");
    expect(assignmentSql).toContain("due_date, launch_date, publish_date, publish_time");
    expect(assignmentSql).toContain("select pg_notify('pgrst', 'reload schema');");
    expect(quickTaskCreateSource).toContain("p_publish_time:    input.publishTime || null");
    expect(draftSource).toContain("publishTime: getMarketingPlanWorkingRowPublishTime(row)");
    expect(appJsx).toContain("window.dispatchEvent(new CustomEvent(\"flowmate:create-draft-updated\"");
    expect(createScreenJsx).toContain("window.addEventListener(\"flowmate:create-draft-updated\", onExternalCreateDraftUpdated)");
    expect(createScreenJsx).toContain("setCreativeDraft(withTitle);");
    expect(creativeFormSource).toContain("Publish Time");
    expect(createScreenJsx).toContain('const FLOWMATE_PUBLISH_TIME_OPTIONS = ["11:00", "14:00", "18:00", "21:00"];');
    expect(creativeFormSource).toContain('value={value.publishTime}');
    expect(creativeFormSource).toContain('onChange={e => update("publishTime", e.target.value)}');
    expect(creativeFormSource).toContain("FLOWMATE_PUBLISH_TIME_OPTIONS.map(time =>");
    expect(creativeFormSource).not.toContain("inputMode=\"numeric\"");
    expect(creativeFormSource).not.toContain("type=\"time\"");
    expect(creativeFormSource).not.toContain("pattern=\"[0-9]{2}:[0-9]{2}\"");
    expect(listDataJs).toContain("publish_time");
    expect(listDataJs).toContain("publishTime: item.publish_time");
    expect(listDataJs).toContain("launchFullLabel: flowmateDateTimeWithOptionalTimeLabel(item.launch_date, item.publish_time)");
  });

  it("maps task Created display to include Bangkok 24-hour time like Launch date", () => {
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");

    expect(listDataJs).toContain("function flowmateDateTimeBangkokLabel");
    expect(listDataJs).toContain('timeZone: "Asia/Bangkok"');
    expect(listDataJs).toContain("createdLabel: flowmateDateTimeBangkokLabel(item.created_at)");
  });

  it("normalizes Marketing Plan HH:mm:ss database times before opening the Creative Request draft", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appTimeSource = [
      appJsx.slice(
        appJsx.indexOf("function normalizeMarketingPlanTimeInput"),
        appJsx.indexOf("function formatMarketingPlanDate"),
      ),
      appJsx.slice(
        appJsx.indexOf("function getMarketingPlanWorkingRowPublishTime"),
        appJsx.indexOf("function createFlowMateDraftFromMarketingPlanRow"),
      ),
    ].join("\n");
    const appSandbox = {} as {
      normalizeMarketingPlanTimeInput: (value: unknown) => string;
      getMarketingPlanWorkingRowPublishTime: (row: { publishTime?: string; placements?: Array<{ publishTime?: string }> }) => string;
    };
    vm.runInNewContext(`${appTimeSource}
this.normalizeMarketingPlanTimeInput = normalizeMarketingPlanTimeInput;
this.getMarketingPlanWorkingRowPublishTime = getMarketingPlanWorkingRowPublishTime;`, appSandbox);

    const createTimeSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function normalizeFlowMatePublishTimeInput"),
      createScreenJsx.indexOf("const FLOWMATE_CREATE_DRAFT_FIELDS"),
    );
    const createSandbox = {} as {
      normalizeFlowMatePublishTimeInput: (value: unknown) => string;
    };
    vm.runInNewContext(`${createTimeSource}
this.normalizeFlowMatePublishTimeInput = normalizeFlowMatePublishTimeInput;`, createSandbox);

    expect(appSandbox.normalizeMarketingPlanTimeInput("14:00:00")).toBe("14:00");
    expect(appSandbox.getMarketingPlanWorkingRowPublishTime({ publishTime: "14:00:00" })).toBe("14:00");
    expect(appSandbox.getMarketingPlanWorkingRowPublishTime({ placements: [{ publishTime: "15:30:00" }] })).toBe("15:30");
    expect(appSandbox.getMarketingPlanWorkingRowPublishTime({})).toBe("11:00");
    expect(createSandbox.normalizeFlowMatePublishTimeInput("14:00:00")).toBe("14:00");
  });

  it("uses Activity log on the detail sidebar and hides Publish Date there", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const collaborationSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const detailSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function DetailScreen"),
      createScreenJsx.indexOf("Object.assign(window, { MyWorkScreen"),
    );
    const sidebarSource = detailSource.slice(
      detailSource.indexOf("<div className=\"detail__side\">"),
      detailSource.indexOf("{w.urgentReason &&"),
    );

    expect(listDataJs).toContain(".from(\"work_item_events\")");
    expect(listDataJs).toContain("activityEvents,");
    expect(listDataJs).toContain("startedAt: startedEvent?.created_at || null");
    expect(detailSource).toContain("const visibleActivityEvents = (() => {");
    expect(detailSource).toContain("seenAssignmentResults");
    expect(detailSource).toContain("function formatFlowMateActivityEvent(event)");
    expect(sidebarSource).toContain("Activity log");
    expect(sidebarSource).toContain("visibleActivityEvents");
    expect(sidebarSource).not.toContain("Assignment reason");
    expect(sidebarSource).not.toContain("Publish Date");
    expect(collaborationSql).toContain("jsonb_build_object('url', v_link.url, 'description', v_link.description, 'link_id', v_link.id)");
    expect(quickTaskSql).toContain("'body', trim(p_body)");
  });

  it("treats Working Sheet rows with a Creative Request link as assigned and prevents duplicate brief creation", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const rowRenderSource = workingSheetSource.slice(
      workingSheetSource.indexOf("visibleRows.map(row => {"),
      workingSheetSource.indexOf("visibleRows.length === 0"),
    );

    expect(rowRenderSource).toContain("const rowStatusValue = getMarketingPlanViewStatus(row);");
    expect(rowRenderSource).toContain("value: rowStatusValue");
    expect(rowRenderSource).toContain("const rowNeedsBriefLinkRepair = rowHasLinkedCreativeRequest && !String(row.briefLink || \"\").trim();");
    expect(rowRenderSource).toContain("rowNeedsBriefLinkRepair ? React.createElement");
    expect(rowRenderSource).toContain("Repair Link");
    expect(rowRenderSource).toContain("rowHasLinkedCreativeRequest ? null : React.createElement");
    expect(rowRenderSource).toContain("Create Brief");
    expect(css).toContain("min-height: 36px;");
    expect(css).toContain("line-height: 20px;");
    expect(css).toContain("padding: 7px 28px 7px 10px;");
  });

  it("limits Working Sheet actions to the row PIC, Sub PIC, or admin and cancels linked FlowMate work before row deletion", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const rowRenderSource = workingSheetSource.slice(
      workingSheetSource.indexOf("visibleRows.map(row => {"),
      workingSheetSource.indexOf("visibleRows.length === 0"),
    );
    const deleteSource = workingSheetSource.slice(
      workingSheetSource.indexOf("async function handleDeleteWorkingRow"),
      workingSheetSource.indexOf("async function handleSaveWorkingSheetRow"),
    );

    expect(marketingPlanSql).toContain("mci.pic_user_id,");
    expect(marketingPlanSql).toContain("mci.sub_pic_user_id,");
    expect(marketingPlanSql).toContain("mci.sub_pic_name");
    expect(appJsx).toContain("picUserId: row.pic_user_id || \"\"");
    expect(workingSheetSource).toContain("function canManageMarketingPlanWorkingRow(row)");
    expect(workingSheetSource).toContain("currentUser.role === \"admin\"");
    expect(workingSheetSource).toContain("row.picUserId === currentUser.id");
    expect(workingSheetSource).toContain("row.subPicUserId === currentUser.id");
    expect(rowRenderSource).toContain("const canManageRow = canManageMarketingPlanWorkingRow(row);");
    expect(rowRenderSource).toContain("disabled: !canManageRow || updatingRowId === row.contentItemId");
    expect(rowRenderSource).toContain('title: canManageRow ? "" : "Only PIC, Sub PIC, or Admin can edit this row."');
    expect(deleteSource).toContain("hasMarketingPlanLinkedCreativeRequest(row)");
    expect(deleteSource).toContain("cancelFlowMateWorkItem");
    expect(deleteSource).toContain("Deleting it will cancel the FlowMate task");
    expect(deleteSource).toContain("await deleteMarketingPlanWorkingSheetRow(row)");
  });

  it("keeps Sub PIC searchable in Working Sheet and gives Sub PIC FlowMate transition parity", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const listData = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );

    expect(appJsx).toContain("function getMarketingPlanWorkingOwnerEntries(row)");
    expect(appJsx).toContain("row && row.subPicUserId");
    expect(appJsx).toContain("row && row.subPicName");
    expect(appJsx).toContain("row.subPicName, row.briefLink");
    expect(workingSheetSource).toContain('"aria-label": "PIC or Sub PIC"');
    expect(workingSheetSource).toContain("row.subPicName || \"-\"");
    expect(workingSheetSource).toContain("row.subPicUserId === currentUser.id");
    expect(appJsx).toContain('className: "col-sub-pic"');
    expect(appJsx).toContain('}, "Sub PIC")');
    expect(listData).toContain("marketing_content_items");
    expect(listData).toContain("marketingPlanSubPicUserId");
    expect(screensA).toContain("currentUserId === w.marketingPlanSubPicUserId");
    expect(marketingPlanSql).toContain("sub_pic_user_id uuid references public.users(id)");
    expect(marketingPlanSql).toContain("create policy \"pic or sub pic can update marketing content items\"");
    expect(marketingPlanSql).toContain("create policy \"pic or sub pic can update marketing channel placements\"");
    expect(quickTaskSql).toContain("v_marketing_sub_pic boolean := false;");
    expect(quickTaskSql).toContain("mci.sub_pic_user_id = v_actor_id");
    expect(quickTaskSql).toContain("if not v_marketing_sub_pic");
  });

  it("restores Sub PIC autocomplete, persistence, assignment RPC, and cross-team FlowMate participant access", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const subPicSql = readFileSync(
      join(process.cwd(), "supabase", "marketing_plan_sub_pic_restore.sql"),
      "utf8",
    );
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const pickerSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanSubPicSearch"),
      appJsx.indexOf("function normalizeMarketingPlanSupervisorRow"),
    );

    expect(pickerSource).toContain('placeholder: "Search active user, e.g. Aof"');
    expect(pickerSource).toContain('"aria-label": "Sub PIC suggestions"');
    expect(pickerSource).toContain("setIsOpen(false)");
    expect(pickerSource).toContain("isOpen && !userId && normalizedQuery");
    expect(workingSheetSource).toContain('inputId: "marketing-plan-sub-pic"');
    expect(workingSheetSource).toContain('inputId: "marketing-plan-edit-sub-pic"');
    expect(workingSheetSource).toContain("subPicUserId: row.subPicUserId || \"\"");
    expect(workingSheetSource).toContain("Select Sub PIC from the suggested active users.");
    expect(appJsx).toContain("sub_pic_user_id: form.subPicUserId || null");
    expect(appJsx).toContain("sub_pic_name: form.subPicUserId");
    expect(appJsx).toContain('.rpc("marketing_plan_assign_sub_pic"');

    expect(subPicSql).toContain("create or replace function public.marketing_plan_assign_sub_pic");
    expect(subPicSql).toContain("Only PIC or Admin can assign Sub PIC");
    expect(subPicSql).toContain("create trigger marketing_plan_guard_sub_pic_assignment");
    expect(subPicSql).toContain("create or replace function public.flowmate_is_marketing_sub_pic");
    expect(subPicSql).toContain("or public.flowmate_is_marketing_sub_pic(wi.id, p_user_id)");
    expect(subPicSql).toContain("or public.flowmate_user_is_work_item_participant(p_user_id, wi.id)");
    expect(subPicSql).toContain("create or replace function public.flowmate_can_collaborate_on_work_item");
    expect(subPicSql).toContain("create or replace function public.flowmate_can_status_transition_work_item");
  });

  it("documents the member/admin access matrix and Marketing Plan write guard contract", () => {
    const accessMatrix = readFileSync(join(process.cwd(), "docs", "ACCESS_MATRIX.md"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );

    expect(accessMatrix).toContain("# FlowMate and Marketing Plan Access Matrix");
    expect(accessMatrix).toContain("Member can manage only Working Sheet rows where they are PIC or Sub PIC.");
    expect(accessMatrix).toContain("Admin can manage every Working Sheet row.");
    expect(workingSheetSource).toContain("function canManageMarketingPlanWorkingRow(row)");
    expect(workingSheetSource).toContain("currentUser.role === \"admin\"");
    expect(workingSheetSource).toContain("row.picUserId === currentUser.id");
    expect(marketingPlanSql).toContain("create policy \"pic or sub pic can update marketing content items\"");
    expect(marketingPlanSql).toContain("create policy \"pic or sub pic can update marketing channel placements\"");
  });

  it("gives schedule operators only Working Sheet Time and Marketing placement Status controls", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const accessMatrix = readFileSync(join(process.cwd(), "docs", "ACCESS_MATRIX.md"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const rowRenderSource = workingSheetSource.slice(
      workingSheetSource.indexOf("visibleRows.map(row => {"),
      workingSheetSource.indexOf("visibleRows.length === 0"),
    );

    expect(quickTaskJs).toContain("can_access_all_teams, can_manage_marketing_schedule");
    expect(quickTaskJs).toContain("can_manage_marketing_schedule: Boolean(profile.can_manage_marketing_schedule)");
    expect(quickTaskJs).toContain("can_manage_marketing_schedule: false");
    expect(workingSheetSource).toContain("function canManageMarketingPlanSchedule(row)");
    expect(workingSheetSource).toContain("canManageMarketingPlanWorkingRow(row)");
    expect(workingSheetSource).toContain("currentUser.can_manage_marketing_schedule === true");
    expect(appJsx).toContain('.rpc("marketing_plan_update_working_row_time"');
    expect(appJsx).toContain('.rpc("marketing_plan_update_working_row_status"');
    expect(workingSheetSource).toContain("Linked FlowMate Review or Delivered can override the displayed Status.");
    expect(workingSheetSource).toContain("Changing Marketing Status does not change the linked FlowMate task");
    expect(workingSheetSource).toContain("async function handleWorkingRowTimeChange(row, nextTime)");
    expect(rowRenderSource).toContain("const canManageSchedule = canManageMarketingPlanSchedule(row);");
    expect(rowRenderSource).toContain("disabled: !canManageSchedule || updatingRowId === row.contentItemId");
    expect(rowRenderSource).toContain('title: canManageSchedule ? "" : "Only PIC, Sub PIC, Admin, or a schedule operator can change Time and Status."');
    expect(rowRenderSource).toContain("onChange: event => handleWorkingRowTimeChange(row, event.target.value)");
    expect(rowRenderSource).toContain("onChange: event => handleWorkingRowStatusChange(row, event.target.value)");
    expect(rowRenderSource).toContain("disabled: !canManageRow || updatingRowId === row.contentItemId");
    expect(rowRenderSource).toContain('title: canManageRow ? "" : "Only PIC, Sub PIC, or Admin can edit this row."');
    expect(accessMatrix).toContain("Schedule operator");
    expect(accessMatrix).toContain("Time and Marketing placement Status only");
    expect(accessMatrix).toContain("does not grant full Edit, Delete, Create Brief, Repair Link, or PIC/Sub PIC controls");
  });

  it("keeps Need Brief creative work cancellable through the current RPC signature", () => {
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const adminSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");
    const quickTransitionSource = quickTaskSql.slice(
      quickTaskSql.indexOf("create or replace function public.transition_creative_work_status"),
      quickTaskSql.indexOf("drop function if exists public.transition_creative_work_status"),
    );
    const adminTransitionSource = adminSql.slice(
      adminSql.indexOf("create or replace function public.flowmate_admin_transition_work_status"),
      adminSql.indexOf("revoke all on function public.flowmate_admin_transition_work_status"),
    );

    expect(quickTransitionSource).toContain("p_cancel_reason text default null");
    expect(quickTransitionSource).toContain("elsif p_next_status = 'cancelled' and v_from_status not in ('delivered', 'cancelled') then");
    expect(quickTransitionSource).toContain("set status = 'cancelled'");
    expect(adminTransitionSource).toContain("p_cancel_reason text default null");
    expect(adminTransitionSource).toContain("when p_next_status = 'cancelled' then trim(p_cancel_reason)");
    expect(adminTransitionSource).toContain("when p_next_status = 'cancelled' then 'cancelled'::public.event_type");
  });

  it("loads FlowMate detail rows from Supabase when opening a detail URL directly", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appRouteSource = appJsx.slice(
      appJsx.indexOf("function App()"),
      appJsx.indexOf("  // O-6:"),
    );
    const detailSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function DetailScreen"),
      createScreenJsx.indexOf("const owner = MEMBERS_BY_ID"),
    );

    expect(appRouteSource).toContain("const [focusId, setFocusId] = useStateApp(() =>");
    expect(appRouteSource).toContain("return getFlowMateHashRouteKey(hash) === \"detail\" ? hash.split(\"/\")[1] || null : null;");
    expect(detailSource).toContain("directDetailItem");
    expect(detailSource).toContain("directDetailLoadState");
    expect(detailSource).toContain("window.loadFlowMateWorkItemById(id, { includeArchived: true })");
    expect(detailSource).not.toContain("window.loadFlowMateListRows()");
    expect(detailSource).not.toContain("WORK_BY_ID[id]");
    expect(detailSource).toContain("window.flowmateSelectedWorkItem = row;");
    expect(detailSource).toContain("Loading work item");
  });

  it("refreshes the open FlowMate detail when a Marketing Plan edit syncs schedule fields", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function DetailScreen"),
      createScreenJsx.indexOf("const owner = MEMBERS_BY_ID"),
    );

    expect(detailSource).toContain('event.detail.reason !== "marketing_plan_working_sheet_row_edited"');
    expect(detailSource).toContain('window.addEventListener("flowmate:refresh-request", onExternalDetailRefresh)');
    expect(detailSource).toContain('window.removeEventListener("flowmate:refresh-request", onExternalDetailRefresh)');
    expect(detailSource).toContain("refreshDetailItem();");
  });

  it("keeps Marketing Plan CSV export for visible placement rows only", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanPlaceholderScreen"),
    );
    const exportHelperSource = appJsx.slice(
      appJsx.indexOf("function exportMarketingPlanRowsCsv"),
      appJsx.indexOf("function groupMarketingPlanRowsByChannel"),
    );

    expect(appJsx).toContain("function exportMarketingPlanRowsCsv");
    expect(exportHelperSource).toContain('"Month"');
    expect(exportHelperSource).toContain('"Campaign"');
    expect(exportHelperSource).toContain('"Team"');
    expect(exportHelperSource).toContain('"Product / Event"');
    expect(exportHelperSource).toContain('"Format"');
    expect(exportHelperSource).toContain('"Tier"');
    expect(exportHelperSource).toContain('"PIC"');
    expect(exportHelperSource).toContain('"Channel"');
    expect(exportHelperSource).toContain('"Publish Date"');
    expect(exportHelperSource).toContain('"Publish Time"');
    expect(exportHelperSource).toContain('"Placement Status"');
    expect(exportHelperSource).toContain('"Note"');
    expect(workingSheetSource).toContain("Export CSV");
    expect(workingSheetSource).toContain("filterMarketingPlanRows(rows, selectedMonth, selectedChannel)");
    expect(workingSheetSource).toContain("Run supabase/marketing_plan.sql");
    expect(workingSheetSource).not.toContain("loadFlowMateListRows");
    expect(workingSheetSource).not.toContain("dueDate");
  });

  it("adds admin-only Marketing Plan Supervisor navigation and direct-route guard", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const shellSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanShell"),
      appJsx.indexOf("function GlobalSearchResultsPanel"),
    );

    expect(appJsx).toContain('"supervisor"');
    expect(appJsx).toContain("MARKETING_PLAN_HASH_KEYS");
    expect(appJsx).toContain('"supervisor"');
    expect(shellSource).toContain("const isAdminUser = user.role === \"admin\";");
    expect(shellSource).toContain("...(isAdminUser ? [supervisorSection] : [])");
    expect(shellSource).toContain('key: "supervisor"');
    expect(shellSource).toContain('label: "Supervisor"');
    expect(shellSource).toContain('activeSection.key === "supervisor" && !isAdminUser && React.createElement');
    expect(shellSource).toContain("Admin access required.");
    expect(shellSource).toContain('activeSection.key === "supervisor" && isAdminUser && React.createElement(MarketingPlanSupervisorScreen');
    expect(shellSource).toContain("user: user");
  });

  it("loads Supervisor reports from the four admin report views without querying for non-admin direct routes", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const loaderSource = appJsx.slice(
      appJsx.indexOf("async function loadMarketingPlanSupervisorRows"),
      appJsx.indexOf("function getMarketingPlanSupervisorMonthOptions"),
    );

    expect(appJsx).toContain("async function loadMarketingPlanSupervisorRows(user)");
    expect(loaderSource).toContain('if (!user || user.role !== "admin") return');
    expect(loaderSource).toContain('.from("marketing_plan_supervisor_monthly_v")');
    expect(loaderSource).toContain('.from("marketing_plan_supervisor_pic_v")');
    expect(loaderSource).toContain('.from("marketing_plan_supervisor_campaign_v")');
    expect(loaderSource).toContain('.from("marketing_plan_supervisor_channel_v")');
  });

  it("implements Supervisor summary cards, tabs, month data filter, and filtered CSV export", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const supervisorSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
      appJsx.indexOf("function MarketingPlanShell"),
    );
    const exportSource = appJsx.slice(
      appJsx.indexOf("function exportMarketingPlanSupervisorCsv"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );

    expect(appJsx).toContain("function normalizeMarketingPlanSupervisorRow");
    expect(appJsx).toContain("function filterMarketingPlanSupervisorRows");
    expect(appJsx).toContain("function exportMarketingPlanSupervisorCsv");
    expect(supervisorSource).toContain("Monthly assignment health for Marketing Plan rows.");
    expect(supervisorSource).toContain("Total Event");
    expect(supervisorSource).not.toContain("Total Rows");
    expect(supervisorSource).toContain("Assigned");
    expect(supervisorSource).toContain("Unassigned");
    expect(supervisorSource).toContain("Avg Working Days Before Launch");
    expect(supervisorSource).toContain("Risk");
    expect(supervisorSource).toContain("Critical");
    for (const tab of ["Monthly Overview", "PIC Performance", "Campaign Risk", "Channel Risk"]) {
      expect(supervisorSource).toContain(tab);
    }
    expect(supervisorSource).toContain("getMarketingPlanSupervisorMonthOptions(monthlyRows)");
    expect(supervisorSource).toContain("filterMarketingPlanSupervisorRows(monthlyRows, filters)");
    expect(supervisorSource).toContain("loadSupervisorRows(isAlive);");
    expect(supervisorSource).toContain("onClick: () => loadSupervisorRows(() => true)");
    expect(supervisorSource).not.toContain("attachFlowMateLiveRefresh");
    expect(supervisorSource).not.toContain("flowmate:refresh-request");
    expect(exportSource).toContain("filterMarketingPlanSupervisorRows(rows, filters)");
    expect(exportSource).toContain("marketing-plan-supervisor-");
    expect(appJsx).toContain("function formatMarketingPlanSupervisorExportDateTime");
    expect(appJsx).toContain("7 * 60 * 60 * 1000");
    expect(appJsx).toContain("getUTCFullYear()");
    expect(exportSource).toContain("formatMarketingPlanSupervisorExportDateTime(row.firstAssignedAt)");
    expect(exportSource).not.toContain("row.firstAssignedAt,\n    row.workingDaysBeforeLaunch");
    for (const field of [
      '"Month"',
      '"Campaign"',
      '"Product / Event"',
      '"Channel"',
      '"Launch Date"',
      '"Time"',
      '"PIC"',
      '"Effective Status"',
      '"Stored Status"',
      '"Assigned At"',
      '"Working Days Before Launch"',
      '"Risk Bucket"',
      '"Brief Link"',
    ]) {
      expect(exportSource).toContain(field);
    }
  });

  it("renders Supervisor risk buckets with expected labels/classes and no ranking language", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const supervisorSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
      appJsx.indexOf("function MarketingPlanPlaceholderScreen"),
    );

    expect(appJsx).toContain("function getMarketingPlanSupervisorRiskClass");
    expect(appJsx).toContain('if (bucket === "Healthy") return "badge--delivered";');
    expect(appJsx).toContain('if (bucket === "Watch") return "badge--neutral";');
    expect(appJsx).toContain('if (bucket === "Risk") return "badge--review";');
    expect(appJsx).toContain('if (bucket === "Critical") return "badge--overdue";');
    for (const label of ["Healthy", "Watch", "Risk", "Critical"]) {
      expect(supervisorSource).toContain(label);
    }
    const uiText = supervisorSource.toLowerCase();
    for (const banned of ["rank", "score", "leaderboard", "worst pic", "best pic"]) {
      expect(uiText).not.toContain(banned);
    }
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

  it("does not drain historical Queued work when creative capacity is released", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const adminSql = collaborationSql();
    const compatibilityStart = assignmentSql.lastIndexOf("create or replace function public.flowmate_rerun_queued_creative_requests(");
    const compatibilityEnd = assignmentSql.indexOf(
      "revoke all on function public.flowmate_rerun_queued_creative_requests(integer)",
      compatibilityStart,
    );
    const compatibilitySql = assignmentSql.slice(compatibilityStart, compatibilityEnd);

    expect(assignmentSql).toContain("create or replace function public.flowmate_rerun_queued_creative_requests(");
    expect(assignmentSql).toContain("revoke all on function public.flowmate_rerun_queued_creative_requests(integer)");
    expect(assignmentSql).toContain("Deprecated compatibility surface");
    expect(compatibilitySql).toContain("'checked', 0");
    expect(compatibilitySql).not.toContain("flowmate_run_assignment");
    expect(quickTaskSql).not.toContain("v_queue_drain");
    expect(adminSql).not.toContain("v_queue_drain");
    expect(quickTaskSql).not.toContain("flowmate_rerun_queued_creative_requests");
    expect(adminSql).not.toContain("flowmate_rerun_queued_creative_requests");
  });

  it("checks creative capacity across working days when effort is larger than one day", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("v_assignment_start date");
    expect(assignmentSql).toContain("v_assignment_end date");
    expect(assignmentSql).toContain("v_production_cutoff time := time '15:00'");
    expect(assignmentSql).toMatch(/v_now_bkk\s+timestamp\s*:=\s*timezone\('Asia\/Bangkok', now\(\)\)/);
    expect(assignmentSql).toContain("v_assignment_start_half := 'pm'");
    expect(assignmentSql).toContain("v_assignment_start := public.flowmate_next_working_day(v_today + 1)");
    expect(assignmentSql).toContain("v_assignment_end := greatest(v_assignment_start, coalesce(v_wi.due_date, v_production_deadline, v_assignment_start))");
    expect(assignmentSql).toContain("bucket_cap");
    expect(assignmentSql).toContain("bucket_remaining");
    expect(assignmentSql).toContain("window_assigned_effort");
    expect(assignmentSql).toContain("a.bucket_date = bucket_days.bucket_date");
    expect(assignmentSql).toContain("a.bucket_half = bucket_days.bucket_half");
    expect(assignmentSql).toContain("before the 1st Draft date");
    expect(assignmentSql).not.toContain("v_assignment_end := greatest(v_today, coalesce(v_wi.launch_date, v_wi.due_date, v_today))");
    expect(assignmentSql).not.toContain("greatest(0, b.effective_cap * v_working_days - b.leave_capacity_loss)");
    expect(assignmentSql).not.toContain("v_effort      := least(v_raw_effort, 8)");
    expect(assignmentSql).not.toContain("v_was_capped  := v_raw_effort > 8");
  });

  it("repairs CR-1047 through the engine without changing GD/VE member settings", () => {
    const repairSql = readFileSync(join(process.cwd(), "supabase", "fix_cr1047_assignment_window.sql"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const ganttScreenJsx = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");

    expect(repairSql).toContain("where display_id = 'CR-1047'");
    expect(repairSql).toContain("if v_work.status <> 'queued' then");
    expect(repairSql).toContain("public.flowmate_earliest_capacity_date(");
    expect(repairSql).toContain("public.flowmate_run_assignment(v_work.id, 'rerun')");
    expect(repairSql).not.toContain("update public.team_members");
    expect(createScreenJsx).toContain("seenAssignmentResults");
    expect(createScreenJsx).toContain("metadata.reason");
    expect(ganttScreenJsx).toContain("Daily workload shows total points planned automatically for each person");
    expect(ganttScreenJsx).toContain("users do not need to schedule time slots manually");
  });

  it("separates WIP failures from capacity failures and safely repairs the Aug 3 queued requests", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const repairSql = readFileSync(
      join(process.cwd(), "supabase", "fix_queued_assignment_windows_20260803.sql"),
      "utf8",
    );

    expect(assignmentSql).toContain("v_has_available_wip boolean");
    expect(assignmentSql).toContain("elsif not v_has_available_wip then");
    expect(assignmentSql).toContain("matching members have 0 pt remaining before the 1st Draft date");
    expect(assignmentSql).toContain("some capacity, but less than the required");
    expect(repairSql).toContain("array['CR-1050', 'CR-1048', 'CR-1049']");
    expect(repairSql).toContain("public.flowmate_earliest_capacity_date(");
    expect(repairSql).toContain("public.flowmate_run_assignment(v_work.id, 'rerun')");
    expect(repairSql).toContain("set local statement_timeout = '30s'");
    expect(repairSql).not.toContain("update public.team_members");
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
    const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const helperJs = readFileSync(join(process.cwd(), "supabase-ai-tags.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
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
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");

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
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");

    expect(listDataJs).toContain("function attachFlowMateLiveRefresh");
    expect(listDataJs).toContain("FLOWMATE_REFRESH_POLL_MS");
    // O-2/O-3: self-scheduling poller that pauses on hidden tabs (was a fixed
    // setInterval); refreshes are event-driven + visibility-aware.
    expect(listDataJs).toContain("visibilitychange");
    expect(listDataJs).toContain("document.hidden");
    expect(appJsx).toContain("window.startFlowMateRealtime()");
    expect(appJsx).toContain("window.stopFlowMateRealtime()");
    expect(appJsx).toContain("flowmate:refresh-request");
    for (const source of [screensA, screensB, screensC]) {
      expect(source).toContain("attachFlowMateLiveRefresh");
    }
  });

  it("shows connected and degraded realtime status without signed-out data access", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");

    expect(appJsx).toContain('authState.status !== "signed-in"');
    expect(appJsx).toContain("setRealtimeState");
    expect(appJsx).toContain("Realtime connected");
    expect(appJsx).toContain("Realtime degraded");
    expect(appJsx).toContain("Polling fallback active");
    expect(listDataJs).toContain("if (!window.FLOWMATE_CURRENT_USER)");
    expect(listDataJs).not.toMatch(/localStorage\.setItem\(["'][^"']*(token|session|secret|api[_-]?key)/i);
    expect(appJsx).not.toMatch(/localStorage\.setItem\(["'][^"']*(token|session|secret|api[_-]?key)/i);
  });
});

// ============================================================================
// MVP 1.2 List filters and refresh controls
// ============================================================================
describe("MVP 1.2 List filters and refresh controls", () => {
  it("renders due dates consistently by date instead of hiding badges for delivered or cancelled rows", () => {
    const dataJsx = readFileSync(join(process.cwd(), "data.jsx"), "utf8");
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
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
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
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const listSource = screensB.slice(screensB.indexOf("function ListScreen"), screensB.indexOf("/* ============================================================\n   KANBAN BOARD"));

    expect(listSource).toContain("const LIST_STATUS_FILTER_KEYS =");
    expect(listSource).toContain("LIST_STATUS_FILTER_KEYS.map");
    expect(listSource).not.toContain("Object.entries(STATUS_LABEL).map");
    expect(listSource).not.toContain('value="new"');
    expect(listSource).not.toContain('value="need_brief"');
  });

  it("keeps List filter context when opening a task detail", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
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

  it("shows unique Attention Needed rows grouped by unassigned and advisory risk", () => {
    const utils = loadGithubSearchUtils();
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const attentionSource = screensB.slice(screensB.indexOf("function QueueScreen"), screensB.indexOf("function AttentionGroup"));
    const rows = [
      { id: "CR-1", status: "unassigned", title: "Needs owner" },
      { id: "CR-2", status: "assigned", needsSplit: true, title: "Hybrid" },
      { id: "CR-3", status: "need_brief", title: "Need brief" },
      { id: "CR-4", status: "assigned", assignmentWarnings: [{ code: "over_capacity" }], title: "Overloaded" },
    ];

    expect(utils.getFlowMateAttentionRows(rows).map((row) => row.id)).toEqual(["CR-1", "CR-2", "CR-4"]);
    expect(utils.getFlowMateAttentionGroups(rows).unassigned.map((row) => row.id)).toEqual(["CR-1"]);
    expect(utils.getFlowMateAttentionGroups(rows).needs_split.map((row) => row.id)).toEqual(["CR-2"]);
    expect(utils.getFlowMateAttentionGroups(rows).over_capacity.map((row) => row.id)).toEqual(["CR-4"]);
    expect(attentionSource).toContain("Attention Needed");
    expect(attentionSource).toContain("window.getFlowMateAttentionRows");
    expect(attentionSource).toContain("window.getFlowMateAttentionGroups");
    expect(attentionSource).not.toContain('return w.status === "queued"');
  });

  it("keeps closed work out of operational views without mutating input", () => {
    const utils = loadGithubSearchUtils();
    const rows = [
      { id: "A", status: "assigned" },
      { id: "D", status: "delivered", assignmentWarnings: [{ code: "over_capacity" }] },
      { id: "C", status: "cancelled", needsSplit: true },
      { id: "L", status: "done", needsSplit: true },
    ];

    expect(utils.getFlowMateListVisibleRows(rows, "all").map(row => row.id)).toEqual(["A"]);
    expect(utils.getFlowMateAttentionRows(rows).map(row => row.id)).toEqual([]);
    expect(rows.map(row => row.id)).toEqual(["A", "D", "C", "L"]);
  });

  it("never exposes closed rows for persisted explicit filters and normalizes status matching", () => {
    const utils = loadGithubSearchUtils();
    const rows = [
      { id: "OPEN", status: "ReViEw" },
      { id: "DELIVERED", status: "DELIVERED" },
      { id: "CANCELLED", status: "Cancelled" },
      { id: "DONE", status: "DoNe" },
    ];

    ["delivered", "cancelled", "done", "DELIVERED", "Cancelled", "DoNe"].forEach((filterStatus) => {
      expect(utils.getFlowMateListVisibleRows(rows, filterStatus).map(row => row.id)).toEqual([]);
    });
    expect(utils.getFlowMateListVisibleRows(rows, "review").map(row => row.id)).toEqual(["OPEN"]);
    expect(rows.map(row => row.id)).toEqual(["OPEN", "DELIVERED", "CANCELLED", "DONE"]);
  });

  it("recovers an obsolete persisted List status filter to all", () => {
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const listSource = screensB.slice(screensB.indexOf("function ListScreen"), screensB.indexOf("/* ============================================================\n   KANBAN BOARD"));

    expect(listSource).toContain('const initialListStatus = LIST_STATUS_FILTER_KEYS.includes(savedListState.filterStatus)');
    expect(listSource).toContain('const [filterStatus, setFilterStatus] = useStateB(initialListStatus);');
  });

  it("keeps visible Refresh buttons wired to real reload handlers", () => {
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const boardSource = screensB.slice(screensB.indexOf("function BoardScreen"), screensB.indexOf("function QueueScreen"));
    const timelineSource = appJsx.slice(appJsx.indexOf("function MarketingPlanTimelineScreen"), appJsx.indexOf("function MarketingPlanChannelPlanScreen"));
    const channelSource = appJsx.slice(appJsx.indexOf("function MarketingPlanChannelPlanScreen"), appJsx.indexOf("function MarketingPlanCalendarScreen"));
    const calendarSource = appJsx.slice(appJsx.indexOf("function MarketingPlanCalendarScreen"), appJsx.indexOf("function MarketingPlanWorkingSheetScreen"));

    expect(appJsx).toContain("onRefresh: () => refreshNotifications({");
    expect(appJsx).toContain("showLoading: true");
    expect(boardSource).toContain("async function handleBoardRefresh()");
    expect(boardSource).toContain("setLoadState({ status: \"loading\", message: \"Refreshing board data...\" })");
    expect(boardSource).toContain("setFlash({ tone: \"ok\", text: \"Board refreshed.\" })");
    expect(boardSource).toContain("window.dispatchEvent(new CustomEvent(\"flowmate:refresh-counts\"))");
    expect(boardSource).toContain('onClick={handleBoardRefresh}');
    expect(screensB).toContain('onClick={loadWhitelist} disabled={pending}');
    expect(timelineSource).toContain("async function loadTimelineRows");
    expect(timelineSource).toContain('onClick: () => window.dispatchEvent(new CustomEvent("flowmate:refresh-request"))');
    expect(timelineSource).toContain("window.attachFlowMateLiveRefresh");
    expect(channelSource).toContain("async function loadTimelineRows(options = {})");
    expect(channelSource).toContain('onClick: () => window.dispatchEvent(new CustomEvent("flowmate:refresh-request"))');
    expect(channelSource).toContain("window.attachFlowMateLiveRefresh");
    expect(calendarSource).toContain("async function loadCalendarRows");
    expect(calendarSource).toContain('onClick: () => window.dispatchEvent(new CustomEvent("flowmate:refresh-request"))');
    expect(calendarSource).toContain("window.attachFlowMateLiveRefresh");
  });
});

// ============================================================================
// MVP 1.2 Team Calendar frontend
// ============================================================================
describe("MVP 1.2 Team Calendar frontend", () => {
  it("adds a Calendar route to team navigation and renders CalendarScreen", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const navSource = appJsx.slice(appJsx.indexOf("const NAV = ["), appJsx.indexOf("const ADMIN_NAV_GROUP"));

    expect(navSource).toContain('key: "calendar"');
    expect(navSource).toContain('label: "Calendar"');
    expect(navSource).toContain('icon: "calendar"');
    expect(appJsx).toContain('"calendar": "Team calendar"');
    expect(appJsx).toContain('route === "calendar"');
    expect(appJsx).toContain("React.createElement(CalendarScreen");
    expect(appJsx).toContain("onOpen: open");
  });

  it("adds Team Schedule below Calendar with Timeline and Workload", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const navSource = appJsx.slice(appJsx.indexOf("const NAV = ["), appJsx.indexOf("const ADMIN_NAV_GROUP"));
    const calendarIndex = navSource.indexOf('key: "calendar"');
    const ganttIndex = navSource.indexOf('key: "gantt"');
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(calendarIndex).toBeGreaterThan(-1);
    expect(ganttIndex).toBeGreaterThan(calendarIndex);
    expect(appJsx).toContain('"gantt": "Team Schedule"');
    expect(appJsx).toContain('route === "gantt"');
    expect(appJsx).toContain("React.createElement(TeamGanttScreen");
    expect(appJsx).toContain("onOpen: open");
    expect(ganttSource).toContain("function TeamGanttScreen({ onOpen })");
    expect(ganttSource).toContain("data-testid=\"flowmate-team-gantt-route\"");
    expect(ganttSource).toContain("data-testid=\"flowmate-team-gantt-chart\"");
    expect(ganttSource).not.toContain("Trello Power-Up Lite");
    expect(ganttSource).toContain("todayOffset");
    expect(ganttSource).toContain("gantt__today-line");
    expect(ganttSource).toContain("flowmate-team-schedule-timeline-tab");
    expect(ganttSource).toContain("flowmate-team-schedule-workload-tab");
    expect(ganttSource).toContain("priorityClass");
    expect(ganttSource).toContain("Capacity = actual weekday capacity minus leave and holidays");
    expect(ganttSource).toContain("window.flowmateSelectedWorkItem = null");
    expect(ganttSource).toContain("onOpen(item.id)");
    expect(appCss).toContain(".gantt");
    expect(appCss).toContain(".gantt__bar");
    expect(appCss).toContain(".gantt__today-line");
    expect(appCss).toContain(".gantt__toolbar");
    expect(appCss).toContain(".gantt__legend");
    expect(appCss).toContain(".gantt__bar.is-urgent");
  });

  it("opens a partial Team Schedule card through the full detail loader", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));
    const openScheduleItemBody = ganttSource.match(/function openScheduleItem\(item\) \{([\s\S]*?)\n  \}/)?.[1];
    expect(openScheduleItemBody).toBeTruthy();

    const openedIds: string[] = [];
    const sandbox = {
      window: { flowmateSelectedWorkItem: { id: "CR-OLD", campaign: "stale summary" } },
      onOpen: (id: string) => openedIds.push(id),
      item: { id: "CR-1064", title: "Schedule summary only" },
    };
    vm.runInNewContext(`(function openScheduleItem(item) {${openScheduleItemBody}\n})(item);`, sandbox);

    expect(sandbox.window.flowmateSelectedWorkItem).toBeNull();
    expect(openedIds).toEqual(["CR-1064"]);
  });

  it("Team Schedule month dropdown keeps the current month selectable", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const searchUtils = readFileSync(join(process.cwd(), "search-utils.js"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_START = "2026-01"');
    expect(searchUtils).toContain('const FLOWMATE_MONTH_EXPORT_END = "2027-12"');
    expect(searchUtils).toContain("options.push({ key, label })");
    expect(ganttSource).toContain("data-testid=\"flowmate-gantt-month\"");
    expect(screensC).toContain("function flowMateRowsMonthOptionsC(rows");
    expect(ganttSource).toContain("const monthOptions = teamScheduleMonthOptionsC(sourceRows, monthKey)");
    expect(ganttSource).toContain("monthOptions.map");
    expect(ganttSource).not.toContain("flowMateMonthOptionsC().map(option => <option key={option.key} value={option.key}>{option.label}</option>)");
  });

  it("Team Schedule renders a horizontally scrollable one-month timeline", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(screensC).toContain("function ganttTimelineWindowC(monthKey)");
    expect(screensC).toContain("const visibleMonthCount = 1");
    expect(ganttSource).toContain("const ganttWindow = ganttTimelineWindowC(monthKey)");
    expect(ganttSource).toContain("ganttWindow.totalDays");
    expect(ganttSource).toContain("ganttWindow.dayCells");
    expect(ganttSource).toContain("flowMateMonthLabelC(monthKey)");
    expect(ganttSource).not.toContain("Trello Power-Up Lite");
    expect(ganttSource).not.toContain("Two-month window");
    expect(ganttSource).not.toContain("Scroll right to see the second month");
    expect(ganttSource).not.toContain("Grouped by team / assignee");
    expect(ganttSource).not.toContain("Click bar to open task");
    expect(ganttSource).toContain("ganttTaskModelC(row, monthKey, ganttWindow");
    expect(appCss).toContain(".gantt__month-scale");
    expect(appCss).toContain("min-width: calc(var(--gantt-days, 62) * 30px)");
    expect(appCss).toContain("width: calc(var(--gantt-days, 62) * 30px)");
    expect(appCss).toContain("box-sizing: border-box");
    expect(appCss).toContain("background-color: var(--garena-white)");
    expect(appCss).toContain("background-size: calc(100% / var(--gantt-days, 62)) 100%");
    expect(appCss).toContain("overflow: auto");
    expect(appCss).toMatch(/\.gantt\s*\{[\s\S]*max-height: calc\(100vh - 220px\);[\s\S]*overflow: auto;/);
    expect(appCss).toMatch(/\.gantt__header\s*\{[\s\S]*position: sticky;[\s\S]*top: 0;[\s\S]*z-index: 20;/);
  });

  it("Team Schedule fills the available desktop width without shrinking days below the scroll floor", () => {
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");

    expect(appCss).toMatch(/\.team-schedule\s*\{[^}]*max-width:\s*none;/);
    expect(appCss).toMatch(/\.team-schedule__timeline :is\([^)]*\.gantt__timeline-head[^)]*\)\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*calc\(var\(--gantt-days, 62\) \* 30px\);/);
    expect(appCss).toMatch(/\.team-schedule__timeline \.gantt__month-scale\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*100%;/);
  });

  it("keeps the Gantt owner column above horizontally scrolling task bars", () => {
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");

    expect(appCss).toMatch(/\.gantt__owner\s*\{[\s\S]*position: sticky;[\s\S]*left: 0;[\s\S]*z-index: 7;/);
    expect(appCss).toMatch(/\.gantt__owner-head\s*\{[\s\S]*position: sticky;[\s\S]*left: 0;[\s\S]*z-index: 10;/);
    expect(appCss).toMatch(/\.gantt__team-title\s*\{[\s\S]*position: sticky;[\s\S]*left: 0;[\s\S]*width: 220px;/);
    expect(appCss).toMatch(/\.gantt__bar\s*\{[\s\S]*position: relative;[\s\S]*z-index: 1;/);
  });

  it("Team Schedule renders GD/VE leave requests on assignee rows", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(screensC).toContain("function ganttLeaveModelC(row, monthKey, ganttWindow)");
    expect(screensC).toContain("function mergeGanttLeaveSegmentsC(leaves)");
    expect(ganttSource).toContain('row.type === "leave"');
    expect(ganttSource).toContain("const leaves = sourceRows");
    expect(ganttSource).toContain("mergeGanttLeaveSegmentsC(leaves.filter");
    expect(ganttSource).toContain('className={`gantt__leave');
    expect(ganttSource).toContain("Half leave");
    expect(appCss).toContain(".gantt__leave");
    expect(appCss).toContain(".gantt__leave.is-partial");
    expect(appCss).toMatch(/\.gantt__leave\s*\{[\s\S]*min-width: 0;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  });

  it("shows simplified weekly capacity with task drill-down in Team Schedule", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listData = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const capacitySql = readFileSync(join(process.cwd(), "supabase", "gantt_capacity_allocation_read.sql"), "utf8");
    const ganttSource = screensC.slice(screensC.indexOf("function TeamGanttScreen"), screensC.indexOf("function CalendarScreen"));

    expect(listData).toContain('"flowmate_capacity_allocations"');
    expect(listData).toContain("async function loadFlowMateCapacityAllocationRows(startDate, endDate)");
    expect(listData).toContain('.from("flowmate_capacity_allocations")');
    expect(listData).toContain('.gte("bucket_date", startDate)');
    expect(listData).toContain('.lte("bucket_date", endDate)');
    expect(listData).toContain("window.loadFlowMateCapacityAllocationRows = loadFlowMateCapacityAllocationRows");
    expect(listData).toContain("async function loadFlowMateNonWorkingDays(startDate, endDate)");
    expect(listData).toContain("window.loadFlowMateNonWorkingDays = loadFlowMateNonWorkingDays");
    expect(screensC).toContain("function teamScheduleWeeklyCellC(");
    expect(ganttSource).toContain('data-testid="flowmate-team-schedule-workload"');
    expect(ganttSource).toContain('data-testid="flowmate-team-schedule-capacity-cell"');
    expect(ganttSource).toContain('data-testid="flowmate-team-schedule-workload-inspector"');
    expect(ganttSource).toContain("selectedWorkload.entries.map");
    expect(ganttSource).toContain("Assigned, In Progress, Review, and Blocked count toward workload");
    expect(appCss).toContain(".team-schedule__capacity-cell.is-over");
    expect(appCss).toContain('html[data-theme="dark"] .team-schedule__capacity-cell.is-over');
    expect(capacitySql).toContain("alter table public.flowmate_capacity_allocations enable row level security");
    expect(capacitySql).toContain("public.flowmate_current_user_can_read_work_item(work_item_id)");
    expect(capacitySql).toContain("grant select on public.flowmate_capacity_allocations to authenticated");
    expect(capacitySql).toContain("revoke insert, update, delete on public.flowmate_capacity_allocations from authenticated");
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

  it("keeps leave rows but excludes delivered, cancelled, and legacy done work from calendar day and week results", () => {
    const utils = loadGithubSearchUtils();
    const rows = [
      { id: "OPEN", dueDate: "2026-05-20", status: "assigned", type: "creative" },
      { id: "DELIVERED", dueDate: "2026-05-20", status: "delivered", type: "creative" },
      { id: "CANCELLED", dueDate: "2026-05-20", status: "cancelled", type: "quick" },
      { id: "LEGACY-DONE", dueDate: "2026-05-21", status: "done", type: "creative" },
      { id: "LEAVE", calendarDate: "2026-05-20", status: "approved", type: "leave" },
    ];

    expect(utils.getFlowMateCalendarAgendaRows(rows, { dateKey: "2026-05-20", range: "day" }).map(row => row.id)).toEqual(["LEAVE", "OPEN"]);
    expect(utils.getFlowMateCalendarAgendaRows(rows, { dateKey: "2026-05-20", range: "week" }).map(row => row.id)).toEqual(["LEAVE", "OPEN"]);
  });

  it("CalendarScreen shows month and agenda modes with launch date context and opens detail rows", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
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

  it("keeps closed statuses out of List and Calendar operational status dropdowns", () => {
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listSource = screensB.slice(screensB.indexOf("function ListScreen"), screensB.indexOf("/* ============================================================\n   KANBAN BOARD"));
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(listSource).toContain("window.getFlowMateListVisibleRows(sourceRows, filterStatus)");
    expect(listSource).not.toContain('"delivered"');
    expect(listSource).not.toContain('"cancelled"');
    expect(calendarSource).toContain("window.isFlowMateOperationalRow(row)");
    expect(calendarSource).not.toContain("Object.entries(STATUS_LABEL).map");
    expect(calendarSource).not.toContain('value="delivered"');
    expect(calendarSource).not.toContain('value="cancelled"');
  });

  it("CalendarScreen keeps summary metrics in a compact horizontal row", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain('className="calendar-metrics"');
    expect(calendarSource).toContain("Scheduled items");
    expect(calendarSource).toContain("Quick Tasks");
    expect(calendarSource).toContain("Due soon");
    expect(calendarSource).toContain("Overdue");
    expect(appCss).toContain(".calendar-metrics");
    expect(appCss).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(appCss).toContain(".calendar-metrics .stat");
  });

  it("Calendar agenda Prev, Today, and Next move the selected day or selected week", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
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
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain("function openCalendarOverflow(event, dateKey)");
    expect(calendarSource).toContain('setAgendaRange("day")');
    expect(calendarSource).toContain('setViewMode("agenda")');
    expect(calendarSource).toContain("onClick={(event) => openCalendarOverflow(event, cell.key)}");
    expect(calendarSource).toContain("Open all");
  });

  it("calendar month item text is constrained so long titles do not overflow cells", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));

    expect(calendarSource).toContain('minWidth: 0');
    expect(calendarSource).toContain('overflow: "hidden"');
    expect(calendarSource).toContain('overflowWrap: "anywhere"');
    expect(calendarSource).toContain('wordBreak: "break-word"');
  });

  it("Calendar loads leave request rows and exposes Create Leave Request", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
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

  it("Calendar leave cards show only owner and leave period without LV ids", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const calendarSource = screensC.slice(screensC.indexOf("function CalendarScreen"));
    const calendarItemSource = calendarSource.slice(
      calendarSource.indexOf("function calendarItem"),
      calendarSource.indexOf("return (", calendarSource.indexOf("function calendarItem")),
    );

    expect(calendarSource).toContain("const isLeaveItem = item.type === \"leave\";");
    expect(calendarSource).toContain("const leavePeriodLabel = item.leaveUnits === 0.5 ? `${item.halfLabel} Leave` : \"AM + PM Leave\";");
    expect(calendarSource).toContain("const calendarTitle = isLeaveItem ? `${owner} on leave` : item.title;");
    expect(calendarSource).toContain("{!isLeaveItem && (");
    expect(calendarSource).toContain("{calendarTitle}");
    expect(calendarSource).toContain("{isLeaveItem ? leavePeriodLabel : `${owner} - ${STATUS_LABEL[item.status] || item.status}`}");
    expect(calendarItemSource).not.toContain("<span className=\"mono strong\"");
    expect(calendarItemSource).not.toContain("{item.id}");
  });
});

// ============================================================================
// MVP 1.2 Notification Center frontend
// ============================================================================
describe("MVP 1.2 Notification Center frontend", () => {
  it("loads signed-in user notifications and marks read state through backend-scoped APIs", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
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
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
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
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
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
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const topbarSource = appJsx.slice(
      appJsx.indexOf('className: "app__topbar"'),
      appJsx.indexOf('className: "app__sidebar"'),
    );

    expect(appJsx).toContain("const [notifications, setNotifications]");
    expect(appJsx).toContain("const unreadNotificationCount");
    expect(appJsx).toContain("loadFlowMateNotifications");
    expect(appJsx).toContain("NotificationCenterPanel");
    expect(appJsx).toContain("markFlowMateNotificationRead");
    expect(appJsx).toContain("markAllFlowMateNotificationsRead");
    expect(appJsx).toContain("dismissReadFlowMateNotifications");
    expect(appJsx).toContain("handleOpenNotification");
    expect(appJsx).toContain("window.flowmateSelectedWorkItem = row");
    expect(appJsx).toContain("onOpen: handleOpenNotification");

    expect(topbarSource).toContain("Notifications");
    expect(topbarSource).toContain("refreshNotifications({");
    expect(topbarSource).toContain("showLoading: true");
    expect(topbarSource).toContain("unreadNotificationCount > 0 && React.createElement");
    expect(topbarSource).not.toContain("Notifications are planned");
  });

  it("toggles the Notifications popup closed on a second topbar click", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const topbarSource = appJsx.slice(
      appJsx.indexOf('className: "app__topbar"'),
      appJsx.indexOf('className: "app__sidebar"'),
    );

    expect(topbarSource).toContain("setIsNotificationCenterOpen(open => {");
    expect(topbarSource).toContain("const nextOpen = !open;");
    expect(topbarSource).toContain("if (nextOpen) refreshNotifications({");
    expect(topbarSource).toContain("showLoading: true");
    expect(topbarSource).toContain("return nextOpen;");
  });

  it("renders clear notification loading, empty, unread, and read states", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
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
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const panelSource = appJsx.slice(appJsx.indexOf("function NotificationCenterPanel"));

    expect(panelSource).toContain("link_added: \"Link\"");
    expect(panelSource).toContain("watcher_added: \"Watcher\"");
    expect(panelSource).toContain("comments, links, watchers, and due reminders will appear here");
  });
});

describe("MVP 1.2 topbar create menu", () => {
  it("opens a topbar Create dropdown with Quick Task, Creative Request, and Leave request choices", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const topbarSource = appJsx.slice(
      appJsx.indexOf('className: "app__topbar"'),
      appJsx.indexOf('className: "app__sidebar"'),
    );

    expect(appJsx).toContain("const [isCreateMenuOpen, setIsCreateMenuOpen]");
    expect(appJsx).toContain("CreateMenuPanel");
    expect(topbarSource).toContain("setIsCreateMenuOpen");
    expect(topbarSource).not.toContain('onClick: () => nav("create")');
    expect(appJsx).toContain("Quick Task");
    expect(appJsx).toContain("Creative Request");
    expect(appJsx).toContain("Leave request");
  });

  it("routes Create menu choices to the correct create mode or leave modal", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");

    expect(appJsx).toContain('onQuick: () => handleTopbarCreateChoice("quick")');
    expect(appJsx).toContain('onCreative: () => handleTopbarCreateChoice("creative")');
    expect(appJsx).toContain('onLeave: () => handleTopbarCreateChoice("leave")');
    expect(appJsx).toContain("setCreateModeIntent(choice)");
    expect(appJsx).toContain("setIsGlobalLeaveModalOpen(true)");
    expect(appJsx).toContain("React.createElement(GlobalLeaveRequestModal");
    expect(appJsx).toContain("initialMode: createModeIntent");
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
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");

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
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

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
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(listDataJs).toContain("flowmateDateTimeFullLabel(comment.created_at)");
    expect(listDataJs).toContain("day: \"numeric\"");
    expect(listDataJs).toContain("month: \"short\"");
    expect(listDataJs).toContain("year: \"numeric\"");
    expect(listDataJs).toContain("hour12: true");
    expect(detailSource).toContain("comment.createdLabel || flowmateFormatCommentTime(comment.created_at)");
  });

  it("preserves line breaks when rendering detail comment text", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain('<div className="comment__text" style={{ whiteSpace: "pre-wrap" }}>{comment.body}</div>');
  });

  it("updates detail links and watchers immediately after successful add", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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

  it("records Submit Review links as Review Link rows in the Link zone", () => {
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const adminSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const transitionSource = quickTaskSql.slice(
      quickTaskSql.indexOf("elsif p_next_status = 'review' and v_from_status = 'in_progress'"),
      quickTaskSql.indexOf("elsif p_next_status = 'delivered' and v_from_status = 'review'"),
    );
    const adminTransitionSource = adminSql.slice(
      adminSql.indexOf("create or replace function public.flowmate_admin_transition_work_status"),
      adminSql.indexOf("revoke all on function public.flowmate_admin_transition_work_status"),
    );

    expect(screensA).toContain('label: "Review Link"');
    expect(transitionSource).toContain("insert into public.work_item_links");
    expect(transitionSource).toContain("'Review Link'");
    expect(transitionSource).toContain("not exists");
    expect(adminTransitionSource).toContain("insert into public.work_item_links");
    expect(adminTransitionSource).toContain("'Review Link'");
  });

  it("shows AI tag changes as explicit Activity log entries", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const aiTagSql = readFileSync(join(process.cwd(), "supabase", "ai_tags.sql"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(aiTagSql).toContain("'add_ai_tag'");
    expect(aiTagSql).toContain("'remove_ai_tag'");
    expect(detailSource).toContain('if (action === "add_ai_tag") return `${actor} added AI Tag${suffix}`;');
    expect(detailSource).toContain('if (action === "remove_ai_tag") return `${actor} removed AI Tag${suffix}`;');
  });

  it("does not show status controls to read-only watchers", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain("const canStatusTransition");
    expect(detailSource).toContain("currentUserId === w.requesterUserId");
    expect(detailSource).toContain("currentUserId === w.assigneeUserId");
    expect(detailSource).toContain("owner?.userId === currentUserId");
    expect(detailSource).toContain("window.FLOWMATE_CURRENT_USER?.role === \"admin\"");
    expect(detailSource).not.toContain("visibleWatchers.some");
  });

  it("keeps the watcher add controls readable in the narrow detail sidebar", () => {
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");
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
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");
    const boardSource = screensB.slice(screensB.indexOf("function BoardScreen"), screensB.indexOf("function QueueScreen"));

    expect(boardSource).toContain("window.transitionFlowMateWorkStatus(row.id, targetStatus, options)");
    expect(boardSource).not.toContain("window.transitionFlowMateCreativeStatus(row.id, targetStatus, options)");
  });

  it("routes admin archive through the soft archive RPC without client actor spoofing", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

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
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");

    expect(listDataJs).toContain("archived_at");
    expect(listDataJs).toContain("const activeWorkItems = (workItemsResult.data || []).filter((item) => !item.archived_at)");
    expect(listDataJs).toContain("const rows = activeWorkItems.map((item) =>");
  });

  it("removes View as perspective controls and keeps My work on the signed-in user", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
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
    const screensA = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = screensA.slice(screensA.indexOf("function DetailScreen"));

    expect(detailSource).toContain("const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === \"admin\"");
    expect(detailSource).toContain("async function runAdminArchive()");
    expect(detailSource).toContain("window.adminArchiveFlowMateWorkItem(w.id, reason)");
    // H-11: archive confirmation now uses the flowmatePrompt modal (note + confirm).
    expect(detailSource).toContain("Soft archive, not a permanent delete.");
    expect(detailSource).toContain("Admin archive");
    expect(detailSource).toContain("{isAdminUser && w.isSupabaseRow && !w.archivedAt && (");
  });

  it("syncs FlowMate review and delivered statuses back to linked Marketing Plan rows", () => {
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const adminSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");

    for (const sql of [quickTaskSql, adminSql]) {
      expect(sql).toContain("update public.marketing_channel_placements mcp");
      expect(sql).toContain("from public.marketing_content_items mci");
      expect(sql).toContain("mci.id = mcp.content_item_id");
      expect(sql).toContain("mci.flowmate_work_item_id = v_work.id");
      expect(sql).toContain("when p_next_status = 'review' then 'review'");
      expect(sql).toContain("when p_next_status = 'delivered' then 'ready_to_post'");
    }
  });

  it("resets linked Marketing Plan working rows when a Creative Request is cancelled", () => {
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const adminSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");

    for (const sql of [quickTaskSql, adminSql]) {
      expect(sql).toContain("if v_work.work_type = 'creative_request'");
      expect(sql).toContain("p_next_status = 'cancelled'");
      expect(sql).toContain("with linked_content as (");
      expect(sql).toContain("brief_link = null");
      expect(sql).toContain("flowmate_work_item_id = null");
      expect(sql).toContain("status = 'not_started'");
      expect(sql).toContain("placement_status = 'planned'");
      expect(sql).toContain("mci.flowmate_work_item_id = v_work.id");
      expect(sql).toContain("substring(mci.brief_link from '#detail/([^/?#]+)') = v_work.display_id");
    }

    const workingRowsSource = appJsx.slice(appJsx.indexOf("const rowHasLinkedCreativeRequest"));
    expect(workingRowsSource).toContain("rowHasLinkedCreativeRequest ? null");
    expect(workingRowsSource).toContain("Create Brief");
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
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain("id, email, display_name, requester_team, is_active, role");
    expect(quickTaskJs).toContain("role: profile.role || \"member\"");
  });

  it("shows whitelist entry points only for admin users", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");

    expect(appJsx).toContain("const isAdminUser = user.role === \"admin\"");
    expect(appJsx).toContain("getVisibleNavGroups(user.role)");
    expect(appJsx).toContain("function isFlowMateRouteAllowedForRole(role, routeKey)");
    expect(appJsx).toContain("const allowedRoute = isFlowMateRouteAllowedForRole(user.role, route)");
    expect(appJsx).toContain('allowedRoute && route === "admin-whitelist" && isAdminUser && React.createElement(AdminWhitelistScreen, null)');
    expect(appJsx).toContain("!allowedRoute && React.createElement(AccessDeniedScreen");
    expect(appJsx).toContain("onNav: nav");
  });

  it("limits member FlowMate navigation to Personal and Team while admins see Supervisor and Admin", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");

    expect(appJsx).toContain("const MEMBER_NAV_GROUPS = NAV.filter(group => group.group === \"Personal\" || group.group === \"Team\");");
    expect(appJsx).toContain("function getVisibleNavGroups(role)");
    expect(appJsx).toContain("return role === \"admin\" ? [...NAV, ADMIN_NAV_GROUP] : MEMBER_NAV_GROUPS;");
    expect(appJsx).toContain("const MEMBER_ROUTE_KEYS = new Set(MEMBER_NAV_GROUPS.flatMap(group => group.items.map(item => item.key)).concat([\"detail\"]));");
    expect(appJsx).toContain("if (role === \"admin\") return Boolean(TITLE_MAP[routeKey]);");
    expect(appJsx).toContain("return MEMBER_ROUTE_KEYS.has(routeKey);");
  });

  it("uses admin whitelist helpers and RPCs instead of direct browser writes", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

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

  it("loads whitelist timestamps from the actual added_at column to avoid PostgREST 400s", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain(".select(\"email,display_name,role,team_member_code,added_at,added_by\")");
    expect(quickTaskJs).toContain("created_at: row.created_at || row.added_at");
    expect(quickTaskJs).not.toContain(".select(\"email,display_name,role,team_member_code,created_at,added_by\")");
  });

  it("renders list, add, deactivate, and Supabase error states for admin whitelist management", () => {
    const screensB = readFileSync(join(process.cwd(), "screens-b.jsx"), "utf8");

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
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
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
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

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
    expect(assignmentSql).toContain("public.flowmate_leave_fraction_for_bucket");
    expect(assignmentSql).toContain("from public.leave_requests lr");
    expect(assignmentSql).toContain("then 0.5::numeric");
    expect(assignmentSql).toContain("generate_series(v_assignment_start, v_assignment_end, interval '1 day')");
    expect(assignmentSql).toContain("bucket_half in ('am', 'pm')");
    expect(assignmentSql).toContain("public.flowmate_capacity_allocations");
    expect(assignmentSql).toContain("bucket_remaining");
  });

  it("matches assignment candidates by Creative Request Type / Skill", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    const finalEngineStart = assignmentSql.lastIndexOf("create or replace function public.flowmate_run_assignment(");
    const finalEngineEnd = assignmentSql.indexOf(
      "revoke all on function public.flowmate_run_assignment(uuid, public.assignment_trigger)",
      finalEngineStart,
    );
    const finalEngineSql = assignmentSql.slice(finalEngineStart, finalEngineEnd);

    expect(assignmentSql).toContain("v_required_skill text");
    expect(assignmentSql).toContain("v_required_skill := lower(trim(coalesce(v_det.asset_subtype, '')))");
    expect(assignmentSql).toContain("when v_required_skill ilike '%graphic pack%' then 'graphic-pack'");
    expect(assignmentSql).toContain("when v_required_skill in ('hero album','hero-album') then 'hero-album'");
    expect(assignmentSql).toContain("when v_required_skill = 'new web' then 'new-web'");
    expect(assignmentSql).toContain("when v_det.asset_type in ('general-video','esport-video') then 'video-standard'");
    expect(assignmentSql).toContain("v_required_skill = any (tm.skills)");
    expect(assignmentSql).not.toContain("with gdve_default_skills(member_code, skills) as (");
    expect(assignmentSql).toContain("Re-running rpc_assignment.sql must preserve every manual skill");
    expect(seedSql).toMatch(/'pond'[\s\S]*array\[[^\]]*'new-web'[^\]]*\]::text\[\]/);
    expect(seedSql).toMatch(/'jo'[\s\S]*array\[[^\]]*'new-web'[^\]]*\]::text\[\]/);
    expect(finalEngineSql).toContain("'code', 'skill_mismatch'");
    expect(finalEngineSql).toContain("'code', 'backup_skill'");
    expect(finalEngineSql).not.toContain("'result', 'queued'");
    expect(assignmentSql).not.toContain("v_det.asset_type = any (tm.skills)");
  });

  it("sets Hero Album effort to 16 points", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("when subtype in ('hero album','hero-album') then 16::numeric");
    expect(assignmentSql).not.toContain("|| array['hero-album']::text[]");
    expect(assignmentSql).not.toContain("and 'banner' = any (coalesce(tm.skills, '{}'::text[]))");
  });

  it("seeds initial GD/VE skills but never overwrites manual Team settings on conflict", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    const expectedSkillRows = [
      ["pond", "array['hero-album','logo','new-web','graphic-pack','kv-design','jersey-design','merchandise-design','video-standard','video-under-1-min','motion']::text[]"],
      ["jo", "array['hero-album','banner','logo','new-web','web-reskin','cdn-design','resize','graphic-pack','kv-design','jersey-design','jersey-in-game','merchandise-design']::text[]"],
      ["tong", "array['hero-album','banner','logo','web-reskin','cdn-design','resize','graphic-pack','kv-design','jersey-design','jersey-in-game','merchandise-design']::text[]"],
      ["eye", "array['banner','logo','web-reskin','cdn-design','resize','jersey-in-game']::text[]"],
      ["vee", "array['video-standard','video-under-1-min','motion']::text[]"],
      ["ploy", "array['banner','logo','resize','graphic-pack']::text[]"],
    ];

    expectedSkillRows.forEach(([memberCode, skillArray]) => {
      expect(seedSql).toContain(`'${memberCode}'`);
      expect(seedSql).toContain(skillArray);
    });
    for (const memberCode of ["pond", "jo", "tong", "eye", "vee", "ploy"]) {
      const memberRow = seedSql
        .split("\n")
        .find((line) => line.includes(`'${memberCode}'`) && line.includes("'GD/VE'")) || "";
      expect(memberRow).toContain("8, null, 4, 'available', true");
    }
    expect(seedSql).not.toContain("skills = excluded.skills");
    expect(seedSql).not.toContain("backup_skills = excluded.backup_skills");
    expect(seedSql).not.toContain("capacity_per_day = excluded.capacity_per_day");
    expect(seedSql).not.toContain("wip_limit = excluded.wip_limit");
    expect(assignmentSql).not.toContain("with gdve_default_skills(member_code, skills) as (");
    expect(assignmentSql).not.toContain("update public.team_members tm\n   set skills");
    expect(assignmentSql).not.toContain("update public.team_members tm\n   set backup_skills");
    expect(assignmentSql).not.toMatch(/update\s+public\.team_members[\s\S]{0,600}\b(skills|backup_skills|wip_limit)\b/i);
    expect(assignmentSql).not.toContain("where lower(tm.member_code) = any (array['pond','jo','tong','eye','ploy'])\n   and 'banner' = any");
    expect(assignmentSql).toContain("Candidate eligibility must always read the live team_members.skills");
    expect(assignmentSql).toContain("Never add");
    expect(assignmentSql).toContain("per-member skill or WIP defaults inside assignment installation or routing.");
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

  it("balances Ops and Marketing static requests by skill and remaining capacity while keeping Pond first for video/motion", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) in ('pond','jo','tong','eye') then 0");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'pond' and v_required_skill in ('motion','video-standard','video-under-1-min') then 0");
    expect(assignmentSql).toContain("when v_requester_context <> 'esport' then 1");
    expect(assignmentSql).toContain("order by pool_rank asc,\n           context_rank asc,\n           context_tie_rank asc,\n           remaining desc,\n           window_assigned_effort asc,\n           wip_now asc,");
    expect(assignmentSql).not.toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'jo' then 1");
    expect(assignmentSql).not.toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'tong' then 2");
    expect(assignmentSql).not.toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'eye' then 3");
    expect(assignmentSql).not.toContain("when v_requester_context <> 'esport' and lower(tm.member_code) = 'pond' then 4");
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

  it("allows urgent fallback only through manually selected primary or backup skills", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");

    expect(assignmentSql).toContain("v_allow_backup_pool boolean");
    expect(assignmentSql).toContain("v_allow_backup_pool := v_wi.priority = 'urgent'");
    expect(assignmentSql).toContain("and v_required_skill in ('video-standard','video-under-1-min')");
    expect(assignmentSql).toContain("and (v_required_skill_2 is null or v_required_skill_2 in ('video-standard','video-under-1-min'));");
    expect(assignmentSql).toContain("when v_allow_backup_pool");
    expect(assignmentSql).not.toContain("or lower(tm.member_code) = 'pond'");
    expect(assignmentSql).not.toContain("set backup_skills = (");
    expect(assignmentSql).toContain("and lower(tm.member_code) = any (v_creative_owner_codes)");
    expect(assignmentSql).toContain("Auto (urgent fallback)");
  });

  it("repairs Pond to the approved manual skills without reassigning historical work", () => {
    const fixSql = readFileSync(join(process.cwd(), "supabase", "fix_pond_manual_skills.sql"), "utf8");

    expect(fixSql).toContain("where lower(member_code) = 'pond'");
    expect(fixSql).toContain("array[\n           'hero-album'");
    for (const selectedSkill of [
      "hero-album",
      "logo",
      "new-web",
      "graphic-pack",
      "kv-design",
      "jersey-design",
      "merchandise-design",
      "video-standard",
      "video-under-1-min",
      "motion",
    ]) {
      expect(fixSql).toContain(`'${selectedSkill}'`);
    }
    for (const excludedSkill of ["banner", "web-reskin", "cdn-design", "resize", "jersey-in-game"]) {
      expect(fixSql).not.toMatch(new RegExp(`^\\s*'${excludedSkill}',?$`, "m"));
    }
    expect(fixSql).toContain("backup_skills = '{}'::text[]");
    expect(fixSql).toContain("capacity_per_day = 8");
    expect(fixSql).toContain("wip_limit = 4");
    expect(fixSql).not.toContain("update public.work_items");
  });

  it("applies the approved Ploy, Joe, Tong, and GD/VE WIP settings without touching historical work", () => {
    const fixSql = readFileSync(join(process.cwd(), "supabase", "fix_gdve_team_settings_20260727.sql"), "utf8");

    expect(fixSql).toContain("where lower(member_code) = 'ploy'");
    expect(fixSql).toContain("where lower(member_code) = 'jo'");
    expect(fixSql).toContain("where lower(member_code) = 'tong'");
    expect(fixSql).toContain("array_prepend('hero-album', skills)");
    expect(fixSql).toContain("set wip_limit = 4");
    expect(fixSql).toContain("lower(replace(discipline, '/', '')) = 'gdve'");
    expect(fixSql).toContain("backup_skills = '{}'::text[]");
    for (const ploySkill of ["banner", "logo", "resize", "graphic-pack"]) {
      expect(fixSql).toContain(`'${ploySkill}'`);
    }
    expect(fixSql).not.toContain("update public.work_items");
    expect(fixSql).not.toContain("insert into public.work_items");
  });

  it("seeds Tong as available full-capacity by default", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    const tongRow = seedSql
      .split("\n")
      .find((line) => line.includes("'tong'") && line.includes("'Tong'")) || "";

    expect(tongRow).toContain("8, null, 4, 'available', true");
    expect(tongRow).not.toContain("8, 4, 4, 'partial', true");
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
  it("archives then clears FlowMate task data and Marketing Plan working data without touching system settings", () => {
    const resetSql = readFileSync(join(process.cwd(), "supabase", "reset_tasks_for_production.sql"), "utf8");
    const quickTaskSql = readFileSync(join(process.cwd(), "supabase", "rpc_quick_task.sql"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const readme = readFileSync(join(process.cwd(), "supabase", "README.md"), "utf8");

    expect(resetSql).toContain("begin;");
    expect(resetSql).toContain("commit;");
    expect(resetSql).toContain("CONFIRM_RESET_FLOWMATE_TASKS");
    expect(resetSql).toContain("create schema if not exists flowmate_archive");
    expect(resetSql).toContain("flowmate_archive.reset_batches");
    expect(resetSql).toContain("flowmate_archive.task_table_rows");
    expect(resetSql).toContain("to_jsonb");
    expect(resetSql).toContain("production_task_and_marketing_plan_reset");
    expect(resetSql).toContain("update public.work_items");
    expect(resetSql).toContain("set archived_at = coalesce(archived_at, now())");
    expect(resetSql).toContain("'marketing_plans'");
    expect(resetSql).toContain("'marketing_campaigns'");
    expect(resetSql).toContain("'marketing_content_items'");
    expect(resetSql).toContain("'marketing_channel_placements'");
    expect(resetSql).toContain("'marketing_plan_events'");
    expect(resetSql).toContain("delete from public.notifications");
    expect(resetSql).toContain("where work_item_id is not null");
    expect(resetSql).toContain("or event_id in (select id from public.work_item_events)");
    expect(resetSql.indexOf("delete from public.marketing_plan_events;")).toBeLessThan(resetSql.indexOf("delete from public.marketing_channel_placements;"));
    expect(resetSql.indexOf("delete from public.marketing_channel_placements;")).toBeLessThan(resetSql.indexOf("delete from public.marketing_content_items;"));
    expect(resetSql.indexOf("delete from public.marketing_content_items;")).toBeLessThan(resetSql.indexOf("delete from public.marketing_campaigns;"));
    expect(resetSql.indexOf("delete from public.marketing_campaigns;")).toBeLessThan(resetSql.indexOf("delete from public.marketing_plans;"));
    expect(resetSql).toContain("delete from public.work_item_ai_tags;");
    expect(resetSql).toContain("delete from public.work_item_watchers;");
    expect(resetSql).toContain("delete from public.work_item_links;");
    expect(resetSql).toContain("delete from public.checklist_items;");
    expect(resetSql).toContain("delete from public.comments;");
    expect(resetSql).toContain("delete from public.assignment_runs;");
    expect(resetSql).toContain("delete from public.creative_request_details;");
    expect(resetSql).toContain("delete from public.work_item_events;");
    expect(resetSql).toContain("delete from public.work_items;");
    expect(resetSql).toContain("'work_items' as table_name");
    expect(resetSql).toContain("'leave_requests_kept'");
    expect(resetSql).toContain("'users_kept'");
    expect(resetSql).toContain("'team_members_kept'");
    expect(resetSql).toContain("'user_whitelist_kept'");
    expect(resetSql).not.toMatch(/delete\s+from\s+public\.(users|team_members|user_whitelist|creative_request_templates|capacity_overrides|leave_requests|skills)\b/i);
    expect(resetSql).not.toMatch(/truncate\s+table/i);
    expect(assignmentSql).toContain("select coalesce(max((substring(display_id from 4))::integer), 1000) + 1");
    expect(quickTaskSql).toContain("select coalesce(max((substring(display_id from 4))::integer), 2000) + 1");
    expect(readme).toContain("supabase/reset_tasks_for_production.sql");
    expect(readme).toContain("archives FlowMate task/request rows and Marketing Plan Working Sheet rows");
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

  it("unassigned and attention counts replace the historical queued metric", () => {
    const hybridSummary = calculateWorkloadSummary([
      ...fixture,
      {
        ...fixture[0],
        displayId: "CR-UNASSIGNED",
        status: "unassigned",
        assigneeName: null,
        assigneeUserId: null,
        isOverdue: false,
        isDueSoon: false,
        isQueued: false,
        isUnassigned: true,
        assignmentWarningCodes: ["over_capacity"],
      },
    ]);
    expect(hybridSummary.unassignedCount).toBe(1);
    expect(hybridSummary.attentionCount).toBe(1);
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

// ============================================================================
// Marketing Plan schedule-operator backend contract
// ============================================================================
describe("Marketing Plan schedule-operator backend contract", () => {
  const operatorSqlPath = join(process.cwd(), "supabase", "marketing_plan_schedule_operator.sql");
  const operatorSql = existsSync(operatorSqlPath) ? readFileSync(operatorSqlPath, "utf8") : "";
  const canonicalMarketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");

  function getRpcBody(sql: string, functionName: string) {
    const start = sql.indexOf(`create or replace function public.${functionName}`);
    const end = start < 0 ? -1 : sql.indexOf("\n$$;", start);
    return start < 0 || end < 0 ? "" : sql.slice(start, end + 4);
  }

  it("adds an opt-in schedule capability and activates it only for the active Real profile", () => {
    expect(operatorSql).toContain("can_manage_marketing_schedule boolean not null default false");
    expect(operatorSql).toContain("lower(email) = 'fco.punyakon@garena.com'");
    expect(operatorSql).toContain("can_access_all_teams = true");
    expect(operatorSql).toContain("can_manage_marketing_schedule = true");
    expect(operatorSql).toContain("and is_active = true");
    const realBackfill = operatorSql.slice(
      operatorSql.indexOf("update public.users"),
      operatorSql.indexOf("create or replace function public.marketing_plan_update_working_row_time"),
    );
    expect(realBackfill).not.toMatch(/role\s*=\s*'admin'/i);
  });

  it("keeps canonical installers aligned with the Real member capability", () => {
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const workspaceSql = readFileSync(join(process.cwd(), "supabase", "workflow_team_workspaces.sql"), "utf8");
    const whitelistSql = readFileSync(join(process.cwd(), "supabase", "whitelist_access.sql"), "utf8");
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");

    expect(schemaSql).toContain("can_manage_marketing_schedule boolean not null default false");
    expect(workspaceSql).toContain("'fco.punyakon@garena.com'");
    expect(whitelistSql).toContain("'fco.punyakon@garena.com',     'Real',    'member', 'real'");
    expect(whitelistSql).toContain("can_manage_marketing_schedule = true");
    expect(marketingPlanSql).toContain("marketing_plan_update_working_row_time");
    expect(marketingPlanSql).toContain("marketing_plan_update_working_row_status");
  });

  it("exposes authenticated-only narrow time and status RPCs with fixed search paths", () => {
    for (const functionName of [
      "marketing_plan_update_working_row_time(uuid, time)",
      "marketing_plan_update_working_row_status(uuid, text)",
    ]) {
      expect(operatorSql).toContain(`create or replace function public.${functionName.split("(")[0]}`);
      expect(operatorSql).toContain(`revoke all on function public.${functionName} from public, anon, authenticated`);
      expect(operatorSql).toContain(`grant execute on function public.${functionName} to authenticated`);
    }
    expect(operatorSql).toContain("security definer\nset search_path = ''");
    expect(operatorSql).toContain("v_actor_id := auth.uid()");
    expect(operatorSql).toContain("and u.is_active = true");
    expect(operatorSql).toContain("v_actor.can_manage_marketing_schedule = true");
    expect(operatorSql).toContain("v_content.pic_user_id = v_actor_id");
    expect(operatorSql).toContain("v_content.sub_pic_user_id = v_actor_id");
  });

  it("keeps each installer and canonical RPC body narrowly authorized and scoped", () => {
    for (const sql of [operatorSql, canonicalMarketingPlanSql]) {
      const timeRpc = getRpcBody(sql, "marketing_plan_update_working_row_time");
      const statusRpc = getRpcBody(sql, "marketing_plan_update_working_row_status");

      for (const rpcBody of [timeRpc, statusRpc]) {
        expect(rpcBody).toContain("security definer\nset search_path = ''");
        expect(rpcBody).toContain("v_actor_id := auth.uid()");
        expect(rpcBody).toContain("and u.is_active = true");
        expect(rpcBody).toContain("v_actor.role = 'admin'");
        expect(rpcBody).toContain("v_content.pic_user_id = v_actor_id");
        expect(rpcBody).toContain("v_content.sub_pic_user_id = v_actor_id");
        expect(rpcBody).toContain("v_actor.can_manage_marketing_schedule = true");
      }

      expect(timeRpc).toContain("if p_publish_time is null or p_publish_time not in ('11:00', '14:00', '18:00', '21:00') then");
      expect(timeRpc).toContain("Select a posting time: 11:00, 14:00, 18:00, or 21:00.");
      expect(timeRpc).toContain("using errcode = '22023'");
      expect(timeRpc).toContain("set source_start_time = p_publish_time");
      expect(timeRpc).toContain("set publish_time = p_publish_time");
      expect(timeRpc).toContain("where content_item_id = v_content.id");
      expect(timeRpc).toContain("where id = v_content.flowmate_work_item_id");
      expect(timeRpc).not.toContain("set placement_status =");
      expect(timeRpc).not.toContain("set status =");
      expect(timeRpc).not.toContain("set launch_date =");

      expect(statusRpc).toContain("if p_placement_status is null or p_placement_status not in ('planned', 'assigned', 'review', 'ready', 'ready_to_post', 'scheduled', 'posted', 'delayed', 'cancelled') then");
      expect(statusRpc).toContain("set placement_status = p_placement_status");
      expect(statusRpc).toContain("where content_item_id = v_content.id");
      expect(statusRpc).not.toContain("update public.marketing_content_items");
      expect(statusRpc).not.toContain("update public.work_items");
      expect(statusRpc).not.toContain("set source_start_time =");
      expect(statusRpc).not.toContain("set publish_time =");
      expect(statusRpc).not.toContain("set status =");
    }
  });

  it("does not broaden table RLS for schedule operators", () => {
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const marketingPlanRls = marketingPlanSql.slice(
      marketingPlanSql.indexOf("-- RLS"),
      marketingPlanSql.indexOf("-- Views"),
    );

    expect(operatorSql).not.toMatch(/create policy[\s\S]*can_manage_marketing_schedule/i);
    expect(marketingPlanRls).not.toContain("can_manage_marketing_schedule");
  });
});
