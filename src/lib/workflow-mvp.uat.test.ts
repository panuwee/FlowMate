import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const app = () => read("app.jsx");
const css = () => read("app.css");
const createScreen = () => read("screens-a.jsx");
const catalogSql = () => read("supabase", "workflow_mvp_catalogs.sql");
const esportFormatSql = () => read("supabase", "workflow_esport_channel_multi_format.sql");
const noTagSql = () => read("supabase", "workflow_no_tag_channel.sql");
const teamSql = () => read("supabase", "workflow_team_workspaces.sql");
const gdveVisibilitySql = () => read("supabase", "workflow_gdve_creative_visibility.sql");
const gdveAssigneeStartSql = () => read("supabase", "workflow_gdve_assignee_cross_workspace_start.sql");
const quickTaskSql = () => read("supabase", "rpc_quick_task.sql");

describe("Workflow Management MVP R1-R9 integration", () => {
  it("R1 keeps channel-specific structured formats and invalid-selection validation", () => {
    const screen = createScreen();
    const sql = catalogSql();
    const delta = esportFormatSql();
    expect(screen).toContain('data-testid="creative-format-checkboxes"');
    expect(screen).toContain("nextValue.sizeFormats = nextFormatKeys");
    expect(screen).toContain("getFlowMateCreativeFormatOptions(selectedChannels)");
    expect(screen).toContain("Choose a Size / format that is valid");
    expect(screen).toContain("Asset Count 2 must be at least 1 when Type / Skill 2 is selected.");
    expect(sql).toContain("create table if not exists public.creative_channel_formats");
    expect(sql).toContain("size_format_code");
    expect(sql).toContain("width_px");
    expect(sql).toContain("height_px");
    expect(delta).toContain("size_format_codes text[]");
    expect(delta).toContain("workflow_creative_format_codes_from_text");
    expect(delta).toContain("facebook_esport");
  });

  it("R2 renders every matching Working Row and reports the exact count", () => {
    const source = app();
    expect(source).not.toMatch(/visibleRows\.slice\(0,\s*12\)/);
    expect(source).toContain('data-testid": "working-row-count"');
    expect(source).toContain("visibleRows.map(row =>");
    expect(source).toContain('"Showing ", visibleRows.length, " rows"');
  });

  it("loads Marketing Plan rows by a cached three-month window without dropping month navigation", () => {
    const source = app();
    const loaderSource = source.slice(
      source.indexOf("const MARKETING_PLAN_TIMELINE_SELECT_COLUMNS"),
      source.indexOf("async function findOrCreateMarketingPlan"),
    );
    const workingSheet = source.slice(
      source.indexOf("function MarketingPlanWorkingSheetScreen"),
      source.indexOf("function MarketingPlanSupervisorScreen"),
    );

    expect(loaderSource).toContain("MARKETING_PLAN_TIMELINE_CACHE_TTL_MS");
    expect(loaderSource).toContain("const marketingPlanTimelineCache = new Map()");
    expect(loaderSource).toContain("const marketingPlanTimelineRequests = new Map()");
    expect(loaderSource).toContain('.from("marketing_plans").select("month_key")');
    expect(loaderSource).toContain("getMarketingPlanTimelineWindow(targetMonthKey).monthKeys");
    expect(loaderSource).toContain('.select(MARKETING_PLAN_TIMELINE_SELECT_COLUMNS).in("month_key", windowMonths)');
    expect(loaderSource).not.toContain('.from("marketing_plan_timeline_v").select("*")');
    expect(loaderSource).toContain("marketingPlanTimelineRequests.has(cacheKey)");
    expect(loaderSource).toContain("sortMarketingPlanTimelineRows(cached.rows, orderBy)");
    expect(workingSheet).toContain("useEffectApp(() => {");
    expect(workingSheet).toContain("}, [selectedMonth]);");
    expect(workingSheet).toContain("useMemoApp(() => groupMarketingPlanWorkingSheetRows");
    expect(workingSheet).toContain("useMemoApp(() => resolveMarketingPlanWorkingRowsView");
  });

  it("Phase 2 backfills direct FlowMate links and removes regex joins from reporting views", () => {
    const marketingSql = read("supabase", "marketing_plan.sql");
    const supervisorSql = read("supabase", "marketing_plan_supervisor.sql");
    const migration = read("supabase", "marketing_plan_performance_phase2.sql");
    const verification = read("supabase", "marketing_plan_performance_phase2_verify.sql");
    const timelineView = marketingSql.slice(
      marketingSql.indexOf("create or replace view public.marketing_plan_timeline_v"),
      marketingSql.indexOf("create or replace view public.marketing_campaign_summary_v"),
    );
    const supervisorView = supervisorSql.slice(
      supervisorSql.indexOf("create or replace view public.marketing_plan_supervisor_monthly_v"),
      supervisorSql.indexOf("create or replace view public.marketing_plan_supervisor_pic_v"),
    );

    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
    expect(migration).toContain("where mci.flowmate_work_item_id is null");
    expect(migration).toContain("set flowmate_work_item_id = wi.id");
    expect(migration).toContain("get diagnostics v_backfilled_count = row_count");
    expect(migration).toContain("create or replace view public.marketing_plan_timeline_v");
    expect(migration).toContain("create or replace view public.marketing_plan_supervisor_monthly_v");
    expect(migration).toContain("with (security_invoker = true) as");
    expect(migration).toContain("left join public.work_items wi on wi.id = mci.flowmate_work_item_id");
    expect(migration).toContain("idx_marketing_plans_active_month");
    expect(migration).toContain("idx_marketing_channel_placements_publish_schedule");
    expect(migration).toContain("grant select on public.marketing_plan_timeline_v to authenticated");
    expect(timelineView).not.toContain("substring(mci.brief_link");
    expect(supervisorView).not.toContain("substring(mci.brief_link");
    expect(verification).toContain("Expected mismatched_links = 0");
    expect(verification).toContain("explain (analyze, buffers, format text)");
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
  });

  it("defaults every Marketing Plan publishing screen to the current month", () => {
    const source = app();
    const monthHelperSource = source.slice(
      source.indexOf("function getMarketingPlanMonthOptions"),
      source.indexOf("function normalizeMarketingPlanCampaignOption"),
    );
    const monthHelpers = new Function(`
      function flowMateTodayDateKey() { return "2026-08-03"; }
      ${monthHelperSource}
      return { getMarketingPlanMonthOptions, getDefaultMarketingPlanMonth };
    `)() as {
      getMarketingPlanMonthOptions: (rows: Array<Record<string, string>>) => string[];
      getDefaultMarketingPlanMonth: (monthOptions: string[]) => string;
    };
    const timeline = source.slice(
      source.indexOf("function MarketingPlanTimelineScreen"),
      source.indexOf("function MarketingPlanChannelPlanScreen"),
    );
    const channelPlan = source.slice(
      source.indexOf("function MarketingPlanChannelPlanScreen"),
      source.indexOf("function MarketingPlanCalendarScreen"),
    );
    const calendar = source.slice(
      source.indexOf("function MarketingPlanCalendarScreen"),
      source.indexOf("function MarketingPlanWorkingSheetScreen"),
    );
    const workingSheet = source.slice(
      source.indexOf("function MarketingPlanWorkingSheetScreen"),
      source.indexOf("function MarketingPlanSupervisorScreen"),
    );

    expect(source).toContain("function getMarketingPlanCurrentMonthKey()");
    expect(source).toContain("const months = new Set([getMarketingPlanCurrentMonthKey()])");
    expect(source).toContain("function getDefaultMarketingPlanMonth(monthOptions)");
    expect(monthHelpers.getMarketingPlanMonthOptions([{ monthKey: "2026-07" }])).toEqual([
      "2026-07",
      "2026-08",
    ]);
    expect(monthHelpers.getDefaultMarketingPlanMonth(["2026-07", "2026-08"])).toBe("2026-08");
    for (const screen of [timeline, channelPlan, calendar, workingSheet]) {
      expect(screen).toContain("useStateApp(getMarketingPlanCurrentMonthKey)");
      expect(screen).toContain("getDefaultMarketingPlanMonth(monthOptions)");
      expect(screen).not.toContain("monthOptions[0]");
    }
    expect(timeline).toContain('channelMode === "facebook_esport"');
  });

  it("R3 exposes persistent Light/Dark controls and dark tokens", () => {
    const source = app();
    const styles = css();
    expect((source.match(/React\.createElement\(ThemeToggle/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('flowmate:appearance:v1');
    expect(source).toContain('document.documentElement.setAttribute("data-theme", appearance)');
    expect(styles).toContain('html[data-theme="dark"]');
    expect(styles).toContain("--surface-page: var(--garena-bg)");
  });

  it("R4 combines account-scoped My Tasks, Launch Date range, search, and clear controls", () => {
    const source = app();
    for (const testId of [
      "working-month-filter",
      "marketing-working-my-tasks",
      "working-start-date",
      "working-end-date",
      "working-search",
      "working-filter-reset",
    ]) {
      expect(source).toContain(`"data-testid": "${testId}"`);
    }
    for (const removedTestId of [
      "working-channel-filter",
      "working-status-filter",
      "working-team-filter",
      "working-owner-filter",
    ]) {
      expect(source).not.toContain(`"data-testid": "${removedTestId}"`);
    }
    expect(source).toContain("resolveMarketingPlanWorkingRowsView(groupedWorkingRows");
    expect(source).toContain('"aria-pressed": myTasksOnly');
  });

  it("R5 enforces four team workspaces in UI queries and database RLS", () => {
    const listData = read("supabase-list-data.js");
    const authData = read("supabase-quick-task.js");
    const sql = teamSql();
    const gdveSql = gdveVisibilitySql();
    expect(listData).toContain('.eq("owning_team_code", activeTeam)');
    expect(listData).toContain('activeTeam === "gdve"');
    expect(listData).toContain('.eq("work_type", "creative_request")');
    expect(authData).toContain('from("user_team_memberships")');
    expect(sql).toContain("create table if not exists public.user_team_memberships");
    expect(sql).toContain('create policy "team members can read work items"');
    expect(sql).toContain("flowmate_current_user_can_read_work_item(id)");
    expect(gdveSql).toContain("wi.work_type = 'creative_request'");
    expect(gdveSql).toContain("flowmate_user_is_team_member(p_user_id, 'gdve')");
    expect(gdveSql).toContain("wi.owning_team_code is not null");
    for (const team of ["gdve", "ops", "mkt", "esport"]) expect(sql).toContain(`('${team}'`);
  });

  it("lets only an assigned GD/VE member use assignee-authorized actions across team workspaces", () => {
    const installer = teamSql();
    const hotfix = gdveAssigneeStartSql();
    const transitions = quickTaskSql();

    for (const sql of [installer, hotfix]) {
      const helperStart = sql.indexOf(
        "create or replace function public.flowmate_user_is_gdve_work_item_assignee",
      );
      const helperEnd = sql.indexOf(
        "create or replace function public.flowmate_",
        helperStart + 20,
      );
      const helperSource = sql.slice(helperStart, helperEnd);

      expect(sql).toContain("flowmate_user_is_gdve_work_item_assignee");
      expect(helperSource).not.toContain(
        "flowmate_user_is_team_member(p_user_id, 'gdve')",
      );
      expect(helperSource).toContain("actor_member.user_id = p_user_id");
      expect(helperSource).toContain("actor_member.active = true");
      expect(helperSource).toContain("actor_member.discipline");
      expect(helperSource).toContain("wi.assignee_user_id = p_user_id");
      expect(helperSource).toContain("owner_member.user_id = p_user_id");
      expect(helperSource).toContain("owner_member.active = true");
      expect(sql).toContain("new.owning_team_code is not distinct from old.owning_team_code");
      expect(sql).toContain("and not v_gdve_assignee_same_workspace");
      expect(sql).toContain("flowmate_guard_child_work_item_team");
    }

    expect(hotfix).toContain("insert into public.user_team_memberships");
    expect(hotfix).toContain("on conflict (user_id, team_code) do nothing");
    expect(hotfix).toContain("blocked_by_assignee_helper");
    expect(hotfix).toContain("wi.display_id = 'CR-1022'");
    expect(hotfix).toContain("requesters and unassigned GD/VE users do not receive cross-workspace write");
    expect(hotfix).toContain("assignees can Start Work, Submit Review, Block, Resume, and Cancel");
    expect(hotfix).toContain("requester-only Approve Delivery / Request Changes remain requester-only");
    expect(hotfix).toContain("direct cross-workspace mutation remains denied by RLS");
    expect(hotfix).not.toContain(
      "create or replace function public.flowmate_current_user_can_mutate_work_item",
    );

    const mutateHelper = installer.slice(
      installer.indexOf("create or replace function public.flowmate_current_user_can_mutate_work_item"),
      installer.indexOf("create or replace function public.flowmate_is_trusted_database_context"),
    );
    expect(mutateHelper).not.toContain("flowmate_user_is_gdve_work_item_assignee");

    expect(transitions).toContain("Only owner can start this work");
    expect(transitions).toContain("Only owner can submit this work for review");
    expect(transitions).toContain("Only owner can block this work");
    expect(transitions).toContain("Only owner can resume this work");
    expect(transitions).toContain("Only requester or current owner can cancel this work");
    expect(transitions).toContain("Only requester can approve delivery");
    expect(transitions).toContain("Only requester can request changes");
  });

  it("global search exposes readable task context instead of clipped one-line results", () => {
    const source = app();
    const styles = css();
    for (const label of ["Campaign", "Team", "Requester", "Assignee", "Due"]) {
      expect(source).toContain(`React.createElement("strong", null, "${label}")`);
    }
    expect(source).toContain("searchbar__result-context");
    expect(styles).toContain("width: min(760px, calc(100vw - 32px))");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain(".searchbar__result-meta-item");
  });

  it("R6 persists function colours and renders labelled tags", () => {
    const source = app();
    const sql = catalogSql();
    expect(sql).toContain("create table if not exists public.marketing_campaign_functions");
    expect(sql).toContain("marketing_update_campaign_tag_function");
    expect(source).toContain("Campaign Function Colour Tag");
    expect(source).toContain("campaign-function-tag");
    expect(source).toContain("renderCampaignFunctionTag(campaign)");
  });

  it("R7 searches, sorts, archives, restores, and preserves historical tags", () => {
    const source = app();
    const sql = catalogSql();
    expect(source).toContain("Search campaign tags");
    expect(source).toContain("Most recently used");
    expect(source).toContain("Include archived");
    expect(source).toContain("archiveFlowMateMarketingCampaignTag");
    expect(source).toContain("restoreFlowMateMarketingCampaignTag");
    expect(sql).toContain("marketing_archive_campaign_tag");
    expect(sql).toContain("marketing_restore_campaign_tag");
    expect(sql).toContain("normalized_name");
    expect(sql).toContain("usage_count");
  });

  it("R8 collapses campaign rows accessibly and persists session state", () => {
    const source = app();
    expect(source).toContain("MARKETING_TIMELINE_COLLAPSE_KEY");
    expect(source).toContain("toggleCampaignCollapsed(campaign.id)");
    expect(source).toContain('"aria-expanded": !collapsedCampaignKeys.includes(campaign.id)');
    expect(source).toContain('display: collapsedCampaignKeys.includes(campaign.id) ? "none" : "grid"');
    expect(source).toContain('campaign.assets.length, " rows"');
  });

  it("R9 keeps Home and Product Book accessible in Marketing Plan and all entry pages", () => {
    const source = app();
    expect(source).toContain("function MarketingPlanShell({");
    expect(source).toContain("onSwitchProductBook");
    expect(source).toContain('data-testid": "global-home"');
    for (const entry of [
      ["index.html"],
      ["home", "index.html"],
      ["product-book", "index.html"],
    ]) {
      const html = read(...entry);
      expect(html).toContain("workflow-mvp.js");
      expect(html).toMatch(/app\.js\?v=[0-9]{8}-[0-9]{2}/);
    }
  });

  it("separates FB eSport, filters all Marketing Plan views by function, and renders three months", () => {
    const source = app();
    expect(source).toContain('key: "facebook_esport"');
    expect(source).toContain('key: "facebook-esport-timeline"');
    expect(source).toContain('"FB eSport Timeline"');
    expect(source).toContain('channelMode: "facebook_esport"');
    expect(source).toContain('channelMode: "official"');
    expect(source).toContain('row.channel === "facebook_esport"');
    expect(source).toContain('row.channel !== "facebook_esport"');
    expect(source).toContain("MARKETING_PLAN_ESPORT_TIMELINE_COUNT_CHANNELS");
    expect(source).toContain("getStoredMarketingTimelineCollapsedCampaigns(collapseStorageKey)");
    expect(source).toContain("MarketingPlanFunctionFilter");
    expect((source.match(/React\.createElement\(MarketingPlanFunctionFilter/g) || []).length).toBe(3);
    expect(source).toContain("[monthKey, nextMonthKey, getNextMarketingPlanMonthKey(nextMonthKey)]");
    expect(source).toContain("filterMarketingPlanRows(publishableRows, selectedMonth, selectedChannel, \"\", true)");
    expect(source).toContain('filterMarketingPlanRows(rows, selectedMonth, selectedChannel, "", true).forEach');
  });

  it("stores No Tag exclusively and excludes it from every publishing view", () => {
    const source = app();
    const createSource = createScreen();
    const sql = noTagSql();
    const timelineSource = source.slice(
      source.indexOf("function MarketingPlanTimelineScreen"),
      source.indexOf("function MarketingPlanWorkingSheetScreen"),
    );

    expect(source).toContain('key: "no_tag"');
    expect(source).toContain('label: "No Tag"');
    expect(source).toContain("function getMarketingPlanExclusiveChannels");
    expect(source).toContain('if (channelKey === "no_tag") return ["no_tag"]');
    expect(source).toContain("function isMarketingPlanPublishableChannel");
    expect(timelineSource).toContain('row.channel !== "facebook_esport" && isMarketingPlanPublishableChannel(row.channel)');
    expect((timelineSource.match(/filter\(row => isMarketingPlanPublishableChannel\(row\.channel\)\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(timelineSource).toContain("MARKETING_PLAN_CHANNELS.filter(channel => isMarketingPlanPublishableChannel(channel.key))");
    expect(createSource).toContain('{ key: "no_tag", label: "No Tag" }');
    expect(createSource).toContain('channelLabel === "No Tag"');
    expect(createSource).toContain('"No Tag": ["custom"]');
    expect(sql).toContain("'no_tag'");
    expect(sql).toContain("No Tag cannot be combined with another Channel Tag");
    expect(sql).toContain("marketing_channel_placements_validate_channel_exclusivity");
    expect(sql).toContain("workflow_normalize_creative_channels");
    expect(sql).toContain("('no_tag', 'custom')");
  });

  it("contains no known Thai mojibake markers in runtime source", () => {
    const runtime = [
      app(),
      css(),
      createScreen(),
      read("screens-b.jsx"),
      read("screens-c.jsx"),
      read("workflow-mvp.js"),
    ].join("\n");
    for (const marker of ["เธข", "ยท", "โ€", "�"]) expect(runtime).not.toContain(marker);
  });
});
