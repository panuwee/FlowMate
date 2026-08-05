export type WorkType = "creative_request" | "quick_task";

export type WorkItemSummary = {
  displayId: string;
  title: string;
  workType: WorkType;
  status: string;
  assetType: string | null;
  campaign: string | null;
  requesterName: string | null;
  assigneeName: string | null;
  assigneeUserId: string | null;
  effortPoint: number | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  isQueued: boolean;
  isUnassigned?: boolean;
  assignmentWarningCodes?: string[];
  // PRD §10 lists `platform` as a required search field. Optional because
  // quick tasks and partially-loaded rows may not carry it.
  platform?: string | null;
  platforms?: string[] | null;
  sizeFormat?: string | null;
};

export type WorkloadSummary = {
  creativeEffort: number;
  quickTaskCount: number;
  overdueCount: number;
  dueSoonCount: number;
  unassignedCount: number;
  attentionCount: number;
};

const PRODUCTION_CAPACITY_STATUSES = new Set(["assigned", "in_progress", "review", "blocked"]);
const NON_PRODUCTION_CAPACITY_STATUSES = new Set(["need_brief", "unassigned", "queued", "delivered", "cancelled"]);

export function filterWorkItems(items: WorkItemSummary[], query: string): WorkItemSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const platformText = item.platforms && item.platforms.length > 0
      ? item.platforms.join(" ")
      : item.platform ?? "";
    const searchable = [
      item.displayId,
      item.title,
      item.campaign,
      item.requesterName,
      item.assigneeName,
      item.status,
      item.assetType,
      item.workType,
      platformText,
      item.sizeFormat,
      item.assignmentWarningCodes?.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
}

export function getOverdueAssignedItems(
  items: WorkItemSummary[],
  currentUserId: string,
): WorkItemSummary[] {
  return items.filter((item) => item.assigneeUserId === currentUserId && item.isOverdue);
}

export function calculateWorkloadSummary(items: WorkItemSummary[]): WorkloadSummary {
  const attentionDisplayIds = new Set<string>();
  return items.reduce<WorkloadSummary>(
    (summary, item) => {
      // Capacity stays reserved through Review and is released on Delivered/Cancelled.
      if (
        item.workType === "creative_request" &&
        !NON_PRODUCTION_CAPACITY_STATUSES.has(item.status) &&
        PRODUCTION_CAPACITY_STATUSES.has(item.status)
      ) {
        summary.creativeEffort += item.effortPoint ?? 0;
      }

      if (item.workType === "quick_task" && !["delivered", "cancelled"].includes(item.status)) {
        summary.quickTaskCount += 1;
      }

      if (item.isOverdue) summary.overdueCount += 1;
      if (item.isDueSoon) summary.dueSoonCount += 1;
      const isUnassigned = item.isUnassigned === true || item.status === "unassigned";
      if (isUnassigned) summary.unassignedCount += 1;
      if (
        isUnassigned ||
        item.status === "blocked" ||
        (item.status === "review" && item.isOverdue) ||
        (item.assignmentWarningCodes?.length ?? 0) > 0
      ) {
        if (!attentionDisplayIds.has(item.displayId)) {
          attentionDisplayIds.add(item.displayId);
          summary.attentionCount += 1;
        }
      }

      return summary;
    },
    {
      creativeEffort: 0,
      quickTaskCount: 0,
      overdueCount: 0,
      dueSoonCount: 0,
      unassignedCount: 0,
      attentionCount: 0,
    },
  );
}

export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAssetType(assetType: string | null): string {
  if (!assetType) return "Quick task";
  return assetType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
