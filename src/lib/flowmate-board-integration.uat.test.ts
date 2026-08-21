import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const readRepo = (path: string) => readFileSync(join(repoRoot, path), "utf8");

describe("FlowMate Board integration contracts", () => {
  it("loads archived work directly and makes archived detail read-only", () => {
    const detailSource = readRepo("screens-a.jsx");

    expect(detailSource).toContain("loadFlowMateWorkItemById");
    expect(detailSource).toContain("includeArchived: true");
    expect(detailSource).toContain("Archived work item");
    expect(detailSource).toContain("isArchivedDetail");
    expect(detailSource).toContain("restoreFlowMateArchivedWorkItem");
    expect(detailSource).toContain("Restore archived work");
    expect(detailSource).toContain("throwOnError");
    expect(detailSource).toContain("await refreshDetailItem({ throwOnError: true })");
    expect(detailSource).toContain("Restored in Supabase, but detail refresh failed");
    expect(detailSource).toContain("w.archivedAt");
  });

  it("uses the archive-inclusive KPI loader instead of the active List loader", () => {
    const screensC = readRepo("screens-c.jsx");
    const kpiSource = screensC.slice(
      screensC.indexOf("function KpiScreen"),
      screensC.indexOf("/* ============================================================\n   TEAM CALENDAR"),
    );

    expect(kpiSource).toContain("window.loadFlowMateKpiRows");
    expect(kpiSource).toContain("window.loadFlowMateKpiRows({ month: kpiExportMonth })");
    expect(kpiSource).toContain("[kpiExportMonth]");
    expect(kpiSource).not.toContain("window.loadFlowMateListRows()");
    expect(kpiSource).toContain("Historical Supabase data");

    const loaderSource = readRepo("supabase-list-data.js");
    expect(loaderSource).toContain("async function loadFlowMateKpiRows({ month } = {})");
    expect(loaderSource).toContain('.gte("due_date", monthStart)');
    expect(loaderSource).toContain('.lt("due_date", nextMonthStart)');
  });

  it("passes global search into Board so archived search is an explicit opt-in", () => {
    const appSource = readRepo("app.jsx");
    const boardRender = appSource.slice(
      appSource.indexOf('route === "board"'),
      appSource.indexOf('route === "calendar"'),
    );

    expect(boardRender).toContain("searchQuery: searchQuery");
    expect(appSource).toContain("flowmate:search-archived");
    expect(appSource).toContain("Search archived");
    expect(appSource).toContain('sessionStorage.setItem("flowmate:board:archiveSearch"');
    expect(appSource).toContain("setTimeout(() => {");
    const archiveAction = appSource.slice(
      appSource.indexOf('className: "searchbar__archive-action"'),
      appSource.indexOf('}, React.createElement(Icon, {', appSource.indexOf('className: "searchbar__archive-action"')),
    );
    expect(archiveAction).toContain("onClick:");
    expect(archiveAction).not.toContain("onMouseDown:");
  });

  it("keeps cache tokens synchronized across all deployed entry pages", () => {
    const entries = [
      readRepo("index.html"),
      readRepo("home/index.html"),
      readRepo("product-book/index.html"),
    ];
    const assetNames = [
      "app.css",
      "supabase-list-data.js",
      "supabase-quick-task.js",
      "search-utils.js",
      "screens-a.js",
      "screens-b.js",
      "screens-c.js",
      "app.js",
    ];
    const currentReleaseAssets = new Set([
      "supabase-list-data.js",
      "search-utils.js",
      "screens-b.js",
      "screens-c.js",
      "app.js",
    ]);

    for (const assetName of assetNames) {
      const versions = entries.map((entry) => {
        const match = entry.match(new RegExp(`${assetName.replace(".", "\\.")}\\?v=([0-9a-f-]+)`));
        return match?.[1] || "";
      });
      expect(versions[0], `${assetName} must have a cache token`).not.toBe("");
      expect(new Set(versions).size, `${assetName} cache tokens must match`).toBe(1);
      if (assetName === "app.css") {
        expect(versions[0], "app.css must use the automated release token").toMatch(/^[0-9]{8}-[a-f0-9]{6}$/);
      }
      if (assetName === "app.js") {
        expect(versions[0], "app.js must use the automated release token").toMatch(/^[0-9]{8}-[0-9]{2}$/);
      } else if (assetName === "supabase-list-data.js") {
        expect(versions[0], "supabase-list-data.js must use the current release token").toBe("20260817-01");
      } else if (currentReleaseAssets.has(assetName)) {
        expect(versions[0], `${assetName} must use the current release token`).toBe("20260806-01");
      }
    }
  });
});
