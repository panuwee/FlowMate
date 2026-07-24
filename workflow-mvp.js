(function attachWorkflowMvp(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FlowMateWorkflowMvp = api;
})(typeof window !== "undefined" ? window : null, function createWorkflowMvpApi() {
  const FORMAT_OPTIONS = Object.freeze({
    "1200x1200": Object.freeze({ key: "1200x1200", width: 1200, height: 1200, aspectRatio: "1:1", label: "1200×1200 (1:1)" }),
    "1200x1500": Object.freeze({ key: "1200x1500", width: 1200, height: 1500, aspectRatio: "4:5", label: "1200×1500 (4:5)" }),
    "1080x1920": Object.freeze({ key: "1080x1920", width: 1080, height: 1920, aspectRatio: "9:16", label: "1080×1920 (9:16)" }),
    "1920x1080": Object.freeze({ key: "1920x1080", width: 1920, height: 1080, aspectRatio: "16:9", label: "1920×1080 (16:9)" }),
    custom: Object.freeze({ key: "custom", width: null, height: null, aspectRatio: "custom", label: "Custom / production specification" }),
  });

  const CHANNEL_FORMAT_KEYS = Object.freeze({
    facebook: Object.freeze(["1200x1200", "1200x1500"]),
    tiktok: Object.freeze(["1080x1920", "1200x1500"]),
    instagram: Object.freeze(["1200x1200", "1200x1500"]),
    youtube: Object.freeze(["1920x1080"]),
    in_game: Object.freeze(["custom"]),
    other: Object.freeze(["custom"]),
  });
  let runtimeFormatOptions = { ...FORMAT_OPTIONS };
  let runtimeChannelFormatKeys = Object.fromEntries(
    Object.entries(CHANNEL_FORMAT_KEYS).map(([channel, keys]) => [channel, keys.slice()]),
  );

  const TEAMS = Object.freeze([
    Object.freeze({ key: "gdve", label: "Team GD/VE" }),
    Object.freeze({ key: "ops", label: "Team Ops" }),
    Object.freeze({ key: "mkt", label: "Team MKT" }),
    Object.freeze({ key: "esport", label: "Team eSport" }),
  ]);

  const CAMPAIGN_FUNCTIONS = Object.freeze({
    mkt: Object.freeze({ key: "mkt", label: "MKT", className: "campaign-function--mkt" }),
    ops: Object.freeze({ key: "ops", label: "Ops", className: "campaign-function--ops" }),
    esport: Object.freeze({ key: "esport", label: "eSport", className: "campaign-function--esport" }),
  });

  function normalizeChannel(value) {
    const compact = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (["facebook", "fb", "meta"].includes(compact)) return "facebook";
    if (["tiktok", "tk"].includes(compact)) return "tiktok";
    if (["instagram", "ig", "insta", "reels"].includes(compact)) return "instagram";
    if (["youtube", "yt", "shorts", "youtubeshorts"].includes(compact)) return "youtube";
    if (["ingame", "game", "inapp"].includes(compact)) return "in_game";
    return "other";
  }

  function getFormatOptionsForChannels(channels) {
    const keys = [];
    (Array.isArray(channels) ? channels : [channels]).forEach((channel) => {
      (runtimeChannelFormatKeys[normalizeChannel(channel)] || runtimeChannelFormatKeys.other || []).forEach((key) => {
        if (!keys.includes(key)) keys.push(key);
      });
    });
    return keys.map((key) => runtimeFormatOptions[key]).filter(Boolean);
  }

  function formatLabel(formatKey) {
    return runtimeFormatOptions[String(formatKey || "").trim()]?.label || String(formatKey || "");
  }

  function isFormatValidForChannels(formatKey, channels) {
    const key = String(formatKey || "").trim();
    return Boolean(key) && getFormatOptionsForChannels(channels).some((option) => option.key === key);
  }

  function setCreativeFormatCatalog(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const nextFormats = {};
    const nextChannelFormats = {};
    rows.forEach((row) => {
      const channel = normalizeChannel(row.channelCode || row.channel_code);
      const key = String(row.formatCode || row.format_code || "").trim();
      if (!key) return;
      if (!nextFormats[key]) {
        nextFormats[key] = Object.freeze({
          key,
          width: row.width == null ? row.width_px ?? null : row.width,
          height: row.height == null ? row.height_px ?? null : row.height,
          aspectRatio: row.aspectRatio || row.aspect_ratio || "custom",
          label: row.label || row.display_label || key,
        });
      }
      if (!nextChannelFormats[channel]) nextChannelFormats[channel] = [];
      if (!nextChannelFormats[channel].includes(key)) nextChannelFormats[channel].push(key);
    });
    if (Object.keys(nextFormats).length === 0) return false;
    runtimeFormatOptions = nextFormats;
    runtimeChannelFormatKeys = nextChannelFormats;
    return true;
  }

  function normalizeTeamKey(value) {
    const compact = String(value || "").trim().toLowerCase().replace(/[\s_/-]+/g, "");
    if (["gdve", "gd", "ve", "creative", "design", "video"].includes(compact)) return "gdve";
    if (["ops", "operation", "operations"].includes(compact)) return "ops";
    if (["mkt", "marketing"].includes(compact)) return "mkt";
    if (["esport", "esports"].includes(compact)) return "esport";
    return "";
  }

  function getAccessibleTeams(user) {
    if (user && user.can_access_all_teams) return TEAMS.slice();
    const rawTeams = Array.isArray(user?.accessible_teams)
      ? user.accessible_teams
      : [user?.requester_team];
    const allowed = new Set(rawTeams.map(normalizeTeamKey).filter(Boolean));
    return TEAMS.filter((team) => allowed.has(team.key));
  }

  function canAccessTeam(user, teamKey) {
    const normalized = normalizeTeamKey(teamKey);
    return Boolean(normalized) && getAccessibleTeams(user).some((team) => team.key === normalized);
  }

  function normalizeCampaignName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeCampaignFunction(value) {
    const normalized = normalizeTeamKey(value);
    return normalized === "mkt" || normalized === "ops" || normalized === "esport" ? normalized : "";
  }

  function getCampaignFunction(value) {
    return CAMPAIGN_FUNCTIONS[normalizeCampaignFunction(value)] || null;
  }

  function normalizeTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function applyTheme(value, target) {
    const theme = normalizeTheme(value);
    const element = target || (typeof document !== "undefined" ? document.documentElement : null);
    if (element) element.setAttribute("data-theme", theme);
    return theme;
  }

  return Object.freeze({
    FORMAT_OPTIONS,
    CHANNEL_FORMAT_KEYS,
    TEAMS,
    CAMPAIGN_FUNCTIONS,
    normalizeChannel,
    getFormatOptionsForChannels,
    formatLabel,
    isFormatValidForChannels,
    setCreativeFormatCatalog,
    normalizeTeamKey,
    getAccessibleTeams,
    canAccessTeam,
    normalizeCampaignName,
    normalizeCampaignFunction,
    getCampaignFunction,
    normalizeTheme,
    applyTheme,
  });
});
