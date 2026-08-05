import { describe, expect, it } from "vitest";
import {
  calculateWorkloadSummary,
  filterWorkItems,
  getOverdueAssignedItems,
  type WorkItemSummary,
} from "./flowmate";

const items: WorkItemSummary[] = [
  {
    displayId: "CR-1042",
    title: "Free Fire OB48 carousel",
    workType: "creative_request",
    status: "in_progress",
    assetType: "static_graphic",
    campaign: "OB48 Launch",
    requesterName: "Lin Chen",
    assigneeName: "Jo",
    assigneeUserId: "user-jo",
    effortPoint: 4,
    isOverdue: true,
    isDueSoon: false,
    isQueued: false,
  },
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
  {
    displayId: "QT-0209",
    title: "Update shared brand folder",
    workType: "quick_task",
    status: "in_progress",
    assetType: null,
    campaign: "Internal",
    requesterName: "Pond",
    assigneeName: "Pond",
    assigneeUserId: "user-pond",
    effortPoint: null,
    isOverdue: false,
    isDueSoon: true,
    isQueued: false,
  },
];

describe("filterWorkItems", () => {
  it("finds work by id, title, campaign, requester, assignee, status, and asset type", () => {
    expect(filterWorkItems(items, "cr-1042")).toHaveLength(1);
    expect(filterWorkItems(items, "hybrid")).toHaveLength(1);
    expect(filterWorkItems(items, "pond")).toHaveLength(1);
    expect(filterWorkItems(items, "queued")).toHaveLength(1);
    expect(filterWorkItems(items, "OB48")).toHaveLength(1);
  });
});

describe("getOverdueAssignedItems", () => {
  it("shows only overdue work assigned to the current user", () => {
    expect(getOverdueAssignedItems(items, "user-jo").map((item) => item.displayId)).toEqual(["CR-1042"]);
    expect(getOverdueAssignedItems(items, "user-pond")).toEqual([]);
  });
});

describe("calculateWorkloadSummary", () => {
  it("counts creative effort separately from quick tasks", () => {
    const summary = calculateWorkloadSummary(items);

    // Historical queued work is retained for audit only and must not consume
    // current GD/VE production capacity.
    expect(summary.creativeEffort).toBe(4);
    expect(summary.quickTaskCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.unassignedCount).toBe(0);
    expect(summary.attentionCount).toBe(0);
  });
});
