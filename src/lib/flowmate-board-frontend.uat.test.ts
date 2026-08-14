import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const readRepo = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function loadBrowserScript(path: string, overrides: Record<string, unknown> = {}, runtime: { Date?: DateConstructor } = {}) {
  const eventListeners = new Map<string, Set<(event: { type: string; detail?: unknown }) => void>>();
  const windowObject: Record<string, any> = {
    FLOWMATE_CURRENT_USER: { id: "user-1", role: "member" },
    FLOWMATE_ACTIVE_TEAM: "mkt",
    MEMBERS: [],
    MEMBERS_BY_ID: {},
    TEAMS: [],
    dispatchEvent: vi.fn((event: { type: string; detail?: unknown }) => {
      Array.from(eventListeners.get(event.type) || []).forEach(listener => listener(event));
      return true;
    }),
    addEventListener: vi.fn((type: string, listener: (event: { type: string; detail?: unknown }) => void) => {
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      eventListeners.get(type)?.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: { type: string; detail?: unknown }) => void) => {
      eventListeners.get(type)?.delete(listener);
    }),
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
    Date: runtime.Date || Date,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(readRepo(path), context, { filename: path });
  return windowObject;
}

function loadBoardCacheHelpers(overrides: Record<string, unknown> = {}, runtime: { Date?: DateConstructor } = {}) {
  const eventListeners = new Map<string, Set<(event: { type: string; detail?: unknown }) => void>>();
  const windowObject: Record<string, any> = {
    FLOWMATE_CURRENT_USER: { id: "user-1", role: "member" },
    FLOWMATE_ACTIVE_TEAM: "mkt",
    dispatchEvent: vi.fn((event: { type: string; detail?: unknown }) => {
      Array.from(eventListeners.get(event.type) || []).forEach(listener => listener(event));
      return true;
    }),
    addEventListener: vi.fn((type: string, listener: (event: { type: string; detail?: unknown }) => void) => {
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      eventListeners.get(type)?.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: { type: string; detail?: unknown }) => void) => {
      eventListeners.get(type)?.delete(listener);
    }),
    ...overrides,
  };
  const source = readRepo("screens-b.jsx");
  const helperSource = source.slice(0, source.indexOf("function ListScreen"));
  runInNewContext(helperSource, {
    window: windowObject,
    React: {},
    Date: runtime.Date || Date,
    Object,
    Map,
    Array,
    Promise,
    setTimeout,
    clearTimeout,
  }, { filename: "screens-b.jsx" });
  return windowObject;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  for (let cycle = 0; cycle < 8; cycle += 1) {
    await Promise.resolve();
  }
}

function makeQueryResult(data: unknown[] = [], count: number | null = null, error: Error | null = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const result = { data, count, error };
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

function makeListLoaderSupabase(batches: Array<{ flagError?: Error }> = [{}]) {
  let currentBatch = -1;
  const from = vi.fn((table: string) => {
    if (table === "work_items") currentBatch += 1;
    const batch = batches[Math.min(Math.max(currentBatch, 0), batches.length - 1)] || {};
    const data = table === "work_items" ? [{
      id: `work-${currentBatch}`,
      display_id: `CR-${currentBatch}`,
      title: `batch ${currentBatch}`,
      work_type: "creative_request",
      status: "assigned",
      priority: "normal",
      created_at: "2026-08-06T00:00:00Z",
    }] : [];
    return makeQueryResult(data, null, table === "work_item_flags_v" ? batch.flagError || null : null).query;
  });
  return {
    flowmateSupabase: { from },
    workItemSelectCount: () => from.mock.calls.filter(([table]) => table === "work_items").length,
  };
}

function makeDeferredListLoaderSupabase() {
  const batches = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];
  let currentBatch = -1;
  const from = vi.fn((table: string) => {
    if (table === "work_items") currentBatch += 1;
    const batchIndex = Math.max(currentBatch, 0);
    const result = {
      data: table === "work_items" ? [{
        id: `work-${batchIndex}`,
        display_id: `CR-${batchIndex}`,
        title: batchIndex === 0 ? "old batch" : `fresh batch ${batchIndex}`,
        work_type: "creative_request",
        status: "assigned",
        priority: "normal",
        created_at: "2026-08-06T00:00:00Z",
      }] : [],
      count: null,
      error: null,
    };
    const query: Record<string, any> = {};
    ["select", "eq", "neq", "is", "in", "not", "or", "gt", "gte", "lt", "lte", "order", "limit", "range"].forEach(method => {
      query[method] = () => query;
    });
    query.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      (table === "work_items" ? batches[batchIndex].promise : Promise.resolve()).then(() => result).then(resolve, reject);
    return query;
  });
  return {
    flowmateSupabase: { from },
    batches,
    workItemSelectCount: () => from.mock.calls.filter(([table]) => table === "work_items").length,
  };
}

