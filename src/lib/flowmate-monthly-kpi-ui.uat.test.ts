import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readRepo = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("FlowMate Creative monthly KPI UI", () => {
  it("loads the Supervisor-only monthly aggregate views", () => {
    const loader = readRepo("supabase-list-data.js");

    expect(loader).toContain("async function loadFlowMateCreativeKpiMonthly()");
    expect(loader).toContain('.from("flowmate_creative_kpi_gdve_monthly_v")');
    expect(loader).toContain('.from("flowmate_creative_kpi_requester_monthly_v")');
    expect(loader).toContain('.order("review_month", { ascending: true })');
    expect(loader).toContain("window.loadFlowMateCreativeKpiMonthly = loadFlowMateCreativeKpiMonthly");
  });

  it("keeps KPI under Supervisor and exposes monthly views for both roles", () => {
    const app = readRepo("app.jsx");
    const screen = readRepo("screens-c.jsx");

    expect(app).toContain('key: "kpi"');
    expect(app).toContain('label: "Creative KPI"');
    expect(screen).toContain('data-testid={`flowmate-kpi-tab-${tab.key}`}');
    expect(screen).toContain('{ key: "team", label: "Team overview" }');
    expect(screen).toContain('{ key: "gdve", label: "GD/VE" }');
    expect(screen).toContain('{ key: "requester", label: "Requester" }');
    expect(screen).toContain('data-testid="flowmate-kpi-person-filter"');
    expect(screen).toContain('data-testid="flowmate-kpi-range-filter"');
  });

  it("shows progression with sample size, percentiles, team benchmark, and resilient states", () => {
    const screen = readRepo("screens-c.jsx");
    const monthlyScreen = screen.slice(screen.indexOf("function CreativeKpiScreen"), screen.indexOf("function calendarUtcKeyC"));
    const css = readRepo("app.css");

    expect(screen).toContain("function FlowMateKpiTrendChartC");
    expect(screen).toContain("P50 typical");
    expect(screen).toContain("P85 slower cases");
    expect(screen).toContain("Team benchmark");
    expect(screen).toContain("Small sample");
    expect(screen).toContain("No eligible monthly data");
    expect(screen).toContain("Retry");
    expect(screen).toContain("Missing");
    expect(screen).toContain("Exceptions");
    expect(monthlyScreen).toContain("not ranking");
    expect(css).toContain(".creative-kpi__chart");
    expect(css).toContain("@media (max-width: 760px)");
  });
});
