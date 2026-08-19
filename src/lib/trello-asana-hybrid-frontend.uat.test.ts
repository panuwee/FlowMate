import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const app = read("app.jsx");
const screensA = read("screens-a.jsx");
const screensB = read("screens-b.jsx");
const screensC = read("screens-c.jsx");
const listData = read("supabase-list-data.js");
const quickTask = read("supabase-quick-task.js");
const data = read("data.jsx");
const search = read("search-utils.js");
const css = read("app.css");
const flowmate = read("src/lib/flowmate.ts");

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  source = source.replace(/\r\n/g, "\n");
  const start = source.indexOf(startMarker);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function functionSlice(source: string, name: string, nextMarker: string): string {
  return sliceBetween(source, `function ${name}`, nextMarker);
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("FlowMate Trello + Asana hybrid frontend static UAT", () => {
  it("uses Attention Needed as the canonical route and redirects legacy #queue links", () => {
    expect(app).toContain('key: "attention"');
    expect(app).toContain('label: "Attention Needed"');
    expect(app).toContain('"attention": "Attention Needed"');
    expect(app).toContain('return routeKey === "queue" ? "attention" : routeKey;');
    expect(app).toContain('h.split("/")[0] === "queue"');
    expect(app).toContain('#attention`);');
    expect(app).toContain('route === "attention" && React.createElement(QueueScreen');
    expect(withoutComments(app)).not.toMatch(/["'`]Central Queue["'`]/i);
    expect(withoutComments(screensB)).not.toMatch(/>\s*Central Queue\s*</i);
  });

  it("registers Unassigned status styling and reusable assignment warning badges", () => {
    expect(data).toContain('unassigned: "Unassigned"');
    expect(data).toContain('unassigned: "badge--unassigned"');
    expect(data).toContain("function AssignmentWarningBadges");
    expect(data).toContain('className="assignment-warnings"');
    expect(data).toContain("warning-badge--${warning?.severity || \"warning\"}");
    expect(data).toMatch(/Object\.assign\(window,[\s\S]*AssignmentWarningBadges/);
  });

  it("deduplicates Attention rows, exposes all categories, and uses the deduplicated nav count", () => {
    const attentionRows = functionSlice(search, "getFlowMateAttentionRows", "function getFlowMateAttentionGroups");
    expect(search).toContain("const FLOWMATE_ATTENTION_CATEGORY_CODES = [");
    expect(search).toContain('"unassigned"');
    expect(search).toContain('"review_delay"');
    expect(search).toContain('"blocked"');
    expect(search).toContain('"needs_split"');
    expect(attentionRows).toContain("const seen = new Set()");
    expect(attentionRows).toContain("seen.has(row.id)");
    expect(attentionRows).toContain("seen.add(row.id)");
    expect(search).toContain("attention: getFlowMateAttentionRows(rows).length");
    expect(search).toContain("window.getFlowMateAttentionCategoryCodes = getFlowMateAttentionCategoryCodes");
    expect(search).toContain("window.getFlowMateAttentionRows = getFlowMateAttentionRows");
    expect(search).toContain("window.getFlowMateAttentionGroups = getFlowMateAttentionGroups");
  });

  it("orders My Work by overdue, blocked, capacity/deadline risk, due soon, then normal", () => {
    const rank = functionSlice(search, "getFlowMateMyWorkSortRank", "function sortFlowMateMyWorkRows");
    const overdue = rank.indexOf("return 0");
    const blocked = rank.indexOf("return 1");
    const risk = rank.indexOf("return 2");
    const soon = rank.indexOf("return 3");
    const normal = rank.indexOf("return 4");
    expect(rank).toContain('warningCodes.has("over_capacity")');
    expect(rank).toContain('warningCodes.has("deadline_capacity_gap")');
    expect(rank).toContain('warningCodes.has("review_buffer_risk")');
    expect([overdue, blocked, risk, soon, normal]).toEqual([...([overdue, blocked, risk, soon, normal])].sort((a, b) => a - b));
    expect(screensA).toContain("window.sortFlowMateMyWorkRows");
    expect(screensA).toContain("<AssignmentWarningBadges work={w} limit={2} />");
  });

  it("loads latest assignment warnings/result/reason safely with the locked select in both paths", () => {
    const latestRuns = functionSlice(listData, "loadFlowMateLatestAssignmentRuns", "function parseFlowMateAssignmentWarnings");
    const parser = functionSlice(listData, "parseFlowMateAssignmentWarnings", "async function loadFlowMateAiTagRowsForList");
    const lockedSelect = 'select("work_item_id,capacity_snapshot,reason,result,final_owner_member_id,ran_at")';
    expect(latestRuns.match(new RegExp(lockedSelect.replace(/[()]/g, "\\$&"), "g"))?.length).toBe(2);
    expect(latestRuns).toContain('.from("latest_assignment_run_v")');
    expect(latestRuns).toContain('.from("assignment_runs")');
    expect(parser).toContain('typeof snapshot === "string"');
    expect(parser).toContain("JSON.parse(snapshot)");
    expect(parser).toContain("catch (error)");
    expect(parser).toContain("return []");
    expect(parser).toContain("Array.isArray(snapshot.warnings)");
    expect(listData).toContain("assignmentWarnings: parseFlowMateAssignmentWarnings(assignmentRun?.capacity_snapshot)");
    expect(listData).toContain("assignmentResult: assignmentRun?.result || item.status || \"\"");
    expect(listData).toContain("assignmentReason: assignmentRun?.reason || item.assignment_reason || \"\"");
  });

  it("exports active GD/VE member and per-item capacity allocation loaders", () => {
    expect(listData).toContain("async function loadFlowMateActiveCreativeMembers()");
    expect(listData).toContain('.eq("active", true)');
    expect(listData).toContain("window.isFlowMateGdVeMember");
    expect(listData).toContain("async function loadFlowMateCapacityAllocationsForWorkItem(workItemId)");
    expect(listData).toContain('.from("flowmate_capacity_allocations")');
    expect(listData).toContain("window.loadFlowMateActiveCreativeMembers = loadFlowMateActiveCreativeMembers");
    expect(listData).toContain("window.loadFlowMateCapacityAllocationsForWorkItem = loadFlowMateCapacityAllocationsForWorkItem");
  });

  it("uses exact no-actor reassignment and capacity-reschedule RPC helper contracts", () => {
    const change = functionSlice(quickTask, "changeFlowMateCreativeAssignee", "async function rescheduleFlowMateCapacityAllocation");
    const reschedule = functionSlice(quickTask, "rescheduleFlowMateCapacityAllocation", "window.changeFlowMateCreativeAssignee");
    expect(change).toContain('rpc("flowmate_change_creative_assignee"');
    expect(change).toContain("p_display_id: displayId");
    expect(change).toContain("p_target_member_id: targetMemberId || null");
    expect(change).toContain('p_reason: String(reason || "").trim() || null');
    expect(change).not.toContain("p_actor_user_id");
    expect(reschedule).toContain('rpc("flowmate_reschedule_capacity_allocation"');
    expect(reschedule).toContain("p_display_id: displayId");
    expect(reschedule).toContain("p_allocations: allocations");
    expect(reschedule).not.toContain("p_actor_user_id");
    for (const helper of [change, reschedule]) {
      expect(helper).toContain('new CustomEvent("flowmate:refresh-request"');
      expect(helper).toContain('new CustomEvent("flowmate:refresh-counts")');
    }
  });

  it("renders only assigned, unassigned, and need_brief creative create outcomes", () => {
    expect(screensA).toContain('kind: result === "assigned" ? "assigned" : result === "need_brief" ? "need_brief" : "unassigned"');
    expect(screensA).toContain('result.kind === "assigned" && "Request submitted - assigned"');
    expect(screensA).toContain('result.kind === "unassigned" && "Request submitted - unassigned"');
    expect(screensA).toContain('result.kind === "need_brief" && "Request submitted - needs brief"');
    expect(screensA).toContain('{m?.name || result.ownerName || "Assigned owner"}');
    expect(screensA).toContain("Owner selected by the assignment engine");
    expect(screensA).toContain("<AssignmentWarningBadges work={resultWarningWork} limit={8} />");
    expect(screensA).toContain("Task created but needs manual assignment.");
    expect(screensA).toContain('onClick={() => onNav("attention")}');
    expect(screensA).not.toContain('result.kind === "queued"');
    expect(screensA).not.toContain('kind: "queued"');
  });

  it("renders all 12 Attention categories with context and no rerun controls", () => {
    const attention = sliceBetween(screensB, "const FLOWMATE_ATTENTION_CATEGORIES_B", "/* ============================================================\n   ADMIN WHITELIST");
    const categoriesLiteral = sliceBetween(attention, "const FLOWMATE_ATTENTION_CATEGORIES_B", "];\n");
    const codes = [...categoriesLiteral.matchAll(/code:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(codes).toEqual([
      "unassigned",
      "over_capacity",
      "wip_exceeded",
      "skill_mismatch",
      "backup_skill",
      "member_partial",
      "member_on_leave",
      "deadline_capacity_gap",
      "review_buffer_risk",
      "review_delay",
      "blocked",
      "needs_split",
    ]);
    expect(attention).toContain('<h1 className="page__title">Attention Needed</h1>');
    expect(attention).toContain("window.getFlowMateAttentionRows");
    expect(attention).toContain("window.getFlowMateAttentionGroups");
    expect(attention).toContain("Actionable context");
    expect(attention).not.toMatch(/rerun/i);
    expect(attention).not.toMatch(/>\s*Refresh\s*</i);
  });

  it("keeps authoritative Detail permissions, self-assignment, Sub PIC, and status controls without manual capacity editing", () => {
    expect(screensA).toContain('const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === "admin"');
    expect(screensA).toContain("const isRequesterUser = currentUserId === w.requesterUserId");
    expect(screensA).toContain("(isAdminUser || isRequesterUser)");
    expect(screensA).toContain("activeCreativeMembers.some(member => member.id === currentTeamMemberId && member.active !== false)");
    expect(screensA).toContain('w.status === "unassigned" && isActiveCreativeMember');
    expect(screensA).toContain('await window.changeFlowMateCreativeAssignee(w.id, currentTeamMemberId, "Self-assigned from Unassigned")');
    expect(screensA).toContain('<option value="">Unassigned</option>');
    expect(screensA).toContain("activeCreativeMembers.map(member => <option");
    expect(screensA).not.toContain("AM/PM capacity allocation");
    expect(screensA).not.toContain("submitCapacityAllocations");
    expect(screensA).not.toContain("window.rescheduleFlowMateCapacityAllocation(w.id");
    expect(screensA).not.toContain("capacityEditorState");
    expect(screensA).toContain("window.canFlowMateTransitionWorkItem?.(");
    expect(quickTask).toContain("row.marketingPlanSubPicUserId");
    expect(screensA).toContain(".some(canTransitionTo)");
  });

  it("renders warning context and Unassigned status across My Work, List, Board, and Detail", () => {
    expect(screensA).toContain("<AssignmentWarningBadges work={w} limit={2} />");
    expect(screensA).toContain('id="detail-assignment-attention"');
    expect(screensA).toContain('w.status === "unassigned"');
    expect(screensB).toContain('{ key: "unassigned",  label: "Unassigned" }');
    const warningBadgeCount = (screensB.match(/<AssignmentWarningBadges work=\{w\}/g)?.length || 0)
      + (screensB.match(/<AssignmentWarningBadges work=\{row\}/g)?.length || 0);
    expect(warningBadgeCount).toBeGreaterThanOrEqual(3);
    expect(screensB).toContain("<StatusBadge status={w.status} />");
  });

  it("marks weekly Team Schedule workload above capacity and exposes drill-down", () => {
    const capacityClass = functionSlice(screensC, "ganttCapacityClassC", "function ganttCapacityTitleC");
    const capacityTitle = functionSlice(screensC, "ganttCapacityTitleC", "function TeamGanttScreen");
    expect(capacityClass).toContain('if (usedPoint > bucketCapacity) return "is-over-capacity"');
    expect(capacityClass.indexOf("usedPoint > bucketCapacity")).toBeLessThan(capacityClass.indexOf("usedPoint === bucketCapacity"));
    expect(capacityTitle).toContain("const amountOver = Number((usedPoint - bucketCapacity).toFixed(2))");
    expect(capacityTitle).toContain("OVER CAPACITY by ${amountOver} pt");
    expect(screensC).toContain('stateClass === "is-over-capacity"');
    expect(screensC).toContain('used > roundedAvailable ? "is-over"');
    expect(screensC).toContain("selectedWorkload.entries.map");
    expect(screensC).toContain("This view is read-only");
  });

  it("uses Unassigned and deduplicated Attention metrics instead of a current queued workflow", () => {
    expect(screensC).toContain("window.getFlowMateAttentionRows");
    expect(screensC).toContain("window.getFlowMateAttentionCategoryCodes");
    expect(screensC).toContain("Attention / at risk");
    expect(screensC).toContain("Current work without an owner");
    expect(screensC).toContain("Deduplicated current attention items");
    expect(screensC).not.toContain("Queued effort");
    expect(screensC).not.toMatch(/className="kpi__lbl">Queued</);
    expect(screensC).not.toMatch(/className="stat__lbl">Queued</);
    expect(screensC).not.toContain('["Queued",');
  });

  it("keeps capacity through Review and summarizes Unassigned plus Attention", () => {
    expect(flowmate).toContain('isUnassigned?: boolean');
    expect(flowmate).toContain('assignmentWarningCodes?: string[]');
    expect(flowmate).toContain('unassignedCount: number');
    expect(flowmate).toContain('attentionCount: number');
    expect(flowmate).not.toContain('queuedCount: number');
    expect(flowmate).toContain('new Set(["assigned", "in_progress", "review", "blocked"])');
    expect(flowmate).toContain('new Set(["need_brief", "unassigned", "queued", "delivered", "cancelled"])');
    expect(flowmate).toContain("!NON_PRODUCTION_CAPACITY_STATUSES.has(item.status)");
    expect(flowmate).toContain("attentionDisplayIds.has(item.displayId)");
  });

  it("styles Unassigned, warnings, Attention, simplified daily capacity, overload, dark mode, and mobile", () => {
    expect(css).toContain(".badge--unassigned");
    expect(css).toContain(".assignment-warnings");
    expect(css).toContain(".warning-badge");
    expect(css).toContain('section[aria-labelledby^="attention-"]');
    expect(css).toContain('section[aria-labelledby="detail-assignment-attention"]');
    expect(css).toContain('form[aria-label="Change creative assignee"]');
    expect(css).not.toContain('form[aria-label="Edit AM PM capacity allocation"]');
    expect(css).toContain(".gantt__capacity-summary.is-over-capacity");
    expect(css).toContain('html[data-theme="dark"] .badge--unassigned');
    expect(css).toContain('html[data-theme="dark"] .warning-badge');
    expect(css).toContain('html[data-theme="dark"] .gantt__capacity-summary.is-over-capacity');
    expect(css).toContain("@media (max-width: 768px)");
  });

  it("contains no obvious mojibake sequences in the touched frontend sources", () => {
    const touchedSources: Record<string, string> = {
      "app.jsx": app,
      "screens-a.jsx": screensA,
      "screens-b.jsx": screensB,
      "screens-c.jsx": screensC,
      "supabase-list-data.js": listData,
      "supabase-quick-task.js": quickTask,
      "data.jsx": data,
      "search-utils.js": search,
      "app.css": css,
      "src/lib/flowmate.ts": flowmate,
    };
    const obviousMojibake = ["\uFFFD", "\u00C2", "\u00C3", "\u0E22\u0E17", "\u00E2\u20AC", "\u00EF\u00BF\u00BD"];
    for (const [path, source] of Object.entries(touchedSources)) {
      for (const sequence of obviousMojibake) {
        expect(source, `${path} contains mojibake sequence ${JSON.stringify(sequence)}`).not.toContain(sequence);
      }
    }
  });
});
