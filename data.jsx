// FlowMate — shared data, icons, and small UI atoms
// All globals exported to `window` so other Babel scripts can use them.

/* ---------- Inline icon set (Lucide-style 1.6 stroke) ---------- */
const ICONS = {
  search: <><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></>,
  plus: <><path d="M12 5v14"></path><path d="M5 12h14"></path></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10 21a2 2 0 0 0 4 0"></path></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.5 5h13l3.5 7v7a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-7Z"></path></>,
  list: <><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></>,
  board: <><rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="11" rx="1"></rect></>,
  queue: <><path d="M21 6H3"></path><path d="M21 12H8"></path><path d="M21 18H3"></path></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></>,
  settings: <><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>,
  check: <><polyline points="20 6 9 17 4 12"></polyline></>,
  clock: <><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></>,
  zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></>,
  play: <><polygon points="6 4 20 12 6 20 6 4"></polygon></>,
  send: <><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></>,
  rerun: <><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></>,
  filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></>,
  more: <><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></>,
  chevron: <><polyline points="9 18 15 12 9 6"></polyline></>,
  arrow: <><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></>,
  x: <><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></>,
  block: <><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></>,
  pencil: <><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></>,
  pause: <><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></>,
};
function Icon({ name, size = 16, ...rest }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      {path}
    </svg>
  );
}

/* ---------- Domain data ---------- */
const MEMBERS = [
  { id: "m-pond", name: "Pond",   initials: "PD", color: "#2E546D", discipline: "Hybrid",        skills: ["static-graphic", "general-video", "motion", "esport-video-backup"], capacityPerDay: 8, wipLimit: 3, availability: "available" },
  { id: "m-jo",   name: "Jo",     initials: "JO", color: "#C0504D", discipline: "Static Graphic", skills: ["static-graphic"], capacityPerDay: 8, wipLimit: 3, availability: "available" },
  { id: "m-tong", name: "Tong",   initials: "TG", color: "#BF6B00", discipline: "Static Graphic", skills: ["static-graphic"], capacityPerDay: 8, wipLimit: 3, availability: "partial", capacityOverride: 4 },
  { id: "m-eye",  name: "Eye",    initials: "EY", color: "#2E546D", discipline: "Static Graphic", skills: ["static-graphic"], capacityPerDay: 8, wipLimit: 3, availability: "available" },
  { id: "m-vee",  name: "Vee",    initials: "VE", color: "#C0504D", discipline: "eSport Video",   skills: ["esport-video"], capacityPerDay: 8, wipLimit: 2, availability: "available" },
];
const MEMBERS_BY_ID = Object.fromEntries(MEMBERS.map(m => [m.id, m]));

const TEAMS = ["Marketing", "Esport Ops", "Community", "Sales", "Product", "Operations"];

// Today is May 15 2026 per design system context
const TODAY = "May 15";

