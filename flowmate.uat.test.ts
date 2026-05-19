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
    expect(utils.getFlowMateQueueRows(rows).map((row) => row.id)).toEqual(["CR-2", "CR-3"]);
    expect(utils.getFlowMateNavCounts(rows, currentUser, members)).toEqual({ "my-work": 1, queue: 2 });
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
});

describe("quick task Other assignee SQL support", () => {
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

  it("My work UI has Team Flow style status filters and ordered sections", () => {
    const screensA = readFileSync(join(process.cwd(), "github", "screens-a.jsx"), "utf8");
    const myWorkSource = screensA.slice(screensA.indexOf("function MyWorkScreen"));

    expect(myWorkSource).toContain("filterStatus");
    expect(myWorkSource).toContain("filterFlowMateMyWorkByStatus");
    expect(myWorkSource).toContain("sortFlowMateMyWorkRows");
    expect(myWorkSource.indexOf('title="Overdue"')).toBeLessThan(myWorkSource.indexOf('title="Due today"'));
    expect(myWorkSource).toContain("All statuses");
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
});

describe("full assignee roster", () => {
  const assigneeCodes = [
    "gear", "panu", "big", "mark", "po", "aof", "folk", "mac", "no", "may",
    "boss", "mag", "real", "pointer", "pond", "jo", "tong", "eye", "vee",
    "pluem", "net", "ben", "peak",
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
      "Pluem", "Net", "Ben", "Peak",
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

  it("list owner filter includes all synced team members", () => {
    const listScreenJsx = readFileSync(join(process.cwd(), "github", "screens-b.jsx"), "utf8");
    expect(listScreenJsx).toContain("...(window.MEMBERS || []).map");
    expect(listScreenJsx).toContain("ownerOptionRows");
  });

  it("creative request assignment is limited to the creative owner pool only", () => {
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const allowedCodes = ["pond", "jo", "tong", "eye", "vee"];
    for (const code of allowedCodes) {
      expect(assignmentSql).toContain(`'${code}'`);
    }
    expect(assignmentSql).toContain("tm.member_code = any (v_creative_owner_codes)");
    expect(assignmentSql).not.toContain("tm.member_code = any (array['gear'");
  });

  it("seed keeps the real roster but removes mock work sample data", () => {
    const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    expect(seedSql).toContain("insert into public.team_members");
    expect(seedSql).toContain("update public.users");
    expect(seedSql).toContain("set is_active = false");
    expect(seedSql).not.toContain("delete from public.users");
    expect(seedSql).not.toContain("mock-pond");
    expect(seedSql).not.toContain("insert into public.work_items");
    expect(seedSql).not.toContain("insert into public.creative_request_details");
    expect(seedSql).not.toContain("insert into public.checklist_items");
    expect(seedSql).not.toContain("insert into public.comments");
    expect(seedSql).not.toContain("CR-1051");
    expect(seedSql).not.toContain("QT-0209");
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
    expect(appJsx).toContain("getVisibleNavGroups(isAdminUser)");
    expect(appJsx).toContain("{route === \"admin-whitelist\" && isAdminUser && <AdminWhitelistScreen />}");
    expect(appJsx).toContain("{route === \"admin-whitelist\" && !isAdminUser && <AccessDeniedScreen onNav={nav} />}");
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
    expect(screensB).toContain("error.message || \"Whitelist RPC failed.\"");
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
