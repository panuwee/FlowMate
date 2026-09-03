import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const readRepo = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function loadBrowserScript(path: string, overrides: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<(event: { type: string; detail?: unknown }) => void>>();
  const windowObject: Record<string, any> = {
    FLOWMATE_CURRENT_USER: { id: "user-owner", team_member_id: "member-owner", role: "member" },
    FLOWMATE_ACTIVE_TEAM: "mkt",
    MEMBERS: [],
    MEMBERS_BY_ID: {},
    TEAMS: [],
    getFlowMateActiveTeam: () => "mkt",
    dispatchEvent: vi.fn((event: { type: string; detail?: unknown }) => {
      Array.from(listeners.get(event.type) || []).forEach(listener => listener(event));
      return true;
    }),
    addEventListener: vi.fn((type: string, listener: (event: { type: string; detail?: unknown }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: { type: string; detail?: unknown }) => void) => {
      listeners.get(type)?.delete(listener);
    }),
    ...overrides,
  };
  runInNewContext(readRepo(path), {
    window: windowObject,
    console,
    CustomEvent: class CustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    URL,
    Date,
    Object,
    Map,
    Set,
    Array,
    Promise,
    setTimeout,
    clearTimeout,
  }, { filename: path });
  return windowObject;
}

function makeQuery(data: unknown[] = [], count: number | null = null, error: unknown = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const result = { data, count, error };
  const query: Record<string, any> = {};
  ["select", "eq", "neq", "is", "in", "not", "or", "gt", "gte", "lt", "lte", "order", "limit", "range"].forEach(method => {
    query[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  });
  query.maybeSingle = async () => ({ data: data[0] || null, error });
  query.single = async () => ({ data: data[0] || null, error });
  query.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { query, calls };
}

function makeProfileSupabase() {
  const tableCalls: string[] = [];
  const queries = new Map<string, ReturnType<typeof makeQuery>[]>();
  const workItem = {
    id: "work-1",
    display_id: "CR-1001",
    title: "Launch art",
    work_type: "creative_request",
    status: "in_progress",
    priority: "normal",
    requester_user_id: "user-requester",
    assignee_user_id: "user-owner",
    final_owner_member_id: "member-owner",
    owning_team_code: "mkt",
    created_at: "2026-08-01T00:00:00Z",
  };
  const dataByTable: Record<string, unknown[]> = {
    work_items: [workItem],
    users: [
      { id: "user-requester", display_name: "Requester" },
      { id: "user-owner", display_name: "Owner" },
    ],
    team_members: [{ id: "member-owner", user_id: "user-owner", display_name: "Owner", active: true }],
  };
  const from = vi.fn((table: string) => {
    tableCalls.push(table);
    const built = makeQuery(dataByTable[table] || []);
    if (!queries.has(table)) queries.set(table, []);
    queries.get(table)?.push(built);
    return built.query;
  });
  return {
    flowmateSupabase: { from, rpc: vi.fn(async () => ({ data: {}, error: null })) },
    tableCalls,
    queries,
  };
}

describe("FlowMate performance remediation", () => {
  it("loads the shared navigation/search profile without detail-only tables and scopes related rows to visible work IDs", async () => {
    const supabase = makeProfileSupabase();
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase);

    await windowObject.loadFlowMateNavigationRows();
    await windowObject.loadFlowMateSearchRows();

    expect(supabase.tableCalls.filter(table => table === "work_items")).toHaveLength(1);
    expect(supabase.tableCalls).not.toContain("comments");
    expect(supabase.tableCalls).not.toContain("work_item_links");
    expect(supabase.tableCalls).not.toContain("work_item_watchers");
    expect(supabase.tableCalls).not.toContain("work_item_ai_tags");
    expect(supabase.tableCalls).not.toContain("work_item_events");
    expect(supabase.tableCalls).not.toContain("checklist_items");
    expect(supabase.tableCalls).not.toContain("creative_request_details");
    expect(supabase.tableCalls).not.toContain("marketing_content_items");
    expect(supabase.queries.get("work_item_flags_v")?.[0].calls).toContainEqual(["in", "work_item_id", ["work-1"]]);
  });

  it("keeps My Work comments/checklist scoped while excluding links, watchers, AI tags and events", async () => {
    const supabase = makeProfileSupabase();
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase);

    await windowObject.loadFlowMateMyWorkRows();

    expect(supabase.tableCalls).toContain("comments");
    expect(supabase.tableCalls).toContain("checklist_items");
    expect(supabase.tableCalls).not.toContain("work_item_links");
    expect(supabase.tableCalls).not.toContain("work_item_watchers");
    expect(supabase.tableCalls).not.toContain("work_item_ai_tags");
    expect(supabase.tableCalls).not.toContain("work_item_events");
    expect(supabase.queries.get("comments")?.[0].calls).toContainEqual(["in", "work_item_id", ["work-1"]]);
  });

  it("does not load event history for operational List, Calendar, Workload, or Attention rows", async () => {
    const supabase = makeProfileSupabase();
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase);

    await windowObject.loadFlowMateOperationalRows();

    expect(supabase.tableCalls).not.toContain("work_item_events");
  });

  it("resolves comment authors with a second users query limited to missing actor IDs", async () => {
    const workItem = {
      id: "work-1",
      display_id: "CR-1001",
      title: "Launch art",
      work_type: "creative_request",
      status: "in_progress",
      priority: "normal",
      requester_user_id: "user-requester",
      assignee_user_id: "user-owner",
      final_owner_member_id: "member-owner",
      owning_team_code: "mkt",
      created_at: "2026-08-01T00:00:00Z",
    };
    const userQueries: ReturnType<typeof makeQuery>[] = [];
    let userQueryNumber = 0;
    const from = vi.fn((table: string) => {
      if (table === "work_items") return makeQuery([workItem]).query;
      if (table === "comments") {
        return makeQuery([{
          id: "comment-1",
          work_item_id: "work-1",
          author_user_id: "user-commenter",
          body: "Ready for review",
          created_at: "2026-08-02T00:00:00Z",
        }]).query;
      }
      if (table === "users") {
        userQueryNumber += 1;
        const built = makeQuery(userQueryNumber === 1
          ? [
              { id: "user-requester", display_name: "Requester" },
              { id: "user-owner", display_name: "Owner" },
            ]
          : [{ id: "user-commenter", display_name: "Commenter" }]);
        userQueries.push(built);
        return built.query;
      }
      if (table === "team_members") {
        return makeQuery([{ id: "member-owner", user_id: "user-owner", display_name: "Owner", active: true }]).query;
      }
      return makeQuery([]).query;
    });
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from, rpc: vi.fn(async () => ({ data: {}, error: null })) },
    });

    const rows = await windowObject.loadFlowMateMyWorkRows();

    expect(rows[0].comments[0].authorName).toBe("Commenter");
    expect(userQueries).toHaveLength(2);
    expect(userQueries[1].calls).toContainEqual(["in", "id", ["user-commenter"]]);
  });

  it("classifies refresh reasons so unrelated comments do not reload Board or Timeline", () => {
    const windowObject = loadBrowserScript("supabase-list-data.js");
    expect(windowObject.flowMateRefreshReasonMatches({ detail: { reason: "comments" } }, ["work_items"])).toBe(false);
    expect(windowObject.flowMateRefreshReasonMatches({ detail: { reason: "work_items" } }, ["work_items"])).toBe(true);
    expect(windowObject.flowMateRefreshReasonMatches({ detail: {} }, ["work_items"])).toBe(true);
  });

  it("uses the backend transition matrix for owner, requester and Marketing Sub-PIC", () => {
    const windowObject = loadBrowserScript("supabase-quick-task.js");
    const row = {
      type: "creative",
      status: "in_progress",
      requesterUserId: "user-requester",
      assigneeUserId: "user-owner",
      assignee: "member-owner",
      marketingPlanSubPicUserId: "user-subpic",
      isSupabaseRow: true,
    };

    expect(windowObject.canFlowMateTransitionWorkItem(row, "review", { id: "user-owner", team_member_id: "member-owner" }, {})).toBe(true);
    expect(windowObject.canFlowMateTransitionWorkItem(row, "review", { id: "user-requester" }, {})).toBe(false);
    expect(windowObject.canFlowMateTransitionWorkItem(row, "review", { id: "user-subpic" }, {})).toBe(true);
    const reviewRow = { ...row, status: "review" };
    expect(windowObject.canFlowMateTransitionWorkItem(reviewRow, "delivered", { id: "user-requester" }, {})).toBe(true);
    expect(windowObject.canFlowMateTransitionWorkItem(reviewRow, "delivered", { id: "user-owner" }, {})).toBe(false);
  });

  it("guards My Work status actions with the shared permission matrix and an immediate pending ref", () => {
    const screens = readRepo("screens-a.jsx");
    const myWork = screens.slice(screens.indexOf("function MyWorkScreen"), screens.indexOf("function QuickTaskChecklist"));

    expect(myWork).toContain("const transitionPendingRef = useRef({})");
    expect(myWork).toContain("window.canFlowMateTransitionWorkItem?.(");
    expect(myWork).toContain("currentStatus: work.status");
    expect(myWork).toContain('canTransition(w, "review")');
  });

  it("deduplicates concurrent status submissions with the same work item and target status", async () => {
    let resolveRpc!: (value: { data: unknown; error: null }) => void;
    const rpcPromise = new Promise<{ data: unknown; error: null }>(resolve => { resolveRpc = resolve; });
    const rpc = vi.fn(() => rpcPromise);
    const windowObject = loadBrowserScript("supabase-quick-task.js", {
      flowmateSupabase: { rpc },
    });

    const first = windowObject.transitionFlowMateWorkStatus("CR-1001", "review", { deliveryLink: "https://example.com/review" });
    const second = windowObject.transitionFlowMateWorkStatus("CR-1001", "review", { deliveryLink: "https://example.com/review" });
    expect(rpc).toHaveBeenCalledTimes(1);
    resolveRpc({ data: { status: "review" }, error: null });
    await Promise.all([first, second]);
    expect(windowObject.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it("treats a same-state submission as a no-op without calling an RPC or emitting an event", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    const windowObject = loadBrowserScript("supabase-quick-task.js", {
      flowmateSupabase: { rpc },
    });

    const result = await windowObject.transitionFlowMateWorkStatus("CR-1001", "review", { currentStatus: "review" });

    expect(result).toMatchObject({ status: "review", unchanged: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(windowObject.dispatchEvent).not.toHaveBeenCalled();
  });

  it("keeps Detail usable when AI tags return an expected 42501 denial", async () => {
    const workItem = {
      id: "work-1",
      display_id: "CR-1001",
      title: "Restricted tags",
      work_type: "creative_request",
      status: "assigned",
      priority: "normal",
      requester_user_id: "user-requester",
      assignee_user_id: "user-owner",
      final_owner_member_id: "member-owner",
      owning_team_code: "mkt",
      created_at: "2026-08-01T00:00:00Z",
    };
    const from = vi.fn((table: string) => {
      if (table === "work_items") return makeQuery([workItem]).query;
      if (table === "work_item_ai_tags") return makeQuery([], null, { code: "42501", message: "denied" }).query;
      if (table === "users") return makeQuery([{ id: "user-owner", display_name: "Owner" }]).query;
      if (table === "team_members") return makeQuery([{ id: "member-owner", user_id: "user-owner", display_name: "Owner", active: true }]).query;
      return makeQuery([]).query;
    });
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from, rpc: vi.fn(async () => ({ data: {}, error: null })) },
    });

    const row = await windowObject.loadFlowMateWorkItemById("CR-1001", { includeArchived: true });

    expect(row).toMatchObject({ id: "CR-1001", detailHydrated: true, aiTagsUnavailable: true });
    expect(row.aiTags).toEqual([]);
  });

  it("resolves lazy Detail actor names without loading the global users table", async () => {
    const workItem = {
      id: "work-1",
      display_id: "CR-1001",
      title: "Actor lookup",
      work_type: "creative_request",
      status: "assigned",
      priority: "normal",
      requester_user_id: "user-requester",
      assignee_user_id: "user-owner",
      final_owner_member_id: "member-owner",
      owning_team_code: "mkt",
      created_at: "2026-08-01T00:00:00Z",
    };
    const userQueries: ReturnType<typeof makeQuery>[] = [];
    let userQueryNumber = 0;
    const from = vi.fn((table: string) => {
      if (table === "work_items") return makeQuery([workItem]).query;
      if (table === "comments") {
        return makeQuery([{
          id: "comment-1",
          work_item_id: "work-1",
          author_user_id: "user-commenter",
          body: "Detail comment",
          created_at: "2026-08-02T00:00:00Z",
        }]).query;
      }
      if (table === "users") {
        userQueryNumber += 1;
        const built = makeQuery(userQueryNumber === 1
          ? [
              { id: "user-requester", display_name: "Requester" },
              { id: "user-owner", display_name: "Owner" },
            ]
          : [{ id: "user-commenter", display_name: "Commenter" }]);
        userQueries.push(built);
        return built.query;
      }
      if (table === "team_members") {
        return makeQuery([{ id: "member-owner", user_id: "user-owner", display_name: "Owner", active: true }]).query;
      }
      return makeQuery([]).query;
    });
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from, rpc: vi.fn(async () => ({ data: {}, error: null })) },
    });

    const row = await windowObject.loadFlowMateWorkItemById("CR-1001", { includeArchived: true });

    expect(row.comments[0].authorName).toBe("Commenter");
    expect(userQueries).toHaveLength(2);
    expect(userQueries[1].calls).toContainEqual(["in", "id", ["user-commenter"]]);
  });

  it("hydrates partial Board rows in Detail and avoids the duplicate AI Tag RPC", () => {
    const detail = readRepo("screens-a.jsx").slice(readRepo("screens-a.jsx").indexOf("function DetailScreen"));
    expect(detail).toContain("const w = directDetailMatch || selected || null");
    expect(detail).toContain("!w.detailHydrated");
    expect(detail).not.toContain("window.loadFlowMateAiTags({ displayId: w.id })");
    expect(detail).toContain("aiTagsUnavailable");
  });

  it("loads Active Board as one batched snapshot without per-lane exact counts", () => {
    const loader = readRepo("supabase-list-data.js");
    const board = readRepo("screens-b.jsx").slice(readRepo("screens-b.jsx").indexOf("function BoardScreen"));
    const laneLoader = loader.slice(loader.indexOf("async function loadFlowMateBoardLane"), loader.indexOf("async function loadFlowMateBoardSummary"));
    expect(loader).toContain("async function loadFlowMateActiveBoard");
    expect(board).toContain("window.loadFlowMateActiveBoard");
    expect(laneLoader).not.toContain('count: "exact"');
  });

  it("refreshes Board for local task mutations even when Realtime is degraded", () => {
    const board = readRepo("screens-b.jsx").slice(readRepo("screens-b.jsx").indexOf("function BoardScreen"));

    expect(board).toContain('"quick_task_created"');
    expect(board).toContain('"creative_assignee_changed"');
    expect(board).toContain('"rerun_assignment"');
    expect(board).not.toMatch(/reasons:\s*\[[^\]]*"comments"/s);
  });

  it("preserves intentionally loaded Board rows above one page during refresh", () => {
    const loader = readRepo("supabase-list-data.js");
    const activeBoardLoader = loader.slice(
      loader.indexOf("async function loadFlowMateActiveBoard"),
      loader.indexOf("function normalizeFlowMateDeliveredRow"),
    );

    expect(activeBoardLoader).toContain("while (cursor && loaded.length < requestedSize)");
    expect(activeBoardLoader).toContain("Math.min(500");
  });

  it("lazy-loads global search only while a non-empty search is open", () => {
    const app = readRepo("app.jsx");
    const searchEffect = app.slice(app.indexOf("async function refreshGlobalSearchRows"), app.indexOf("if (authState.status === \"loading\")"));
    expect(searchEffect).toContain("window.loadFlowMateSearchRows");
    expect(searchEffect).toContain("if (!isGlobalSearchOpen || !normalizedGlobalSearch)");
    expect(searchEffect).not.toContain('window.addEventListener("flowmate:refresh-request", refreshGlobalSearchRows)');
  });

  it("loads Team Settings members without depending on the Workload report view", async () => {
    const tableCalls: string[] = [];
    const from = vi.fn((table: string) => {
      tableCalls.push(table);
      if (table === "team_members") {
        return makeQuery([{
          id: "member-1",
          user_id: "user-1",
          member_code: "pond",
          display_name: "Pond",
          initials: "PO",
          color: "#123456",
          discipline: "GD/VE",
          discipline_short: "GD",
          skills: ["banner"],
          backup_skills: ["video"],
          capacity_per_day: 8,
          capacity_override_per_day: null,
          wip_limit: 3,
          availability: "available",
        }]).query;
      }
      if (table === "leave_requests") return makeQuery([]).query;
      return makeQuery([], null, { message: `Unexpected table: ${table}` }).query;
    });
    const windowObject = loadBrowserScript("supabase-workload-data.js", {
      flowmateSupabase: { from },
    });

    const members = await windowObject.loadFlowMateTeamSettingsMembers();

    expect(tableCalls).toEqual(["team_members", "leave_requests"]);
    expect(tableCalls).not.toContain("member_workload_v");
    expect(members).toEqual([expect.objectContaining({
      id: "member-1",
      name: "Pond",
      availability: "available",
      skills: ["banner", "video-backup"],
    })]);
  });

  it("keeps Team Settings independent from the hidden Workload screen", () => {
    const screens = readRepo("screens-c.jsx");
    const settings = screens.slice(
      screens.indexOf("function SettingsScreen"),
      screens.indexOf("function TaskAssignScheduleScreen"),
    );

    expect(settings).toContain("window.loadFlowMateTeamSettingsMembers");
    expect(settings).not.toContain("window.loadFlowMateWorkloadRows");
  });
});