const WORK = [
  // OVERDUE
  { id: "CR-1042", type: "creative", title: "Free Fire OB48 launch — IG carousel set (6 frames)",
    status: "in_progress", priority: "urgent", effort: 4, dueLabel: "May 13", dueDelta: -2,
    assetType: "static-graphic", subtype: "social carousel", platform: "Instagram", size: "1080×1350",
    requesterTeam: "Marketing", campaign: "OB48 Launch",
    assignee: "m-jo", requester: "Lin Chen",
    reviewRound: 0, checklist: { done: 4, total: 6 },
    overdue: true },
  { id: "CR-1038", type: "creative", title: "AOV ranked season promo banner — YouTube end-card",
    status: "blocked", priority: "high", effort: 2, dueLabel: "May 14", dueDelta: -1,
    assetType: "static-graphic", platform: "YouTube", size: "1920×1080",
    requesterTeam: "Marketing", campaign: "AOV S24",
    assignee: "m-eye", requester: "Daniel Park",
    blockReason: "Waiting on legal copy review",
    reviewRound: 1, checklist: { done: 2, total: 5 },
    overdue: true },

  // DUE SOON / IN PROGRESS / REVIEW
  { id: "CR-1051", type: "creative", title: "CODM World Championship — TikTok teaser (15s)",
    status: "in_progress", priority: "urgent", effort: 7, dueLabel: "May 16", dueDelta: 1,
    assetType: "esport-video", subtype: "short-form", platform: "TikTok", size: "1080×1920",
    requesterTeam: "Esport Ops", campaign: "CODM Worlds",
    assignee: "m-vee", requester: "Mira Santos",
    reviewRound: 0, checklist: { done: 3, total: 5 } },
  { id: "CR-1047", type: "creative", title: "Q2 partner deck — chart visual refresh (8 slides)",
    status: "review", priority: "normal", effort: 4, dueLabel: "May 17", dueDelta: 2,
    assetType: "static-graphic", platform: "Deck", size: "1920×1080",
    requesterTeam: "Sales", campaign: "Q2 Partner Review",
    assignee: "m-pond", requester: "Aisha Rahman",
    reviewRound: 1, checklist: { done: 5, total: 5 } },
  { id: "CR-1049", type: "creative", title: "AOV community spotlight — motion intro (6s loop)",
    status: "assigned", priority: "normal", effort: 6, dueLabel: "May 19", dueDelta: 4,
    assetType: "motion", platform: "Instagram, YouTube", size: "1080×1080",
    requesterTeam: "Community", campaign: "Spotlight #14",
    assignee: "m-pond", requester: "Jamal Wright",
    reviewRound: 0, checklist: { done: 0, total: 4 } },
  { id: "CR-1052", type: "creative", title: "Garena careers — campus visit recap reel",
    status: "in_progress", priority: "normal", effort: 6, dueLabel: "May 21", dueDelta: 6,
    assetType: "general-video", platform: "LinkedIn", size: "1080×1080",
    requesterTeam: "Operations", campaign: "Campus 2026",
    assignee: "m-pond", requester: "Hana Liu",
    reviewRound: 0, checklist: { done: 1, total: 4 } },
  { id: "CR-1045", type: "creative", title: "Esport graphic pack — FF Pro League finals",
    status: "in_progress", priority: "high", effort: 8, dueLabel: "May 20", dueDelta: 5,
    assetType: "static-graphic", subtype: "esport pack — full set", platform: "Multi",
    requesterTeam: "Esport Ops", campaign: "FFPL Finals",
    assignee: "m-tong", requester: "Mira Santos",
    reviewRound: 0, checklist: { done: 2, total: 8 } },
  { id: "CR-1050", type: "creative", title: "Anti-cheat update — explainer thumbnail set",
    status: "assigned", priority: "normal", effort: 2, dueLabel: "May 18", dueDelta: 3,
    assetType: "static-graphic", platform: "Web, YouTube",
    requesterTeam: "Product", campaign: "Anti-Cheat 2.3",
    assignee: "m-eye", requester: "Soo-yeon Park",
    reviewRound: 0, checklist: { done: 0, total: 3 } },
  { id: "CR-1048", type: "creative", title: "FF skin reveal — short-form vertical (10s)",
    status: "review", priority: "high", effort: 4, dueLabel: "May 18", dueDelta: 3,
    assetType: "esport-video", subtype: "short-form", platform: "TikTok, Reels",
    requesterTeam: "Marketing", campaign: "FF May Drop",
    assignee: "m-vee", requester: "Lin Chen",
    reviewRound: 2, checklist: { done: 4, total: 4 } },

  // QUEUED
  { id: "CR-1053", type: "creative", title: "AOV launch — hybrid package (key art + 20s motion)",
    status: "queued", priority: "high", effort: 8, dueLabel: "May 22", dueDelta: 7,
    assetType: "hybrid", platform: "Multi",
    requesterTeam: "Marketing", campaign: "AOV S24 Launch",
    requester: "Daniel Park",
    queueReason: "Hybrid request must be split into separate static + video requests.",
    needsSplit: true },
  { id: "CR-1054", type: "creative", title: "Free Fire MX — regional banner refresh (4 sizes)",
    status: "queued", priority: "normal", effort: 4, dueLabel: "May 18", dueDelta: 3,
    assetType: "static-graphic", platform: "Web, App",
    requesterTeam: "Marketing", campaign: "FF MX June",
    requester: "Aisha Rahman",
    queueReason: "All static graphic designers at WIP limit before due date." },
  { id: "CR-1055", type: "creative", title: "Pro League finals — venue signage motion loop",
    status: "queued", priority: "urgent", effort: 7, dueLabel: "May 17", dueDelta: 2,
    assetType: "motion", platform: "Venue", size: "3840×1080",
    requesterTeam: "Esport Ops", campaign: "FFPL Finals",
    requester: "Mira Santos",
    queueReason: "Pond at WIP limit; no other motion-capable member with remaining capacity before due date." },

  // NEED BRIEF
  { id: "CR-1056", type: "creative", title: "Community AMA recap — graphics",
    status: "need_brief", priority: "low", effort: null, dueLabel: "May 24", dueDelta: 9,
    assetType: "static-graphic", requesterTeam: "Community",
    requester: "Jamal Wright",
    queueReason: "Need Brief: brief link and size/format are required." },

  // QUICK TASKS
  { id: "QT-209",  type: "quick", title: "Update shared brand-asset folder structure for Q2",
    status: "in_progress", priority: "normal", dueLabel: "May 16", dueDelta: 1,
    assignee: "m-pond", requester: "Pond", requesterTeam: "GD/VE Internal",
    checklist: { done: 2, total: 4 } },
  { id: "QT-211",  type: "quick", title: "Pull retention chart numbers for tomorrow's standup",
    status: "assigned", priority: "low", dueLabel: "May 15", dueDelta: 0,
    assignee: "m-eye", requester: "Tom Liu", requesterTeam: "GD/VE Internal",
    checklist: { done: 0, total: 2 } },
  { id: "QT-213",  type: "quick", title: "Review junior designer portfolio — first round",
    status: "assigned", priority: "normal", dueLabel: "May 19", dueDelta: 4,
    assignee: "m-pond", requester: "Pond", requesterTeam: "GD/VE Internal",
    checklist: { done: 0, total: 1 } },

  // DELIVERED (recent — for KPI / board)
  { id: "CR-1031", type: "creative", title: "OB47 patch notes — chart visuals (12 charts)",
    status: "delivered", priority: "normal", effort: 6, dueLabel: "May 10", dueDelta: -5,
    assetType: "static-graphic", platform: "Web", requesterTeam: "Product",
    assignee: "m-jo", requester: "Soo-yeon Park", reviewRound: 1 },
  { id: "CR-1029", type: "creative", title: "May newsletter — header banner",
    status: "delivered", priority: "low", effort: 2, dueLabel: "May 8", dueDelta: -7,
    assetType: "static-graphic", platform: "Email", requesterTeam: "Marketing",
    assignee: "m-eye", requester: "Lin Chen", reviewRound: 0 },
];

