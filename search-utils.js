function flowmateSearchText(row) {
  const owner = row.assignee && window.MEMBERS_BY_ID[row.assignee]
    ? window.MEMBERS_BY_ID[row.assignee].name
    : "";

  const platformText = Array.isArray(row.platforms)
    ? row.platforms.join(" ")
    : (row.platform || "");

  return [
    row.id,
    row.title,
    row.type,
    row.status,
    row.priority,
    row.assetType,
    platformText,
    row.size,
    row.dueLabel,
    row.requester,
    row.requesterTeam,
    row.campaign,
    owner,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFlowMateSearch(row, query) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  return flowmateSearchText(row).includes(normalizedQuery);
}

function getFlowMateCreatedDisplayId(created) {
  if (!created) return "";
  return created.display_id || created.displayId || created.id || "";
}

function findFlowMateWorkItemById(rows, id) {
  if (!Array.isArray(rows) || !id) return null;
  return rows.find((row) => row && row.id === id) || null;
}

function flowmateDateToDdMmYyyy(dateValue) {
  if (!dateValue) return "";
  const parts = dateValue.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function buildFlowMateTemplateTitle(input) {
  const datePart = flowmateDateToDdMmYyyy(input && input.launchDate);
  const functionPart = ((input && input.requesterTeam) || "").trim();
  const projectPart = ((input && input.projectName) || "").trim();
  if (!datePart || !functionPart || !projectPart) return "";
  return `[${datePart}][${functionPart}][${projectPart}]`;
}

function filterFlowMateAssigneeOptions(options, query) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  if (!normalizedQuery) return options || [];
  return (options || []).filter((option) =>
    ((option && option.name) || "").toLowerCase().startsWith(normalizedQuery)
  );
}

const FLOWMATE_DONE_STATUSES = ["delivered", "cancelled", "done"];

function isFlowMateActiveStatus(status) {
  return !FLOWMATE_DONE_STATUSES.includes((status || "").toLowerCase());
}

function getFlowMateCurrentUserIds(currentUser, members) {
  const user = currentUser || {};
  const memberList = members || [];
  const myMember = memberList.find((member) => member && member.id === user.team_member_id)
    || memberList.find((member) =>
      member && member.name && user.name && member.name.toLowerCase() === user.name.toLowerCase()
    );
  return [user.team_member_id, user.id, myMember && myMember.id].filter(Boolean);
}

function getFlowMateMyWorkRows(rows, currentUser, members, query) {
  const meIds = getFlowMateCurrentUserIds(currentUser, members);
  return (rows || []).filter((row) =>
    meIds.includes(row && row.assignee)
    && isFlowMateActiveStatus(row && row.status)
    && matchesFlowMateSearch(row || {}, query)
  );
}

function getFlowMateMyWorkSortRank(row) {
  if (row && (row.overdue || (row.dueDelta != null && row.dueDelta < 0))) return 0;
  if (row && row.dueDelta === 0) return 1;
  if (row && row.dueDelta != null && row.dueDelta > 0) return 2;
  return 3;
}

function sortFlowMateMyWorkRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const rankDiff = getFlowMateMyWorkSortRank(a) - getFlowMateMyWorkSortRank(b);
    if (rankDiff) return rankDiff;
    const dueA = a && a.dueDelta != null ? a.dueDelta : 9999;
    const dueB = b && b.dueDelta != null ? b.dueDelta : 9999;
    if (dueA !== dueB) return dueA - dueB;
    return String((a && a.id) || "").localeCompare(String((b && b.id) || ""));
  });
}

function filterFlowMateMyWorkByStatus(rows, status) {
  const value = status || "all";
  const source = rows || [];
  if (value === "all") return source;
  if (value === "overdue") return source.filter((row) => row && (row.overdue || (row.dueDelta != null && row.dueDelta < 0)));
  if (value === "due_today") return source.filter((row) => row && !row.overdue && row.dueDelta === 0);
  if (value === "quick") return source.filter((row) => row && row.type === "quick");
  if (value === "creative") return source.filter((row) => row && row.type === "creative");
  return source.filter((row) => row && row.status === value);
}

function getFlowMateUtcDateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getFlowMateCalendarDateKey(row, today = new Date()) {
  if (!row) return "";
  const rawDate = row.calendarDate || row.dueDate;
  if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) return rawDate.slice(0, 10);
  if (row.dueDelta == null || Number.isNaN(Number(row.dueDelta))) return "";
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return getFlowMateUtcDateKey(new Date(todayUtc + Number(row.dueDelta) * 86400000));
}

