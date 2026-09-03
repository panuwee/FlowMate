import { existsSync, readFileSync as nodeReadFileSync } from "node:fs";
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

const readFileSync = (...args: Parameters<typeof nodeReadFileSync>) => (
  nodeReadFileSync(...args).replace(/\r\n/g, "\n")
);

function extractNamedFunction(source: string, functionName: string) {
  const functionStart = source.indexOf(`function ${functionName}(`);
  if (functionStart < 0) return "";
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === "async " ? functionStart - 6 : functionStart;
  const signatureEnd = source.indexOf(") {", functionStart);
  const bodyStart = signatureEnd < 0 ? -1 : signatureEnd + 2;
  if (bodyStart < 0) return "";
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

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

describe("Marketing Plan Current Working approved contracts", () => {
  const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
  const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
  const workingStart = appJsx.indexOf("function MarketingPlanWorkingSheetScreen");
  const workingEnd = appJsx.indexOf("function MarketingPlanSupervisorScreen", workingStart);
  const workingSource = appJsx.slice(workingStart, workingEnd);
  const calendarSource = appJsx.slice(appJsx.indexOf("function MarketingPlanCalendarScreen"), workingStart);
  const css = readFileSync(join(process.cwd(), "app.css"), "utf8");

  function extractCssBlock(selector: string) {
    const start = css.indexOf(`${selector} {`);
    expect(start, selector).toBeGreaterThanOrEqual(0);
    const end = css.indexOf("}", start);
    expect(end, selector).toBeGreaterThan(start);
    return css.slice(start, end + 1);
  }

  function readCssHex(block: string, property: "color" | "background") {
    return block.match(new RegExp(`(?:^|\\n)\\s*${property}:\\s*(#[0-9A-F]{6})`, "i"))?.[1].toUpperCase() || "";
  }

  function getContrastRatio(foreground: string, background: string) {
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16) / 255) || [];
      const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function loadGeneratedOptions(source: string, constantName: string) {
    const declaration = source.match(new RegExp(`const ${constantName} = \\[[\\s\\S]*?\\n\\];`))?.[0] || "";
    expect(declaration).not.toBe("");
    const sandbox = {} as { options?: Array<{ value: string; label: string }> };
    vm.runInNewContext(`${declaration}\nthis.options = ${constantName};`, sandbox);
    return Array.from(sandbox.options || [], (option) => ({ value: option.value, label: option.label }));
  }

  function loadWholeHourNormalizer(source: string) {
    const functionSource = extractNamedFunction(source, "normalizeWholeHourTime");
    expect(functionSource).not.toBe("");
    return vm.runInNewContext(`(${functionSource})`, {}) as (value: unknown) => string;
  }

  function loadWorkingRowsFilter() {
    const functionSource = extractNamedFunction(appJsx, "filterMarketingPlanWorkingRows");
    expect(functionSource).not.toBe("");
    return vm.runInNewContext(`(${functionSource})`, {
      getMarketingPlanChannelLabel: (channel: string) => ({ facebook: "Facebook", tiktok: "TikTok" })[channel] || channel,
      getMarketingPlanWorkingRowTeam: (row: Record<string, unknown>) => String(row.contentTeam || row.campaignTeam || row.market || "").trim(),
    }) as (rows: Array<Record<string, unknown>>, criteria?: Record<string, unknown>) => Array<Record<string, unknown>>;
  }

  function loadWorkingRowsView() {
    const functionSource = extractNamedFunction(appJsx, "resolveMarketingPlanWorkingRowsView");
    expect(functionSource).not.toBe("");
    return vm.runInNewContext(`(${functionSource})`, {
      filterMarketingPlanWorkingRows: loadWorkingRowsFilter(),
    }) as (
      rows: Array<Record<string, unknown>>,
      criteria: Record<string, unknown>,
      lastValidDateState?: { startDate: string; endDate: string; emptyReason: string },
    ) => {
      visibleRows: Array<Record<string, unknown>>;
      emptyReason: string;
      nextValidDateState: { startDate: string; endDate: string; emptyReason: string };
    };
  }

  function loadPreferenceController(options: Record<string, unknown>) {
    const functionSource = extractNamedFunction(appJsx, "createMarketingWorkingMyTasksPreferenceController");
    expect(functionSource).not.toBe("");
    return vm.runInNewContext(`(${functionSource})`, {})(options) as {
      setAccount: (userId: string) => Promise<void>;
      setLocalValue: (enabled: boolean) => Promise<void>;
      invalidateAccount: (userId: string) => void;
    };
  }

  function loadCsvExporter(downloads: Array<{ filename: string; headers: string[]; rows: string[][] }>) {
    const functionSource = extractNamedFunction(appJsx, "exportMarketingPlanRowsCsv");
    expect(functionSource).not.toBe("");
    return vm.runInNewContext(`(${functionSource})`, {
      window: {
        flowmateDownloadCsv: (filename: string, headers: string[], rows: string[][]) => downloads.push({ filename, headers, rows }),
      },
      getMarketingPlanMonthLabel: (monthKey: string) => ({ "2026-09": "Sep 2026", "2026-10": "Oct 2026" })[monthKey] || monthKey,
      getMarketingPlanWorkingRowTeam: (row: Record<string, unknown>) => String(row.contentTeam || row.campaignTeam || row.market || ""),
      getMarketingPlanChannelLabel: (channel: string) => ({ facebook: "Facebook", tiktok: "TikTok" })[channel] || channel,
      formatMarketingPlanTime: (value: string) => value || "N/A",
      getMarketingPlanStatusLabel: (value: string) => ({ ready_to_post: "Ready to Post", planned: "Planned" })[value] || value,
      getMarketingPlanWorkingSheetStatus: (row: Record<string, unknown>) => row.placementStatus || "planned",
    }) as (visibleRows: Array<Record<string, unknown>>, selectedMonth: string) => number;
  }

  type RenderedElement = {
    type: unknown;
    props: Record<string, unknown>;
    children: unknown[];
  };

  function findRenderedElement(node: unknown, predicate: (element: RenderedElement) => boolean): RenderedElement | undefined {
    if (!node || typeof node !== "object") return undefined;
    const element = node as RenderedElement;
    if (element.type && predicate(element)) return element;
    for (const child of element.children || []) {
      const match = findRenderedElement(child, predicate);
      if (match) return match;
    }
    return undefined;
  }

  function findRenderedElements(node: unknown, predicate: (element: RenderedElement) => boolean): RenderedElement[] {
    if (Array.isArray(node)) return node.flatMap((child) => findRenderedElements(child, predicate));
    if (!node || typeof node !== "object") return [];
    const element = node as RenderedElement;
    return [
      ...(element.type && predicate(element) ? [element] : []),
      ...(element.children || []).flatMap((child) => findRenderedElements(child, predicate)),
    ];
  }

  function getRenderedText(node: unknown): string {
    if (node == null || node === false) return "";
    if (Array.isArray(node)) return node.map(getRenderedText).filter(Boolean).join(" ");
    if (typeof node !== "object") return String(node);
    return ((node as RenderedElement).children || []).map(getRenderedText).filter(Boolean).join(" ");
  }

  function renderMarketingCalendarTree(viewMode: "day" | "week" | "4_days" | "schedule") {
    const functionSource = extractNamedFunction(appJsx, "MarketingPlanCalendarScreen");
    expect(functionSource).not.toBe("");
    const rows = [
      { placementId: "timed", contentItemId: "content-timed", publishDate: "2026-09-01", publishTime: "09:00", channel: "facebook", campaignName: "Timed campaign", contentTitle: "Timed row" },
      { placementId: "db-timed", contentItemId: "content-db-timed", publishDate: "2026-09-01", publishTime: "10:00:00", channel: "facebook", campaignName: "DB timed campaign", contentTitle: "DB timed row" },
      { placementId: "untimed", contentItemId: "content-untimed", publishDate: "2026-09-01", publishTime: null, channel: "facebook", campaignName: "Untimed campaign", contentTitle: "Untimed row" },
      { placementId: "legacy-junk", contentItemId: "content-legacy-junk", publishDate: "2026-09-01", publishTime: "14:00junk", channel: "facebook", campaignName: "Legacy junk campaign", contentTitle: "Legacy junk row" },
      { placementId: "legacy-seconds", contentItemId: "content-legacy-seconds", publishDate: "2026-09-01", publishTime: "14:00:30", channel: "facebook", campaignName: "Legacy seconds campaign", contentTitle: "Legacy seconds row" },
      { placementId: "untimed-next", contentItemId: "content-untimed-next", publishDate: "2026-09-02", publishTime: "", channel: "facebook", campaignName: "Next campaign", contentTitle: "Next untimed row" },
    ];
    const stateSlots: unknown[] = [
      rows,
      "2026-09",
      ["2026-09"],
      "all",
      ["mkt"],
      [],
      viewMode,
      "",
      { status: "live", message: "Live" },
    ];
    let stateIndex = 0;
    const normalize = loadWholeHourNormalizer(appJsx);
    const formatSource = extractNamedFunction(appJsx, "formatMarketingPlanTime");
    const formatTime = vm.runInNewContext(`(${formatSource})`, { normalizeWholeHourTime: normalize });
    const sortSource = extractNamedFunction(appJsx, "sortMarketingPlanCalendarRowsByTime");
    const sortRows = vm.runInNewContext(`(${sortSource})`, { normalizeWholeHourTime: normalize });
    const viewDays = viewMode === "day"
      ? ["2026-09-01"]
      : viewMode === "4_days"
        ? ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]
        : ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
    const sandbox = {
      React: {
        Fragment: "fragment",
        createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props || {}, children }),
      },
      useStateApp(initialValue: unknown) {
        const index = stateIndex++;
        return [index in stateSlots ? stateSlots[index] : typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue, () => undefined];
      },
      useEffectApp: () => undefined,
      window: { dispatchEvent: () => undefined },
      CustomEvent: class {},
      getMarketingPlanCurrentMonthKey: () => "2026-09",
      MARKETING_PLAN_FUNCTION_FILTER_OPTIONS: [{ code: "mkt" }],
      MARKETING_PLAN_CALENDAR_VIEW_OPTIONS: [
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
        { value: "4_days", label: "4 Days" },
        { value: "schedule", label: "Schedule" },
      ],
      MARKETING_PLAN_WORKING_STATUS_OPTIONS: [{ value: "planned", label: "Planned" }],
      MARKETING_PLAN_REFRESH_REASONS: [],
      filterMarketingPlanRowsByFunctions: (input: unknown[]) => input,
      isMarketingPlanPublishableChannel: () => true,
      getMarketingPlanChannelOptions: () => [],
      getMarketingPlanTimelineWindow: () => ({
        days: viewDays.map((key) => ({ key, day: Number(key.slice(-2)), isWeekend: false })),
        monthGroups: [{ label: "Sep 2026" }],
      }),
      getMarketingPlanCalendarViewDays: () => viewDays,
      filterMarketingPlanRows: (input: unknown[]) => input,
      filterMarketingPlanRowsByVisibleCampaignTags: (input: unknown[]) => input,
      sortMarketingPlanCalendarRowsByTime: sortRows,
      normalizeWholeHourTime: normalize,
      getMarketingPlanStatusClass: () => "badge--neutral",
      getMarketingPlanStatusLabel: () => "Planned",
      getMarketingPlanViewStatus: () => "planned",
      getMarketingPlanChannelLabel: () => "Facebook",
      formatMarketingPlanTime: formatTime,
      formatMarketingPlanShortWeekday: (value: string) => value,
      getMarketingPlanMonthLabel: (value: string) => value,
      getMarketingPlanCalendarRangeLabel: () => viewMode,
      MarketingPlanFunctionFilter: () => null,
      Icon: () => null,
    };
    const screen = vm.runInNewContext(`(${functionSource})`, sandbox) as () => RenderedElement;
    return screen();
  }

  function renderWorkingSheetTree(options: {
    rows?: Array<Record<string, unknown>>;
    currentUser?: Record<string, unknown>;
    updatingRowId?: string;
    duplicateSourceRow?: Record<string, unknown> | null;
    duplicateLaunchDate?: string;
    duplicatePublishTime?: string;
    duplicateSameDateConfirmed?: boolean;
    duplicateInFlightContentItemId?: string;
    duplicateGuardActivatedSourceId?: string;
    onStateChange?: (index: number, value: unknown) => void;
    runDuplicate?: (...args: unknown[]) => Promise<Record<string, unknown>>;
    loadTimelineRows?: (...args: unknown[]) => Promise<Array<Record<string, unknown>>>;
    rpc?: (name: string, params: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
    suppressConsoleError?: boolean;
  } = {}) {
    const functionSource = extractNamedFunction(appJsx, "MarketingPlanWorkingSheetScreen");
    expect(functionSource).not.toBe("");
    const rows = options.rows || [];
    const stateSlots: unknown[] = [
      rows,
      "2026-09",
      ["2026-09"],
      false,
      "",
      "",
      "",
      "",
      "",
      [],
      [],
      "",
      {
        campaignName: "",
        productEvent: "",
        launchDate: "",
        publishTime: "",
        assetType: "",
        contentTier: "",
        subPicUserId: "",
        subPicName: "",
        requiresBrief: true,
        details: "",
        channels: [],
        note: "",
      },
      { status: "idle", message: "" },
      options.updatingRowId || "",
      null,
      null,
      { status: "live", message: "Live" },
      options.duplicateSourceRow || null,
      options.duplicateLaunchDate || "",
      options.duplicatePublishTime || "",
      options.duplicateSameDateConfirmed || false,
      options.duplicateInFlightContentItemId || "",
    ];
    let stateIndex = 0;
    const normalizeWholeHour = loadWholeHourNormalizer(appJsx);
    const normalizeWorkingStatus = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "normalizeMarketingPlanWorkingStatus")})`,
      {},
    );
    const getWorkingSheetStatus = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "getMarketingPlanWorkingSheetStatus")})`,
      { normalizeMarketingPlanWorkingStatus: normalizeWorkingStatus },
    );
    const getTierClass = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "getMarketingPlanTierClass")})`,
      {},
    );
    const getWorkingStatusClass = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "getMarketingPlanWorkingStatusClass")})`,
      {},
    );
    const getLegacyPublishTime = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "getMarketingPlanLegacyPublishTimeOption")})`,
      { normalizeWholeHourTime: normalizeWholeHour },
    );
    const getInlineTimeUi = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "getMarketingPlanInlineTimeUi")})`,
      {
        isMarketingPlanNoTagSelection: (channels: unknown) => Array.isArray(channels) && channels.length === 1 && channels[0] === "no_tag",
        normalizeMarketingPlanPublishTimeOption: normalizeWholeHour,
        getMarketingPlanLegacyPublishTimeOption: getLegacyPublishTime,
      },
    );
    const sandbox = {
      React: {
        createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props || {}, children }),
      },
      useStateApp(initialValue: unknown) {
        const index = stateIndex++;
        if (!(index in stateSlots)) stateSlots[index] = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
        return [stateSlots[index], (nextValue: unknown) => {
          stateSlots[index] = typeof nextValue === "function"
            ? (nextValue as (current: unknown) => unknown)(stateSlots[index])
            : nextValue;
          options.onStateChange?.(index, stateSlots[index]);
        }];
      },
      useEffectApp: () => undefined,
      useMemoApp: (factory: () => unknown) => factory(),
      useRefApp: (value: unknown) => ({ current: value }),
      window: {
        FLOWMATE_CURRENT_USER: options.currentUser || { id: "user-a", role: "member" },
        FLOWMATE_MARKETING_CAMPAIGNS: [],
        FLOWMATE_MENTION_USERS: [],
        flowmateSupabase: { rpc: options.rpc || (async () => ({ data: null, error: null })) },
        dispatchEvent: () => undefined,
      },
      console: options.suppressConsoleError ? { ...console, error: () => undefined } : console,
      CustomEvent: class {},
      getMarketingPlanCurrentMonthKey: () => "2026-09",
      getDefaultMarketingPlanWorkingSheetForm: () => stateSlots[12],
      createMarketingWorkingMyTasksPreferenceController: () => ({ setAccount() {}, setLocalValue() {}, invalidateAccount() {} }),
      groupMarketingPlanWorkingSheetRows: (input: unknown[]) => input,
      isMarketingPlanNoTagSelection: (channels: unknown) => Array.isArray(channels) && channels.length === 1 && channels[0] === "no_tag",
      resolveMarketingPlanWorkingRowsView: (input: unknown[]) => ({
        visibleRows: input,
        emptyReason: "No rows match the selected filters.",
        nextValidDateState: { startDate: "", endDate: "", emptyReason: "No rows match the selected filters." },
      }),
      getMarketingPlanMonthLabel: (monthKey: string) => monthKey,
      MARKETING_PLAN_PUBLISH_TIME_OPTIONS: loadGeneratedOptions(appJsx, "MARKETING_PLAN_PUBLISH_TIME_OPTIONS"),
      MARKETING_PLAN_ASSET_TYPES: [],
      MARKETING_PLAN_CONTENT_TIERS: [],
      MARKETING_PLAN_CHANNELS: [],
      MARKETING_PLAN_WORKING_STATUS_OPTIONS: [
        { value: "planned", label: "Planned" },
        { value: "assigned", label: "Assigned" },
        { value: "review", label: "Review" },
        { value: "ready_to_post", label: "Ready to Post" },
        { value: "scheduled", label: "Schedule" },
        { value: "posted", label: "Posted" },
      ],
      getMarketingPlanWorkingSheetStatus: getWorkingSheetStatus,
      getMarketingPlanTierClass: getTierClass,
      getMarketingPlanWorkingStatusClass: getWorkingStatusClass,
      normalizeMarketingPlanPublishTimeOption: normalizeWholeHour,
      getMarketingPlanLegacyPublishTimeOption: getLegacyPublishTime,
      getMarketingPlanInlineTimeUi: getInlineTimeUi,
      canDuplicateMarketingWorkingRow: (() => {
        const source = extractNamedFunction(appJsx, "canDuplicateMarketingWorkingRow");
        return source ? vm.runInNewContext(`(${source})`, {}) : () => false;
      })(),
      createMarketingWorkingDuplicateActionGuard: (() => {
        const source = extractNamedFunction(appJsx, "createMarketingWorkingDuplicateActionGuard");
        if (!source) return () => ({ activate: () => false, cancel: () => true, run: async () => ({ status: "ignored" }) });
        const createGuard = vm.runInNewContext(`(${source})`, {}) as () => {
          activate: (sourceId: string) => boolean;
          cancel: () => boolean;
          run: <T>(sourceId: string, action: () => Promise<T>) => Promise<T | { status: "ignored" }>;
        };
        return () => {
          const guard = createGuard();
          if (options.duplicateGuardActivatedSourceId) guard.activate(options.duplicateGuardActivatedSourceId);
          return guard;
        };
      })(),
      getMarketingWorkingDuplicateDraft: (() => {
        const source = extractNamedFunction(appJsx, "getMarketingWorkingDuplicateDraft");
        return source ? vm.runInNewContext(`(${source})`, {
          normalizeMarketingPlanPublishTimeOption: normalizeWholeHour,
          getMarketingPlanLegacyPublishTimeOption: getLegacyPublishTime,
        }) : () => ({ launchDate: "", publishTime: "" });
      })(),
      runMarketingWorkingRowDuplicate: options.runDuplicate || (async () => ({ status: "unknown", message: "Unknown" })),
      loadMarketingPlanTimelineRows: options.loadTimelineRows || (async () => rows),
      hasMarketingPlanLinkedCreativeRequest: () => false,
      getMarketingPlanChannelLabel: (channel: string) => channel,
      getMarketingPlanChannelAbbrev: (channel: string) => channel.toUpperCase(),
      formatMarketingPlanDate: (date: string) => date,
      MarketingPlanSubPicSearch: () => null,
      Icon: () => null,
      openNativeTimePicker: () => undefined,
      openFlowMateCreativeBriefFromMarketingRow: () => undefined,
    };
    const screen = vm.runInNewContext(`(${functionSource})`, sandbox) as () => RenderedElement;
    return screen();
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function loadDuplicatePermission() {
    const functionSource = extractNamedFunction(appJsx, "canDuplicateMarketingWorkingRow");
    expect(functionSource).not.toBe("");
    if (!functionSource) return null;
    return vm.runInNewContext(`(${functionSource})`, {}) as (
      row: Record<string, unknown> | null,
      currentUser: Record<string, unknown> | null,
    ) => boolean;
  }

  function loadDuplicateDraftBuilder() {
    const functionSource = extractNamedFunction(appJsx, "getMarketingWorkingDuplicateDraft");
    expect(functionSource).not.toBe("");
    if (!functionSource) return null;
    const normalize = loadWholeHourNormalizer(appJsx);
    const getLegacy = vm.runInNewContext(
      `(${extractNamedFunction(appJsx, "getMarketingPlanLegacyPublishTimeOption")})`,
      { normalizeWholeHourTime: normalize },
    );
    return vm.runInNewContext(`(${functionSource})`, {
      normalizeMarketingPlanPublishTimeOption: normalize,
      getMarketingPlanLegacyPublishTimeOption: getLegacy,
    }) as (row: Record<string, unknown>) => { launchDate: string; publishTime: string };
  }

  function loadDuplicateActionGuard() {
    const functionSource = extractNamedFunction(appJsx, "createMarketingWorkingDuplicateActionGuard");
    expect(functionSource).not.toBe("");
    if (!functionSource) return null;
    return vm.runInNewContext(`(${functionSource})`, {}) as () => {
      activate: (sourceId: string) => boolean;
      cancel: () => boolean;
      run: <T>(sourceId: string, action: () => Promise<T>) => Promise<T | { status: "ignored" }>;
      getState: () => { sourceId: string; inFlight: boolean };
    };
  }

  function loadDuplicateRunner() {
    const functionSource = extractNamedFunction(appJsx, "runMarketingWorkingRowDuplicate");
    expect(functionSource).not.toBe("");
    if (!functionSource) return null;
    return vm.runInNewContext(`(${functionSource})`, {
      console: { error: () => undefined },
      isMarketingPlanNoTagSelection: (channels: unknown) => Array.isArray(channels) && channels.length === 1 && channels[0] === "no_tag",
    }) as (
      sourceRow: Record<string, unknown>,
      launchDate: string,
      publishTime: string,
      dependencies: {
        rpc: (name: string, params: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
        refreshRows: () => Promise<Array<Record<string, unknown>>>;
        openBrief: (row: Record<string, unknown>) => void | Promise<void>;
      },
    ) => Promise<{ status: string; contentItemId?: string; message?: string }>;
  }

  function loadCreativeBriefNavigationContract() {
    const openSource = extractNamedFunction(appJsx, "openFlowMateCreativeBriefFromMarketingRow");
    const listenerSource = extractNamedFunction(appJsx, "onSwitchFlowMateProduct");
    expect(openSource).not.toBe("");
    expect(listenerSource).not.toBe("");
    if (!openSource || !listenerSource) return null;
    const listeners = new Map<string, Array<(event: { type: string; detail: Record<string, unknown> }) => void>>();
    const events: Array<{ type: string; detail: Record<string, unknown> }> = [];
    const localStorageValues = new Map<string, string>();
    const sessionStorageValues = new Map<string, string>();
    const testWindow = {
      location: { hash: "#marketing-working" },
      localStorage: { setItem: (key: string, value: string) => localStorageValues.set(key, value) },
      sessionStorage: { setItem: (key: string, value: string) => sessionStorageValues.set(key, value) },
      addEventListener(type: string, listener: (event: { type: string; detail: Record<string, unknown> }) => void) {
        listeners.set(type, [...(listeners.get(type) || []), listener]);
      },
      dispatchEvent(event: { type: string; detail: Record<string, unknown> }) {
        events.push(event);
        for (const listener of listeners.get(event.type) || []) listener(event);
        return true;
      },
    };
    class TestCustomEvent {
      type: string;
      detail: Record<string, unknown>;

      constructor(type: string, init: { detail: Record<string, unknown> }) {
        this.type = type;
        this.detail = init.detail;
      }
    }
    const routeChanges: string[] = [];
    const productChanges: string[] = [];
    const listener = vm.runInNewContext(`(${listenerSource})`, {
      window: testWindow,
      sessionStorage: testWindow.sessionStorage,
      TITLE_MAP: { create: "Create" },
      setActiveProduct: (value: string) => productChanges.push(value),
      setRoute: (value: string) => routeChanges.push(value),
    }) as (event: { type: string; detail: Record<string, unknown> }) => void;
    const openBrief = vm.runInNewContext(`(${openSource})`, {
      window: testWindow,
      CustomEvent: TestCustomEvent,
      createFlowMateDraftFromMarketingPlanRow: (row: Record<string, unknown>) => ({ sourceId: row.contentItemId }),
    }) as (row: Record<string, unknown>) => void;
    return { testWindow, listener, events, localStorageValues, sessionStorageValues, routeChanges, productChanges, openBrief };
  }

  function loadPreferenceFunctions(flowmateSupabase: unknown) {
    const loadSource = extractNamedFunction(appJsx, "loadMarketingWorkingMyTasksPreference");
    const saveSource = extractNamedFunction(appJsx, "saveMarketingWorkingMyTasksPreference");
    expect(loadSource).not.toBe("");
    expect(saveSource).not.toBe("");
    if (!loadSource || !saveSource) return null;
    return {
      load: vm.runInNewContext(`(${loadSource})`, { window: { flowmateSupabase } }) as (userId?: string) => Promise<boolean>,
      save: vm.runInNewContext(`(${saveSource})`, { window: { flowmateSupabase } }) as (userId: string, enabled: boolean) => Promise<void>,
    };
  }

  const workingRows = [
    { id: "pic-boundary", picUserId: "user-a", subPicUserId: "", picName: "Shared Name", publishDate: "2026-09-01", contentTitle: "Alpha launch", channels: ["facebook"] },
    { id: "sub-boundary", picUserId: "user-b", subPicUserId: "user-a", subPicName: "Shared Name", publishDate: "2026-09-15", contentTitle: "Beta launch", channels: ["tiktok"] },
    { id: "same-name-other-id", picUserId: "user-c", subPicUserId: "", picName: "Shared Name", publishDate: "2026-09-30", contentTitle: "Gamma launch", channels: ["facebook"] },
    { id: "unassigned", picUserId: "", subPicUserId: "", publishDate: "2026-09-20", contentTitle: "Delta launch", channels: [] },
  ];

  it("Current Working filters My Tasks by exact PIC or Sub PIC id, including missing-user and same-name cases", () => {
    const filterRows = loadWorkingRowsFilter();

    expect(filterRows(workingRows, { currentUserId: "user-a", myTasksOnly: true }).map((row) => row.id)).toEqual([
      "pic-boundary",
      "sub-boundary",
    ]);
    expect(filterRows(workingRows, { currentUserId: "", myTasksOnly: true })).toEqual([]);
  });

  it("Launch Date supports empty, start-only, end-only, inclusive bounds, and rejects an invalid range", () => {
    const filterRows = loadWorkingRowsFilter();

    expect(filterRows(workingRows, {}).map((row) => row.id)).toEqual(workingRows.map((row) => row.id));
    expect(filterRows(workingRows, { startDate: "2026-09-15" }).map((row) => row.id)).toEqual([
      "sub-boundary",
      "same-name-other-id",
      "unassigned",
    ]);
    expect(filterRows(workingRows, { endDate: "2026-09-15" }).map((row) => row.id)).toEqual([
      "pic-boundary",
      "sub-boundary",
    ]);
    expect(filterRows(workingRows, { startDate: "2026-09-01", endDate: "2026-09-30" }).map((row) => row.id)).toEqual(
      workingRows.map((row) => row.id),
    );
    expect(filterRows(workingRows, { startDate: "2026-09-30", endDate: "2026-09-01" })).toEqual([]);
  });

  it("Current Working filters combine My Tasks, Launch Date, and existing text search", () => {
    const filterRows = loadWorkingRowsFilter();

    expect(filterRows(workingRows, {
      currentUserId: "user-a",
      myTasksOnly: true,
      startDate: "2026-09-15",
      endDate: "2026-09-30",
      search: "launch",
    }).map((row) => row.id)).toEqual(["sub-boundary"]);
  });

  it("Current Working CSV exports each supplied grouped visible row exactly once with joined Channels and N/A", () => {
    const downloads: Array<{ filename: string; headers: string[]; rows: string[][] }> = [];
    const exportRows = loadCsvExporter(downloads);
    const groupedVisibleRows = [
      {
        contentItemId: "group-a",
        monthKey: "2026-09",
        campaignName: "Campaign A",
        contentTeam: "Brand",
        contentTitle: "Hero post",
        format: "Banner",
        contentTier: "S",
        picName: "Alice",
        subPicName: "Bob",
        channels: ["facebook", "tiktok"],
        publishDate: "2026-09-10",
        publishTime: "11:00",
        placementStatus: "ready_to_post",
        placementNote: "Grouped note",
      },
      {
        contentItemId: "group-b",
        monthKey: "2026-10",
        campaignName: "Campaign B",
        contentTitle: "Clip",
        channels: [],
        publishDate: "2026-10-02",
        publishTime: "",
        placementStatus: "planned",
      },
    ];

    expect(exportRows(groupedVisibleRows, "2099-01")).toBe(2);
    expect(downloads).toEqual([{
      filename: "marketing-plan-2099-01-current-working.csv",
      headers: ["Month", "Campaign", "Team", "Product / Event", "Format", "Tier", "PIC", "Sub PIC", "Channels", "Launch Date / Deadline", "Publish Time", "Marketing Status", "Note"],
      rows: [
        ["Sep 2026", "Campaign A", "Brand", "Hero post", "Banner", "S", "Alice", "Bob", "Facebook | TikTok", "2026-09-10", "11:00", "Ready to Post", "Grouped note"],
        ["Oct 2026", "Campaign B", "", "Clip", "", "", "", "", "", "2026-10-02", "N/A", "Planned", ""],
      ],
    }]);
  });

  it("My Tasks preference client defaults missing data off and uses the account-scoped select/upsert contract", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    let readResult: { data: unknown; error: unknown } = { data: null, error: null };
    let writeResult: { error: unknown } = { error: null };
    const query = {
      select: (...args: unknown[]) => { calls.push(["select", ...args]); return query; },
      eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return query; },
      maybeSingle: async () => { calls.push(["maybeSingle"]); return readResult; },
      upsert: async (...args: unknown[]) => { calls.push(["upsert", ...args]); return writeResult; },
    };
    const flowmateSupabase = {
      from: (table: string) => { calls.push(["from", table]); return query; },
    };
    const preferences = loadPreferenceFunctions(flowmateSupabase);
    if (!preferences) return;

    expect(await preferences.load()).toBe(false);
    expect(calls).toEqual([]);
    expect(await preferences.load("user-a")).toBe(false);
    expect(calls).toEqual([
      ["from", "user_ui_preferences"],
      ["select", "marketing_working_my_tasks"],
      ["eq", "user_id", "user-a"],
      ["maybeSingle"],
    ]);

    calls.length = 0;
    readResult = { data: { marketing_working_my_tasks: true }, error: null };
    expect(await preferences.load("user-b")).toBe(true);
    calls.length = 0;
    await preferences.save("user-b", 1 as unknown as boolean);
    expect(calls).toEqual([
      ["from", "user_ui_preferences"],
      ["upsert", { user_id: "user-b", marketing_working_my_tasks: true }, { onConflict: "user_id" }],
    ]);

    const readError = new Error("read failed");
    readResult = { data: null, error: readError };
    await expect(preferences.load("user-c")).rejects.toBe(readError);
    const writeError = new Error("write failed");
    writeResult = { error: writeError };
    await expect(preferences.save("user-c", false)).rejects.toBe(writeError);
  });

  it("My Tasks ignores a stale preference read success after a newer local toggle", async () => {
    const read = deferred<boolean>();
    const values: boolean[] = [];
    const messages: string[] = [];
    const controller = loadPreferenceController({
      loadPreference: () => read.promise,
      savePreference: async () => undefined,
      onValue: (value: boolean) => values.push(value),
      onMessage: (message: string) => messages.push(message),
    });

    const loading = controller.setAccount("user-a");
    expect(values).toEqual([false]);
    await controller.setLocalValue(true);
    read.resolve(false);
    await loading;

    expect(values).toEqual([false, true]);
    expect(messages).toEqual(["", ""]);
  });

  it("My Tasks ignores a stale preference read failure after a newer local toggle", async () => {
    const read = deferred<boolean>();
    const values: boolean[] = [];
    const messages: string[] = [];
    const controller = loadPreferenceController({
      loadPreference: () => read.promise,
      savePreference: async () => undefined,
      onValue: (value: boolean) => values.push(value),
      onMessage: (message: string) => messages.push(message),
    });

    const loading = controller.setAccount("user-a");
    expect(values).toEqual([false]);
    await controller.setLocalValue(true);
    read.reject(new Error("stale read failed"));
    await loading;

    expect(values).toEqual([false, true]);
    expect(messages).toEqual(["", ""]);
  });

  it("My Tasks shows exact current-account read and write warnings", async () => {
    const loadWarning = "My Tasks preference could not be loaded. It is off for this account.";
    const activeWriteWarning = "My Tasks is active, but the preference could not be saved.";
    const inactiveWriteWarning = "My Tasks preference could not be saved.";
    const read = deferred<boolean>();
    const readValues: boolean[] = [];
    const readMessages: string[] = [];
    const readController = loadPreferenceController({
      loadPreference: () => read.promise,
      savePreference: async () => undefined,
      onValue: (value: boolean) => readValues.push(value),
      onMessage: (message: string) => readMessages.push(message),
    });
    const loading = readController.setAccount("user-a");
    read.reject(new Error("current read failed"));
    await loading;
    expect(readValues).toEqual([false, false]);
    expect(readMessages).toEqual(["", loadWarning]);

    for (const { loadedValue, nextValue, warning } of [
      { loadedValue: false, nextValue: true, warning: activeWriteWarning },
      { loadedValue: true, nextValue: false, warning: inactiveWriteWarning },
    ]) {
      const write = deferred<void>();
      const messages: string[] = [];
      const controller = loadPreferenceController({
        loadPreference: async () => loadedValue,
        savePreference: () => write.promise,
        onValue: () => undefined,
        onMessage: (message: string) => messages.push(message),
      });
      await controller.setAccount("user-a");
      const saving = controller.setLocalValue(nextValue);
      await Promise.resolve();
      write.reject(new Error("current write failed"));
      await saving;
      expect(messages).toEqual(["", "", warning]);
    }
  });

  it("My Tasks ignores account A read and write failures after switching to account B", async () => {
    const readA = deferred<boolean>();
    const readB = deferred<boolean>();
    const writeA = deferred<void>();
    const values: boolean[] = [];
    const messages: string[] = [];
    const controller = loadPreferenceController({
      loadPreference: (userId: string) => userId === "user-a" ? readA.promise : readB.promise,
      savePreference: () => writeA.promise,
      onValue: (value: boolean) => values.push(value),
      onMessage: (message: string) => messages.push(message),
    });

    const loadingA = controller.setAccount("user-a");
    const savingA = controller.setLocalValue(true);
    const loadingB = controller.setAccount("user-b");
    readA.reject(new Error("account A read failed"));
    writeA.reject(new Error("account A write failed"));
    readB.resolve(true);
    await Promise.all([loadingA, savingA, loadingB]);

    expect(values).toEqual([false, true, false, true]);
    expect(messages).toEqual(["", "", ""]);
    expect(messages).not.toContain("My Tasks preference could not be loaded. It is off for this account.");
    expect(messages).not.toContain("My Tasks is active, but the preference could not be saved.");
    expect(messages).not.toContain("My Tasks preference could not be saved.");
  });

  it("My Tasks serializes rapid writes so the last local action is stored last", async () => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    const writes: Array<{ userId: string; enabled: boolean }> = [];
    const controller = loadPreferenceController({
      loadPreference: async () => false,
      savePreference: (userId: string, enabled: boolean) => {
        writes.push({ userId, enabled });
        return writes.length === 1 ? firstWrite.promise : secondWrite.promise;
      },
      onValue: () => undefined,
      onMessage: () => undefined,
    });

    await controller.setAccount("user-a");
    const saveOn = controller.setLocalValue(true);
    const saveOff = controller.setLocalValue(false);
    await Promise.resolve();
    expect(writes).toEqual([{ userId: "user-a", enabled: true }]);
    firstWrite.resolve();
    await saveOn;
    await Promise.resolve();
    expect(writes).toEqual([
      { userId: "user-a", enabled: true },
      { userId: "user-a", enabled: false },
    ]);
    secondWrite.resolve();
    await saveOff;
  });

  it("Launch Date invalid range reapplies last valid bounds and reason to current rows, account, My Tasks, and search", () => {
    const resolveView = loadWorkingRowsView();
    expect(resolveView([], {
      currentUserId: "user-a",
      myTasksOnly: true,
      startDate: "",
      endDate: "",
      search: "",
    }).emptyReason).toBe("No tasks are assigned to you in this month.");
    expect(resolveView([{ id: "outside", publishDate: "2026-10-01", channels: [] }], {
      currentUserId: "user-a",
      myTasksOnly: false,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      search: "",
    }).emptyReason).toBe("No tasks match the selected Launch Date / Deadline range.");
    const valid = resolveView(workingRows, {
      currentUserId: "user-a",
      myTasksOnly: true,
      startDate: "2026-09-01",
      endDate: "2026-09-15",
      search: "missing",
    });
    expect(valid.visibleRows).toEqual([]);
    expect(valid.emptyReason).toBe("No rows match the selected filters.");

    const currentMonthRows = [
      { id: "current-match", picUserId: "user-b", publishDate: "2026-09-10", contentTitle: "Current launch", channels: [] },
      { id: "old-account", picUserId: "user-a", publishDate: "2026-09-10", contentTitle: "Current launch", channels: [] },
      { id: "outside-last-valid-date", picUserId: "user-b", publishDate: "2026-09-20", contentTitle: "Current launch", channels: [] },
    ];
    const invalid = resolveView(currentMonthRows, {
      currentUserId: "user-b",
      myTasksOnly: true,
      startDate: "2026-09-30",
      endDate: "2026-09-01",
      search: "current",
    }, valid.nextValidDateState);

    expect(invalid.visibleRows.map((row) => row.id)).toEqual(["current-match"]);
    expect(invalid.emptyReason).toBe("No rows match the selected filters.");
    expect(invalid.nextValidDateState).toEqual(valid.nextValidDateState);
  });

  it("Current Working filters render the approved toolbar order, Clear scope, status text, and empty states", () => {
    const toolbarStart = workingSource.indexOf('className: "marketing-working-filters"');
    const toolbarEnd = workingSource.indexOf('className: "marketing-working-active-filters"', toolbarStart);
    const toolbar = workingSource.slice(toolbarStart, toolbarEnd);
    const orderedMarkers = [
      '"aria-label": "Month"',
      'className: `btn btn--secondary marketing-working-my-tasks',
      'className: "field marketing-working-filter-field marketing-working-start-date"',
      'className: "field marketing-working-filter-field marketing-working-end-date"',
      '"data-testid": "working-search"',
      '"data-testid": "working-filter-reset"',
      '"data-testid": "working-export"',
      '"data-testid": "working-row-count"',
    ];
    let previousIndex = -1;
    for (const marker of orderedMarkers) {
      const markerIndex = toolbar.indexOf(marker);
      expect(markerIndex, marker).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }

    expect(toolbar).toContain('"aria-pressed": myTasksOnly');
    expect(toolbar).toContain('myTasksOnly && React.createElement("span", null, "✓")');
    expect(toolbar).toContain('type: "date"');
    expect(toolbar).toContain('aria-describedby');
    expect(toolbar).toContain('}, "Showing ", visibleRows.length, " rows")');
    expect(workingSource).toContain("resolveMarketingPlanWorkingRowsView");
    expect(workingSource).toContain("exportMarketingPlanRowsCsv(visibleRows, selectedMonth)");

    const clearStart = workingSource.indexOf("function clearWorkingFilters");
    const clearEnd = workingSource.indexOf("function handleWorkingRowTimeChange", clearStart);
    const clearSource = workingSource.slice(clearStart, clearEnd);
    expect(clearSource).toContain('setWorkingStartDate("")');
    expect(clearSource).toContain('setWorkingEndDate("")');
    expect(clearSource).toContain('setWorkingDateError("")');
    expect(clearSource).toContain('setWorkingSearch("")');
    expect(clearSource).not.toContain("setSelectedMonth");
    expect(clearSource).not.toContain("setMyTasksOnly");
  });

  it("Current Working renders its row count as a polite live region", () => {
    const tree = renderWorkingSheetTree();
    const rowCount = findRenderedElement(tree, (element) => element.props["data-testid"] === "working-row-count");

    expect(rowCount).toBeDefined();
    expect(rowCount?.props["aria-live"]).toBe("polite");
    expect(rowCount?.children).toEqual(["Showing ", 0, " rows"]);
  });

  it("keeps Month and replaces four Current Working dropdowns with My Tasks and Launch Date range", () => {
    expect(workingSource).toContain('"aria-label": "Month"');
    expect(workingSource).toContain("aria-pressed");
    expect(workingSource).toContain("marketing-working-start-date");
    expect(workingSource).toContain("marketing-working-end-date");
    expect(workingSource).toContain("marketing-working-my-tasks");
    const toolbarStart = workingSource.indexOf('"data-testid": "working-filters"');
    const toolbarEnd = workingSource.indexOf('"data-testid": "working-search"');
    expect(toolbarStart).toBeGreaterThanOrEqual(0);
    expect(toolbarEnd).toBeGreaterThan(toolbarStart);
    const currentWorkingToolbar = workingSource.slice(toolbarStart, toolbarEnd);
    for (const obsoleteControl of ["working-channel", "working-status", "working-team", "working-owner"]) {
      expect(currentWorkingToolbar).not.toContain(obsoleteControl);
    }
    expect(workingSource).toContain("getMarketingPlanTierClass(row.contentTier)");
    expect(workingSource).toContain("getMarketingPlanWorkingStatusClass(rowStatusValue)");
  });

  it("matches My Tasks by PIC or Sub PIC user id and never by display name", () => {
    expect(workingSource).toContain("row.picUserId === currentUser.id");
    expect(workingSource).toContain("row.subPicUserId === currentUser.id");
    expect(workingSource).toContain("marketing-working-my-tasks");
    expect(workingSource).not.toContain("row.picName === currentUser.name");
    expect(workingSource).not.toContain("row.subPicName === currentUser.name");
  });

  it("uses N/A plus every whole hour from 00:00 through 23:00", () => {
    const expected = [
      { value: "", label: "N/A" },
      ...Array.from({ length: 24 }, (_, hour) => {
        const value = `${String(hour).padStart(2, "0")}:00`;
        return { value, label: value };
      }),
    ];
    const marketingOptions = loadGeneratedOptions(appJsx, "MARKETING_PLAN_PUBLISH_TIME_OPTIONS");
    const creativeOptions = loadGeneratedOptions(createScreenJsx, "FLOWMATE_PUBLISH_TIME_OPTIONS");

    expect(marketingOptions).toEqual(expected);
    expect(creativeOptions).toEqual(expected);
    expect(marketingOptions).toHaveLength(25);
    expect(new Set(marketingOptions.map((option) => option.value)).size).toBe(25);
    expect(marketingOptions[1]).toEqual({ value: "00:00", label: "00:00" });
    expect(marketingOptions.at(-1)).toEqual({ value: "23:00", label: "23:00" });
  });

  it("normalizes the complete nullable whole-hour Publish Time and preserves rejected legacy values", () => {
    for (const [source, legacyFunctionName] of [
      [appJsx, "getMarketingPlanLegacyPublishTimeOption"],
      [createScreenJsx, "getFlowMateLegacyPublishTimeOption"],
    ] as const) {
      const normalize = loadWholeHourNormalizer(source);
      expect(normalize(null)).toBe("");
      expect(normalize("")).toBe("");
      expect(normalize(" 14:00:00 ")).toBe("14:00");
      expect(normalize("00:00")).toBe("00:00");
      expect(normalize("23:00")).toBe("23:00");
      for (const invalid of ["24:00", "14:30", "14:00:30", "14:00junk", "14:00:00junk", "9:00", "1400", "bad"]) {
        expect(normalize(invalid), invalid).toBe("");
      }
      const legacySource = extractNamedFunction(source, legacyFunctionName);
      const getLegacy = vm.runInNewContext(`(${legacySource})`, {
        normalizeWholeHourTime: normalize,
        formatMarketingPlanTime: (value: unknown) => value ? String(value).trim().slice(0, 5) : "N/A",
      }) as (value: unknown) => string;
      expect(getLegacy("14:00:00")).toBe("");
      expect(getLegacy("14:00:30")).toBe("14:00:30");
      expect(getLegacy("14:00junk")).toBe("14:00junk");
    }
  });

  it("keeps nullable Publish Time defaults, validation, null sync, and legacy visibility", () => {
    const marketingDefaultSource = extractNamedFunction(appJsx, "getDefaultMarketingPlanWorkingSheetForm");
    const creativeDefaultSource = extractNamedFunction(createScreenJsx, "getDefaultCreativeDraft");
    const saveSource = workingSource.slice(
      workingSource.indexOf("async function handleSaveWorkingSheetRow"),
      workingSource.indexOf("async function handleWorkingRowTimeChange"),
    );
    const creativeValidationSource = extractNamedFunction(createScreenJsx, "getFlowMateCreateValidationErrors");
    const updateTimeSource = extractNamedFunction(appJsx, "updateMarketingPlanWorkingSheetTime");
    const syncSource = extractNamedFunction(appJsx, "syncMarketingPlanLinkedFlowMateSchedule");
    const marketingLegacySource = extractNamedFunction(appJsx, "getMarketingPlanLegacyPublishTimeOption");
    const creativeLegacySource = extractNamedFunction(createScreenJsx, "getFlowMateLegacyPublishTimeOption");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(marketingDefaultSource).toContain('publishTime: ""');
    expect(creativeDefaultSource).toContain('publishTime: ""');
    expect(saveSource).not.toContain('["publishTime", "Time is required."]');
    expect(saveSource).toContain('publishTime: ""');
    expect(creativeValidationSource).not.toContain('requireTime("publishTime"');
    expect(creativeValidationSource).toContain("normalizeWholeHourTime(row.publishTime)");
    expect(creativeValidationSource).toContain("Publish Time must be N/A or a whole hour.");
    expect(updateTimeSource).toContain("p_publish_time: normalizedTime || null");
    expect(syncSource).toContain("p_publish_time: effectivePublishTime");
    expect(marketingLegacySource).not.toBe("");
    expect(creativeLegacySource).not.toBe("");
    expect(workingSource).toContain("getMarketingPlanLegacyPublishTimeOption(row.publishTime)");
    expect(workingSource).toContain("disabled: true");
    expect(createScreenJsx).toContain("getFlowMateLegacyPublishTimeOption(value.publishTime)");
    expect(creativeFormSource).toContain("disabled>{legacyPublishTime}</option>");
    expect(createScreenJsx).not.toContain('Publish Time <span className="req">*</span>');
  });

  it("Creative Request No Tag disables publishing-only inputs and uses the exact helper copy", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(createScreenJsx).toContain("function isFlowMateNoTagDraft(draft)");
    expect(creativeFormSource).toContain("const isNoTag = isFlowMateNoTagDraft(value);");
    expect(creativeFormSource).toContain("disabled={isNoTag}");
    expect(creativeFormSource.match(/Not required for No Tag/g) || []).toHaveLength(2);
  });

  it("resets Creative Request Publish Time before normal success and fallback Create another paths", () => {
    const resetSource = extractNamedFunction(createScreenJsx, "resetSubmittedDraft");
    expect(resetSource).not.toBe("");
    let creativeDraft: Record<string, unknown> = { publishTime: "21:00" };
    const resetSubmittedDraft = vm.runInNewContext(`(${resetSource})`, {
      mode: "creative",
      setQuickDraft: () => undefined,
      setCreativeDraft: (nextDraft: Record<string, unknown>) => { creativeDraft = nextDraft; },
      normalizeFlowMateQuickDraft: (draft: Record<string, unknown>) => draft,
      getDefaultQuickDraft: () => ({ title: "", publishTime: "" }),
      withCreativeDraftTitle: (draft: Record<string, unknown>) => draft,
      getDefaultCreativeDraft: () => ({ title: "", publishTime: "" }),
    }) as () => void;

    resetSubmittedDraft();
    expect(creativeDraft.publishTime).toBe("");

    const submitSource = createScreenJsx.slice(
      createScreenJsx.indexOf("async function handleSubmit()"),
      createScreenJsx.indexOf("if (submitted) return"),
    );
    const clearIndex = submitSource.indexOf("clearFlowMateCreateDraft(mode)");
    const resetIndex = submitSource.indexOf("resetSubmittedDraft();", clearIndex);
    expect(resetIndex).toBeGreaterThan(clearIndex);
    expect(resetIndex).toBeLessThan(submitSource.indexOf("if (nextResult.warning)"));
    expect(resetIndex).toBeLessThan(submitSource.indexOf("await openCreatedDetail(created, nextResult.id)"));
  });

  it("renders per-day Time not set sections after timed rows in Day, Week, and 4 Days Calendar modes", () => {
    for (const viewMode of ["day", "week", "4_days"] as const) {
      const tree = renderMarketingCalendarTree(viewMode);
      const grid = findRenderedElement(tree, (element) => element.props.className === "marketing-calendar-time-grid");
      expect(grid, viewMode).toBeDefined();
      const gridText = getRenderedText(grid);
      expect(gridText.indexOf("Timed row"), viewMode).toBeGreaterThanOrEqual(0);
      expect(gridText.indexOf("DB timed row"), viewMode).toBeGreaterThan(gridText.indexOf("Timed row"));
      expect(gridText.indexOf("Time not set"), viewMode).toBeGreaterThan(gridText.indexOf("DB timed row"));
      expect(gridText.indexOf("Untimed row"), viewMode).toBeGreaterThan(gridText.indexOf("Time not set"));

      const firstDayUntimed = findRenderedElements(grid, (element) => (
        String(element.props.className || "").includes("marketing-calendar-time-grid__time-not-set")
        && element.props["data-date"] === "2026-09-01"
      ))[0];
      expect(getRenderedText(firstDayUntimed), viewMode).toContain("Untimed row");
      expect(getRenderedText(firstDayUntimed), viewMode).toContain("Legacy junk row");
      expect(getRenderedText(firstDayUntimed), viewMode).toContain("14:00junk");
      expect(getRenderedText(firstDayUntimed), viewMode).toContain("Legacy seconds row");
      expect(getRenderedText(firstDayUntimed), viewMode).toContain("14:00:30");

      const midnightSlot = findRenderedElements(grid, (element) => element.props.className === "marketing-calendar-time-grid__slot" && element.props.key === "2026-09-01-0")[0];
      expect(getRenderedText(midnightSlot), viewMode).not.toContain("Untimed row");
      const timedSlotsText = getRenderedText(findRenderedElements(grid, (element) => element.props.className === "marketing-calendar-time-grid__slot"));
      expect(timedSlotsText, viewMode).toContain("DB timed row");
      expect(timedSlotsText, viewMode).not.toContain("Legacy junk row");
      expect(timedSlotsText, viewMode).not.toContain("Legacy seconds row");
      expect(findRenderedElements(grid, (element) => String(element.props.className || "").includes("marketing-calendar-time-grid__time-not-set")).length, viewMode).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders Schedule timed rows before Time not set while preserving invalid legacy times", () => {
    const tree = renderMarketingCalendarTree("schedule");
    const schedule = findRenderedElement(tree, (element) => element.props.className === "marketing-calendar-schedule");
    expect(schedule).toBeDefined();
    const scheduleText = getRenderedText(schedule);
    expect(scheduleText.indexOf("Timed row")).toBeGreaterThanOrEqual(0);
    expect(scheduleText.indexOf("DB timed row")).toBeGreaterThan(scheduleText.indexOf("Timed row"));
    expect(scheduleText.indexOf("Time not set")).toBeGreaterThan(scheduleText.indexOf("DB timed row"));

    const timeNotSet = findRenderedElements(schedule, (element) => element.props.className === "marketing-calendar-schedule__time-not-set")[0];
    const timeNotSetText = getRenderedText(timeNotSet);
    expect(timeNotSetText).toContain("Untimed row");
    expect(timeNotSetText).toContain("Legacy junk row");
    expect(timeNotSetText).toContain("14:00junk");
    expect(timeNotSetText).toContain("Legacy seconds row");
    expect(timeNotSetText).toContain("14:00:30");
  });

  it("maps every Tier to a stable semantic class with readable light and dark styling", () => {
    const mapperSource = extractNamedFunction(appJsx, "getMarketingPlanTierClass");
    expect(mapperSource).not.toBe("");
    const getTierClass = vm.runInNewContext(`(${mapperSource})`, {}) as (tier: unknown) => string;
    expect([
      getTierClass("S"), getTierClass(" a "), getTierClass("b"), getTierClass("C"), getTierClass("unknown"),
    ]).toEqual([
      "marketing-tier--s", "marketing-tier--a", "marketing-tier--b", "marketing-tier--c", "",
    ]);

    const foregrounds = { s: "#B42318", a: "#B54708", b: "#175CD3", c: "#475467" };
    for (const [modifier, foreground] of Object.entries(foregrounds)) {
      const lightBlock = extractCssBlock(`.marketing-tier--${modifier}`);
      const darkBlock = extractCssBlock(`html[data-theme="dark"] .marketing-tier--${modifier}`);
      expect(readCssHex(lightBlock, "color"), modifier).toBe(foreground);
      expect(getContrastRatio(readCssHex(lightBlock, "color"), readCssHex(lightBlock, "background")), `${modifier} light`).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(readCssHex(darkBlock, "color"), readCssHex(darkBlock, "background")), `${modifier} dark`).toBeGreaterThanOrEqual(4.5);
    }
    expect(workingSource).toContain("getMarketingPlanTierClass(row.contentTier)");
  });

  it("renders Tier and normalized Working Status semantics in real Current Working rows", () => {
    const tree = renderWorkingSheetTree({
      rows: [
        {
          contentItemId: "managed-row",
          monthKey: "2026-09",
          campaignName: "Managed campaign",
          contentTitle: "Managed item",
          contentTier: "S",
          format: "Banner",
          channels: ["facebook"],
          publishDate: "2026-09-01",
          publishTime: "11:00",
          placementStatus: "planned",
          picUserId: "user-a",
          picName: "User A",
          requiresBrief: false,
        },
        {
          contentItemId: "locked-schedule-row",
          monthKey: "2026-09",
          campaignName: "Locked campaign",
          contentTitle: "Scheduled item",
          contentTier: "A",
          format: "Video",
          channels: ["youtube"],
          publishDate: "2026-09-02",
          publishTime: "",
          placementStatus: "schedule",
          picUserId: "user-b",
          picName: "User B",
          requiresBrief: false,
        },
      ],
      currentUser: { id: "user-a", role: "member" },
    });
    const rows = findRenderedElements(tree, (element) => element.props["data-testid"] === "working-row");
    expect(rows).toHaveLength(2);

    const managedTier = findRenderedElement(rows[0], (element) => String(element.props.className || "").includes("marketing-tier"));
    expect(getRenderedText(managedTier)).toBe("S");
    expect(managedTier?.props.className).toBe("marketing-tier marketing-tier--s");

    const lockedTier = findRenderedElement(rows[1], (element) => String(element.props.className || "").includes("marketing-tier"));
    expect(getRenderedText(lockedTier)).toBe("A");
    expect(lockedTier?.props.className).toBe("marketing-tier marketing-tier--a");

    const statusSelects = rows.map((row) => findRenderedElement(
      row,
      (element) => String(element.props.className || "").includes("marketing-working-status"),
    ));
    expect(statusSelects[0]?.props).toMatchObject({
      value: "planned",
      disabled: false,
      className: "select marketing-working-status marketing-status--planned",
    });
    expect(statusSelects[1]?.props).toMatchObject({
      value: "scheduled",
      disabled: true,
      className: "select marketing-working-status marketing-status--schedule",
    });
    const scheduleOption = findRenderedElements(
      statusSelects[1],
      (element) => element.type === "option" && element.props.value === "scheduled",
    )[0];
    expect(getRenderedText(scheduleOption)).toBe("Schedule");
  });

  it("maps each Working Status colour independently from existing timeline badge semantics", () => {
    const mapperSource = extractNamedFunction(appJsx, "getMarketingPlanWorkingStatusClass");
    expect(mapperSource).not.toBe("");
    const getWorkingStatusClass = vm.runInNewContext(`(${mapperSource})`, {}) as (status: unknown) => string;
    expect([
      getWorkingStatusClass("planned"), getWorkingStatusClass("assigned"), getWorkingStatusClass("review"),
      getWorkingStatusClass("ready"), getWorkingStatusClass("ready_to_post"), getWorkingStatusClass("schedule"),
      getWorkingStatusClass("scheduled"), getWorkingStatusClass("posted"), getWorkingStatusClass("unknown"),
    ]).toEqual([
      "marketing-status--planned", "marketing-status--assigned", "marketing-status--review",
      "marketing-status--ready-to-post", "marketing-status--ready-to-post", "marketing-status--schedule",
      "marketing-status--schedule", "marketing-status--posted", "marketing-status--planned",
    ]);

    const timelineMapperSource = extractNamedFunction(appJsx, "getMarketingPlanStatusClass");
    const normalizeSource = extractNamedFunction(appJsx, "normalizeMarketingPlanWorkingStatus");
    const normalizeStatus = vm.runInNewContext(`(${normalizeSource})`, {});
    const getTimelineStatusClass = vm.runInNewContext(`(${timelineMapperSource})`, {
      normalizeMarketingPlanWorkingStatus: normalizeStatus,
    }) as (status: string) => string;
    expect([
      getTimelineStatusClass("planned"), getTimelineStatusClass("assigned"), getTimelineStatusClass("review"),
      getTimelineStatusClass("ready_to_post"), getTimelineStatusClass("scheduled"), getTimelineStatusClass("posted"),
    ]).toEqual([
      "badge--neutral", "badge--assigned", "badge--review", "badge--assigned", "badge--assigned", "badge--delivered",
    ]);

    const foregrounds = {
      planned: "#475467", assigned: "#175CD3", review: "#B54708",
      "ready-to-post": "#0E7090", schedule: "#6941C6", posted: "#027A48",
    };
    for (const [modifier, foreground] of Object.entries(foregrounds)) {
      const lightBlock = extractCssBlock(`.marketing-status--${modifier}`);
      const darkBlock = extractCssBlock(`html[data-theme="dark"] .marketing-status--${modifier}`);
      expect(readCssHex(lightBlock, "color"), modifier).toBe(foreground);
      expect(getContrastRatio(readCssHex(lightBlock, "color"), readCssHex(lightBlock, "background")), `${modifier} light`).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(readCssHex(darkBlock, "color"), readCssHex(darkBlock, "background")), `${modifier} dark`).toBeGreaterThanOrEqual(4.5);
    }
    expect(workingSource).toContain("getMarketingPlanWorkingStatusClass(rowStatusValue)");
  });

  it("Duplicate action authorizes only required-brief Admin, exact PIC, or exact Sub PIC IDs", () => {
    const canDuplicate = loadDuplicatePermission();
    if (!canDuplicate) return;
    const requiredRow = {
      requiresBrief: true,
      picUserId: "pic-user",
      subPicUserId: "sub-user",
      picName: "Shared Name",
      subPicName: "Shared Name",
    };
    const cases = [
      { label: "Admin", user: { id: "other", role: "admin" }, allowed: true },
      { label: "exact PIC", user: { id: "pic-user", role: "member" }, allowed: true },
      { label: "exact Sub PIC", user: { id: "sub-user", role: "member" }, allowed: true },
      { label: "same display name", user: { id: "other", role: "member", name: "Shared Name" }, allowed: false },
      { label: "schedule operator only", user: { id: "other", role: "member", can_manage_marketing_schedule: true }, allowed: false },
      { label: "missing user", user: null, allowed: false },
    ];
    for (const testCase of cases) {
      expect(canDuplicate(requiredRow, testCase.user), testCase.label).toBe(testCase.allowed);
    }
    expect(canDuplicate({ ...requiredRow, requiresBrief: false }, { id: "pic-user", role: "member" })).toBe(false);
    expect(canDuplicate(null, { id: "pic-user", role: "member" })).toBe(false);
  });

  it("Duplicate Brief draft preserves Launch Date / Deadline, N/A or whole-hour Time, and a visible legacy Time", () => {
    const buildDraft = loadDuplicateDraftBuilder();
    if (!buildDraft) return;
    expect(buildDraft({ publishDate: "2026-09-12", publishTime: null })).toEqual({
      launchDate: "2026-09-12",
      publishTime: "",
    });
    expect(buildDraft({ publishDate: "2026-09-13", publishTime: "14:00:00" })).toEqual({
      launchDate: "2026-09-13",
      publishTime: "14:00",
    });
    expect(buildDraft({ publishDate: "2026-09-14", publishTime: "14:00junk" })).toEqual({
      launchDate: "2026-09-14",
      publishTime: "14:00junk",
    });
  });

  it("Duplicate Brief Create navigation requires synchronous acknowledgment from the real product-switch listener", () => {
    const contract = loadCreativeBriefNavigationContract();
    if (!contract) return;
    expect(() => contract.openBrief({ contentItemId: "created-row" })).toThrow("Create Brief navigation was not handled.");
    expect(contract.events.map((event) => event.type)).toEqual([
      "flowmate:create-draft-updated",
      "flowmate:switch-flowmate-product",
    ]);
    expect(contract.localStorageValues.get("flowmate:create:creativeDraft:v1")).toBe(JSON.stringify({ sourceId: "created-row" }));

    contract.testWindow.addEventListener("flowmate:switch-flowmate-product", contract.listener);
    expect(() => contract.openBrief({ contentItemId: "acknowledged-row" })).not.toThrow();
    const acknowledgedSwitch = contract.events.at(-1);
    expect(acknowledgedSwitch).toMatchObject({
      type: "flowmate:switch-flowmate-product",
      detail: { route: "create", handled: true },
    });
    expect(contract.productChanges).toEqual(["flowmate"]);
    expect(contract.routeChanges).toEqual(["create"]);
    expect(contract.testWindow.location.hash).toBe("create");
    expect(contract.sessionStorageValues.get("flowmate:activeProduct")).toBe("flowmate");
    expect(contract.events.filter((event) => event.type === "flowmate:create-draft-updated")).toHaveLength(2);
  });

  it("renders Duplicate action as a direct authorized Current Working control beside Edit", () => {
    const rows = [
      { contentItemId: "pic-row", monthKey: "2026-09", campaignName: "Campaign A", contentTitle: "PIC row", publishDate: "2026-09-10", publishTime: "11:00", contentTier: "A", channels: ["facebook"], placementStatus: "planned", picUserId: "user-a", requiresBrief: true },
      { contentItemId: "other-row", monthKey: "2026-09", campaignName: "Campaign B", contentTitle: "Other row", publishDate: "2026-09-11", publishTime: "", contentTier: "B", channels: ["tiktok"], placementStatus: "planned", picUserId: "user-b", requiresBrief: true },
      { contentItemId: "no-brief-row", monthKey: "2026-09", campaignName: "Campaign C", contentTitle: "No brief row", publishDate: "2026-09-12", publishTime: "", contentTier: "C", channels: ["facebook"], placementStatus: "planned", picUserId: "user-a", requiresBrief: false },
    ];
    const tree = renderWorkingSheetTree({ rows, currentUser: { id: "user-a", role: "member", can_manage_marketing_schedule: true } });
    const renderedRows = findRenderedElements(tree, (element) => element.props["data-testid"] === "working-row");
    expect(renderedRows).toHaveLength(3);
    const actionGroups = renderedRows.map((row) => findRenderedElement(
      row,
      (element) => String(element.props.className || "").split(/\s+/).includes("marketing-working-actions"),
    ));
    const buttons = actionGroups.map((group) => findRenderedElements(group, (element) => element.type === "button"));
    expect(buttons[0].map(getRenderedText)).toContain("Edit");
    expect(buttons[0].map(getRenderedText)).toContain("Duplicate");
    expect(buttons[0].find((button) => getRenderedText(button) === "Duplicate")?.props.className)
      .toContain("marketing-working-duplicate");
    expect(buttons[1].map(getRenderedText)).not.toContain("Duplicate");
    expect(buttons[2].map(getRenderedText)).not.toContain("Duplicate");
  });

  it("Duplicate Brief modal renders accessible context, prefills legacy Time, and gates same-date creation", () => {
    const sourceRow = {
      contentItemId: "source-row",
      monthKey: "2026-09",
      campaignName: "Tournament campaign",
      contentTitle: "Fixture post",
      publishDate: "2026-09-18",
      publishTime: "14:00junk",
      contentTier: "A",
      channels: ["facebook"],
      placementStatus: "planned",
      picUserId: "user-a",
      requiresBrief: true,
    };
    const tree = renderWorkingSheetTree({
      rows: [sourceRow],
      duplicateSourceRow: sourceRow,
      duplicateLaunchDate: "2026-09-18",
      duplicatePublishTime: "14:00junk",
      duplicateSameDateConfirmed: false,
    });
    const dialog = findRenderedElement(tree, (element) => element.props.role === "dialog");
    expect(dialog?.props).toMatchObject({ role: "dialog", "aria-modal": "true", "aria-labelledby": "marketing-working-duplicate-title" });
    expect(getRenderedText(dialog)).toContain("Duplicate Brief");
    expect(getRenderedText(dialog)).toContain("Tournament campaign");
    expect(getRenderedText(dialog)).toContain("Fixture post");
    expect(getRenderedText(dialog)).toContain("A new Working Sheet row will be created without the previous Brief Link.");
    const dateInput = findRenderedElement(dialog, (element) => element.props["data-testid"] === "marketing-working-duplicate-date");
    expect(dateInput?.props).toMatchObject({ type: "date", value: "2026-09-18", autoFocus: true });
    const timeSelect = findRenderedElement(dialog, (element) => element.props["data-testid"] === "marketing-working-duplicate-time");
    expect(timeSelect?.props.value).toBe("14:00junk");
    const legacyOption = findRenderedElement(timeSelect, (element) => element.type === "option" && element.props.value === "14:00junk");
    expect(legacyOption?.props.disabled).toBe(true);
    expect(getRenderedText(legacyOption)).toBe("14:00junk");
    const timeOptions = findRenderedElements(timeSelect, (element) => element.type === "option");
    expect(timeOptions.map((option) => option.props.value)).toEqual([
      "14:00junk", "", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00",
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
      "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
    ]);
    const confirmation = findRenderedElement(dialog, (element) => element.props["data-testid"] === "marketing-working-duplicate-same-date");
    expect(confirmation?.props).toMatchObject({ type: "checkbox", checked: false });
    const createButton = findRenderedElement(dialog, (element) => element.type === "button" && getRenderedText(element) === "Create Duplicate");
    expect(createButton?.props.disabled).toBe(true);

    const confirmedTree = renderWorkingSheetTree({
      rows: [sourceRow],
      duplicateSourceRow: sourceRow,
      duplicateLaunchDate: "2026-09-18",
      duplicatePublishTime: "14:00",
      duplicateSameDateConfirmed: true,
    });
    const confirmedDialog = findRenderedElement(confirmedTree, (element) => element.props.role === "dialog");
    const confirmedCreate = findRenderedElement(confirmedDialog, (element) => element.type === "button" && getRenderedText(element) === "Create Duplicate");
    expect(confirmedCreate?.props.disabled).toBe(false);
  });

  it("Duplicate Brief modal blocks close, backdrop, Escape, and repeated actions while in flight", () => {
    const sourceRow = {
      contentItemId: "source-row",
      monthKey: "2026-09",
      campaignName: "Campaign",
      contentTitle: "Asset",
      publishDate: "2026-09-18",
      publishTime: "11:00",
      contentTier: "A",
      channels: ["facebook"],
      placementStatus: "planned",
      picUserId: "user-a",
      requiresBrief: true,
    };
    const stateChanges: Array<{ index: number; value: unknown }> = [];
    const tree = renderWorkingSheetTree({
      rows: [sourceRow],
      duplicateSourceRow: sourceRow,
      duplicateLaunchDate: "2026-09-18",
      duplicatePublishTime: "11:00",
      duplicateSameDateConfirmed: true,
      duplicateInFlightContentItemId: "source-row",
      onStateChange: (index, value) => stateChanges.push({ index, value }),
    });
    const dialog = findRenderedElement(tree, (element) => element.props.role === "dialog");
    const backdrop = findRenderedElement(tree, (element) => String(element.props.className || "").split(/\s+/).includes("marketing-working-duplicate-backdrop"));
    const closeButton = findRenderedElement(dialog, (element) => element.props["aria-label"] === "Close Duplicate Brief dialog");
    const cancelButton = findRenderedElement(dialog, (element) => element.type === "button" && getRenderedText(element) === "Cancel");
    const createButton = findRenderedElement(dialog, (element) => element.type === "button" && getRenderedText(element) === "Duplicating...");
    expect(closeButton?.props.disabled).toBe(true);
    expect(cancelButton?.props.disabled).toBe(true);
    expect(createButton?.props.disabled).toBe(true);
    (backdrop?.props.onMouseDown as (() => void))();
    (dialog?.props.onKeyDown as ((event: Record<string, unknown>) => void))({
      key: "Escape",
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    });
    expect(stateChanges).toEqual([]);
  });

  it("Duplicate action guard blocks rapid submits, waits through refresh, and requires a new row action to retry", async () => {
    const createGuard = loadDuplicateActionGuard();
    if (!createGuard) return;
    const guard = createGuard();
    const refreshGate = deferred<void>();
    let calls = 0;
    expect(guard.activate("source-row")).toBe(true);
    const first = guard.run("source-row", async () => {
      calls += 1;
      await refreshGate.promise;
      return { status: "unknown" as const };
    });
    const rapidSecond = await guard.run("source-row", async () => {
      calls += 1;
      return { status: "unexpected" as const };
    });
    expect(rapidSecond).toEqual({ status: "ignored" });
    expect(calls).toBe(1);
    expect(guard.getState()).toEqual({ sourceId: "source-row", inFlight: true });
    expect(guard.cancel()).toBe(false);
    refreshGate.resolve();
    expect(await first).toEqual({ status: "unknown" });
    expect(guard.getState()).toEqual({ sourceId: "", inFlight: false });
    expect(await guard.run("source-row", async () => ({ status: "unexpected" }))).toEqual({ status: "ignored" });
    expect(guard.activate("source-row")).toBe(true);
  });

  it("Duplicate submit cleanup belongs only to the guard-acquired invocation from the same rendered closure", async () => {
    const sourceRow = {
      contentItemId: "source-row",
      monthKey: "2026-09",
      campaignName: "Campaign",
      contentTitle: "Asset",
      publishDate: "2026-09-18",
      publishTime: "11:00",
      contentTier: "A",
      channels: ["facebook"],
      placementStatus: "planned",
      picUserId: "user-a",
      requiresBrief: true,
    };
    const resultGate = deferred<Record<string, unknown>>();
    const stateChanges: Array<{ index: number; value: unknown }> = [];
    let duplicateCalls = 0;
    const tree = renderWorkingSheetTree({
      rows: [sourceRow],
      duplicateSourceRow: sourceRow,
      duplicateLaunchDate: "2026-09-19",
      duplicatePublishTime: "11:00",
      duplicateSameDateConfirmed: false,
      duplicateGuardActivatedSourceId: "source-row",
      runDuplicate: async () => {
        duplicateCalls += 1;
        return resultGate.promise;
      },
      onStateChange: (index, value) => stateChanges.push({ index, value }),
    });
    const form = findRenderedElement(tree, (element) => element.type === "form" && element.props.role === "dialog");
    const submit = form?.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>;
    const first = submit({ preventDefault: () => undefined });
    const second = submit({ preventDefault: () => undefined });
    await second;

    expect(duplicateCalls).toBe(1);
    expect(stateChanges.filter((change) => change.index === 22)).toEqual([{ index: 22, value: "source-row" }]);
    expect(stateChanges.filter((change) => [18, 19, 20, 21].includes(change.index))).toEqual([]);

    resultGate.resolve({ status: "opened", contentItemId: "created-row" });
    await first;
    expect(stateChanges.filter((change) => change.index === 22)).toEqual([
      { index: 22, value: "source-row" },
      { index: 22, value: "" },
    ]);
    expect(stateChanges.filter((change) => change.index === 18).at(-1)).toEqual({ index: 18, value: null });
  });

  it("Duplicate Brief behavior uses exact RPC args, returned ID, refreshed row, and empty integration links", async () => {
    const runDuplicate = loadDuplicateRunner();
    if (!runDuplicate) return;
    const events: string[] = [];
    const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const openedRows: Array<Record<string, unknown>> = [];
    const sourceRow = { contentItemId: "source-id", briefLink: "https://old", flowmateWorkItemId: "old-work", campaignName: "Old campaign" };
    const returnedRow = { contentItemId: "new-id", briefLink: "https://unexpected", flowmateWorkItemId: "unexpected-work", flowmateDisplayId: "CR-9999", campaignName: "Fresh campaign", publishDate: "2026-10-02", publishTime: "15:00" };
    const result = await runDuplicate(sourceRow, "2026-10-02", "15:00", {
      rpc: async (name, params) => {
        events.push("rpc");
        rpcCalls.push({ name, params });
        return { data: { content_item_id: "new-id" }, error: null };
      },
      refreshRows: async () => {
        events.push("refresh");
        return [returnedRow];
      },
      openBrief: (row) => {
        events.push("open");
        openedRows.push(row);
      },
    });
    expect(rpcCalls).toEqual([{
      name: "marketing_plan_duplicate_working_row",
      params: { p_source_content_item_id: "source-id", p_launch_date: "2026-10-02", p_publish_time: "15:00" },
    }]);
    expect(events).toEqual(["rpc", "refresh", "open"]);
    expect(result).toEqual({ status: "opened", contentItemId: "new-id" });
    expect(openedRows).toEqual([{
      ...returnedRow,
      briefLink: "",
      flowmateWorkItemId: "",
      flowmateDisplayId: "",
    }]);
    expect(openedRows[0]).not.toMatchObject({ campaignName: "Old campaign" });
  });

  it("Duplicate Brief sends null Publish Time for No Tag rows even if stale time was still present", async () => {
    const runDuplicate = loadDuplicateRunner();
    if (!runDuplicate) return;
    const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];

    await runDuplicate({
      contentItemId: "source-id",
      publishDate: "2026-10-02",
      publishTime: "18:00",
      channels: ["no_tag"],
      channel: "no_tag",
    }, "2026-10-02", "18:00", {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        return { data: { content_item_id: "new-id" }, error: null };
      },
      refreshRows: async () => [{ contentItemId: "new-id", channels: ["no_tag"] }],
      openBrief: () => undefined,
    });

    expect(rpcCalls).toEqual([{
      name: "marketing_plan_duplicate_working_row",
      params: { p_source_content_item_id: "source-id", p_launch_date: "2026-10-02", p_publish_time: null },
    }]);
  });

  it("Duplicate Brief unknown response refreshes before returning and never opens or reconstructs a row", async () => {
    const runDuplicate = loadDuplicateRunner();
    if (!runDuplicate) return;
    const events: string[] = [];
    const result = await runDuplicate({ contentItemId: "source-id", campaignName: "Stale source" }, "2026-10-03", "", {
      rpc: async () => {
        events.push("rpc-error");
        return { data: null, error: { message: "connection lost" } };
      },
      refreshRows: async () => {
        events.push("refresh");
        return [{ contentItemId: "maybe-created" }];
      },
      openBrief: () => {
        events.push("open");
      },
    });
    expect(events).toEqual(["rpc-error", "refresh"]);
    expect(result).toEqual({
      status: "unknown",
      message: "The duplicate result could not be confirmed. Check the refreshed Working Sheet before retrying.",
    });
  });

  it("Duplicate Brief distinguishes a confirmed create with refresh failure and still refreshes unknown RPC outcomes", async () => {
    const runDuplicate = loadDuplicateRunner();
    if (!runDuplicate) return;
    let refreshAttempts = 0;
    const refreshRows = async () => {
      refreshAttempts += 1;
      throw new Error("timeline unavailable");
    };
    const confirmedCreate = await runDuplicate({ contentItemId: "source-id" }, "2026-10-05", "", {
      rpc: async () => ({ data: { content_item_id: "created-row" }, error: null }),
      refreshRows,
      openBrief: () => {
        throw new Error("must not open without a refreshed row");
      },
    });
    expect(confirmedCreate).toEqual({
      status: "created_refresh_failed",
      contentItemId: "created-row",
      message: "The duplicate row was created, but the Working Sheet could not refresh. Refresh the Working Sheet before using Create Brief.",
    });

    const unknownCreate = await runDuplicate({ contentItemId: "source-id" }, "2026-10-06", "", {
      rpc: async () => {
        throw new Error("network outcome unknown");
      },
      refreshRows,
      openBrief: () => {
        throw new Error("must not open");
      },
    });
    expect(refreshAttempts).toBe(2);
    expect(unknownCreate).toEqual({
      status: "unknown",
      message: "The duplicate result could not be confirmed. Check the refreshed Working Sheet before retrying.",
    });
  });

  it("Duplicate submit asks its Working Sheet refresh dependency to propagate load failure truthfully", async () => {
    const runDuplicate = loadDuplicateRunner();
    if (!runDuplicate) return;
    const sourceRow = {
      contentItemId: "source-row",
      monthKey: "2026-09",
      campaignName: "Campaign",
      contentTitle: "Asset",
      publishDate: "2026-09-18",
      publishTime: "11:00",
      contentTier: "A",
      channels: ["facebook"],
      placementStatus: "planned",
      picUserId: "user-a",
      requiresBrief: true,
    };
    const loadOptions: Array<Record<string, unknown>> = [];
    const stateChanges: Array<{ index: number; value: unknown }> = [];
    const tree = renderWorkingSheetTree({
      rows: [sourceRow],
      duplicateSourceRow: sourceRow,
      duplicateLaunchDate: "2026-09-19",
      duplicatePublishTime: "11:00",
      duplicateGuardActivatedSourceId: "source-row",
      runDuplicate: runDuplicate as unknown as (...args: unknown[]) => Promise<Record<string, unknown>>,
      rpc: async () => ({ data: { content_item_id: "created-row" }, error: null }),
      loadTimelineRows: async (_field, _month, options) => {
        loadOptions.push(options as Record<string, unknown>);
        throw new Error("timeline unavailable");
      },
      suppressConsoleError: true,
      onStateChange: (index, value) => stateChanges.push({ index, value }),
    });
    const form = findRenderedElement(tree, (element) => element.type === "form" && element.props.role === "dialog");
    await (form?.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => undefined });

    expect(loadOptions).toEqual([{ force: true, throwOnError: true }]);
    expect(stateChanges.filter((change) => change.index === 11).at(-1)).toEqual({
      index: 11,
      value: "The duplicate row was created, but the Working Sheet could not refresh. Refresh the Working Sheet before using Create Brief.",
    });
  });

  it("Duplicate Brief retains created rows when refreshed lookup or Create Brief navigation fails", async () => {
    const runDuplicate = loadDuplicateRunner();
    if (!runDuplicate) return;
    let refreshCount = 0;
    const notFound = await runDuplicate({ contentItemId: "source-id" }, "2027-01-02", "", {
      rpc: async () => ({ data: { content_item_id: "outside-window" }, error: null }),
      refreshRows: async () => {
        refreshCount += 1;
        return [];
      },
      openBrief: () => {
        throw new Error("must not open");
      },
    });
    expect(notFound).toEqual({
      status: "created_not_found",
      contentItemId: "outside-window",
      message: "The duplicate row was created but is not in the current timeline window. Find it by Launch Date / Deadline before using Create Brief.",
    });

    const openFailed = await runDuplicate({ contentItemId: "source-id" }, "2026-10-04", "", {
      rpc: async () => ({ data: [{ content_item_id: "created-row" }], error: null }),
      refreshRows: async () => {
        refreshCount += 1;
        return [{ contentItemId: "created-row", briefLink: "old", flowmateWorkItemId: "old" }];
      },
      openBrief: () => {
        throw new Error("navigation unavailable");
      },
    });
    expect(refreshCount).toBe(2);
    expect(openFailed).toEqual({
      status: "created_not_opened",
      contentItemId: "created-row",
      message: "The duplicate row was created. Use its Create Brief action from the refreshed Working Sheet.",
    });
  });

  it("keeps Time column and Actions wide enough to avoid clipping", () => {
    const tableBlock = extractCssBlock(".marketing-working-table");
    const timeBlock = extractCssBlock(".marketing-working-table .col-time");
    const actionsBlock = extractCssBlock(".marketing-working-table .col-actions");
    const timeSelectBlock = extractCssBlock(".marketing-working-time-text");
    const actionButtonBlock = extractCssBlock(".marketing-working-actions .btn");

    expect(Number(tableBlock.match(/\bmin-width:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(1420);
    expect(Number(timeBlock.match(/\bwidth:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(96);
    expect(Number(timeBlock.match(/\bmin-width:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(96);
    expect(Number(actionsBlock.match(/\bwidth:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(220);
    expect(Number(actionsBlock.match(/\bmin-width:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(220);
    expect(timeSelectBlock).toMatch(/\bbox-sizing:\s*border-box/);
    expect(timeSelectBlock).toMatch(/\bwidth:\s*100%/);
    expect(Number(timeSelectBlock.match(/\bmin-width:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(72);
    expect(Number(timeSelectBlock.match(/\bpadding-right:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(24);
    expect(timeSelectBlock).toMatch(/\bwhite-space:\s*nowrap/);
    expect(timeSelectBlock).toMatch(/\bfont-variant-numeric:\s*tabular-nums/);
    expect(actionButtonBlock).toMatch(/\bwhite-space:\s*nowrap/);
    const tree = renderWorkingSheetTree();
    const horizontalWrapper = findRenderedElement(
      tree,
      (element) => (element.props.style as Record<string, unknown> | undefined)?.overflowX === "auto",
    );
    const table = findRenderedElement(
      horizontalWrapper,
      (element) => String(element.props.className || "").split(/\s+/).includes("marketing-working-table"),
    );
    expect(horizontalWrapper).toBeDefined();
    expect(table).toBeDefined();
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
    expect(appCss.replace(/\r\n/g, "\n")).toContain(".app__main--product-book {\n  padding: 0 var(--s-6) var(--s-7);");
    expect(appCss).not.toContain("box-shadow: 0 -28px");
    expect(activeEntryHtml).toMatch(/app\.js\?v=[0-9]{8}-[a-f0-9]{6}/);
    expect(activeEntryHtml).not.toContain("v20260709-6");
  });

  it("serves Product Book from a direct GitHub Pages path", () => {
    const productBookIndexPath = join(process.cwd(), "product-book", "index.html");

    expect(existsSync(productBookIndexPath)).toBe(true);

    const productBookIndexHtml = readFileSync(productBookIndexPath, "utf8");

    expect(productBookIndexHtml).toContain('<base href="../" />');
    expect(productBookIndexHtml).toContain('window.location.hash = "product-book-latest"');
    expect(productBookIndexHtml).toMatch(/app\.js\?v=[0-9]{8}-[a-f0-9]{6}/);
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
    expect(quickTaskJs).toMatch(/p_requester_team:\s*input\.requesterTeam/);
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
    expect(quickTaskFormSource).toContain("Launch Date / Deadline");
    expect(quickTaskFormSource).toContain("1st Review / Draft");
    expect(quickTaskFormSource).toContain("Auto-filled from Launch Date / Deadline, Requester Team / Function, and Project / campaign.");
    expect(quickTaskFormSource).toContain("readOnly");
  });

  it("creative request form explains its auto-filled title template", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const creativeFormSource = createScreenJsx.slice(
      createScreenJsx.indexOf("function CreativeRequestForm"),
      createScreenJsx.indexOf("function CreateResultScreen"),
    );

    expect(creativeFormSource).toContain("Auto-filled from Launch Date / Deadline, your account team, Campaign, and Product / Event.");
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
    expect(quickTaskFormSource).toContain("{TEAMS.map((team) =>");
    expect(creativeFormSource).not.toContain("requesterTeamOptions");
    expect(creativeFormSource).not.toContain("errors.requesterTeam");
  });

  it("creative request generates fixed Launch Date / Deadline milestones and flags capacity risk", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const creativeFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function CreativeRequestForm"));
    const quickTaskFormSource = createScreenJsx.slice(createScreenJsx.indexOf("function QuickTaskForm"), createScreenJsx.indexOf("function CreativeRequestForm"));

    expect(createScreenJsx).toContain("function subtractFlowMateWorkingDays");
    expect(createScreenJsx).toContain("function getFlowMateEarliestCreativeDraftDate(draft, now = new Date())");
    expect(createScreenJsx).toContain("function getFlowMateAutoCreativeDraftDate(draft)");
    expect(createScreenJsx).toContain("dueDate: getFlowMateAutoCreativeDraftDate(nextValue)");
    expect(createScreenJsx).not.toContain("const shouldAutoFillDraftDate = !value.dueDate || value.dueDate === previousAutoDraftDate");
    expect(createScreenJsx).toContain('requireField("dueDate", "1st Draft is required.")');
    expect(creativeFormSource).toContain("Asset First Draft Due");
    expect(creativeFormSource).toContain("readOnly");
    expect(creativeFormSource).toContain("disabled");
    expect(creativeFormSource).toContain("First Draft: T-4 Thai working days before Launch Date / Deadline.");
    expect(creativeFormSource).toContain("Final/Approved: T-2 Thai working days before Launch Date / Deadline.");
    expect(creativeFormSource).not.toContain("Due date");
    expect(quickTaskFormSource).toContain("1st Review / Draft");
    expect(quickTaskJs).toContain("p_due_date:         input.dueDate || null");
    expect(assignmentSql).toContain("create or replace function public.flowmate_earliest_capacity_date(");
    expect(assignmentSql).toContain("v_due_date := public.flowmate_subtract_th_business_days(v_launch_date, 4)");
    expect(assignmentSql).toContain("else public.flowmate_subtract_th_business_days(v_launch_date, 2)");
    expect(assignmentSql).toContain("v_review_buffer_working_days integer := 2");
    expect(assignmentSql).toContain("'code', 'review_buffer_risk'");
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

  it("keeps explicit Urgent validation and removes point-led auto-promotion from submit", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const handleSubmitSource = createScreenJsx.slice(createScreenJsx.indexOf("async function handleSubmit"));
    const validationSource = extractNamedFunction(createScreenJsx, "getFlowMateCreateValidationErrors");

    expect(createScreenJsx).toContain("const FLOWMATE_NORMAL_CREATIVE_CAPACITY_PER_DAY = 8");
    expect(createScreenJsx).toContain("const FLOWMATE_CREATIVE_CAPACITY_PER_BUCKET = 4");
    expect(createScreenJsx).toContain("const FLOWMATE_MIDDAY_CUTOFF_HOUR = 12");
    expect(createScreenJsx).toContain("const FLOWMATE_PRODUCTION_CUTOFF_HOUR = 15");
    expect(createScreenJsx).toContain("function getFlowMateCreativeEffortEstimate(draft)");
    expect(createScreenJsx).toContain("function getFlowMateProductionStartBucket(now = new Date())");
    expect(createScreenJsx).toContain("function countFlowMateCapacityBucketsInclusive(startDate, startHalf, endDate)");
    expect(createScreenJsx).toContain("function getFlowMateCreativeTimePressure(draft)");
    expect(validationSource).toContain('if (row.priority === "urgent")');
    expect(validationSource).toContain('requireField("urgentReason", "Urgent reason is required.")');
    expect(handleSubmitSource).not.toContain("const timePressure = mode === \"creative\" ? getFlowMateCreativeTimePressure(submissionDraft) : null");
    expect(handleSubmitSource).not.toContain("timePressure.requiresUrgent");
    expect(handleSubmitSource).not.toContain("Priority will be set to Urgent");
    expect(handleSubmitSource).not.toContain("Set Urgent and submit");
    expect(createScreenJsx).not.toContain("Auto urgent:");
    expect(handleSubmitSource).not.toContain("submissionDraft = urgentDraft");
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

  it("keeps optional Publish Time validation on-page with the generic highlighted-fields alert", () => {
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
    expect(createScreenSource).toContain("Please correct the highlighted fields.");
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
    expect(handleSubmitSource).toContain("setCreateAlert(hasInvalidBriefLink ? FLOWMATE_INVALID_BRIEF_LINK_MESSAGE : \"Please correct the highlighted fields.\")");
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
    expect(detailSource).toContain("Launch Date / Deadline");
    expect(detailSource).not.toContain("<div className=\"meta-row__lbl\">Publish Date</div>");
  });

  it("detail side panel orders Created, Asset First Draft Due, Launch Date / Deadline, then AI Tag and hides Publish Date", () => {
    const createScreenJsx = readFileSync(join(process.cwd(), "screens-a.jsx"), "utf8");
    const detailSource = createScreenJsx.slice(createScreenJsx.indexOf("function DetailScreen"));
    const creativeDetailsSource = detailSource.slice(detailSource.indexOf("{hasCreativeDetails"), detailSource.indexOf("Link zone"));
    const sideSource = detailSource.slice(detailSource.indexOf("detail__side"), detailSource.indexOf("Activity log"));

    expect(sideSource.indexOf("Created")).toBeGreaterThan(-1);
    expect(sideSource).not.toContain("Publish Date");
    expect(sideSource.indexOf("Asset First Draft Due")).toBeGreaterThan(sideSource.indexOf("Created"));
    expect(sideSource.indexOf("Launch Date / Deadline")).toBeGreaterThan(sideSource.indexOf("Asset First Draft Due"));
    expect(sideSource.indexOf("AI Tag")).toBeGreaterThan(sideSource.indexOf("Launch Date / Deadline"));
    expect(creativeDetailsSource).not.toContain("Launch Date / Deadline");
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
    expect(creativeFormSource).toContain("Asset First Draft Due");
    expect(creativeFormSource).toContain("Launch Date / Deadline");
    expect(creativeFormSource).toContain("First Draft: T-4 Thai working days before Launch Date / Deadline.");
    expect(creativeFormSource).toContain("Final/Approved: T-2 Thai working days before Launch Date / Deadline.");
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
    expect(detailSource).toContain("Launch Date / Deadline");
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
    expect(exportSource).toContain("\"Launch Date / Deadline\"");
    expect(exportSource).toContain("\"Due / First Draft\"");
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
    expect(myWorkSource).toContain("const scheduleRisk = mine.filter");
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
    expect(screensC).toContain("window.loadFlowMateOperationalRows");
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

  it("normal KPI keeps AI data out of per-member display and export", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const dataJsx = readFileSync(join(process.cwd(), "data.jsx"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(listDataJs).toContain('"work_item_ai_tags"');
    expect(listDataJs).toContain("aiTagsByWorkItemId");
    expect(listDataJs).toContain("aiTags: aiTagsByWorkItemId[item.id] || []");
    expect(dataJsx).toContain("function flowmateDownloadWorkbook(");
    expect(kpiSource).not.toContain("aiTaggedItems");
    expect(kpiSource).not.toContain("AI Tagged");
    expect(kpiSource).not.toContain("flowMateKpiGdVeAiSheets");
    expect(kpiSource).not.toContain("AI Tag");
    expect(kpiSource).toContain("window.flowmateDownloadWorkbook");
    expect(kpiSource).toContain("flowmate-kpi-${selectedKpiExportMonth}");
    expect(kpiSource).not.toContain("exportFlowMateCsvC(\n      `flowmate-kpi-${kpiExportMonth}");
  });

  it("normal KPI leaves delivery timestamps available without calculating personal completion speed", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(listDataJs).toContain("delivered_at");
    expect(listDataJs).toContain("createdAt: item.created_at");
    expect(listDataJs).toContain("deliveredAt: item.delivered_at");
    expect(screensC).toContain("function flowMateKpiAssignedAtC(row)");
    expect(screensC).toContain("function flowMateKpiDeliveredAtC(row)");
    expect(screensC).toContain("function flowMateKpiCompletionDaysC(row)");
    expect(kpiSource).not.toContain("Avg days to delivered");
    expect(kpiSource).not.toContain("completionDetailRows");
    expect(kpiSource).not.toContain("Completion detail");
    expect(kpiSource).not.toContain("flowMateKpiCompletionDaysC");
    expect(screensC).toContain('timeZone: "Asia/Bangkok"');
  });

  it("normal KPI counts cancelled tasks by team without personal audit detail", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listDataJs = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
    const kpiSource = screensC.slice(screensC.indexOf("function KpiScreen"), screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"));

    expect(listDataJs).toContain("cancel_reason");
    expect(listDataJs).toContain("cancelReason: item.cancel_reason || \"\"");
    expect(screensC).toContain("function flowMateKpiCancelledAtC(row)");
    expect(screensC).toContain("function flowMateKpiCancelReasonC(row)");
    expect(kpiSource).toContain("buildFlowMateKpiTeamSummaryC(kpiRows, flowMateBangkokDateKeyC())");
    expect(kpiSource).toContain("kpiTotals.cancelled");
    expect(kpiSource).toContain("Cancelled");
    expect(kpiSource).toContain('name: "Team status"');
    expect(kpiSource).not.toContain("Cancelled detail");
    expect(kpiSource).not.toContain("Cancel reason");
    expect(kpiSource).not.toContain("Cancelled At");
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
    expect(appJsx).toContain("loadFlowMateSearchRows");
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
    expect(workloadSource).toContain("Assigned awaiting acceptance");
    expect(workloadSource).toContain("In Progress");
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

  it("Workload activity and date signals are scoped to the selected month", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadSource = screensC.slice(screensC.indexOf("function WorkloadScreen"), screensC.indexOf("/* ============================================================\n   KPI VIEW"));

    expect(workloadSource).toContain("const selectedMonthWorkingDays = flowMateWorkingDaysInMonthC(selectedWorkloadMonth)");
    expect(workloadSource).toContain("buildFlowMateWorkloadMemberSummaryC(r, monthItems, monthRequestedItems, workloadTodayKey)");
    expect(workloadSource).toContain("flowMateBangkokDateKeyC()");
    expect(workloadSource).toContain("Assigned awaiting acceptance");
    expect(workloadSource).toContain("Due soon");
    expect(workloadSource).toContain("Overdue");
    expect(workloadSource).not.toContain("assignedEffort");
    expect(workloadSource).not.toContain("capacityWindow");
    expect(workloadSource).not.toContain("effectiveCap");
  });

  it("Workload detail and assignment eligibility keep Review active until delivery", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const workloadDataJs = readFileSync(join(process.cwd(), "supabase-workload-data.js"), "utf8");
    const assignmentSql = readFileSync(join(process.cwd(), "supabase", "rpc_assignment.sql"), "utf8");
    const schemaSql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const collaborationSql = readFileSync(join(process.cwd(), "supabase", "collaboration_admin.sql"), "utf8");

    expect(screensC).toContain('const FLOWMATE_ACTIVE_WORK_STATUS_KEYS = ["assigned", "in_progress", "review", "blocked"];');
    expect(workloadDataJs).toContain('const FLOWMATE_ACTIVE_WORK_STATUS_KEYS = ["assigned", "in_progress", "review", "blocked"];');
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

  it("frontend keeps requester teams to the four canonical teams across FlowMate Create and List", () => {
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
    expect(screensA).toContain("function getDefaultRequesterTeam()");
    expect(screensA).toContain("window.normalizeFlowMateRequesterTeam?.(window.FLOWMATE_CURRENT_USER?.requester_team)");
    expect(screensA).toContain('product !== "task-assign"');
    expect(screensA).toContain("{TEAMS.map((team) =>");
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
    expect(assignmentSql).toContain("due_date, final_approved_due_date, launch_date, publish_date");
    expect(assignmentSql).toContain("v_due_date, v_final_approved_due_date, v_launch_date, p_publish_date");
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

  it("appends new timeline view columns without renaming existing production positions", () => {
    const sql = marketingSql();
    const timelineView = sql.slice(
      sql.indexOf("create or replace view public.marketing_plan_timeline_v"),
      sql.indexOf("create or replace view public.marketing_campaign_summary_v"),
    );
    const productionCompatibleOrder = [
      "mci.brief_link",
      "mci.source_start_date",
      "mci.source_start_time",
      "mci.flowmate_work_item_id",
      "mci.status as content_status",
      "mci.sort_order as content_sort_order",
      "mcp.id as placement_id",
      "mcp.channel",
      "mcp.publish_date",
      "mcp.publish_time",
      "mcp.placement_status",
      "mcp.posted_url",
      "mcp.note as placement_note",
      "wi.status as flowmate_status",
      "wi.display_id as flowmate_display_id",
      "mci.sub_pic_user_id",
      "mci.sub_pic_name",
      "mci.requires_brief",
    ];

    let previousIndex = -1;
    for (const column of productionCompatibleOrder) {
      const columnIndex = timelineView.indexOf(column);
      expect(columnIndex, column).toBeGreaterThan(previousIndex);
      previousIndex = columnIndex;
    }
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
    expect(sql).toContain("when base.stored_status = 'planned' and base.requires_brief and base.missing_brief_link = false then 'assigned'");
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
  it("refreshes nav counts for identity, workspace, or product changes", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const refreshStart = appJsx.indexOf("async function refreshNavCounts(event)");
    const effectEnd = appJsx.indexOf("  useEffectApp(() => {", refreshStart);
    const navEffect = appJsx.slice(refreshStart, effectEnd);

    expect(navEffect).toContain('window.addEventListener("flowmate:refresh-counts", refreshNavCounts)');
    expect(navEffect).toContain("}, [authState.status, authState.user && authState.user.id, activeTeamKey, activeProduct]);");
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
    expect(loaderSource).toContain("window.loadFlowMateOperationalRows");
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

  it("removes archived Campaign Tags from every Marketing Plan view and prioritizes today in Campaign Timeline", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const timelineSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanTimelineScreen"),
      appJsx.indexOf("function MarketingPlanChannelPlanScreen"),
    );
    const channelPlanSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanChannelPlanScreen"),
      appJsx.indexOf("function MarketingPlanCalendarScreen"),
    );
    const calendarSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanCalendarScreen"),
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
    );

    expect(appJsx).toContain("function filterMarketingPlanRowsByVisibleCampaignTags");
    expect(appJsx).toContain("function prioritizeMarketingPlanCampaignsForDate");
    expect(appJsx).toContain("function getMarketingPlanTodayKey");
    expect(timelineSource).toContain("filterMarketingPlanRowsByVisibleCampaignTags(functionFilteredRows, campaignCatalogRows)");
    expect(timelineSource).toContain("prioritizeMarketingPlanCampaignsForDate(groupMarketingPlanTimelineRows(timelineRows, selectedMonth), getMarketingPlanTodayKey())");
    expect(channelPlanSource).toContain("filterMarketingPlanRowsByVisibleCampaignTags(publishableRows, campaignCatalogRows)");
    expect(calendarSource).toContain("filterMarketingPlanRowsByVisibleCampaignTags(filteredRows, campaignCatalogRows)");
    expect(timelineSource).toContain("ref: timelineScrollRef");
    expect(timelineSource).toContain("scrollLeft = Math.max(0, todayIndex * columnWidth - columnWidth * 2)");
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
    expect(workingSheetSource).toContain("Launch Date / Deadline");
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
    const rowRenderStart = workingSheetSource.indexOf("visibleRows.map(row => {");
    const rowRenderEnd = workingSheetSource.indexOf("visibleRows.length === 0", rowRenderStart);
    const rowActionsSource = workingSheetSource.slice(
      workingSheetSource.indexOf('className: "marketing-working-actions"', rowRenderStart),
      rowRenderEnd,
    );
    const editModalSource = workingSheetSource.slice(
      workingSheetSource.indexOf("Edit Working Sheet row"),
      workingSheetSource.length,
    );

    expect(appJsx).toContain("const MARKETING_PLAN_WORKING_STATUS_OPTIONS");
    expect(appJsx).toContain("const MARKETING_PLAN_PUBLISH_TIME_OPTIONS = [");
    expect(appJsx).toContain('{ value: "", label: "N/A" }');
    for (const status of ["planned", "assigned", "review", "ready_to_post", "scheduled", "posted"]) {
      expect(appJsx).toContain(`value: "${status}"`);
    }
    expect(appJsx).toContain("function groupMarketingPlanWorkingSheetRows");
    expect(workingSheetSource).toContain('groupMarketingPlanWorkingSheetRows(rows, selectedMonth, "all")');
    expect(workingSheetSource).toContain("marketing-channel-tags");
    expect(workingSheetSource).toContain("marketing-working-table");
    expect(workingSheetSource).toContain("marketing-working-time-text");
    expect(workingSheetSource).not.toContain("marketing-working-brief");
    expect(workingSheetSource).toContain("marketing-working-status");
    expect(workingSheetSource).toContain('className: "col-date"');
    expect(workingSheetSource).toContain('}, "Launch Date / Deadline")');
    expect(workingSheetSource).not.toContain('}, "Publish Date")');
    expect(workingSheetSource).toContain("formatMarketingPlanDate(row.publishDate)");
    expect(workingSheetSource).toContain('className: "col-pic"');
    expect(workingSheetSource).toContain('}, "PIC")');
    expect(workingSheetSource).toContain('className: "col-actions"');
    expect(workingSheetSource).toContain('}, "Actions")');
    expect(workingSheetSource).toContain("MARKETING_PLAN_PUBLISH_TIME_OPTIONS.map(option =>");
    expect(workingSheetSource).toContain('React.createElement("option", {');
    expect(workingSheetSource).toContain("key: option.value");
    expect(workingSheetSource).toContain("value: option.value");
    expect(workingSheetSource).not.toContain("placeholder=\"HH:MM\"");
    expect(workingSheetSource).toContain("normalizeMarketingPlanPublishTimeOption");
    expect(appJsx).toContain("function isMarketingPlanNoTagSelection(channels)");
    expect(workingSheetSource).toContain("isMarketingPlanNoTagSelection(sheetForm.channels)");
    expect(workingSheetSource).toContain("isMarketingPlanNoTagSelection(editForm.channels)");
    expect(workingSheetSource).toContain("isMarketingPlanNoTagSelection(duplicateSourceRow && duplicateSourceRow.channels)");
    expect(workingSheetSource.match(/Not required for No Tag/g) || []).toHaveLength(4);
    expect(workingSheetSource).toContain("Time must be N/A or a whole hour.");
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
    expect(appJsx).toContain("await syncMarketingPlanLinkedFlowMateSchedule(row, form, publishTime)");
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
    expect(css).toContain("min-width: 1420px");
    expect(css).toContain(".marketing-working-table .col-date { width: 92px; }");
    expect(css).toContain(".marketing-working-table .col-time { width: 96px; min-width: 96px; }");
    expect(css).toContain(".marketing-working-table .col-link { width: 76px; }");
    expect(css).toContain(".marketing-working-table .col-pic { width: 58px; }");
    expect(css).toContain(".marketing-working-table .col-status { width: 108px; }");
    expect(css).toContain(".marketing-working-table .col-actions { width: 220px; min-width: 220px; }");
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
    expect(marketingSql).toContain("publish_time = v_effective_publish_time");
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
    expect(draftSource).toContain('publishTime: isMarketingPlanNoTagSelection(selectedChannels) ? "" : getMarketingPlanWorkingRowPublishTime(row)');
    expect(appJsx).toContain("window.dispatchEvent(new CustomEvent(\"flowmate:create-draft-updated\"");
    expect(createScreenJsx).toContain("window.addEventListener(\"flowmate:create-draft-updated\", onExternalCreateDraftUpdated)");
    expect(createScreenJsx).toContain("setCreativeDraft(withTitle);");
    expect(creativeFormSource).toContain("Publish Time");
    expect(createScreenJsx).toContain("const FLOWMATE_PUBLISH_TIME_OPTIONS = [");
    expect(createScreenJsx).toContain('{ value: "", label: "N/A" }');
    expect(creativeFormSource).toContain('value={isNoTag ? "" : value.publishTime}');
    expect(creativeFormSource).toContain('onChange={e => update("publishTime", e.target.value)}');
    expect(creativeFormSource).toContain("FLOWMATE_PUBLISH_TIME_OPTIONS.map(option =>");
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

  it("keeps Marketing Status editable after a Creative Request link and prevents duplicate brief creation", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "app.css"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const rowRenderSource = workingSheetSource;

    expect(rowRenderSource).toContain("const rowStatusValue = getMarketingPlanWorkingSheetStatus(row);");
    expect(rowRenderSource).toContain("value: rowStatusValue");
    expect(rowRenderSource).toContain("const rowNeedsBriefLinkRepair = row.requiresBrief && rowHasLinkedCreativeRequest && !String(row.briefLink || \"\").trim();");
    expect(rowRenderSource).toContain("rowNeedsBriefLinkRepair ? React.createElement");
    expect(rowRenderSource).toContain("Repair Link");
    expect(rowRenderSource).toContain("rowHasLinkedCreativeRequest || !row.requiresBrief ? null : React.createElement");
    expect(rowRenderSource).toContain("Create Brief");
    expect(css).toContain("min-height: 36px;");
    expect(css).toContain("line-height: 20px;");
    expect(css).toContain("padding: 7px 28px 7px 10px;");
  });

  it("lets a Working Sheet row declare whether a Brief is required", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const supervisorSqlSource = readFileSync(join(process.cwd(), "supabase", "marketing_plan_supervisor.sql"), "utf8");
    const briefRequirementPatch = readFileSync(join(process.cwd(), "supabase", "marketing_plan_brief_requirement.sql"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );

    expect(appJsx).toContain("requiresBrief: true");
    expect(appJsx).toContain("requiresBrief: row.requires_brief !== false");
    expect(appJsx).toContain("requires_brief: form.requiresBrief !== false");
    expect(workingSheetSource).toContain("Brief requirement");
    expect(workingSheetSource).toContain("Brief required");
    expect(workingSheetSource).toContain("No Brief required");
    expect(marketingPlanSql).toContain("requires_brief boolean not null default true");
    expect(marketingPlanSql).toContain("mci.requires_brief");
    expect(supervisorSqlSource).toContain("mci.requires_brief");
    expect(supervisorSqlSource).toContain("when base.stored_status = 'planned' and base.requires_brief and base.missing_brief_link = false then 'assigned'");
    expect(supervisorSqlSource).toContain("mci.requires_brief and not public.marketing_plan_is_non_empty_text(mci.brief_link) as missing_brief_link");
    expect(briefRequirementPatch).toContain("add column if not exists requires_brief boolean not null default true");
    expect(briefRequirementPatch).toContain("create or replace view public.marketing_plan_timeline_v");
    expect(briefRequirementPatch).toContain("when base.stored_status = 'planned' and base.requires_brief and base.missing_brief_link = false then 'assigned'");
    expect(briefRequirementPatch).toContain("mci.requires_brief and not public.marketing_plan_is_non_empty_text(mci.brief_link) as missing_brief_link");
    expect(briefRequirementPatch).toContain("select pg_notify('pgrst', 'reload schema')");
  });

  it("limits Working Sheet actions to the row PIC, Sub PIC, or admin and cancels linked FlowMate work before row deletion", () => {
    const appJsx = readFileSync(join(process.cwd(), "app.jsx"), "utf8");
    const marketingPlanSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan.sql"), "utf8");
    const workingSheetSource = appJsx.slice(
      appJsx.indexOf("function MarketingPlanWorkingSheetScreen"),
      appJsx.indexOf("function MarketingPlanSupervisorScreen"),
    );
    const rowRenderStart = workingSheetSource.indexOf("visibleRows.map(row => {");
    const rowRenderSource = workingSheetSource.slice(
      rowRenderStart,
      workingSheetSource.indexOf("visibleRows.length === 0", rowRenderStart),
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

    expect(appJsx).toContain("row.subPicName, row.briefLink");
    expect(workingSheetSource).toContain("row.subPicName || \"-\"");
    expect(workingSheetSource).toContain("row.subPicUserId === currentUser.id");
    expect(appJsx).toContain('className: "col-sub-pic"');
    expect(appJsx).toContain('}, "Sub PIC")');
    expect(listData).toContain("marketing_content_items");
    expect(listData).toContain("marketingPlanSubPicUserId");
    expect(screensA).toContain("window.canFlowMateTransitionWorkItem?.(");
    expect(readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8")).toContain("userId === row.marketingPlanSubPicUserId");
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
    const rowRenderSource = workingSheetSource;

    expect(quickTaskJs).toContain("can_access_all_teams, can_manage_marketing_schedule");
    expect(quickTaskJs).toContain("can_manage_marketing_schedule: Boolean(profile.can_manage_marketing_schedule)");
    expect(quickTaskJs).toContain("can_manage_marketing_schedule: false");
    expect(workingSheetSource).toContain("function canManageMarketingPlanSchedule(row)");
    expect(workingSheetSource).toContain("canManageMarketingPlanWorkingRow(row)");
    expect(workingSheetSource).toContain("currentUser.can_manage_marketing_schedule === true");
    expect(appJsx).toContain('.rpc("marketing_plan_update_working_row_time"');
    expect(appJsx).toContain('.rpc("marketing_plan_update_working_row_status"');
    expect(appJsx).toContain("function getMarketingPlanWorkingSheetStatus(row)");
    expect(workingSheetSource).toContain("Marketing Status remains editable after a Brief Link is created.");
    expect(workingSheetSource).toContain("Changing Marketing Status does not change the linked FlowMate task");
    expect(workingSheetSource).toContain("async function handleWorkingRowTimeChange(row, nextTime)");
    expect(rowRenderSource).toContain("const canManageSchedule = canManageMarketingPlanSchedule(row);");
    expect(rowRenderSource).toContain("const rowStatusValue = getMarketingPlanWorkingSheetStatus(row);");
    expect(rowRenderSource).toContain("const inlineTimeUi = getMarketingPlanInlineTimeUi(row, canManageSchedule, updatingRowId);");
    expect(rowRenderSource).toContain("value: inlineTimeUi.value");
    expect(rowRenderSource).toContain("disabled: inlineTimeUi.disabled");
    expect(rowRenderSource).toContain("title: inlineTimeUi.title");
    expect(rowRenderSource).toContain("if (!inlineTimeUi.isNoTag) handleWorkingRowTimeChange(row, event.target.value);");
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

    expect(appJsx).toContain("async function loadMarketingPlanSupervisorRows(user, options = {})");
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
    expect(supervisorSource).toContain("Avg Working Days Before Launch Date / Deadline");
    expect(supervisorSource).toContain("Risk");
    expect(supervisorSource).toContain("Critical");
    for (const tab of ["Production Insights", "Monthly Overview", "PIC Overview", "Campaign Risk", "Channel Risk"]) {
      expect(supervisorSource).toContain(tab);
    }
    expect(supervisorSource).toContain('const [activeTab, setActiveTab] = useStateApp("production");');
    expect(supervisorSource).toContain("productionInsights.status");
    expect(supervisorSource).toContain("productionStartDate");
    expect(supervisorSource).toContain("productionEndDate");
    expect(supervisorSource).toContain("Team");
    expect(supervisorSource).toContain("Skill");
    expect(supervisorSource).toContain("Priority");
    expect(supervisorSource).toContain("getFlowMateProductionStatusOptions");
    expect(supervisorSource).toContain("Month trend");
    expect(supervisorSource).toContain("Variance");
    for (const productionStatusLabel of ["In Progress", "Assigned awaiting acceptance", "Review", "Blocked", "Delivered"]) {
      expect(supervisorSource).toContain(productionStatusLabel);
    }
    expect(supervisorSource).not.toContain("PIC Performance");
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
    expect(appJsx).toContain("function exportFlowMateProductionInsightsCsv");
    expect(appJsx).toContain('"P50 active hours"');
    expect(appJsx).toContain('"P85 active hours"');
    expect(appJsx).toContain('"Legacy deadline gap count"');
    expect(exportSource).not.toMatch(/fastest|slowest|speed rank|productivity rank/i);
    expect(exportSource).not.toContain("row.firstAssignedAt,\n    row.workingDaysBeforeLaunch");
    for (const field of [
      '"Month"',
      '"Campaign"',
      '"Product / Event"',
      '"Channel"',
      '"Launch Date / Deadline"',
      '"Time"',
      '"PIC"',
      '"Effective Status"',
      '"Stored Status"',
      '"Assigned At"',
      '"Working Days Before Launch Date / Deadline"',
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
    expect(ganttScreenJsx).toContain("Use status, leave, and due dates to decide follow-up.");
    expect(ganttScreenJsx).toContain("Gantt rule: the task bar runs from 1st Draft to Launch Date / Deadline.");
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
    expect(detailSource).not.toContain("window.loadFlowMateAiTags({ displayId: w.id })");
    expect(detailSource).toContain("aiTagsUnavailable");
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
    const normalizedScreensB = screensB.replace(/\r\n/g, "\n");
    const listSource = normalizedScreensB.slice(normalizedScreensB.indexOf("function ListScreen"), normalizedScreensB.indexOf("/* ============================================================\n   KANBAN BOARD"));

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
    const normalizedScreensB = screensB.replace(/\r\n/g, "\n");
    const listSource = normalizedScreensB.slice(normalizedScreensB.indexOf("function ListScreen"), normalizedScreensB.indexOf("/* ============================================================\n   KANBAN BOARD"));

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

  it("adds Team Schedule below Calendar with a timeline-first view", () => {
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
    expect(ganttSource).toContain('function TeamGanttScreen({ onOpen, product = "flowmate" })');
    expect(ganttSource).toContain("data-testid=\"flowmate-team-gantt-route\"");
    expect(ganttSource).toContain("data-testid=\"flowmate-team-gantt-chart\"");
    expect(ganttSource).not.toContain("Trello Power-Up Lite");
    expect(ganttSource).toContain("todayOffset");
    expect(ganttSource).toContain("gantt__today-line");
    expect(ganttSource).toContain("flowmate-team-schedule-timeline-tab");
    expect(ganttSource).toContain("priorityClass");
    expect(ganttSource).toContain("Assigned, In Progress, Review, and Blocked stay visible here until work is delivered or cancelled.");
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

  it("draws one Team Schedule separator per day without repeating the month grid inside every day", () => {
    const appCss = readFileSync(join(process.cwd(), "app.css"), "utf8");

    expect(appCss).toMatch(/\.team-schedule__timeline \.gantt__lane\s*\{[^}]*background-size:\s*auto;/);
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

  it("keeps Team Schedule timeline surfaces while removing the retired weekly capacity branch", () => {
    const screensC = readFileSync(join(process.cwd(), "screens-c.jsx"), "utf8");
    const listData = readFileSync(join(process.cwd(), "supabase-list-data.js"), "utf8");
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
    expect(ganttSource).toContain('data-testid="flowmate-team-gantt-chart"');
    expect(ganttSource).toContain("Assigned, In Progress, Review, and Blocked stay visible here until work is delivered or cancelled.");
    expect(ganttSource).not.toContain("flowmate-team-schedule-workload-tab");
    expect(screensC).not.toContain("function teamScheduleWeeklyCellC(");
    expect(screensC).not.toContain('data-testid="flowmate-team-schedule-workload"');
    expect(screensC).not.toContain('data-testid="flowmate-team-schedule-capacity-cell"');
    expect(screensC).not.toContain('data-testid="flowmate-team-schedule-workload-inspector"');
    expect(screensC).not.toContain("Production timing and weekly capacity for GD/VE");
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
    expect(calendarSource).toContain("window.loadFlowMateOperationalRows");
    expect(calendarSource).toContain("attachFlowMateLiveRefresh(loadRowsIfAlive)");
    expect(calendarSource).toContain('setViewMode("month")');
    expect(calendarSource).toContain('setViewMode("agenda")');
    expect(calendarSource).toContain("Launch Date / Deadline");
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

    expect(appJsx).toContain('onQuick: isTaskAssignProduct ? () => handleTopbarCreateChoice("quick") : null');
    expect(appJsx).toContain('onCreative: isTaskAssignProduct ? null : () => handleTopbarCreateChoice("creative")');
    expect(appJsx).toContain('onLeave: () => handleTopbarCreateChoice("leave")');
    expect(appJsx).toContain("setCreateModeIntent(choice)");
    expect(appJsx).toContain("setIsGlobalLeaveModalOpen(true)");
    expect(appJsx).toContain("React.createElement(GlobalLeaveRequestModal");
    expect(appJsx).toContain('initialMode: isTaskAssignProduct ? "quick" : "creative"');
    expect(createScreenJsx).toContain('function CreateScreen({ onNav, onOpen, initialMode = "creative", product = "flowmate" })');
    expect(createScreenJsx).toContain('useState(() => isTaskAssignProduct || initialMode === "quick" ? "quick" : "creative")');
    expect(createScreenJsx).toContain('const isTaskAssignProduct = product === "task-assign"');
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
    expect(listDataJs).toContain("syncFlowMateMentionUsers(scopedUsers)");
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
    expect(quickTaskJs).toContain("window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.role === \"admin\"");

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

    expect(boardSource).toContain("window.transitionFlowMateWorkStatus(row.id, targetStatus, { ...options, currentStatus: row.status })");
    expect(boardSource).not.toContain("window.transitionFlowMateCreativeStatus(row.id, targetStatus, options)");
  });

  it("routes admin archive through the soft archive RPC without client actor spoofing", () => {
    const quickTaskJs = readFileSync(join(process.cwd(), "supabase-quick-task.js"), "utf8");

    expect(quickTaskJs).toContain("async function adminArchiveFlowMateWorkItem(displayId, reason)");
    expect(quickTaskJs).toContain('rpc("flowmate_admin_archive_work_item"');
    expect(quickTaskJs).toContain("window.adminArchiveFlowMateWorkItem = adminArchiveFlowMateWorkItem");

    const archiveHelper = quickTaskJs.slice(
      quickTaskJs.indexOf("async function adminArchiveFlowMateWorkItem"),
      quickTaskJs.indexOf("async function restoreFlowMateArchivedWorkItem"),
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
    expect(workingRowsSource).toContain("rowHasLinkedCreativeRequest || !row.requiresBrief ? null");
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
    expect(appJsx).toContain("const allowedRoute = isTaskAssignProduct");
    expect(appJsx).toContain(": isFlowMateRouteAllowedForRole(user.role, route);");
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
    const manualReassignStart = assignmentSql.indexOf("create or replace function public.flowmate_change_creative_assignee(");
    const manualReassignEnd = assignmentSql.indexOf(
      "revoke all on function public.flowmate_change_creative_assignee(text, uuid, text)",
      manualReassignStart,
    );
    const finalEngineSql = assignmentSql.slice(finalEngineStart, finalEngineEnd);
    const manualReassignSql = assignmentSql.slice(manualReassignStart, manualReassignEnd);

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
    expect(finalEngineSql).not.toContain("'code', 'skill_mismatch'");
    expect(finalEngineSql).toContain("'code', 'backup_skill'");
    expect(manualReassignSql).toContain("'code', 'skill_mismatch'");
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
  const workgridFeedbackSql = readFileSync(join(process.cwd(), "supabase", "marketing_plan_workgrid_feedback.sql"), "utf8");

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

  it("keeps each schedule operator installer and canonical RPC body narrowly authorized and scoped", () => {
    for (const sql of [operatorSql, canonicalMarketingPlanSql, workgridFeedbackSql]) {
      const timeRpc = getRpcBody(sql, "marketing_plan_update_working_row_time");

      expect(timeRpc).toContain("security definer\nset search_path = ''");
      expect(timeRpc).toContain("v_actor_id := auth.uid()");
      expect(timeRpc).toContain("and u.is_active = true");
      expect(timeRpc).toContain("v_actor.role = 'admin'");
      expect(timeRpc).toContain("v_content.pic_user_id = v_actor_id");
      expect(timeRpc).toContain("v_content.sub_pic_user_id = v_actor_id");
      expect(timeRpc).toContain("v_actor.can_manage_marketing_schedule = true");
      expect(timeRpc).toContain("if not (");
      expect(timeRpc).toContain("p_publish_time is null");
      expect(timeRpc).toContain("extract(minute from p_publish_time) = 0");
      expect(timeRpc).toContain("extract(second from p_publish_time) = 0");
      expect(timeRpc).toContain("Publish Time must be N/A or a whole hour.");
      expect(timeRpc).toContain("using errcode = '22023'");
      expect(timeRpc).not.toContain("p_publish_time not in ('11:00', '14:00', '18:00', '21:00')");
      expect(timeRpc).toMatch(/set source_start_time = (?:v_effective_publish_time|p_publish_time)/);
      expect(timeRpc).toMatch(/set publish_time = (?:case[\s\S]*v_effective_publish_time|p_publish_time)/);
      expect(timeRpc).toContain("where content_item_id = v_content.id");
      expect(timeRpc).toContain("where id = v_content.flowmate_work_item_id");
      expect(timeRpc).not.toContain("set placement_status =");
      expect(timeRpc).not.toContain("set status =");
      expect(timeRpc).not.toContain("set launch_date =");
    }

    for (const sql of [operatorSql, canonicalMarketingPlanSql]) {
      const statusRpc = getRpcBody(sql, "marketing_plan_update_working_row_status");

      expect(statusRpc).toContain("security definer\nset search_path = ''");
      expect(statusRpc).toContain("v_actor_id := auth.uid()");
      expect(statusRpc).toContain("and u.is_active = true");
      expect(statusRpc).toContain("v_actor.role = 'admin'");
      expect(statusRpc).toContain("v_content.pic_user_id = v_actor_id");
      expect(statusRpc).toContain("v_content.sub_pic_user_id = v_actor_id");
      expect(statusRpc).toContain("v_actor.can_manage_marketing_schedule = true");
      expect(statusRpc).toContain("if p_placement_status is null or p_placement_status not in ('planned', 'assigned', 'review', 'ready', 'ready_to_post', 'scheduled', 'posted', 'delayed', 'cancelled') then");
      expect(statusRpc).toContain("set placement_status = p_placement_status");
      expect(statusRpc).toContain("where content_item_id = v_content.id");
      expect(statusRpc).not.toContain("update public.marketing_content_items");
      expect(statusRpc).not.toContain("update public.work_items");
      expect(statusRpc).not.toContain("set source_start_time =");
      expect(statusRpc).not.toContain("set publish_time =");
      expect(statusRpc).not.toContain("set status =");
    }
    expect(workgridFeedbackSql).not.toContain("create or replace function public.marketing_plan_update_working_row_status");
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

  it("validates nullable whole-hour Publish Time before canonical linked schedule sync", () => {
    for (const sql of [canonicalMarketingPlanSql, workgridFeedbackSql]) {
      const syncRpc = getRpcBody(sql, "marketing_plan_sync_flowmate_schedule");

      expect(syncRpc).toContain("p_publish_time is null");
      expect(syncRpc).toContain("extract(minute from p_publish_time) = 0");
      expect(syncRpc).toContain("extract(second from p_publish_time) = 0");
      expect(syncRpc).toMatch(/publish_time = (?:v_effective_publish_time|p_publish_time)/);
      expect(syncRpc).not.toContain("publish_time = coalesce(p_publish_time");
    }
  });
});

// ============================================================================
// Marketing Working Sheet — account-scoped My Tasks preference storage
// ============================================================================
describe("Marketing Working Sheet My Tasks preference storage", () => {
  const preferenceSqlFiles = [
    join(process.cwd(), "supabase", "marketing_plan.sql"),
    join(process.cwd(), "supabase", "marketing_plan_workgrid_feedback.sql"),
  ];
  const preferencePolicyNames = {
    select: "active authenticated accounts can select their My Tasks preference",
    insert: "active authenticated accounts can insert their My Tasks preference",
    update: "active authenticated accounts can update their My Tasks preference",
  };

  function getPreferenceSection(sql: string) {
    const start = sql.indexOf("create table if not exists public.user_ui_preferences");
    const end = sql.indexOf("-- End account-scoped My Tasks preference", start);
    return start < 0 || end < 0 ? "" : sql.slice(start, end);
  }

  function getPolicy(sql: string, policyName: string) {
    const start = sql.indexOf(`create policy "${policyName}"`);
    const end = sql.indexOf(";", start);
    return start < 0 || end < 0 ? "" : sql.slice(start, end + 1);
  }

  function getPreferenceTableGrantStatements(sql: string) {
    const grantMarker = " on table public.user_ui_preferences to ";

    return sql
      .split(";")
      .map((statement) => statement.replace(/\s+/g, " ").trim())
      .filter((statement) => statement.toLowerCase().startsWith("grant "))
      .flatMap((statement) => {
        const normalizedStatement = statement.toLowerCase();
        const grantMarkerIndex = normalizedStatement.indexOf(grantMarker);
        if (grantMarkerIndex < 0) return [];

        const privileges = statement
          .slice("grant ".length, grantMarkerIndex)
          .toLowerCase()
          .split(",")
          .map((privilege) => privilege.trim().replace(/\s+privileges$/, ""))
          .filter(Boolean);
        const grantees = statement
          .slice(grantMarkerIndex + grantMarker.length)
          .toLowerCase()
          .split(",")
          .map((grantee) => grantee.trim())
          .filter(Boolean);

        return [{ privileges, grantees }];
      });
  }

  function getAuthenticatedTableGrantPrivileges(sql: string) {
    return getPreferenceTableGrantStatements(sql)
      .filter(({ grantees }) => grantees.includes("authenticated"))
      .flatMap(({ privileges }) => privileges);
  }

  function expectAuthenticatedTableGrantsToBeLeastPrivilege(sql: string) {
    expect(getAuthenticatedTableGrantPrivileges(sql)).toEqual(["select", "insert", "update"]);
  }

  it("rejects multi-grantee grants that broaden authenticated My Tasks preference access", () => {
    const mutatedGrants = `
      grant select on table public.user_ui_preferences to authenticated, another_role;
      grant delete on table public.user_ui_preferences to another_role, authenticated;
      grant all on table public.user_ui_preferences to another_role, authenticated;
    `;
    const authenticatedPrivileges = getAuthenticatedTableGrantPrivileges(mutatedGrants);

    expect(authenticatedPrivileges).toEqual(["select", "delete", "all"]);
    expect(() => expectAuthenticatedTableGrantsToBeLeastPrivilege(mutatedGrants)).toThrow();
  });

  it("stores My Tasks preference per active authenticated account with least-privilege RLS", () => {
    const requiredAccountPredicate = `user_id = (select auth.uid())\n  and exists (\n    select 1\n    from public.users u\n    where u.id = (select auth.uid())\n      and u.is_active = true\n  )`;

    for (const sqlPath of preferenceSqlFiles) {
      const sql = existsSync(sqlPath) ? readFileSync(sqlPath, "utf8") : "";
      const preferenceSection = getPreferenceSection(sql);

      expect(preferenceSection).not.toBe("");
      expect(preferenceSection).toContain("create table if not exists public.user_ui_preferences");
      expect(preferenceSection).toContain("user_id uuid primary key references public.users(id) on delete cascade");
      expect(preferenceSection).toContain("marketing_working_my_tasks boolean not null default false");
      expect(preferenceSection).toContain("created_at timestamptz not null default now()");
      expect(preferenceSection).toContain("updated_at timestamptz not null default now()");
      expect(preferenceSection).toContain("drop trigger if exists user_ui_preferences_set_updated_at on public.user_ui_preferences");
      expect(preferenceSection).toContain("create trigger user_ui_preferences_set_updated_at");
      expect(preferenceSection).toContain("before update on public.user_ui_preferences");
      expect(preferenceSection).toContain("for each row execute function public.set_updated_at()");
      expect(preferenceSection).toContain("alter table public.user_ui_preferences enable row level security");
      expect(preferenceSection).toContain("revoke all on table public.user_ui_preferences from public, anon, authenticated");
      expectAuthenticatedTableGrantsToBeLeastPrivilege(preferenceSection);
      expect(getPreferenceTableGrantStatements(preferenceSection).some(
        ({ grantees }) => grantees.includes("public") || grantees.includes("anon"),
      )).toBe(false);
      expect(preferenceSection).not.toMatch(/for delete/i);
      expect(preferenceSection).not.toMatch(/security\s+definer|auth\s*\.\s*role\s*\(\s*\)|auth\s*\.\s*jwt\s*\(\s*\)|raw_user_meta_data|user_metadata/i);
      expect(preferenceSection).not.toMatch(
        /auth\s*\.\s*jwt\s*\(\s*\)[\s\S]*?(?:raw_user_meta_data|user_metadata)/i,
      );

      const selectPolicy = getPolicy(preferenceSection, preferencePolicyNames.select);
      const insertPolicy = getPolicy(preferenceSection, preferencePolicyNames.insert);
      const updatePolicy = getPolicy(preferenceSection, preferencePolicyNames.update);

      expect(preferenceSection).toContain(`drop policy if exists "${preferencePolicyNames.select}" on public.user_ui_preferences`);
      expect(preferenceSection).toContain(`drop policy if exists "${preferencePolicyNames.insert}" on public.user_ui_preferences`);
      expect(preferenceSection).toContain(`drop policy if exists "${preferencePolicyNames.update}" on public.user_ui_preferences`);
      expect(selectPolicy).toContain("on public.user_ui_preferences for select\nto authenticated");
      expect(selectPolicy).toContain(`using (\n  ${requiredAccountPredicate}\n)`);
      expect(insertPolicy).toContain("on public.user_ui_preferences for insert\nto authenticated");
      expect(insertPolicy).toContain(`with check (\n  ${requiredAccountPredicate}\n)`);
      expect(updatePolicy).toContain("on public.user_ui_preferences for update\nto authenticated");
      expect(updatePolicy).toContain(`using (\n  ${requiredAccountPredicate}\n)`);
      expect(updatePolicy).toContain(`with check (\n  ${requiredAccountPredicate}\n)`);
    }
  });

});

// ============================================================================
// Marketing Working Sheet — transactional Duplicate Brief backend
// ============================================================================
describe("duplicate working row RPC", () => {
  const duplicateRpcSignature = "public.marketing_plan_duplicate_working_row(uuid, date, time)";
  const duplicateRpcFiles = [
    join(process.cwd(), "supabase", "marketing_plan.sql"),
    join(process.cwd(), "supabase", "marketing_plan_workgrid_feedback.sql"),
  ];

  function scanPostgresSql(sql: string) {
    const executableChars = Array.from({ length: sql.length }, () => " ");
    const topLevelSemicolons: number[] = [];
    const dollarQuotes: Array<{
      delimiter: string;
      start: number;
      contentStart: number;
      contentEnd: number;
      end: number;
    }> = [];

    const preserveNewline = (index: number) => {
      if (sql[index] === "\r" || sql[index] === "\n") {
        executableChars[index] = sql[index];
      }
    };

    const isIdentifierContinuation = (character: string | undefined) => (
      Boolean(character) && /[$_\p{L}\p{M}\p{N}]/u.test(character || "")
    );

    const dollarTagAt = (index: number) => {
      if (isIdentifierContinuation(sql[index - 1])) return "";
      const match = sql.slice(index).match(/^\$(?:[_\p{L}][_\p{L}\p{M}\p{N}]*)?\$/u);
      return match ? match[0] : "";
    };

    let index = 0;
    while (index < sql.length) {
      if (sql.startsWith("--", index)) {
        while (index < sql.length && sql[index] !== "\r" && sql[index] !== "\n") {
          index += 1;
        }
        continue;
      }

      if (sql.startsWith("/*", index)) {
        let depth = 1;
        index += 2;
        while (index < sql.length && depth > 0) {
          preserveNewline(index);
          if (sql.startsWith("/*", index)) {
            depth += 1;
            index += 2;
          } else if (sql.startsWith("*/", index)) {
            depth -= 1;
            index += 2;
          } else {
            index += 1;
          }
        }
        continue;
      }

      if (sql[index] === "'") {
        const hasEscapePrefix = (
          (sql[index - 1] === "E" || sql[index - 1] === "e")
          && !isIdentifierContinuation(sql[index - 2])
        );
        index += 1;
        while (index < sql.length) {
          preserveNewline(index);
          if (hasEscapePrefix && sql[index] === "\\" && index + 1 < sql.length) {
            preserveNewline(index + 1);
            index += 2;
          } else if (sql[index] === "'" && sql[index + 1] === "'") {
            index += 2;
          } else if (sql[index] === "'") {
            index += 1;
            break;
          } else {
            index += 1;
          }
        }
        continue;
      }

      if (sql[index] === '"') {
        index += 1;
        while (index < sql.length) {
          preserveNewline(index);
          if (sql[index] === '"' && sql[index + 1] === '"') {
            index += 2;
          } else if (sql[index] === '"') {
            index += 1;
            break;
          } else {
            index += 1;
          }
        }
        continue;
      }

      if (sql[index] === "$") {
        const delimiter = dollarTagAt(index);
        if (delimiter) {
          const start = index;
          const contentStart = start + delimiter.length;
          const contentEnd = sql.indexOf(delimiter, contentStart);
          const end = contentEnd < 0 ? sql.length : contentEnd + delimiter.length;
          for (let cursor = start; cursor < end; cursor += 1) {
            preserveNewline(cursor);
          }
          dollarQuotes.push({
            delimiter,
            start,
            contentStart,
            contentEnd: contentEnd < 0 ? sql.length : contentEnd,
            end,
          });
          index = end;
          continue;
        }
      }

      executableChars[index] = sql[index];
      if (sql[index] === ";") topLevelSemicolons.push(index);
      index += 1;
    }

    return {
      executableSql: executableChars.join(""),
      topLevelSemicolons,
      dollarQuotes,
    };
  }

  function splitExecutablePostgresStatements(sql: string) {
    const { executableSql, topLevelSemicolons } = scanPostgresSql(sql);
    const statements: string[] = [];
    let statementStart = 0;
    for (const semicolonIndex of topLevelSemicolons) {
      statements.push(executableSql.slice(statementStart, semicolonIndex));
      statementStart = semicolonIndex + 1;
    }
    if (statementStart < executableSql.length) {
      statements.push(executableSql.slice(statementStart));
    }
    return statements;
  }

  function extractDuplicateRpc(sql: string) {
    const { executableSql, dollarQuotes } = scanPostgresSql(sql);
    const marker = "create or replace function public.marketing_plan_duplicate_working_row(";
    const executableLower = executableSql.toLowerCase();
    const start = executableLower.indexOf(marker);
    if (start < 0) return { definition: "", signature: "", body: "" };

    const bodyQuote = dollarQuotes.find((candidate) => (
      candidate.start > start
      && /\bas\s*$/i.test(executableSql.slice(start, candidate.start))
    ));
    if (!bodyQuote || bodyQuote.contentEnd === sql.length) {
      return { definition: "", signature: "", body: "" };
    }

    const signatureEnd = executableLower.indexOf(") returns jsonb", start);
    const semicolonEnd = sql[bodyQuote.end] === ";" ? bodyQuote.end + 1 : bodyQuote.end;
    const definition = sql.slice(start, semicolonEnd);
    return {
      definition,
      signature: signatureEnd < 0 || signatureEnd > bodyQuote.start
        ? ""
        : sql.slice(start + marker.length, signatureEnd).replace(/\s+/g, " ").trim(),
      body: sql.slice(bodyQuote.contentStart, bodyQuote.contentEnd),
    };
  }

  function parseDuplicateRpcPrivilegeStatements(sql: string) {
    const target = " on function public.marketing_plan_duplicate_working_row(uuid, date, time) ";
    return splitExecutablePostgresStatements(sql)
      .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
      .filter((statement) => statement.includes(target))
      .map((statement) => {
        const match = statement.match(
          /^(grant|revoke)\s+(.+?)\s+on function public\.marketing_plan_duplicate_working_row\(uuid, date, time\)\s+(to|from)\s+(.+)$/,
        );
        if (!match) return { action: "invalid", privileges: [], grantees: [] };
        return {
          action: match[1],
          privileges: match[2].split(",").map((value) => value.trim()),
          grantees: match[4].split(",").map((value) => value.trim()),
        };
      });
  }

  function duplicateAuthorizationResult(
    isAdmin: boolean | null,
    isPic: boolean | null,
    isSubPic: boolean | null,
  ) {
    return Boolean(isAdmin ?? false)
      || Boolean(isPic ?? false)
      || Boolean(isSubPic ?? false);
  }

  function duplicatePublishTimeIsAllowed(
    value: { hour: number; minute: number; second: number } | null,
  ) {
    return value === null
      || (
        value.hour >= 0
        && value.hour <= 23
        && value.minute === 0
        && value.second === 0
      );
  }

  it("ignores commented-out duplicate RPC definitions", () => {
    const commentedOutDefinition = [
      "/*",
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid,",
      "  p_launch_date date,",
      "  p_publish_time time default null",
      ") returns jsonb",
      "language plpgsql",
      "as $$",
      "begin",
      "  return '{}'::jsonb;",
      "end;",
      "$$;",
      "*/",
      "-- create or replace function public.marketing_plan_duplicate_working_row(",
      "--   p_source_content_item_id uuid, p_launch_date date, p_publish_time time default null",
      "-- ) returns jsonb as $$ begin return '{}'::jsonb; end; $$;",
    ].join("\n");

    expect(extractDuplicateRpc(commentedOutDefinition)).toEqual({
      definition: "",
      signature: "",
      body: "",
    });
  });

  it("ignores fake duplicate RPC definitions inside nested block comments", () => {
    const nestedCommentDecoy = [
      "/* outer review note",
      "  /* nested review note */",
      "  create or replace function public.marketing_plan_duplicate_working_row(",
      "    p_source_content_item_id uuid,",
      "    p_launch_date date,",
      "    p_publish_time time default null",
      "  ) returns jsonb",
      "  language plpgsql",
      "  as $$",
      "  begin",
      "    return '{\"decoy\":true}'::jsonb;",
      "  end;",
      "$$;",
      "*/",
    ].join("\n");

    expect(extractDuplicateRpc(nestedCommentDecoy)).toEqual({
      definition: "",
      signature: "",
      body: "",
    });
  });

  it("ignores fake duplicate RPC definitions inside dollar-quoted text", () => {
    const dollarQuotedDecoy = [
      "do $decoy$",
      "begin",
      "  create or replace function public.marketing_plan_duplicate_working_row(",
      "    p_source_content_item_id uuid,",
      "    p_launch_date date,",
      "    p_publish_time time default null",
      "  ) returns jsonb",
      "  language plpgsql",
      "  as $$",
      "  begin",
      "    return '{\"decoy\":true}'::jsonb;",
      "  end;",
      "$$;",
      "end;",
      "$decoy$;",
    ].join("\n");

    expect(extractDuplicateRpc(dollarQuotedDecoy)).toEqual({
      definition: "",
      signature: "",
      body: "",
    });
  });

  it("ignores fake RPC markers inside escaped strings and quoted identifiers", () => {
    const quotedDecoys = [
      "select E'prefix \\' still one string",
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid, p_launch_date date, p_publish_time time default null",
      ") returns jsonb language plpgsql as $$",
      "begin return jsonb_build_object(); end;",
      "$$;';",
      'select "prefix "" still one identifier',
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid, p_launch_date date, p_publish_time time default null",
      ") returns jsonb language plpgsql as $$",
      "begin return jsonb_build_object(); end;",
      '$$;";',
    ].join("\n");

    expect(extractDuplicateRpc(quotedDecoys)).toEqual({
      definition: "",
      signature: "",
      body: "",
    });
  });

  it("treats a trailing backslash in an ordinary string as literal before a real RPC", () => {
    const realDefinition = [
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid,",
      "  p_launch_date date,",
      "  p_publish_time time default null",
      ") returns jsonb",
      "language plpgsql",
      "as $function$",
      "begin",
      "  return '{}'::jsonb;",
      "end;",
      "$function$;",
    ].join("\n");
    const sql = [String.raw`select 'ordinary\';`, realDefinition].join("\n");

    expect(extractDuplicateRpc(sql).definition).toBe(realDefinition);
  });

  it("does not start dollar quoting when a valid-looking tag is identifier-adjacent", () => {
    const realDefinition = [
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid,",
      "  p_launch_date date,",
      "  p_publish_time time default null",
      ") returns jsonb",
      "language plpgsql",
      "as $$",
      "begin",
      "  return '{}'::jsonb;",
      "end;",
      "$$;",
    ].join("\n");
    const sql = ["select identifier$tag$;", realDefinition].join("\n");

    expect(extractDuplicateRpc(sql).definition).toBe(realDefinition);
  });

  it("keeps fake RPC markers masked inside valid E and e escape strings", () => {
    const realDefinition = [
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid,",
      "  p_launch_date date,",
      "  p_publish_time time default null",
      ") returns jsonb",
      "language plpgsql",
      "as $real$",
      "begin",
      "  return '{}'::jsonb;",
      "end;",
      "$real$;",
    ].join("\n");
    const sql = [
      String.raw`select E'escaped \' create or replace function public.marketing_plan_duplicate_working_row(uuid, date, time)';`,
      String.raw`select e'escaped \' create or replace function public.marketing_plan_duplicate_working_row(uuid, date, time)';`,
      realDefinition,
    ].join("\n");

    expect(extractDuplicateRpc(sql).definition).toBe(realDefinition);
  });

  it("preserves comment-like text in quoted values and tagged function bodies", () => {
    const realDefinition = [
      "create or replace function public.marketing_plan_duplicate_working_row(",
      "  p_source_content_item_id uuid,",
      "  p_launch_date date,",
      "  p_publish_time time default null",
      ") returns jsonb",
      "language plpgsql",
      "as $function$",
      "begin",
      "  perform '-- text, not a line comment';",
      "  perform 'it''s /* text, not a block comment */';",
      "  perform \"-- quoted identifier\";",
      "  return '{} '::jsonb;",
      "end;",
      "$function$;",
    ].join("\n");

    const extracted = extractDuplicateRpc(realDefinition);

    expect(extracted.definition).toBe(realDefinition);
    expect(extracted.body).toContain("perform '-- text, not a line comment';");
    expect(extracted.body).toContain("perform 'it''s /* text, not a block comment */';");
    expect(extracted.body).toContain('perform "-- quoted identifier";');
  });

  it("uses a null-safe authorization truth table for Admin, PIC, and Sub PIC", () => {
    const cases = [
      { label: "both owners null", admin: false, pic: null, subPic: null, allowed: false },
      { label: "PIC nonmatch and Sub PIC null", admin: false, pic: false, subPic: null, allowed: false },
      { label: "PIC null and Sub PIC nonmatch", admin: false, pic: null, subPic: false, allowed: false },
      { label: "valid Admin", admin: true, pic: null, subPic: null, allowed: true },
      { label: "valid PIC", admin: false, pic: true, subPic: null, allowed: true },
      { label: "valid Sub PIC", admin: false, pic: null, subPic: true, allowed: true },
    ];

    for (const testCase of cases) {
      expect(
        duplicateAuthorizationResult(testCase.admin, testCase.pic, testCase.subPic),
        testCase.label,
      ).toBe(testCase.allowed);
    }

    for (const sqlPath of duplicateRpcFiles) {
      const { body } = extractDuplicateRpc(readFileSync(sqlPath, "utf8"));
      expect(body, sqlPath).toContain("coalesce(public.is_admin_app_user(v_actor_id), false)");
      expect(body, sqlPath).toContain("coalesce(v_source.pic_user_id = v_actor_id, false)");
      expect(body, sqlPath).toContain("coalesce(v_source.sub_pic_user_id = v_actor_id, false)");
    }
  });

  it("accepts N/A and 00:00-23:00 but rejects PostgreSQL 24:00 and partial hours", () => {
    const cases = [
      { label: "N/A", value: null, allowed: true },
      { label: "start of day", value: { hour: 0, minute: 0, second: 0 }, allowed: true },
      { label: "end of day", value: { hour: 23, minute: 0, second: 0 }, allowed: true },
      { label: "PostgreSQL end-of-day alias", value: { hour: 24, minute: 0, second: 0 }, allowed: false },
      { label: "minute offset", value: { hour: 14, minute: 1, second: 0 }, allowed: false },
      { label: "second offset", value: { hour: 14, minute: 0, second: 1 }, allowed: false },
    ];

    for (const testCase of cases) {
      expect(duplicatePublishTimeIsAllowed(testCase.value), testCase.label).toBe(testCase.allowed);
    }

    for (const sqlPath of duplicateRpcFiles) {
      const { body } = extractDuplicateRpc(readFileSync(sqlPath, "utf8"));
      expect(body, sqlPath).toContain("p_publish_time is null");
      expect(body, sqlPath).toContain("extract(hour from p_publish_time) between 0 and 23");
      expect(body, sqlPath).toContain("extract(minute from p_publish_time) = 0");
      expect(body, sqlPath).toContain("extract(second from p_publish_time) = 0");
    }
  });

  it("parses only this function's grants and exposes execute only to authenticated", () => {
    const parserFixture = `
      grant execute on function public.some_adjacent_rpc(uuid, date, time) to anon;
      revoke all on function ${duplicateRpcSignature} from public, anon, authenticated;
      grant execute on function ${duplicateRpcSignature} to authenticated, another_role;
      grant execute on function public.marketing_plan_duplicate_working_row(uuid, date) to public;
    `;
    expect(parseDuplicateRpcPrivilegeStatements(parserFixture)).toEqual([
      { action: "revoke", privileges: ["all"], grantees: ["public", "anon", "authenticated"] },
      { action: "grant", privileges: ["execute"], grantees: ["authenticated", "another_role"] },
    ]);

    for (const sqlPath of duplicateRpcFiles) {
      const sql = readFileSync(sqlPath, "utf8");
      expect(parseDuplicateRpcPrivilegeStatements(sql), sqlPath).toEqual([
        { action: "revoke", privileges: ["all"], grantees: ["public", "anon", "authenticated"] },
        { action: "grant", privileges: ["execute"], grantees: ["authenticated"] },
      ]);
    }
  });

  it("ignores privilege decoys and parses only executable top-level statements", () => {
    const parserFixture = [
      "/* ignored block statement;",
      `revoke all on function ${duplicateRpcSignature} from public, anon, authenticated;`,
      `grant execute on function ${duplicateRpcSignature} to anon;`,
      "*/",
      `-- ignored line statement; grant execute on function ${duplicateRpcSignature} to anon;`,
      "select 'ignored quoted statement;",
      `grant execute on function ${duplicateRpcSignature} to anon;`,
      "';",
      "do $decoy$",
      "begin",
      `  revoke all on function ${duplicateRpcSignature} from public;`,
      `  grant execute on function ${duplicateRpcSignature} to anon;`,
      "end;",
      "$decoy$;",
      `revoke all on function ${duplicateRpcSignature} from public, anon, authenticated;`,
      `grant execute on function ${duplicateRpcSignature} to authenticated;`,
      "grant execute on function public.marketing_plan_duplicate_working_row(uuid, date) to public;",
    ].join("\n");

    expect(parseDuplicateRpcPrivilegeStatements(parserFixture)).toEqual([
      { action: "revoke", privileges: ["all"], grantees: ["public", "anon", "authenticated"] },
      { action: "grant", privileges: ["execute"], grantees: ["authenticated"] },
    ]);
  });

  it("defines the same locked and narrowly authorized clone transaction in both installers", () => {
    const contracts = duplicateRpcFiles.map((sqlPath) => ({
      sqlPath,
      sql: readFileSync(sqlPath, "utf8"),
    })).map(({ sqlPath, sql }) => ({ sqlPath, sql, ...extractDuplicateRpc(sql) }));

    for (const contract of contracts) {
      expect(contract.definition, contract.sqlPath).not.toBe("");
      expect(contract.signature, contract.sqlPath).toBe(
        "p_source_content_item_id uuid, p_launch_date date, p_publish_time time default null",
      );
      expect(contract.definition, contract.sqlPath).toContain(
        "language plpgsql\nsecurity definer\nset search_path = public, pg_temp",
      );

      const sourceLockIndex = contract.body.indexOf("for update;");
      const authorizationIndex = contract.body.indexOf("public.is_admin_app_user(v_actor_id)");
      const contentInsertIndex = contract.body.indexOf("insert into public.marketing_content_items");
      const placementInsertIndex = contract.body.indexOf("insert into public.marketing_channel_placements");
      expect(sourceLockIndex, contract.sqlPath).toBeGreaterThanOrEqual(0);
      expect(authorizationIndex, contract.sqlPath).toBeGreaterThan(sourceLockIndex);
      expect(contentInsertIndex, contract.sqlPath).toBeGreaterThan(authorizationIndex);
      expect(placementInsertIndex, contract.sqlPath).toBeGreaterThan(contentInsertIndex);

      expect(contract.body, contract.sqlPath).toContain("v_actor_id := auth.uid()");
      expect(contract.body, contract.sqlPath).toContain("from public.users u\n  where u.id = v_actor_id\n    and u.is_active = true");
      expect(contract.body, contract.sqlPath).toContain("v_actor.display_name");
      expect(contract.body, contract.sqlPath).toContain("v_source.pic_user_id = v_actor_id");
      expect(contract.body, contract.sqlPath).toContain("v_source.sub_pic_user_id = v_actor_id");
      expect(contract.body, contract.sqlPath).not.toContain("can_manage_marketing_schedule");
      expect(contract.body, contract.sqlPath).toContain("if v_source.requires_brief is distinct from true then");
      expect(contract.body, contract.sqlPath).toContain("if p_launch_date is null then");
      expect(contract.body, contract.sqlPath).not.toContain("select count(*)");
      expect(contract.body, contract.sqlPath).toContain("v_source_placement public.marketing_channel_placements%rowtype");
      expect(contract.body, contract.sqlPath).toContain("for v_source_placement in");
      expect(contract.body, contract.sqlPath).toContain(
        "from public.marketing_channel_placements source\n    where source.content_item_id = v_source.id\n    order by source.id\n    for update",
      );
      expect(contract.body.match(/from public\.marketing_channel_placements source/g), contract.sqlPath)
        .toHaveLength(1);
      expect(contract.body, contract.sqlPath).toContain(
        "v_source_placement_count := v_source_placement_count + 1",
      );
      expect(contract.body, contract.sqlPath).toContain("if v_source_placement_count < 1 then");
      expect(contract.body.indexOf("if v_source_placement_count < 1 then"), contract.sqlPath)
        .toBeGreaterThan(placementInsertIndex);
      expect(contract.body.match(/insert into public\.marketing_content_items/g), contract.sqlPath).toHaveLength(1);
      expect(contract.body.match(/insert into public\.marketing_channel_placements/g), contract.sqlPath).toHaveLength(1);
      expect(contract.body, contract.sqlPath).not.toMatch(/\bexception\s+when\b/i);
      expect(contract.body, contract.sqlPath).not.toMatch(/\b(begin\s+transaction|commit|rollback)\b/i);
      if (contract.body.includes("v_effective_publish_time")) {
        expect(contract.body, contract.sqlPath).toContain("when v_source_placement.channel = 'no_tag' then null");
        expect(contract.body, contract.sqlPath).toContain("'publish_time', v_effective_publish_time");
      } else {
        expect(contract.body, contract.sqlPath).toContain("'publish_time', p_publish_time");
      }
    }
  });

  it("copies approved fields, uses current user names, resets integrations, and creates fresh placements", () => {
    for (const sqlPath of duplicateRpcFiles) {
      const sql = readFileSync(sqlPath, "utf8");
      const { body } = extractDuplicateRpc(sql);

      expect(body, sqlPath).toContain("v_new_content_item_id := gen_random_uuid()");
      expect(body, sqlPath).toContain(
        "campaign_id, title, details, team, format, content_tier, pic_user_id, pic_name,",
      );
      expect(body, sqlPath).toContain(
        "sub_pic_user_id, sub_pic_name, note, brief_link, requires_brief, source_start_date,",
      );
      expect(body, sqlPath).toContain(
        "source_start_time, source_sheet_row, flowmate_work_item_id, status, sort_order",
      );
      expect(body, sqlPath).toContain("v_actor_id, v_actor.display_name");
      expect(body, sqlPath).toContain("v_source.campaign_id, v_source.title, v_source.details, v_source.team");
      expect(body, sqlPath).toContain("v_source.format, v_source.content_tier");
      expect(body, sqlPath).toContain("v_source.note, null, v_source.requires_brief, null, null, null, null");
      expect(body, sqlPath).toContain("'not_started', v_source.sort_order");

      expect(body, sqlPath).toContain("where u.id = v_source.sub_pic_user_id\n      and u.is_active = true\n      and u.id <> v_actor_id");
      expect(body, sqlPath).toContain("v_source_sub_pic.display_name");
      expect(body, sqlPath).not.toContain("v_source.sub_pic_name");

      expect(body, sqlPath).toContain(
        "id, content_item_id, channel, publish_date, publish_time, placement_status, posted_url, note",
      );
      expect(body, sqlPath).toContain("gen_random_uuid(), v_new_content_item_id, v_source_placement.channel, p_launch_date,");
      if (body.includes("v_effective_publish_time")) {
        expect(body, sqlPath).toContain("v_effective_publish_time := null;");
        expect(body, sqlPath).toContain("when v_source_placement.channel = 'no_tag' then null");
        expect(body, sqlPath).toContain("'publish_time', v_effective_publish_time");
      } else {
        expect(body, sqlPath).toContain("p_publish_time, 'planned', null, v_source_placement.note");
        expect(body, sqlPath).toContain("'publish_time', p_publish_time");
      }
      expect(body, sqlPath).toContain("where source.content_item_id = v_source.id");
      expect(body, sqlPath).toContain("'content_item_id', v_new_content_item_id");
      expect(body, sqlPath).toContain("'launch_date', p_launch_date");

      expect(sql, sqlPath).toContain("-- Manual rollback-safe verification checklist (do not run against production):");
      expect(sql, sqlPath).toContain("-- Unauthorized actor: function raises before either insert, leaving zero new rows.");
      expect(sql, sqlPath).toContain("-- Placement insert failure: the uncaught error rolls back the preceding content insert.");
      expect(sql, sqlPath).toContain("-- Successful clone: content and placement IDs are distinct and Brief/FlowMate/source links are null.");
      expect(sql, sqlPath).toContain("-- Channel check: the new row has exactly the source channels and preserves each placement note.");
      expect(sql, sqlPath).toContain("-- Same-date duplication is accepted; no date-based dedupe state is created.");
    }
  });
});
