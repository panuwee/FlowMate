import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

function extractNamedFunction(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) throw new Error(`Missing ${functionName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${functionName}`);
}

function loadNamedFunctions(file: string, names: string[]) {
  const source = repo(file);
  const declarations = names.map(name => extractNamedFunction(source, name)).join("\n");
  const sandbox: Record<string, unknown> = { window: {} };
  vm.runInNewContext(`${declarations}\nthis.helpers = { ${names.join(", ")} };`, sandbox);
  return sandbox.helpers as Record<string, (...args: any[]) => any>;
}

describe("Task 10 final-review frontend remediation", () => {
  it("previews the approved 4 September launch at T-4 and T-2 Thai working days", () => {
    const source = repo("screens-a.jsx");
    const start = source.indexOf("const FLOWMATE_NORMAL_CREATIVE_CAPACITY_PER_DAY");
    const end = source.indexOf("function getFlowMateEarliestCreativeDraftDate");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const declarations = source.slice(start, end);
    class FixedDate extends Date {
      constructor(value?: string | number | Date) {
        super(value === undefined ? "2026-09-03T00:00:00Z" : value);
      }
    }
    const sandbox: Record<string, unknown> = { Date: FixedDate, Set };
    vm.runInNewContext(`${declarations}\nthis.preview = {
      firstDraftDays: FLOWMATE_ASSET_FIRST_DRAFT_WORKING_DAYS,
      finalApprovedDays: FLOWMATE_ASSET_FINAL_APPROVED_WORKING_DAYS,
      firstDraft: getFlowMateDraftDateForLaunchDate("2026-09-04"),
      finalApproved: getFlowMateFinalApprovedDateForLaunchDate("2026-09-04"),
    };`, sandbox);

    expect(sandbox.preview).toEqual({
      firstDraftDays: 4,
      finalApprovedDays: 2,
      firstDraft: "2026-08-31",
      finalApproved: "2026-09-02",
    });
  });

  it("neutralizes and disables inline Working Sheet Time for exclusive No Tag", () => {
    const helpers = loadNamedFunctions("app.jsx", [
      "normalizeWholeHourTime",
      "normalizeMarketingPlanPublishTimeOption",
      "getMarketingPlanLegacyPublishTimeOption",
      "isMarketingPlanNoTagSelection",
      "getMarketingPlanInlineTimeUi",
    ]);

    expect(helpers.getMarketingPlanInlineTimeUi(
      { channels: ["no_tag"], publishTime: "18:00", contentItemId: "row-1" },
      true,
      "",
    )).toEqual({
      isNoTag: true,
      value: "",
      legacyPublishTime: "",
      disabled: true,
      title: "Not required for No Tag",
    });
    expect(helpers.getMarketingPlanInlineTimeUi(
      { channels: ["facebook"], publishTime: "18:00", contentItemId: "row-1" },
      true,
      "",
    )).toEqual({
      isNoTag: false,
      value: "18:00",
      legacyPublishTime: "",
      disabled: false,
      title: "",
    });
  });

  it("uses actual start or First Draft date without Effort and allocation placement", () => {
    const helpers = loadNamedFunctions("screens-c.jsx", [
      "ganttDateKeyFromRowC",
      "ganttTaskStartKeyC",
    ]);
    const historicalNoise = {
      dueDate: "2026-09-10",
      startedAt: "2026-09-06T10:00:00+07:00",
      suggestedStartDate: "2026-09-01",
      effort: 99,
    };
    expect(helpers.ganttTaskStartKeyC(historicalNoise)).toBe("2026-09-06");
    expect(helpers.ganttTaskStartKeyC({ ...historicalNoise, startedAt: "" })).toBe("2026-09-10");

    const teamSchedule = repo("screens-c.jsx").slice(
      repo("screens-c.jsx").indexOf("function TeamGanttScreen"),
      repo("screens-c.jsx").indexOf("function CalendarScreen"),
    );
    expect(teamSchedule).not.toContain("loadFlowMateCapacityAllocationRows");
    expect(teamSchedule).not.toContain("allocationStartByWorkId");
    expect(teamSchedule).not.toContain("capacityRows");
  });

  it("uses Bangkok calendar dates for workload leave and Team Schedule today", () => {
    const workload = loadNamedFunctions("supabase-workload-data.js", [
      "flowmateWorkloadBangkokDateKey",
      "flowmateWorkloadTodayKey",
    ]);
    const screens = loadNamedFunctions("screens-c.jsx", ["flowMateBangkokDateKeyC"]);
    const boundary = new Date("2026-09-02T18:30:00Z");

    expect(workload.flowmateWorkloadBangkokDateKey(boundary)).toBe("2026-09-03");
    expect(workload.flowmateWorkloadTodayKey(boundary)).toBe("2026-09-03");
    expect(screens.flowMateBangkokDateKeyC(boundary)).toBe("2026-09-03");

    const source = repo("screens-c.jsx");
    const teamSchedule = source.slice(
      source.indexOf("function TeamGanttScreen"),
      source.indexOf("function CalendarScreen"),
    );
    expect(teamSchedule).toContain("const todayKey = flowMateBangkokDateKeyC();");
    expect(teamSchedule).not.toContain("const todayKey = calendarUtcKeyC(new Date());");
  });
});