const WORK_BY_ID = Object.fromEntries(WORK.map(w => [w.id, w]));

/* ---------- Status / label maps ---------- */
const STATUS_LABEL = {
  new: "New", need_brief: "Need Brief", queued: "Queued", assigned: "Assigned",
  in_progress: "In Progress", review: "Review", delivered: "Delivered",
  blocked: "Blocked", cancelled: "Cancelled",
};
const STATUS_CLASS = {
  new: "badge--new", need_brief: "badge--need", queued: "badge--queued",
  assigned: "badge--assigned", in_progress: "badge--progress", review: "badge--review",
  delivered: "badge--delivered", blocked: "badge--blocked", cancelled: "badge--cancelled",
};

const ASSET_LABEL = {
  "static-graphic": "Static",
  "general-video": "General video",
  "motion": "Motion",
  "esport-video": "Esport video",
  "hybrid": "Hybrid",
};

/* ---------- Small UI atoms ---------- */
function Avatar({ memberId, size = "" }) {
  if (!memberId) return <span className={`avatar avatar--unassigned ${size}`}><Icon name="users" size={11} /></span>;
  const m = MEMBERS_BY_ID[memberId];
  return <span className={`avatar ${size}`} style={{ background: m.color }}>{m.initials}</span>;
}

function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

function PriorityBadge({ level }) {
  const label = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" }[level];
  return <span className={`prio prio--${level}`}><span className="prio__mark"></span>{label}</span>;
}

function DueBadge({ delta, label, status }) {
  if (status === "delivered" || status === "cancelled") {
    return <span className="muted mono">{label}</span>;
  }
  if (delta < 0) {
    return <span className="badge badge--overdue">{label} · {Math.abs(delta)}d late</span>;
  }
  if (delta <= 2) {
    return <span className="badge badge--soon">{label} · {delta === 0 ? "today" : `${delta}d`}</span>;
  }
  return <span className="mono muted">{label}</span>;
}

function Effort({ value, lg }) {
  if (value == null) return <span className="muted mono">—</span>;
  return <span className={`effort${lg ? " effort--lg" : ""}`}>{value}</span>;
}

function TypePill({ type }) {
  if (type === "quick") return <span className="tag" style={{ background: "#FFF7E6", color: "#8A4A12" }}>Quick</span>;
  return <span className="tag" style={{ background: "#E4ECF2", color: "#2E546D" }}>Creative</span>;
}

function Progress({ done, total }) {
  if (!total) return <span className="muted mono">—</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ display: "inline-block", width: 36, height: 4, borderRadius: 2, background: "var(--garena-light-grey)", position: "relative", overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: `0 ${100 - pct}% 0 0`, background: "var(--garena-deep-blue)" }}></span>
      </span>
      <span className="muted mono" style={{ fontSize: 11 }}>{done}/{total}</span>
    </span>
  );
}

/* ---------- Source citation (Garena brand rule) ---------- */
function Source({ children }) {
  return <div className="src">Source: {children}</div>;
}

/* Export */
Object.assign(window, {
  Icon, ICONS,
  MEMBERS, MEMBERS_BY_ID, TEAMS, TODAY,
  WORK, WORK_BY_ID,
  STATUS_LABEL, STATUS_CLASS, ASSET_LABEL,
  Avatar, StatusBadge, PriorityBadge, DueBadge, Effort, TypePill, Progress, Source,
});
