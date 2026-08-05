import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const readRepo = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function loadBrowserScript(path: string, overrides: Record<string, unknown> = {}) {
  const windowObject: Record<string, any> = {
    FLOWMATE_CURRENT_USER: { id: "user-1", role: "member" },
    FLOWMATE_ACTIVE_TEAM: "mkt",
    MEMBERS: [],
    MEMBERS_BY_ID: {},
    TEAMS: [],
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides,
  };
  const context = {
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
    setTimeout,
    clearTimeout,
  };
  runInNewContext(readRepo(path), context, { filename: path });
  return windowObject;
}

function makeQueryResult(data: unknown[] = [], count: number | null = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const result = { data, count, error: null };
  const query: Record<string, any> = {};
  ["select", "eq", "neq", "is", "in", "not", "or", "gt", "gte", "lt", "lte", "order", "limit", "range"].forEach(method => {
    query[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  });
  query.maybeSingle = async () => ({ data: data[0] || null, error: null });
  query.single = async () => ({ data: data[0] || null, error: null });
  query.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { query, calls };
}

describe("FlowMate Board and Delivered frontend", () => {
  it("rejects a non-active Board lane before querying Supabase", async () => {
    const from = vi.fn();
    const windowObject = loadBrowserScript("github/supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    expect(typeof windowObject.loadFlowMateBoardLane).toBe("function");
    await expect(windowObject.loadFlowMateBoardLane({ status: "delivered" }))
      .rejects.toThrow("Active Board status");
    expect(from).not.toHaveBeenCalled();
  });

  it("calls the canonical Delivered RPC and normalizes its snake_case response", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        scope: "archived",
        rows: [{
          id: "work-1",
          display_id: "CR-1001",
          title: "Archived launch art",
          campaign_name: "August Launch",
          owner_member_id: "member-1",
          owner_name: "Mina",
          work_type: "creative_request",
          effort_point: 5,
          due_date: "2026-05-01",
          launch_date: "2026-05-03",
          delivered_at: "2026-05-02T08:00:00Z",
          archived_at: "2026-07-01T08:00:00Z",
          archive_reason: "auto_delivered_retention_60d",
          delivery_result: "late",
          legacy_missing_delivered_at: false,
        }],
        total: 51,
        next_cursor: { delivered_at: "2026-05-02T08:00:00Z", id: "work-1" },
        has_more: true,
        filter_options: { campaigns: ["August Launch"], owners: [{ id: "member-1", name: "Mina" }] },
        as_of: "2026-08-04T00:00:00Z",
      },
      error: null,
    }));
    const windowObject = loadBrowserScript("github/supabase-list-data.js", {
      flowmateSupabase: { rpc },
    });

    const result = await windowObject.loadFlowMateDeliveredHistory({
      scope: "archived",
      search: " launch ",
      deliveredMonth: "2026-05",
      campaign: "August Launch",
      ownerId: "member-1",
      cursor: { deliveredAt: "2026-05-03T00:00:00Z", id: "work-2" },
      limit: 500,
    });

    expect(rpc).toHaveBeenCalledWith("flowmate_list_delivered_history", {
      p_scope: "archived",
      p_search: "launch",
      p_delivered_month: "2026-05-01",
      p_campaign: "August Launch",
      p_owner_member_id: "member-1",
      p_page_size: 100,
      p_cursor_delivered_at: "2026-05-03T00:00:00Z",
      p_cursor_id: "work-2",
    });
    expect(result).toMatchObject({
      total: 51,
      hasMore: true,
      nextCursor: { deliveredAt: "2026-05-02T08:00:00Z", id: "work-1" },
      rows: [{
        workItemId: "work-1",
        id: "CR-1001",
        type: "creative",
        campaign: "August Launch",
        assignee: "member-1",
        ownerName: "Mina",
        deliveredAt: "2026-05-02T08:00:00Z",
        archivedAt: "2026-07-01T08:00:00Z",
        dueResult: "late",
      }],
    });
  });

  it("loads KPI rows only from the archive-inclusive KPI view", async () => {
    const viewResult = makeQueryResult([
      { id: "work-1", display_id: "CR-1001", title: "Historical item", work_type: "creative_request", status: "delivered", effort_point: 3, delivered_at: "2026-06-10T03:00:00Z", archived_at: "2026-08-10T03:00:00Z", final_owner_member_id: "member-1" },
      { id: "work-2", display_id: "CR-1002", title: "Current active", work_type: "creative_request", status: "in_progress", effort_point: 5, archived_at: null, final_owner_member_id: "member-2" },
      { id: "work-3", display_id: "QT-1003", title: "Cancelled quick", work_type: "quick_task", status: "cancelled", effort_point: null, archived_at: null, final_owner_member_id: null },
    ]);
    const from = vi.fn((table: string) => {
      expect(table).toBe("flowmate_kpi_work_items_v");
      return viewResult.query;
    });
    const windowObject = loadBrowserScript("github/supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const rows = await windowObject.loadFlowMateKpiRows();

    expect(from).toHaveBeenCalledTimes(1);
    expect(rows).toMatchObject([
      { id: "CR-1001", type: "creative", status: "delivered", effort: 3, assignee: "member-1", archivedAt: "2026-08-10T03:00:00Z" },
      { id: "CR-1002", status: "in_progress", effort: 5, archivedAt: null },
      { id: "QT-1003", type: "quick", status: "cancelled", effort: null, archivedAt: null },
    ]);
  });

  it("loads an archived work item by display ID without widening RLS", async () => {
    const workItems = makeQueryResult([{
      id: "work-1",
      display_id: "CR-1001",
      title: "Archived item",
      work_type: "creative_request",
      status: "delivered",
      priority: "normal",
      due_date: "2026-05-01",
      delivered_at: "2026-05-02T08:00:00Z",
      archived_at: "2026-07-01T08:00:00Z",
      archive_reason: "auto_delivered_retention_60d",
      created_at: "2026-04-01T08:00:00Z",
    }]);
    const empty = makeQueryResult([]);
    const tableCalls: string[] = [];
    const from = vi.fn((table: string) => {
      tableCalls.push(table);
      return table === "work_items" ? workItems.query : empty.query;
    });
    const windowObject = loadBrowserScript("github/supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const row = await windowObject.loadFlowMateWorkItemById("CR-1001", { includeArchived: true });

    expect(workItems.calls).toContainEqual(["eq", "display_id", "CR-1001"]);
    expect(workItems.calls).not.toContainEqual(["is", "archived_at", null]);
    expect(tableCalls).toContain("work_item_events");
    expect(row).toMatchObject({
      workItemId: "work-1",
      id: "CR-1001",
      archivedAt: "2026-07-01T08:00:00Z",
      archiveReason: "auto_delivered_retention_60d",
      isSupabaseRow: true,
    });
  });

  it("resolves a quick-task assignee from users when no team-member row exists", async () => {
    const workItems = makeQueryResult([{
      id: "quick-1",
      display_id: "QT-1001",
      title: "Confirm launch copy",
      work_type: "quick_task",
      status: "assigned",
      priority: "normal",
      requester_user_id: "requester-1",
      assignee_user_id: "owner-user",
      created_at: "2026-08-04T00:00:00Z",
    }]);
    const users = makeQueryResult([
      { id: "requester-1", display_name: "Requester" },
      { id: "owner-user", display_name: "Alice Owner" },
    ]);
    const empty = makeQueryResult([]);
    const from = vi.fn((table: string) => {
      if (table === "work_items") return workItems.query;
      if (table === "users") return users.query;
      return empty.query;
    });
    const windowObject = loadBrowserScript("github/supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const row = await windowObject.loadFlowMateWorkItemById("QT-1001");

    expect(users.calls).toContainEqual(["in", "id", ["requester-1", "owner-user"]]);
    expect(row).toMatchObject({
      id: "QT-1001",
      assignee: "owner-user",
      assigneeUserId: "owner-user",
      ownerName: "Alice Owner",
    });
  });

  it("loads Board counts and WIP from the summary RPC without scanning work_items", async () => {
    const from = vi.fn();
    const rpc = vi.fn(async () => ({
      data: {
        counts: { unassigned: 2, assigned: 4, in_progress: 3, review: 9, blocked: 1 },
        wip: {
          in_progress_by_owner: [
            { owner_member_id: "member-1", owner_name: "Mina", current_wip: 3, wip_limit: 2 },
          ],
          review_team_count: 9,
          review_team_limit: 8,
        },
        as_of: "2026-08-04T01:00:00Z",
      },
      error: null,
    }));
    const windowObject = loadBrowserScript("github/supabase-list-data.js", {
      flowmateSupabase: { from, rpc },
    });

    const result = await windowObject.loadFlowMateBoardSummary();

    expect(rpc).toHaveBeenCalledWith("flowmate_board_summary");
    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({
      counts: { unassigned: 2, assigned: 4, in_progress: 3, review: 9, blocked: 1 },
      wip: {
        inProgressByOwner: { "member-1": { name: "Mina", count: 3, limit: 2 } },
        reviewTeamCount: 9,
        reviewTeamLimit: 8,
      },
      asOf: "2026-08-04T01:00:00Z",
    });
  });

  it("requires a restore reason and calls the admin restore RPC once", async () => {
    const rpc = vi.fn(async () => ({ data: { restored: true }, error: null }));
    const windowObject = loadBrowserScript("github/supabase-quick-task.js", {
      flowmateSupabase: { rpc },
    });

    expect(typeof windowObject.restoreFlowMateArchivedWorkItem).toBe("function");
    await expect(windowObject.restoreFlowMateArchivedWorkItem("CR-1001", "   "))
      .rejects.toThrow("Restore reason");
    const result = await windowObject.restoreFlowMateArchivedWorkItem("CR-1001", "Wrong retention date");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("flowmate_admin_restore_work_item", {
      p_display_id: "CR-1001",
      p_restore_reason: "Wrong retention date",
    });
    expect(result).toEqual({ restored: true });
  });

  it("renders five viewport lanes and lazy Delivered history without the List loader", () => {
    const source = readRepo("github/screens-b.jsx");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));

    expect(board).toContain('function BoardScreen({ onOpen, searchQuery = "" })');
    expect(board).toContain('role="tablist"');
    expect(board).toContain('role="tab"');
    expect(board).toContain("aria-selected");
    expect(board).toContain("loadFlowMateBoardLane");
    expect(board).toContain("loadFlowMateBoardSummary");
    expect(board).toContain("loadFlowMateDeliveredHistory");
    expect(board).toContain('window.addEventListener("flowmate:search-archived"');
    expect(board).toContain('window.sessionStorage?.getItem("flowmate:board:archiveSearch")');
    expect(board).toContain('window.sessionStorage?.removeItem("flowmate:board:archiveSearch")');
    expect(board).toContain("Load more");
    expect(board).toContain("View all in List");
    expect(board).toContain("Mark done");
    expect(board).toContain("Mark Delivered");
    expect(board).toContain('aria-live="polite"');
    expect(board).not.toContain("window.loadFlowMateListRows");
    expect(board).not.toContain('{ key: "delivered",   label: "Delivered" }');
  });

  it("keeps ordinary search on the current Board tab and restores Board navigation state", () => {
    const source = readRepo("github/screens-b.jsx");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));

    expect(board).not.toContain('useStateB(searchQuery ? "delivered" : "active")');
    expect(board).not.toContain('setDeliveredFilters(current => ({ ...current, search: searchQuery }))');
    expect(source).toContain('FLOWMATE_BOARD_VIEW_STATE_KEY');
    expect(board).toContain('laneLoadedCounts');
    expect(board).toContain('laneScrollPositions');
    expect(board).toContain('deliveredCursorStack');
    expect(board).toContain('saveFlowMateBoardViewState');
    expect(board).toContain('readFlowMateBoardViewState');
  });

  it("guards async refreshes, clears stale Delivered rows and invalidates partial detail cache", () => {
    const source = readRepo("github/screens-b.jsx");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));
    const deliveredOpen = board.slice(board.indexOf("function openDeliveredWork"), board.indexOf("async function runCardMutation"));

    expect(board).toContain('laneRequestRef');
    expect(board).toContain('activeTabRef');
    expect(board).toContain('deliveredFiltersRef');
    expect(board).toContain('deliveredCursorRef');
    expect(board).toContain('rows: []');
    expect(board).toContain('refreshActiveBoardPreservingState');
    expect(deliveredOpen.indexOf('window.flowmateSelectedWorkItem = null')).toBeGreaterThan(-1);
    expect(deliveredOpen.indexOf('window.flowmateSelectedWorkItem = null')).toBeLessThan(deliveredOpen.indexOf('onOpen(row.id)'));
  });

  it("provides complete keyboard tabs and permission-aware non-drag actions", () => {
    const source = readRepo("github/screens-b.jsx");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));

    expect(board).toContain('aria-controls="flowmate-board-panel-active"');
    expect(board).toContain('aria-controls="flowmate-board-panel-delivered"');
    expect(board).toContain('id="flowmate-board-panel-active"');
    expect(board).toContain('id="flowmate-board-panel-delivered"');
    expect(board).toContain('role="tabpanel"');
    expect(board).toContain('event.key === "ArrowRight"');
    expect(board).toContain('event.key === "Home"');
    expect(board).toContain('event.key === "End"');
    expect(board).toContain('canTransitionBoardWork');
    expect(board).toContain('Backend permissions remain authoritative');
    expect(board).not.toContain('/over|limit/.test(wipText)');
    expect(board).not.toContain('AssignmentWarningBadges work={w}');
  });

  it("guards summary generations, clears sticky archived scope, and keeps card actions unclipped", () => {
    const source = readRepo("github/screens-b.jsx");
    const appSource = readRepo("github/app.jsx");
    const css = readRepo("github/app.css");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));

    expect(board).toContain("summaryRequestRef");
    expect(board).toContain("activeBoardRequestRef");
    expect(board).toContain('window.addEventListener("flowmate:search-cleared"');
    expect(board).toContain('window.addEventListener("flowmate:team-workspace-changed"');
    expect(appSource).toContain('new CustomEvent("flowmate:search-cleared")');
    const menuCss = css.slice(css.indexOf(".board-card-menu__items {"), css.indexOf(".board-card-menu__items button"));
    expect(menuCss).toContain("position: static");
    expect(menuCss).not.toContain("bottom: calc(100% + 4px)");
  });

  it("locks independent lane scrolling, no-wrap responsiveness and accessible targets in CSS", () => {
    const css = readRepo("github/app.css");
    const boardCss = css.slice(css.indexOf("/* ---------- FlowMate Active Board"), css.indexOf("/* ---------- Capacity meter"));

    expect(boardCss).toContain("grid-template-columns: repeat(5");
    expect(boardCss).toContain("flex-wrap: nowrap");
    expect(boardCss).toContain("overflow-x: auto");
    expect(boardCss).toContain("overflow-y: auto");
    expect(boardCss).toContain("overscroll-behavior: contain");
    expect(boardCss).toContain("position: sticky");
    expect(boardCss).toContain("scroll-snap-type: x mandatory");
    expect(boardCss).toContain("min-height: 44px");
    expect(boardCss).toContain(":focus-visible");
    expect(boardCss).toContain("prefers-reduced-motion");
    expect(boardCss).toContain("@media (max-width: 600px)");
    expect(boardCss).toContain("@media (min-resolution: 1.75dppx)");
  });
});
