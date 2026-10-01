// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { transformSync } from "@babel/core";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act, Simulate } from "react-dom/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
let api: any;
let rpc: any;
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  rpc = vi.fn(async () => ({ data: [], error: null }));
  const scope: any = { FLOWMATE_CURRENT_USER: { id: "mkt-user", accessible_teams: ["mkt"] }, FLOWMATE_ACTIVE_TEAM: "mkt",
    flowmateSupabase: { rpc }, dispatchEvent: vi.fn(), addEventListener: vi.fn() };
  runInNewContext(read("supabase-quick-task.js"), { window: scope, console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }, URL, Date, Intl, CustomEvent, setTimeout, clearTimeout });
  api = scope.TaskAssign;
  host = document.createElement("div"); document.body.append(host);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; host.remove(); vi.restoreAllMocks(); });

async function renderPicker(parents: any[] | Error = []) {
  const source = read("screens-a.jsx");
  const code = transformSync(source.slice(source.indexOf("function QuickTaskForm("), source.indexOf("function CreativeRequestForm(")), { configFile: false, babelrc: false, presets: [["@babel/preset-react", { runtime: "classic" }]] })!.code!;
  const scope = { TaskAssign: { ...api, members: async () => [{ userId: "aof", name: "Aof" }, { userId: "jane", name: "Jane" }, { userId: "bob", name: "Bob" }], list: async () => { if (parents instanceof Error) throw parents; return parents; } }, flowmateUserError: (error: Error) => error.message };
  const Form = new Function("React", "window", "useState", "useEffect", "getFlowMateTodayDateKey", code + ";return QuickTaskForm;")(React, scope, React.useState, React.useEffect, () => "2026-10-01");
  let current: any;
  function Harness() { const [draft, setDraft] = React.useState({ responsibleTeam: "mkt", assigneeUserId: "", title: "Venue", note: "Plan", projectName: "", dueDate: "", launchDate: "2099-10-01", priority: "normal", referenceLinks: "", parentId: "", confidential: true, collaboratorIds: ["old-private-member"] }); current = draft; return React.createElement(Form, { value: draft, onChange: setDraft }); }
  root = createRoot(host);
  await act(async () => root!.render(React.createElement(Harness)));
  return () => current;
}

