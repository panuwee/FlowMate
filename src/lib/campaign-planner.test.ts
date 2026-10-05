import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("app.jsx", "utf8");
const helpers = source.slice(source.indexOf("function getCampaignPlannerWindow("), source.indexOf("function MarketingPlanCampaignPlannerScreen("));
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("function normalizeMarketingPlanWorkingStatus("), source.indexOf("function getMarketingPlanStatusClass(")), context);
vm.runInContext(helpers, context);

describe("Campaign Planner calendar dates", () => {
  it("starts rolling windows at the selected month and keeps full year", () => {
    expect(context.getCampaignPlannerWindow("2026-08", 3)).toMatchObject({ start: "2026-08-01", end: "2026-10-31", days: 92 });
    expect(context.getCampaignPlannerWindow("2026-09", 6)).toMatchObject({ start: "2026-09-01", end: "2027-02-28", days: 181 });
    expect(context.getCampaignPlannerWindow("2026-12", 3).months.map(month => month.key)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(context.getCampaignPlannerWindow("2026-09", 12)).toMatchObject({ start: "2026-01-01", end: "2026-12-31", days: 365 });
    expect(context.getCampaignPlannerWindow("2028-02", 12).days).toBe(366);
  });
  it("moves over year boundaries", () => {
    expect(context.shiftCampaignPlannerWindow("2026-10-01", 3)).toBe("2027-01");
    expect(context.shiftCampaignPlannerWindow("2026-01-01", -6)).toBe("2025-07");
  });
  it("uses continuous equal seven-day Monday columns", () => {
    for (const span of [3, 6, 12]) {
      const range = context.getCampaignPlannerWindow("2028-02", span);
      expect(range.weeks.length * 7).toBe(range.axisDays);
      expect(range.months.reduce((n, month) => n + month.weeks.length, 0)).toBe(range.weeks.length);
      range.weeks.forEach((week, index) => {
        expect(week.days).toBe(7);
        expect(new Date(week.start).getUTCDay()).toBe(1);
        expect(new Date(week.end).getUTCDay()).toBe(0);
        if (index) expect(Date.parse(week.start) - Date.parse(range.weeks[index - 1].start)).toBe(7 * 86400000);
      });
      expect(range.axisStart <= range.start).toBe(true);
      expect(range.weeks.at(-1).end >= range.end).toBe(true);
    }
    expect(context.getCampaignPlannerWindow("2026-07", 3).months[0].weeks[0]).toMatchObject({ start: "2026-06-29", end: "2026-07-05", days: 7 });
  });
  it("clips spanning campaigns and keeps a one-day event visible", () => {
    const range = context.getCampaignPlannerWindow("2026-07", 3);
    expect(context.getCampaignPlannerBar("2026-06-01", "2026-10-03", range)).toMatchObject({ left: 2 / range.axisDays * 100, width: 92 / range.axisDays * 100, before: true, after: true });
    expect(context.getCampaignPlannerBar("2026-09-30", "2026-09-30", range).width).toBeCloseTo(100 / range.axisDays);
    expect(context.getCampaignPlannerBar("2026-06-30", "2026-06-30", range)).toBeNull();
    expect(context.getCampaignPlannerBar("", "", range)).toBeNull();
    expect(context.getCampaignPlannerBar("2026-08-02", "2026-08-01", range)).toBeNull();
  });
});
describe("Campaign Planner validation", () => {
  const form = { name: "Summer Sale [Jul-2026]", tagline: "", functionCode: "mkt", startDate: "", endDate: "" };
  it.each(["Summer Sale", "[Jul-2026]", "Summer [Foo-2026]", "Summer [Jul-26]", "Summer [Jul-2026] extra"])("rejects %s with an example", name => {
    expect(context.validateCampaignPlannerForm({ ...form, name }).name).toContain("Summer Sale [Jul-2026]");
  });
  it("allows an optional tagline and suffix independent of event month", () => {
    expect(context.validateCampaignPlannerForm({ ...form, startDate: "2026-08-01", endDate: "2026-08-02" })).toEqual({});
  });
  it("checks paired dates and date order", () => {
    expect(context.validateCampaignPlannerForm({ ...form, startDate: "2026-08-01" }).dates).toBeTruthy();
    expect(context.validateCampaignPlannerForm({ ...form, startDate: "2026-08-02", endDate: "2026-08-01" }).dates).toBeTruthy();
    expect(context.validateCampaignPlannerForm({ ...form, tagline: "x".repeat(301) }).tagline).toBeTruthy();
  });
  it("does not display a fabricated percentage for empty/cancelled campaigns", () => {
    expect(context.getCampaignPlannerProgress({})).toBe("ยังไม่มีงาน");
    expect(context.getCampaignPlannerProgress({ cancelled_items: 2 })).toBe("ยกเลิกทั้งหมด");
    expect(context.getCampaignPlannerProgress({ total_items: 8, completed_items: 3 })).toBe("เสร็จ 3/8 งาน · 38%");
  });
  it("paginates beyond API caps and fails instead of returning partial results", async () => {
    let pages = 0;
    const rows = await context.loadCampaignPlannerPages(() => ({ range: async () => ({ data: ++pages === 1 ? Array(500).fill({ id: 1 }) : [{ id: 2 }] }) }));
    expect(rows).toHaveLength(501);
    await expect(context.loadCampaignPlannerPages(() => ({ range: async () => ({ error: new Error("denied") }) }))).rejects.toThrow("denied");
  });
});
describe("Campaign Planner integration boundaries", () => {
  it("groups actual launch days, deduplicates channels and excludes dates outside the viewport", () => {
    const items = [
      { content_item_id: 1, working_placements: [{ launch_date: "2026-08-01" }, { launch_date: "2026-08-01" }, { launch_date: "2026-08-05" }] },
      { content_item_id: 2, working_placements: [{ launch_date: "2026-08-01" }] },
      { content_item_id: 3, working_placements: [{ launch_date: "2026-07-31" }, { launch_date: "2026-11-01" }] },
      { content_item_id: 4, working_placements: [] }
    ];
    const groups = context.getCampaignPlannerLaunchGroups(items, context.getCampaignPlannerWindow("2026-08", 3));
    expect(groups.map(group => ({ date: group.date, ids: group.items.map(item => item.content_item_id) }))).toEqual([
      { date: "2026-08-01", ids: [1, 2] }, { date: "2026-08-05", ids: [1] }
    ]);
  });
  it("sorts tasks by earliest dated placement, missing dates last, without mutating input", () => {
    const items = [
      { content_item_id: 1, working_placements: [] },
      { content_item_id: 2, working_placements: [{ launch_date: "2026-10-02" }] },
      { content_item_id: 3, working_placements: [{ launch_date: null }, { launch_date: "2026-08-01" }, { launch_date: "2026-08-05" }] }
    ];
    expect(context.sortCampaignPlannerItems(items).map(item => item.content_item_id)).toEqual([3, 2, 1]);
    expect(items.map(item => item.content_item_id)).toEqual([1, 2, 3]);
    expect(context.getCampaignPlannerWorkingRow(items[2])).toMatchObject({ launchDate: "2026-08-01", launchEnd: "2026-08-05" });
  });
  it("matches Working Sheet primary placement dates, stored statuses and mixed status", () => {
    const row = context.getCampaignPlannerWorkingRow({ working_placements: [
      { channel: "youtube", launch_date: "2026-08-02", publish_time: "14:00", status: "posted" },
      { channel: "facebook", launch_date: "2026-08-01", publish_time: "11:00", status: "ready" }
    ], flowmate_status: "delivered" });
    expect(row).toMatchObject({ launchDate: "2026-08-01", status: "ready_to_post", hasMixedStatus: true, channels: ["facebook", "youtube"] });
    expect(context.getCampaignPlannerWorkingRow({ working_placements: [] })).toMatchObject({ launchDate: "", status: "", channels: [] });
    expect(context.getCampaignPlannerWorkingRow({ working_placements: [{ status: "planned" }], flowmate_status: "delivered" }).status).toBe("planned");
  });
  it("moves management out of Timeline and registers the new route", () => {
    const timeline = source.slice(source.indexOf("function MarketingPlanTimelineScreen("), source.indexOf("function MarketingPlanChannelPlanScreen("));
    expect(timeline).not.toContain("Manage Campaign");
    expect(timeline).not.toContain("openCampaignManager");
    expect(source).toContain('activeSection.key === "campaign-planner"');
  });
  it("uses server permission, stable IDs, atomic saves and all-campaign totals", () => {
    const planner = source.slice(source.indexOf("function MarketingPlanCampaignPlannerScreen("), source.indexOf("function MarketingPlanTimelineScreen("));
    expect(planner).toContain('client.rpc("marketing_campaign_planner_can_manage")');
    expect(planner).toContain('client.rpc("marketing_campaign_planner_save"');
    expect(planner).toContain('.eq("campaign_tag_id", id)');
    expect(planner).not.toContain('.in("month_key"');
  });
  it.each([null, "existing-id"])("routes save for campaign %s to the scoped RPC", async id => {
    const calls: any[] = [];
    const sandbox = vm.createContext({
      selected: { campaign_tag_id: id, updated_at: "version" },
      form: { name: " Sale [Oct-2026] ", functionCode: "marketing", tagline: "", startDate: "", endDate: "" },
      validateCampaignPlannerForm: () => ({}), setErrors() {}, setSaveError() {}, setSaving() {},
      client: { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: "new-id" }; } },
      dialogRef: { current: { close() {} } }, setSelected() {}, invalidateMarketingPlanDataCache() {},
      refresh: async () => {}, loadMarketingPlanCampaignOptions: async () => {}
    });
    const start = source.indexOf("  async function saveCampaign(event)", source.indexOf("function MarketingPlanCampaignPlannerScreen("));
    vm.runInContext(source.slice(start, source.indexOf("  async function archiveCampaign", start)), sandbox);
    await sandbox.saveCampaign({ preventDefault() {} });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(id ? "marketing_campaign_planner_save" : "marketing_campaign_planner_create");
    expect(calls[0].payload.p_name).toBe("Sale [Oct-2026]");
    if (id) expect(calls[0].payload.p_campaign_tag_id).toBe(id);
    else expect(calls[0].payload).not.toHaveProperty("p_campaign_tag_id");
  });
  it("separates creation from Admin management in UI and SQL", () => {
    const planner = source.slice(source.indexOf("function MarketingPlanCampaignPlannerScreen("), source.indexOf("function MarketingPlanTimelineScreen("));
    expect(planner).toContain("setCanCreate(createPermission.data === true)");
    expect(planner).toContain('{canCreate && <button className="btn btn--primary" onClick={() => openCampaign({}, true)}');
    expect(planner).toContain("{canManage && !selected.is_archived");
    const sql = readFileSync("supabase/marketing_campaign_planner_create_access.sql", "utf8");
    expect(sql).toContain("auth.uid() is not null and public.is_active_app_user() is true");
    expect(sql).toContain("elsif public.marketing_campaign_planner_can_manage() is not true");
    expect(sql).toContain("public.marketing_campaign_planner_can_create() is not true");
    expect(sql).toContain("public.marketing_upsert_campaign_tag(null, p_name, p_function_code)");
    expect(sql).not.toContain("on conflict");
    expect(sql).not.toContain("grant insert");
  });
});
