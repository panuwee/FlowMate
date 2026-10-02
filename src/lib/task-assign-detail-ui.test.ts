// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";

let root: Root;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); });

async function renderDetail(overrides = {}) {
  const work = { id: "fixture", display_id: "QT-1001", title: "Venue setup", description: "Deliver the floor plan.", requester_team: "mkt", owning_team_code: "ops", requester_name: "Requester", task_request_state: "accepted", status: "assigned", priority: "normal", task_requested_deadline: "2099-10-15", task_committed_deadline: "2099-10-16", is_requester: false, can_dispatch: false, can_execute: false, task_reference_links: ["https://example.test/brief", "javascript:alert(1)"], ...overrides };
  const action = vi.fn(async () => {});
  const chain = { select() { return this; }, eq() { return this; }, is() { return this; }, order: async () => ({ data: [], error: null }) };
  const scope = { TaskAssign: { list: async () => [work], members: async () => [], teamLabel: (key: string) => key, teams: [], action }, flowmateSupabase: { from: () => chain }, FLOWMATE_CURRENT_USER: { id: "viewer" }, flowmateUserError: (error: Error) => error.message, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const code = transformSync(readFileSync("screens-task-assign.jsx", "utf8"), { babelrc: false, configFile: false, presets: [["@babel/preset-react", { runtime: "classic" }]] })!.code!;
  const Screen = new Function("React", "window", "STATUS_LABEL", "getFlowMateTodayDateKey", "URL", code + ";return TaskAssignDetailScreen;")(React, scope, { assigned: "Assigned", in_progress: "In progress" }, () => "2026-10-02", URL);
  host = document.createElement("div"); document.body.append(host);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(host);
  await act(async () => root.render(React.createElement(Screen, { focusId: "QT-1001", onNav: vi.fn(), onOpen: vi.fn() })));
  return action;
}

it("keeps a read-only viewer from dispatching or executing, and preserves safe reference links", async () => {
  await renderDetail();
  expect(host.querySelector("#accept-task-assignee")).toBeNull();
  expect(host.querySelector("#task-action-reason")).toBeNull();
  expect(host.textContent).not.toContain("Start work");
  expect(host.textContent).not.toContain("Cancel task");
  expect(host.querySelectorAll("a")).toHaveLength(1);
  expect(host.querySelector("a")!.getAttribute("href")).toBe("https://example.test/brief");
  expect(host.textContent).toContain("No comments yet.");
  expect(host.querySelector("#task-comment")).not.toBeNull();
});

it("keeps execution and requester cancellation wired to their existing actions", async () => {
  const action = await renderDetail({ can_execute: true, is_requester: true });
  const start = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Start work")!;
  await act(async () => Simulate.click(start));
  expect(action).toHaveBeenCalledWith(expect.objectContaining({ display_id: "QT-1001" }), "start", expect.any(Object));
  const cancel = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Cancel task")!;
  expect(cancel.closest(".task-detail__secondary-action")).not.toBeNull();
  await act(async () => Simulate.click(cancel));
  expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ display_id: "QT-1001" }), "cancel", expect.any(Object));
});