function makeNestedListLoaderSupabase() {
  const from = vi.fn((table: string) => makeQueryResult(table === "work_items" ? [{
    id: "work-1",
    display_id: "CR-1001",
    title: "Copy-safe row",
    work_type: "creative_request",
    status: "assigned",
    priority: "normal",
    created_at: "2026-08-06T00:00:00Z",
  }] : []).query);
  return { flowmateSupabase: { from } };
}

describe("FlowMate Board and Delivered frontend", () => {
  it("shares one List backend batch for concurrent consumers and expires it after 30 seconds", async () => {
    let now = 1_000;
    class FixedDate extends Date {
      static now() {
        return now;
      }
    }
    const supabase = makeListLoaderSupabase();
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase, { Date: FixedDate });

    const [first, second, third] = await Promise.all([
      windowObject.loadFlowMateListRows(),
      windowObject.loadFlowMateListRows(),
      windowObject.loadFlowMateListRows(),
    ]);

    expect(supabase.workItemSelectCount()).toBe(1);
    expect(first).toEqual(second);
    expect(second).toEqual(third);

    now += 29_999;
    await windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(1);

    now += 1;
    await windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(2);
  });

  it("shares forced refreshes and lets explicit invalidation start one new List batch", async () => {
    const supabase = makeListLoaderSupabase();
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase);

    await windowObject.loadFlowMateListRows();
    await Promise.all([
      windowObject.loadFlowMateListRows({ force: true }),
      windowObject.loadFlowMateListRows({ force: true }),
    ]);

    expect(supabase.workItemSelectCount()).toBe(2);
    expect(typeof windowObject.invalidateFlowMateListRowsCache).toBe("function");
    windowObject.invalidateFlowMateListRowsCache();
    await windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(3);
  });

  it("tombstones an active List generation on invalidation so an old response cannot overwrite a fresh batch", async () => {
    const supabase = makeDeferredListLoaderSupabase();
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase);

    const oldRequest = windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(1);
    windowObject.invalidateFlowMateListRowsCache();
    const [freshRequest, sharedFreshRequest] = [
      windowObject.loadFlowMateListRows(),
      windowObject.loadFlowMateListRows(),
    ];
    expect(supabase.workItemSelectCount()).toBe(2);

    supabase.batches[1].resolve();
    const [freshRows, sharedRows] = await Promise.all([freshRequest, sharedFreshRequest]);
    expect(freshRows[0].title).toBe("fresh batch 1");
    expect(sharedRows[0].title).toBe("fresh batch 1");

    supabase.batches[0].resolve();
    await expect(oldRequest).resolves.toMatchObject([{ title: "old batch" }]);
    await expect(windowObject.loadFlowMateListRows()).resolves.toMatchObject([{ title: "fresh batch 1" }]);
    expect(supabase.workItemSelectCount()).toBe(2);

    windowObject.dispatchEvent({ type: "flowmate:refresh-request" });
    const afterRefreshEvent = windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(3);
    supabase.batches[2].resolve();
    await afterRefreshEvent;

    windowObject.dispatchEvent({ type: "flowmate:signed-out" });
    const afterSignOutEvent = windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(4);
    supabase.batches[3].resolve();
    await afterSignOutEvent;
  });

  it("returns isolated List row copies so one consumer cannot mutate another consumer cache result", async () => {
    const windowObject = loadBrowserScript("supabase-list-data.js", makeNestedListLoaderSupabase());

    const firstConsumer = await windowObject.loadFlowMateListRows();
    firstConsumer[0].comments.push({ id: "local-only" });
    firstConsumer[0].checklist.done = 99;
    firstConsumer[0].platforms.push("Local mutation");

    const secondConsumer = await windowObject.loadFlowMateListRows();
    expect(secondConsumer[0].comments).toEqual([]);
    expect(secondConsumer[0].checklist).toEqual({ done: 0, total: 0 });
    expect(secondConsumer[0].platforms).toEqual([]);
  });

  it("expires Board snapshots and clears them from module lifecycle events even while Board is unmounted", () => {
    let now = 1_000;
    class FixedDate extends Date {
      static now() {
        return now;
      }
    }
    const windowObject = loadBoardCacheHelpers({}, { Date: FixedDate });
    const workspaceKey = "user-1:mkt";
    expect(typeof windowObject.writeFlowMateBoardSnapshot).toBe("function");
    expect(typeof windowObject.readFlowMateBoardSnapshot).toBe("function");
    const snapshot = {
      lanes: { assigned: { status: "live", rows: [{ id: "CR-1" }], total: 1, nextCursor: null, hasMore: false, message: "" } },
      summary: { counts: { assigned: 1 }, wip: { inProgressByOwner: {}, reviewTeamCount: 0, reviewTeamLimit: 8 } },
    };

    windowObject.writeFlowMateBoardSnapshot(workspaceKey, snapshot);
    expect(windowObject.readFlowMateBoardSnapshot(workspaceKey)?.lanes.assigned.rows).toEqual([{ id: "CR-1" }]);
    now += 30_000;
    expect(windowObject.readFlowMateBoardSnapshot(workspaceKey)).toBeNull();

    windowObject.writeFlowMateBoardSnapshot(workspaceKey, snapshot);
    windowObject.dispatchEvent({ type: "flowmate:team-workspace-changed" });
    expect(windowObject.readFlowMateBoardSnapshot(workspaceKey)).toBeNull();

    windowObject.writeFlowMateBoardSnapshot(workspaceKey, snapshot);
    windowObject.dispatchEvent({ type: "flowmate:signed-out" });
    expect(windowObject.readFlowMateBoardSnapshot(workspaceKey)).toBeNull();
  });

  it("returns isolated Board snapshot rows so nested card mutations do not leak into the cache", () => {
    const windowObject = loadBoardCacheHelpers();
    const workspaceKey = "user-1:mkt";
    windowObject.writeFlowMateBoardSnapshot(workspaceKey, {
      lanes: {
        assigned: {
          status: "live",
          rows: [{
            id: "CR-1",
            comments: [{ id: "comment-1", metadata: { source: "server" } }],
            aiTags: [{ id: "tag-1", tag: "launch" }],
            checklist: { done: 0, total: 1 },
          }],
          total: 1,
          nextCursor: null,
          hasMore: false,
          message: "",
        },
      },
      summary: { counts: { assigned: 1 }, wip: { inProgressByOwner: {}, reviewTeamCount: 0, reviewTeamLimit: 8 } },
    });

    const firstRead = windowObject.readFlowMateBoardSnapshot(workspaceKey);
    firstRead.lanes.assigned.rows[0].comments[0].metadata.source = "local";
    firstRead.lanes.assigned.rows[0].aiTags.push({ id: "tag-2", tag: "local" });
    firstRead.lanes.assigned.rows[0].checklist.done = 99;

    const secondRead = windowObject.readFlowMateBoardSnapshot(workspaceKey);
    expect(secondRead.lanes.assigned.rows[0].comments).toEqual([{ id: "comment-1", metadata: { source: "server" } }]);
    expect(secondRead.lanes.assigned.rows[0].aiTags).toEqual([{ id: "tag-1", tag: "launch" }]);
    expect(secondRead.lanes.assigned.rows[0].checklist).toEqual({ done: 0, total: 1 });
  });

  it("attaches Board cache lifecycle listeners once and runs at most one queued five-lane refresh", async () => {
    const windowObject = loadBoardCacheHelpers();
    expect(typeof windowObject.ensureFlowMateBoardCacheLifecycleListeners).toBe("function");
    expect(typeof windowObject.runFlowMateBoardRefresh).toBe("function");
    expect(windowObject.addEventListener).toHaveBeenCalledTimes(2);
    windowObject.ensureFlowMateBoardCacheLifecycleListeners();
    expect(windowObject.addEventListener).toHaveBeenCalledTimes(2);

    const firstPipeline = deferred<void>();
    const secondPipeline = deferred<void>();
    const runFiveLanePipeline = vi.fn(() => runFiveLanePipeline.mock.calls.length === 1 ? firstPipeline.promise : secondPipeline.promise);
    const directRefresh = windowObject.runFlowMateBoardRefresh("user-1:mkt", runFiveLanePipeline);
    const eventRefresh = windowObject.runFlowMateBoardRefresh("user-1:mkt", runFiveLanePipeline);
    const mutationRefresh = windowObject.runFlowMateBoardRefresh("user-1:mkt", runFiveLanePipeline);

    await flushMicrotasks();
    expect(runFiveLanePipeline).toHaveBeenCalledTimes(1);
    firstPipeline.resolve();
    await flushMicrotasks();
    expect(runFiveLanePipeline).toHaveBeenCalledTimes(2);
    secondPipeline.resolve();
    await Promise.all([directRefresh, eventRefresh, mutationRefresh]);
    expect(runFiveLanePipeline).toHaveBeenCalledTimes(2);
  });

  it("drains the latest queued Board refresh that arrives during the follow-up without concurrent pipelines", async () => {
    const windowObject = loadBoardCacheHelpers();
    const firstPipeline = deferred<void>();
    const secondPipeline = deferred<void>();
    const thirdPipeline = deferred<void>();
    let activePipelines = 0;
    let maxActivePipelines = 0;
    function pipeline(pending: { promise: Promise<void> }) {
      return () => {
        activePipelines += 1;
        maxActivePipelines = Math.max(maxActivePipelines, activePipelines);
        return pending.promise.finally(() => { activePipelines -= 1; });
      };
    }
    const first = vi.fn(pipeline(firstPipeline));
    const second = vi.fn(pipeline(secondPipeline));
    const replacedThird = vi.fn(pipeline(thirdPipeline));
    const latestThird = vi.fn(pipeline(thirdPipeline));

    const initialRefresh = windowObject.runFlowMateBoardRefresh("user-1:mkt", first);
    const queuedFollowUp = windowObject.runFlowMateBoardRefresh("user-1:mkt", second);
    await flushMicrotasks();
    expect(first).toHaveBeenCalledTimes(1);
    expect(maxActivePipelines).toBe(1);

    firstPipeline.resolve();
    await flushMicrotasks();
    expect(second).toHaveBeenCalledTimes(1);
    expect(maxActivePipelines).toBe(1);

    const replacedTrigger = windowObject.runFlowMateBoardRefresh("user-1:mkt", replacedThird);
    const latestTrigger = windowObject.runFlowMateBoardRefresh("user-1:mkt", latestThird);
    secondPipeline.resolve();
    await flushMicrotasks();
    expect(replacedThird).not.toHaveBeenCalled();
    expect(latestThird).toHaveBeenCalledTimes(1);
    expect(maxActivePipelines).toBe(1);

    thirdPipeline.resolve();
    await Promise.all([initialRefresh, queuedFollowUp, replacedTrigger, latestTrigger]);
    expect(first.mock.calls.length + second.mock.calls.length + latestThird.mock.calls.length).toBe(3);
    expect(maxActivePipelines).toBe(1);
  });

  it("cleans up a rejected Board refresh coordinator so the next refresh can run", async () => {
    const windowObject = loadBoardCacheHelpers();
    const failedRefresh = vi.fn(() => Promise.reject(new Error("lane failed")));
    await expect(windowObject.runFlowMateBoardRefresh("user-1:mkt", failedRefresh)).rejects.toThrow("lane failed");

    const recoveredRefresh = vi.fn(() => Promise.resolve());
    await expect(windowObject.runFlowMateBoardRefresh("user-1:mkt", recoveredRefresh)).resolves.toBeUndefined();
    expect(failedRefresh).toHaveBeenCalledTimes(1);
    expect(recoveredRefresh).toHaveBeenCalledTimes(1);
  });

  it("separates List cache entries by workspace and removes a rejected batch before retry", async () => {
    const supabase = makeListLoaderSupabase([{ flagError: new Error("temporary list failure") }, {}]);
    const windowObject = loadBrowserScript("supabase-list-data.js", supabase);

    await expect(windowObject.loadFlowMateListRows()).rejects.toThrow("temporary list failure");
    await windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(2);

    windowObject.FLOWMATE_ACTIVE_TEAM = "ops";
    await windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(3);

    windowObject.FLOWMATE_ACTIVE_TEAM = "mkt";
    await windowObject.loadFlowMateListRows();
    expect(supabase.workItemSelectCount()).toBe(3);
  });

  it("rejects a non-active Board lane before querying Supabase", async () => {
    const from = vi.fn();
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    expect(typeof windowObject.loadFlowMateBoardLane).toBe("function");
    await expect(windowObject.loadFlowMateBoardLane({ status: "delivered" }))
      .rejects.toThrow("Active Board status");
    expect(from).not.toHaveBeenCalled();
  });

  it("emits one Board lane query ordered by the locked tuple without priority phases", async () => {
    const workItems = makeQueryResult([
      {
        id: "work-1", display_id: "CR-1001", title: "Earlier normal launch", work_type: "creative_request",
        status: "assigned", priority: "normal", due_date: "2026-08-06", launch_date: "2026-08-04", created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "work-2", display_id: "CR-1002", title: "Later urgent launch", work_type: "creative_request",
        status: "assigned", priority: "urgent", due_date: "2026-08-03", launch_date: "2026-08-05", created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "work-3", display_id: "CR-1003", title: "Equal-date deterministic tie", work_type: "creative_request",
        status: "assigned", priority: "normal", due_date: "2026-08-03", launch_date: "2026-08-05", created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "work-4", display_id: "CR-1004", title: "Null launch date is last", work_type: "creative_request",
        status: "assigned", priority: "urgent", due_date: "2026-08-01", launch_date: null, created_at: "2026-08-01T00:00:00Z",
      },
    ]);
    const empty = makeQueryResult([]);
    const workItemQueries = [workItems.query];
    const from = vi.fn((table: string) => table === "work_items" ? workItemQueries.shift() : empty.query);
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const result = await windowObject.loadFlowMateBoardLane({ status: "assigned", limit: 2, total: 4 });

    expect(workItems.calls.filter(([method]) => method === "order")).toEqual([
      ["order", "launch_date", { ascending: true, nullsFirst: false }],
      ["order", "due_date", { ascending: true, nullsFirst: false }],
      ["order", "created_at", { ascending: true }],
      ["order", "display_id", { ascending: true }],
    ]);
    expect(workItems.calls).toContainEqual(["limit", 3]);
    expect(workItems.calls).not.toContainEqual(["eq", "priority", "urgent"]);
    expect(workItems.calls).not.toContainEqual(["neq", "priority", "urgent"]);
    expect(result.rows.map((row: { id: string }) => row.id)).toEqual(["CR-1001", "CR-1002"]);
    expect(result.rows.map((row: { priority: string }) => row.priority)).toEqual(["normal", "urgent"]);
    expect(result.total).toBe(4);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual({
      launchDate: "2026-08-05",
      dueDate: "2026-08-03",
      createdAt: "2026-08-01T00:00:00Z",
      displayId: "CR-1002",
    });
    expect(result.nextCursor).not.toHaveProperty("priorityGroup");
    expect(result.nextCursor).not.toHaveProperty("priority_group");
  });

  it("continues a Board lane with the same launch-date tuple, including null-last branches", async () => {
    const workItems = makeQueryResult([]);
    const empty = makeQueryResult([]);
    const workItemQueries = [workItems.query];
    const from = vi.fn((table: string) => table === "work_items" ? workItemQueries.shift() : empty.query);
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const result = await windowObject.loadFlowMateBoardLane({
      status: "assigned",
      cursor: {
        launchDate: "2026-08-05",
        dueDate: "2026-08-03",
        createdAt: "2026-08-01T00:00:00Z",
        displayId: "CR-1002",
      },
      limit: 2,
    });

    expect(workItems.calls).toContainEqual(["or", "launch_date.gt.2026-08-05,launch_date.is.null,and(launch_date.eq.2026-08-05,due_date.gt.2026-08-03),and(launch_date.eq.2026-08-05,due_date.is.null),and(launch_date.eq.2026-08-05,due_date.eq.2026-08-03,created_at.gt.\"2026-08-01T00:00:00Z\"),and(launch_date.eq.2026-08-05,due_date.eq.2026-08-03,created_at.eq.\"2026-08-01T00:00:00Z\",display_id.gt.CR-1002)"]);
    expect(workItems.calls).not.toContainEqual(["eq", "priority", "urgent"]);
    expect(workItems.calls).not.toContainEqual(["neq", "priority", "urgent"]);
    expect(result.nextCursor).toBeNull();
  });

  it("continues after a null launch and due date without returning earlier non-null dates", async () => {
    const workItems = makeQueryResult([]);
    const empty = makeQueryResult([]);
    const workItemQueries = [workItems.query];
    const from = vi.fn((table: string) => table === "work_items" ? workItemQueries.shift() : empty.query);
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    await windowObject.loadFlowMateBoardLane({
      status: "assigned",
      cursor: {
        launchDate: null,
        dueDate: null,
        createdAt: "2026-08-01T00:00:00Z",
        displayId: "CR-1004",
      },
      limit: 2,
    });

    expect(workItems.calls).toContainEqual(["or", "and(launch_date.is.null,due_date.is.null,created_at.gt.\"2026-08-01T00:00:00Z\"),and(launch_date.is.null,due_date.is.null,created_at.eq.\"2026-08-01T00:00:00Z\",display_id.gt.CR-1004)"]);
  });

  it("continues a non-null launch with a null due date in its null-last bucket", async () => {
    const workItems = makeQueryResult([]);
    const empty = makeQueryResult([]);
    const workItemQueries = [workItems.query];
    const from = vi.fn((table: string) => table === "work_items" ? workItemQueries.shift() : empty.query);
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    await windowObject.loadFlowMateBoardLane({
      status: "assigned",
      cursor: {
        launchDate: "2026-08-05",
        dueDate: null,
        createdAt: "2026-08-01T00:00:00Z",
        displayId: "CR-1004",
      },
      limit: 2,
    });

    expect(workItems.calls).toContainEqual(["or", "launch_date.gt.2026-08-05,launch_date.is.null,and(launch_date.eq.2026-08-05,due_date.is.null,created_at.gt.\"2026-08-01T00:00:00Z\"),and(launch_date.eq.2026-08-05,due_date.is.null,created_at.eq.\"2026-08-01T00:00:00Z\",display_id.gt.CR-1004)"]);
  });

  it("continues a null launch with a non-null due date and keeps both null-last branches", async () => {
    const workItems = makeQueryResult([]);
    const empty = makeQueryResult([]);
    const workItemQueries = [workItems.query];
    const from = vi.fn((table: string) => table === "work_items" ? workItemQueries.shift() : empty.query);
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    await windowObject.loadFlowMateBoardLane({
      status: "assigned",
      cursor: {
        launchDate: null,
        dueDate: "2026-08-03",
        createdAt: "2026-08-01T00:00:00Z",
        displayId: "CR-1002",
      },
      limit: 2,
    });

    expect(workItems.calls).toContainEqual(["or", "and(launch_date.is.null,due_date.gt.2026-08-03),and(launch_date.is.null,due_date.is.null),and(launch_date.is.null,due_date.eq.2026-08-03,created_at.gt.\"2026-08-01T00:00:00Z\"),and(launch_date.is.null,due_date.eq.2026-08-03,created_at.eq.\"2026-08-01T00:00:00Z\",display_id.gt.CR-1002)"]);
  });

  it("does not emit a cursor for an exact Board page without an extra raw row", async () => {
    const workItems = makeQueryResult([
      {
        id: "work-1", display_id: "CR-1001", title: "First exact-page item", work_type: "creative_request",
        status: "assigned", priority: "normal", due_date: "2026-08-03", launch_date: "2026-08-04", created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "work-2", display_id: "CR-1002", title: "Second exact-page item", work_type: "creative_request",
        status: "assigned", priority: "urgent", due_date: "2026-08-03", launch_date: "2026-08-05", created_at: "2026-08-01T00:00:00Z",
      },
    ]);
    const empty = makeQueryResult([]);
    const workItemQueries = [workItems.query];
    const from = vi.fn((table: string) => table === "work_items" ? workItemQueries.shift() : empty.query);
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const result = await windowObject.loadFlowMateBoardLane({ status: "assigned", limit: 2, total: 2 });

    expect(workItems.calls).toContainEqual(["limit", 3]);
    expect(result.rows.map((row: { id: string }) => row.id)).toEqual(["CR-1001", "CR-1002"]);
    expect(result.total).toBe(2);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
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
    const windowObject = loadBrowserScript("supabase-list-data.js", {
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
    const windowObject = loadBrowserScript("supabase-list-data.js", {
      flowmateSupabase: { from },
    });

    const rows = await windowObject.loadFlowMateKpiRows();

    expect(from).toHaveBeenCalledTimes(1);
    expect(rows).toMatchObject([
      { id: "CR-1001", type: "creative", status: "delivered", effort: 3, assignee: "member-1", archivedAt: "2026-08-10T03:00:00Z" },
      { id: "CR-1002", status: "in_progress", effort: 5, archivedAt: null },
      { id: "QT-1003", type: "quick", status: "cancelled", effort: null, archivedAt: null },
    ]);
    expect(rows.find((row: { id: string }) => row.id === "QT-1003")).toMatchObject({ status: "cancelled" });
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
    const windowObject = loadBrowserScript("supabase-list-data.js", {
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
    const windowObject = loadBrowserScript("supabase-list-data.js", {
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
    const windowObject = loadBrowserScript("supabase-list-data.js", {
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
    const windowObject = loadBrowserScript("supabase-quick-task.js", {
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
    const source = readRepo("screens-b.jsx");
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

  it("hydrates Board snapshots lazily and keeps non-empty lanes visible while they refresh", () => {
    const source = readRepo("screens-b.jsx");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));

    expect(source).toContain("const FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS = new Map()");
    expect(board).toContain("readFlowMateBoardSnapshot");
    expect(board).toContain('currentLane.rows.length > 0 ? "refreshing" : "loading"');
    expect(board).toContain('status: currentLane.rows.length > 0 ? "stale-error" : "error"');
    expect(board).toContain('{lane.status === "loading" && lane.rows.length === 0 && <div className="board-state" role="status">Loading {column.label}...</div>}');
    expect(board).not.toContain('{lane.status === "loading" && <div className="board-state" role="status">Loading {column.label}...</div>}');
    expect(board).toContain("clearFlowMateBoardSnapshot");
  });

  it("routes mount, live, manual, and card refreshes through the Board refresh coordinator", () => {
    const source = readRepo("screens-b.jsx");
    const board = source.slice(source.indexOf("function BoardScreen"), source.indexOf("/* ============================================================\n   ATTENTION NEEDED"));

    expect(board).toContain("runFlowMateBoardRefresh");
    expect(board).not.toContain("await loadLane(targetStatus);");
  });

  it("keeps ordinary search on the current Board tab and restores Board navigation state", () => {
    const source = readRepo("screens-b.jsx");
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
    const source = readRepo("screens-b.jsx");
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
    const source = readRepo("screens-b.jsx");
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
    const source = readRepo("screens-b.jsx");
    const appSource = readRepo("app.jsx");
    const css = readRepo("app.css");
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
    const css = readRepo("app.css");
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

  it("loads both Creative Request launch milestones without changing due-date ordering", () => {
    const loader = readRepo("supabase-list-data.js");
    const schema = readRepo("supabase/schema.sql");
    const weeklyCapacity = readRepo("supabase/team_schedule_weekly_capacity.sql");
    const kpiNormalizer = loader.slice(
      loader.indexOf("function normalizeFlowMateKpiRow"),
      loader.indexOf("async function loadFlowMateKpiRows"),
    );

    expect(loader).toContain("final_approved_due_date");
    expect(loader).toContain("finalApprovedDueDate: item.final_approved_due_date");
    expect(loader).toContain("finalApprovedDueLabel: flowmateDateLabel(item.final_approved_due_date)");
    expect(loader).toContain("finalApprovedDueFullLabel: flowmateDateFullLabel(item.final_approved_due_date)");
    expect(kpiNormalizer).toContain("finalApprovedDueDate: row.final_approved_due_date");
    expect(kpiNormalizer).toContain("finalApprovedDueLabel: flowmateDateLabel(row.final_approved_due_date)");
    expect(kpiNormalizer).toContain("finalApprovedDueFullLabel: flowmateDateFullLabel(row.final_approved_due_date)");
    expect(loader).toContain('.order("due_date", { ascending: true })');
    expect(loader).toContain('.order("first_draft_date", { ascending: true })');
    expect(schema).toContain("wi.final_approved_due_date as final_approved_due_date");
    expect(weeklyCapacity).toContain("wi.final_approved_due_date");
  });
});
