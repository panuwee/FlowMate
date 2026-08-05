"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateWorkloadSummary,
  filterWorkItems,
  formatAssetType,
  formatStatus,
  getOverdueAssignedItems,
  type WorkItemSummary,
} from "@/lib/flowmate";
import { MOCK_CURRENT_USER_ID, MOCK_CURRENT_USER_NAME } from "@/lib/mock-auth";
import { getSupabase } from "@/lib/supabase";

type WorkItemRow = {
  id: string;
  display_id: string;
  title: string;
  work_type: "creative_request" | "quick_task";
  status: string;
  campaign_name: string | null;
  requester_user_id: string;
  requester_team: string | null;
  assignee_user_id: string | null;
  final_owner_member_id: string | null;
  effort_point: number | null;
  due_date: string;
  priority: string;
  needs_split: boolean;
  review_round: number;
  blocked_reason: string | null;
};

type FlagRow = {
  work_item_id: string;
  is_overdue: boolean;
  is_due_soon: boolean;
  is_queued: boolean;
};

type UserRow = {
  id: string;
  display_name: string;
  requester_team: string | null;
};

type CreativeDetailRow = {
  work_item_id: string;
  asset_type: string;
};

type TeamMemberRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  initials: string;
  color: string;
};

type WorkloadRow = {
  team_member_id: string;
  member_code: string;
  display_name: string;
  discipline_short: string;
  availability: string;
  effective_capacity_per_day: number | null;
  assigned_effort: number;
  current_wip: number;
  overdue_count: number;
  due_soon_count: number;
  blocked_count: number;
  review_count: number;
  quick_task_count: number;
};

type DisplayItem = WorkItemSummary & {
  id: string;
  requesterTeam: string | null;
  priority: string;
  dueDate: string;
  ownerInitials: string | null;
  ownerColor: string | null;
  reviewRound: number;
  needsSplit: boolean;
  isBlocked: boolean;
};

const navGroups = [
  {
    label: "Personal",
    items: [
      { hash: "#my-work", label: "My work", icon: "inbox" },
      { hash: "#create", label: "Create", icon: "plus" },
    ],
  },
  {
    label: "Team",
    items: [
      { hash: "#board", label: "Board", icon: "board" },
      { hash: "#list", label: "List", icon: "list" },
      { hash: "#attention", label: "Attention Needed", icon: "queue" },
    ],
  },
  {
    label: "Supervisor",
    items: [
      { hash: "#workload", label: "Workload", icon: "users" },
      { hash: "#kpi", label: "KPI", icon: "chart" },
      { hash: "#settings", label: "Team settings", icon: "settings" },
    ],
  },
];