describe("Task Assign client and rendered form", () => {
  it("shows typed matching names, commits only a clicked member and clears a changed selection", async () => {
    const draft = await renderPicker([{ id: "parent", display_id: "QT-100", title: "Event" }]);
    const input = host.querySelector("#task-assignee") as HTMLInputElement;
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => Simulate.change(input, { target: { value: "A" } } as any));
    expect(Array.from(host.querySelectorAll('[role="option"]'), node => node.textContent)).toEqual(["Aof", "Jane"]);
    expect(draft().assigneeUserId).toBe("");
    await act(async () => Simulate.click(host.querySelector('[role="option"]')!));
    expect(draft().assigneeUserId).toBe("aof"); expect(input.value).toBe("Aof");
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => Simulate.change(input, { target: { value: "nobody" } } as any));
    expect(draft().assigneeUserId).toBe(""); expect(host.textContent).toContain("No matching active members.");
    expect(host.textContent).not.toContain("Confidential task"); expect(host.textContent).not.toContain("Selected collaborators");
    expect((host.querySelector('#task-parent option[value="parent"]') as HTMLOptionElement).text).toBe("QT-100 — Event");
    await act(async () => Simulate.change(host.querySelector("#task-parent")!, { target: { value: "parent" } } as any));
    expect(draft().parentId).toBe("parent");
  });
  it("supports keyboard selection and explains an empty parent list", async () => {
    const draft = await renderPicker(); const input = host.querySelector("#task-assignee")!;
    await act(async () => Simulate.change(input, { target: { value: "aof" } } as any));
    await act(async () => Simulate.keyDown(input, { key: "ArrowDown" }));
    await act(async () => Simulate.keyDown(input, { key: "Enter" }));
    expect(draft().assigneeUserId).toBe("aof");
    expect(host.textContent).toContain("No existing tasks you created are available.");
    expect(host.querySelectorAll("#task-parent option")).toHaveLength(1);
  });
  it("reports a failed parent lookup instead of presenting it as an empty list", async () => {
    await renderPicker(new Error("Parent RPC unavailable"));
    expect(host.textContent).toContain("Parent tasks could not load.");
    expect(host.textContent).toContain("Parent RPC unavailable");
    expect(host.textContent).not.toContain("No existing tasks you created");
  });
  it("opens a created task using its own detail route without the Creative loader", async () => {
    const source = read("screens-a.jsx");
    const body = source.slice(source.indexOf("  async function openCreatedDetail("), source.indexOf("  async function handleSubmit()", source.indexOf("  async function openCreatedDetail(")));
    const onOpen = vi.fn();
    const open = new Function("window", "isTaskAssignProduct", "onOpen", body + ";return openCreatedDetail;")({}, true, onOpen);
    await open({}, "QT-2001");
    expect(onOpen).toHaveBeenCalledWith("QT-2001");
  });
  it("keeps deadline-only tasks visible in the calendar without inventing a review date", async () => {
    const source = read("supabase-list-data.js");
    const loader = source.slice(source.indexOf("async function loadFlowMateCalendarRows()"), source.indexOf("async function loadFlowMateTeamScheduleRows()"));
    const calendar = new Function("loadFlowMateOperationalRows", "loadFlowMateLeaveRows", loader + ";return loadFlowMateCalendarRows;")(
      async () => [{ id: "deadline-only", type: "quick", dueDate: null, launchDate: "2099-10-01" }], async () => []);
    expect(await calendar()).toEqual([expect.objectContaining({ dueDate: null, calendarDate: "2099-10-01" })]);
  });
  it("accepts a general task without project/review and rejects malformed dates or unsafe references", () => {
    const draft = { title: "Prepare venue", note: "Deliver the floor plan", responsibleTeam: "ops", launchDate: "2099-10-01", dueDate: "", priority: "normal" };
    expect(api.validate(draft)).toEqual({});
    expect(api.validate({ ...draft, dueDate: "2099-10-02" })).toHaveProperty("dueDate");
    expect(api.validate({ ...draft, launchDate: "2099-02-30" })).toHaveProperty("launchDate");
    expect(api.validate({ ...draft, priority: "urgent" })).toHaveProperty("urgentReason");
    expect(api.validate({ ...draft, referenceLinks: "javascript:alert(1)" })).toHaveProperty("referenceLinks");
  });
  it("sends authenticated source workspace and queues cross-team work without a client-selected assignee", async () => {
    await api.create({ title: "Prepare venue", note: "Deliver plan", responsibleTeam: "ops", launchDate: "2099-10-01", requestKey: "request-1", assigneeUserId: "stale-mkt-assignee", referenceLinks: "https://example.test/brief\nhttps://example.test/brief" });
    expect(rpc).toHaveBeenCalledWith("task_assign_create", expect.objectContaining({ p_source_team: "mkt", p_responsible_team: "ops", p_assignee: null, p_review_date: null, p_project: null, p_request_key: "request-1", p_references: ["https://example.test/brief"] }));
  });
  it("fails clearly when backend is absent and never retries the legacy creation RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "schema cache" } });
    await expect(api.create({ title: "Prepare venue", note: "Plan", responsibleTeam: "ops", launchDate: "2099-10-01" })).rejects.toThrow(/not installed/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("task_assign_create");
  });
  it("renders editable title, optional project/review and switches assignee to receiving-team queue", async () => {
    const source = read("screens-a.jsx");
    const formSource = source.slice(source.indexOf("function QuickTaskForm("), source.indexOf("function CreativeRequestForm("));
    const code = transformSync(formSource, { configFile: false, babelrc: false, presets: [["@babel/preset-react", { runtime: "classic" }]] })!.code!;
    const scope: any = { TaskAssign: { ...api, members: vi.fn(async () => [{ userId: "mkt-user", name: "Marketing member", teamKey: "mkt" }]), list: vi.fn(async () => []) }, flowmateUserError: (err: any) => err.message };
    const Form = new Function("React", "window", "useState", "useEffect", "getFlowMateTodayDateKey", code + ";return QuickTaskForm;")(React, scope, React.useState, React.useEffect, () => "2026-10-01");
    function Harness() { const [draft, setDraft] = React.useState({ title: "Venue setup", note: "Deliver floor plan", responsibleTeam: "mkt", assigneeUserId: "mkt-user", projectName: "", dueDate: "", launchDate: "2099-10-01", priority: "normal", urgentReason: "", referenceLinks: "", confidential: false, parentId: "", collaboratorIds: [] }); return React.createElement(Form, { value: draft, onChange: setDraft }); }
    root = createRoot(host);
    await act(async () => { root!.render(React.createElement(Harness)); });
    expect((host.querySelector("#task-title") as HTMLInputElement).readOnly).toBe(false);
    expect(host.textContent).toContain("Project / Campaign (optional)");
    expect(host.textContent).toContain("1st Review Date (optional)");
    expect((host.querySelector("#task-review") as HTMLInputElement).value).toBe("");
    expect(host.querySelector("#task-assignee")).not.toBeNull();
    await act(async () => { const select = host.querySelector("#task-team") as HTMLSelectElement; select.value = "ops"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("Receiving team will assign a person");
    expect(host.querySelector("#task-assignee")).toBeNull();
  });
  it("recognizes Task Assign direct URLs before product selection", () => {
    const app = read("app.jsx");
    const routes = app.slice(app.indexOf("const TASK_ASSIGN_HASH_KEYS"), app.indexOf("function isFlowMateRouteAllowedForRole"));
    const scope = { location: { hash: "#task-assign-my-work", pathname: "/" } };
    const getProduct = new Function("window", "TASK_ASSIGN_PRODUCT_KEY", "MARKETING_PLAN_HASH_KEYS", "PRODUCT_BOOK_HASH_KEYS", "OT_REQUEST_HASH_KEYS", "PRODUCT_BOOK_PRODUCT_KEY", "OT_REQUEST_PRODUCT_KEY", "TITLE_MAP", routes + ";return getProductFromHashRouteKey;")(scope, "task-assign", new Set(), new Set(), new Set(), "product-book", "ot-request", {});
    expect(getProduct()).toBe("task-assign");
    expect(getProduct("#task-assign-detail/QT-2001")).toBe("task-assign");
    expect(getProduct("#task-assign-workspace")).toBe("task-assign");
  });
});