function getFlowMateCalendarWeekBounds(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  const selected = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (selected.getUTCDay() + 6) % 7;
  const start = new Date(selected.getTime() - mondayOffset * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return {
    startKey: getFlowMateUtcDateKey(start),
    endKey: getFlowMateUtcDateKey(end),
  };
}

function getFlowMateCalendarAgendaRows(rows, filters = {}, today = new Date()) {
  const selectedDateKey = filters.dateKey || getFlowMateUtcDateKey(today);
  const weekBounds = filters.range === "week" ? getFlowMateCalendarWeekBounds(selectedDateKey) : null;
  return (rows || []).filter((row) => {
    if (!row) return false;
    const dateKey = getFlowMateCalendarDateKey(row, today);
    if (!dateKey) return false;
    if (weekBounds) {
      if (dateKey < weekBounds.startKey || dateKey > weekBounds.endKey) return false;
    } else if (dateKey !== selectedDateKey) {
      return false;
    }
    if (filters.assignee && filters.assignee !== "all" && (row.assignee || "unassigned") !== filters.assignee) return false;
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.type && filters.type !== "all" && row.type !== filters.type) return false;
    if (filters.priority && filters.priority !== "all" && row.priority !== filters.priority) return false;
    return true;
  }).sort((a, b) => {
    const dateDiff = getFlowMateCalendarDateKey(a, today).localeCompare(getFlowMateCalendarDateKey(b, today));
    if (dateDiff) return dateDiff;
    const dueA = a && a.dueDelta != null ? a.dueDelta : 9999;
    const dueB = b && b.dueDelta != null ? b.dueDelta : 9999;
    if (dueA !== dueB) return dueA - dueB;
    return String((a && a.id) || "").localeCompare(String((b && b.id) || ""));
  });
}

function getFlowMateQueueRows(rows, query) {
  return (rows || []).filter((row) =>
    matchesFlowMateSearch(row || {}, query)
    && (row.status === "queued" || row.status === "need_brief")
  );
}

function getFlowMateNavCounts(rows, currentUser, members) {
  return {
    "my-work": getFlowMateMyWorkRows(rows, currentUser, members).length,
    queue: getFlowMateQueueRows(rows).length,
  };
}

const FLOWMATE_GD_VE_NAMES = ["pond", "joe", "jo", "tong", "eye", "vee"];

function isFlowMateGdVeMember(member) {
  const name = String((member && member.name) || (member && member.display_name) || "").toLowerCase();
  const code = String((member && member.member_code) || "").toLowerCase();
  const id = String((member && member.id) || "").toLowerCase();
  return FLOWMATE_GD_VE_NAMES.includes(name)
    || FLOWMATE_GD_VE_NAMES.includes(code)
    || FLOWMATE_GD_VE_NAMES.some((owner) => id.includes(owner));
}

function getFlowMateWorkloadStatusCounts(items) {
  const counts = { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0 };
  (items || []).forEach((item) => {
    if (item && Object.prototype.hasOwnProperty.call(counts, item.status)) {
      counts[item.status] += 1;
    }
  });
  return counts;
}

window.matchesFlowMateSearch = matchesFlowMateSearch;
window.getFlowMateCreatedDisplayId = getFlowMateCreatedDisplayId;
window.findFlowMateWorkItemById = findFlowMateWorkItemById;
window.buildFlowMateTemplateTitle = buildFlowMateTemplateTitle;
window.filterFlowMateAssigneeOptions = filterFlowMateAssigneeOptions;
window.getFlowMateMyWorkRows = getFlowMateMyWorkRows;
window.filterFlowMateMyWorkByStatus = filterFlowMateMyWorkByStatus;
window.sortFlowMateMyWorkRows = sortFlowMateMyWorkRows;
window.getFlowMateCalendarDateKey = getFlowMateCalendarDateKey;
window.getFlowMateCalendarAgendaRows = getFlowMateCalendarAgendaRows;
window.getFlowMateQueueRows = getFlowMateQueueRows;
window.getFlowMateNavCounts = getFlowMateNavCounts;
window.isFlowMateGdVeMember = isFlowMateGdVeMember;
window.getFlowMateWorkloadStatusCounts = getFlowMateWorkloadStatusCounts;