export default function Home() {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      let supabase;
      try {
        supabase = getSupabase();
      } catch (configError) {
        setError(configError instanceof Error ? configError.message : String(configError));
        setLoading(false);
        return;
      }

      const [workItemsResult, flagsResult, usersResult, membersResult, detailsResult, workloadResult] =
        await Promise.all([
          supabase
            .from("work_items")
            .select(
              "id, display_id, title, work_type, status, campaign_name, requester_user_id, requester_team, assignee_user_id, final_owner_member_id, effort_point, due_date, priority, needs_split, review_round, blocked_reason",
            )
            .order("due_date", { ascending: true }),
          supabase
            .from("work_item_flags_v")
            .select("work_item_id, is_overdue, is_due_soon, is_queued"),
          supabase.from("users").select("id, display_name, requester_team"),
          supabase.from("team_members").select("id, user_id, display_name, initials, color"),
          supabase.from("creative_request_details").select("work_item_id, asset_type"),
          supabase
            .from("member_workload_v")
            .select(
              "team_member_id, member_code, display_name, discipline_short, availability, effective_capacity_per_day, assigned_effort, current_wip, overdue_count, due_soon_count, blocked_count, review_count, quick_task_count",
            )
            .order("member_code", { ascending: true }),
        ]);

      const firstError =
        workItemsResult.error ||
        flagsResult.error ||
        usersResult.error ||
        membersResult.error ||
        detailsResult.error ||
        workloadResult.error;

      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const flagsByWorkItemId = new Map(
        ((flagsResult.data ?? []) as FlagRow[]).map((flag) => [flag.work_item_id, flag]),
      );
      const usersById = new Map(
        ((usersResult.data ?? []) as UserRow[]).map((user) => [user.id, user]),
      );
      const membersById = new Map(
        ((membersResult.data ?? []) as TeamMemberRow[]).map((member) => [member.id, member]),
      );
      const membersByUserId = new Map(
        ((membersResult.data ?? []) as TeamMemberRow[])
          .filter((member) => member.user_id)
          .map((member) => [member.user_id as string, member]),
      );
      const detailsByWorkItemId = new Map(
        ((detailsResult.data ?? []) as CreativeDetailRow[]).map((detail) => [
          detail.work_item_id,
          detail,
        ]),
      );

      const nextItems = ((workItemsResult.data ?? []) as WorkItemRow[]).map((item) => {
        const flags = flagsByWorkItemId.get(item.id);
        const requester = usersById.get(item.requester_user_id);
        const creativeOwner = item.final_owner_member_id
          ? membersById.get(item.final_owner_member_id)
          : null;
        const quickOwner = item.assignee_user_id ? membersByUserId.get(item.assignee_user_id) : null;
        const owner = creativeOwner ?? quickOwner ?? null;
        const detail = detailsByWorkItemId.get(item.id);

        return {
          id: item.id,
          displayId: item.display_id,
          title: item.title,
          workType: item.work_type,
          status: item.status,
          assetType: detail?.asset_type ?? null,
          campaign: item.campaign_name,
          requesterName: requester?.display_name ?? null,
          requesterTeam: item.requester_team ?? requester?.requester_team ?? null,
          assigneeName: owner?.display_name ?? null,
          assigneeUserId: owner?.user_id ?? item.assignee_user_id,
          ownerInitials: owner?.initials ?? null,
          ownerColor: owner?.color ?? null,
          effortPoint: item.effort_point,
          priority: item.priority,
          dueDate: item.due_date,
          reviewRound: item.review_round,
          needsSplit: item.needs_split,
          isBlocked: Boolean(item.blocked_reason) || item.status === "blocked",
          isOverdue: flags?.is_overdue ?? false,
          isDueSoon: flags?.is_due_soon ?? false,
          isQueued: flags?.is_queued ?? false,
          isUnassigned: item.status === "unassigned",
        };
      });

      setItems(nextItems);
      setWorkload((workloadResult.data ?? []) as WorkloadRow[]);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const filteredItems = useMemo(() => filterWorkItems(items, query) as DisplayItem[], [items, query]);
  const myOverdueItems = useMemo(
    () => getOverdueAssignedItems(items, MOCK_CURRENT_USER_ID),
    [items],
  );
  const summary = useMemo(() => calculateWorkloadSummary(items), [items]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <strong>FlowMate</strong>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <span className="nav-group__label">{group.label}</span>
              {group.items.map((item) => (
                <a
                  key={item.hash}
                  className={`nav-item ${item.hash === "#list" ? "is-active" : ""}`}
                  href={item.hash}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.hash === "#my-work" && myOverdueItems.length > 0 ? (
                    <em>{myOverdueItems.length}</em>
                  ) : null}
                  {item.hash === "#attention" ? <em>{summary.attentionCount}</em> : null}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="live">
          <span>Live</span>
          <strong>{loading ? "Syncing..." : `Synced just now - ${items.length} items`}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search">
            <Icon name="search" />
            <input
              aria-label="Search work"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by ID, title, campaign, requester, assignee..."
            />
            <kbd>Ctrl K</kbd>
          </label>

          <div className="topbar-actions">
            <button className="ghost-btn">
              <Icon name="plus" />
              Create
            </button>
            <button className="icon-btn" aria-label="Notifications">
              <Icon name="bell" />
              <span />
            </button>
            <div className="user-menu">
              <Avatar initials="PD" color="#2E546D" />
              <strong>{MOCK_CURRENT_USER_NAME}</strong>
              <Icon name="chevron" />
            </div>
          </div>
        </header>

        <section className="page">
          <div className="page-header">
            <div>
              <h1>All work</h1>
              <p>
                {loading ? "Loading live Supabase data..." : `${items.length} items across all statuses`}
                {" - synced just now"}
              </p>
            </div>
            <div className="page-actions">
              <button className="secondary-btn">
                <Icon name="filter" />
                Saved views
              </button>
              <button className="secondary-btn">
                <Icon name="download" />
                Export
              </button>
            </div>
          </div>

          {error ? <div className="alert">Supabase error: {error}</div> : null}
          {myOverdueItems.length > 0 ? (
            <div className="alert">
              {myOverdueItems.length} overdue item{myOverdueItems.length > 1 ? "s" : ""} assigned
              to you.
            </div>
          ) : null}

          <div className="filterbar">
            <select aria-label="Status filter">
              <option>All statuses</option>
            </select>
            <select aria-label="Owner filter">
              <option>All owners</option>
            </select>
            <select aria-label="Team filter">
              <option>All teams</option>
            </select>
            <select aria-label="Asset type filter">
              <option>All asset types</option>
            </select>
            <select aria-label="Work type filter">
              <option>All types</option>
            </select>
            <div className="quick-filters">
              <button>Overdue only</button>
              <button>Due soon</button>
              <button>Blocked</button>
            </div>
          </div>

          <div className="table-card">
            <table className="work-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Requester / Team</th>
                  <th>Asset</th>
                  <th>Effort</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.displayId} className={item.isOverdue ? "is-overdue" : ""}>
                    <td className="mono id-cell">{item.displayId.replace("-", "-\n")}</td>
                    <td className="title-cell">
                      <strong>{item.title}</strong>
                    </td>
                    <td>
                      <span className="type-pill">
                        {item.workType === "creative_request" ? "Creative" : "Quick task"}
                      </span>
                    </td>
                    <td>
                      <StatusBadge item={item} />
                    </td>
                    <td>
                      {item.assigneeName ? (
                        <span className="owner">
                          <Avatar initials={item.ownerInitials ?? item.assigneeName.slice(0, 2)} color={item.ownerColor ?? "#2E546D"} />
                          {item.assigneeName}
                        </span>
                      ) : (
                        <span className="muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className="stacked">
                        <strong>{item.requesterName ?? "-"}</strong>
                        <small>{item.requesterTeam ?? "No team"}</small>
                      </span>
                    </td>
                    <td className="muted">{formatAssetType(item.assetType)}</td>
                    <td>
                      <span className="effort">
                        {item.workType === "creative_request" ? item.effortPoint ?? "-" : "-"}
                      </span>
                    </td>
                    <td>
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td>
                      <DueBadge item={item} />
                    </td>
                    <td>
                      <span className="flags">
                        {item.reviewRound > 0 ? <span>R {item.reviewRound}</span> : null}
                        {item.needsSplit ? <span className="flag-warn">Needs split</span> : null}
                        {item.isBlocked ? <span className="flag-danger">Blocked</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="workload-strip" aria-label="Workload summary">
            {workload.map((member) => (
              <article key={member.team_member_id}>
                <strong>{member.display_name}</strong>
                <span>
                  {member.discipline_short} - cap {member.effective_capacity_per_day ?? 0} - effort{" "}
                  {member.assigned_effort} - WIP {member.current_wip}
                </span>
              </article>
            ))}
          </section>
        </section>
      </section>
    </main>
  );
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <span className="avatar" style={{ backgroundColor: color }}>
      {initials}
    </span>
  );
}

function StatusBadge({ item }: { item: WorkItemSummary }) {
  const className = item.isOverdue
    ? "status status--danger"
    : item.status === "blocked"
      ? "status status--danger-solid"
      : item.status === "review" || item.isDueSoon
        ? "status status--warn"
        : item.isQueued
          ? "status status--queue"
          : "status";

  return <span className={className}>{formatStatus(item.status)}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`priority priority--${priority}`}>
      <i />
      {formatStatus(priority)}
    </span>
  );
}

function DueBadge({ item }: { item: DisplayItem }) {
  const dueDate = new Date(`${item.dueDate}T00:00:00`);
  const label = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (item.isOverdue) {
    return <span className="due due--late">{label}</span>;
  }

  if (item.isDueSoon) {
    return <span className="due due--soon">{label}</span>;
  }

  return <span className="muted">{label}</span>;
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    search: "S",
    plus: "+",
    bell: "!",
    inbox: "I",
    board: "B",
    list: "L",
    queue: "Q",
    users: "U",
    chart: "K",
    settings: "*",
    filter: "v",
    download: "DL",
    chevron: "v",
  };

  return <span className="icon" aria-hidden="true">{icons[name] ?? "."}</span>;
}
