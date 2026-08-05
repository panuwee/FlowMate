import { describe, expect, it } from "vitest";

// Runtime helper uses a small UMD wrapper so the same contract can be tested
// in Node and loaded directly by GitHub Pages.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mvp = require("../../github/workflow-mvp.js");

describe("workflow MVP contracts", () => {
  it("returns exact formats for each supported channel", () => {
    expect(mvp.getFormatOptionsForChannels(["Facebook"]).map((item: { key: string }) => item.key))
      .toEqual(["1200x1200", "1200x1500"]);
    expect(mvp.getFormatOptionsForChannels(["FB eSport"]).map((item: { key: string }) => item.key))
      .toEqual(["1200x1200", "1200x1500"]);
    expect(mvp.getFormatOptionsForChannels(["TikTok"]).map((item: { key: string }) => item.key))
      .toEqual(["1080x1920", "1200x1500"]);
    expect(mvp.getFormatOptionsForChannels(["Instagram"]).map((item: { key: string }) => item.key))
      .toEqual(["1200x1200", "1200x1500"]);
    expect(mvp.getFormatOptionsForChannels(["YouTube"]).map((item: { key: string }) => item.key))
      .toEqual(["1920x1080"]);
    expect(mvp.getFormatOptionsForChannels(["No Tag"]).map((item: { key: string }) => item.key))
      .toEqual(["custom"]);
    expect(mvp.normalizeChannel("No Tag")).toBe("no_tag");
  });

  it("returns a de-duplicated union for multiple channels", () => {
    expect(mvp.getFormatOptionsForChannels(["Facebook", "YouTube"]).map((item: { key: string }) => item.key))
      .toEqual(["1200x1200", "1200x1500", "1920x1080"]);
    expect(mvp.getFormatOptionsForChannels(["Facebook", "TikTok"]).map((item: { key: string }) => item.key))
      .toEqual(["1200x1200", "1200x1500", "1080x1920"]);
    expect(mvp.normalizeChannel("FB Esports")).toBe("facebook_esport");
  });

  it("rejects a prior selection when the selected channels change", () => {
    expect(mvp.isFormatValidForChannels("1200x1200", ["Facebook"])).toBe(true);
    expect(mvp.isFormatValidForChannels("1200x1200", ["YouTube"])).toBe(false);
  });

  it("can replace fallback options with the server catalog", () => {
    expect(mvp.setCreativeFormatCatalog([
      { channel_code: "facebook", format_code: "server-square", width_px: 900, height_px: 900, aspect_ratio: "1:1", display_label: "Server square" },
    ])).toBe(true);
    expect(mvp.getFormatOptionsForChannels(["Facebook"])).toEqual([
      { key: "server-square", width: 900, height: 900, aspectRatio: "1:1", label: "Server square" },
    ]);
  });

  it("normalizes teams and limits standard users to assigned teams", () => {
    expect(mvp.normalizeTeamKey("GD/VE")).toBe("gdve");
    expect(mvp.getAccessibleTeams({ accessible_teams: ["Ops", "eSport"] }).map((team: { key: string }) => team.key))
      .toEqual(["ops", "esport"]);
    expect(mvp.getAccessibleTeams({ can_access_all_teams: true })).toHaveLength(4);
  });

  it("normalizes campaign names and theme values", () => {
    expect(mvp.normalizeCampaignName("  MS26.07   Launch ")).toBe("ms26.07 launch");
    expect(mvp.normalizeTheme("dark")).toBe("dark");
    expect(mvp.normalizeTheme("system")).toBe("light");
  });
});
