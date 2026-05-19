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
const MEMBERS = [];
const MEMBERS_BY_ID = Object.fromEntries(MEMBERS.map(m => [m.id, m]));

const TEAMS = ["Operations", "Marketing", "Esport", "GD/VE"];

const TODAY = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

const WORK = [];

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
  if (!m) return <span className={`avatar avatar--unassigned ${size}`}><Icon name="users" size={11} /></span>;
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
