function flowmateSearchText(row) {
  const owner = row.assignee && window.MEMBERS_BY_ID[row.assignee]
    ? window.MEMBERS_BY_ID[row.assignee].name
    : "";

  const channelText = Array.isArray(row.normalizedChannels)
    ? row.normalizedChannels.join(" ")
    : Array.isArray(row.channels)
      ? row.channels.join(" ")
      : Array.isArray(row.platforms)
        ? row.platforms.join(" ")
        : (row.channel || row.platform || "");

  return [
    row.id,
    row.title,
    row.type,
    row.status,
    row.priority,
    row.assetType,
    channelText,
    row.size,
    row.publishLabel,
    row.publishFullLabel,
    row.publishDate,
    row.planningLabel,
    row.dueLabel,
    row.launchLabel,
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

function getFlowMateCreatedUuid(created) {
  if (!created) return "";
  const id = created.id || created.work_item_id || created.workItemId || "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function findFlowMateWorkItemById(rows, id) {
  if (!Array.isArray(rows) || !id) return null;
  return rows.find((row) => row && row.id === id) || null;
}

function flowmateDateToDMmmYyyy(dateValue) {
  if (!dateValue) return "";
  const parts = dateValue.split("-");
  if (parts.length !== 3) return "";
  const year = parts[0];
  const monthIndex = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!Number.isInteger(day) || day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) return "";
  return `${day} ${months[monthIndex]} ${year}`;
}

function buildFlowMateTemplateTitle(input) {
  const datePart = flowmateDateToDMmmYyyy(input && input.launchDate);
  const functionPart = ((input && input.requesterTeam) || "").trim();
  const projectPart = ((input && input.projectName) || "").trim();
  const productEventPart = ((input && input.productEvent) || "").trim();
  if (!datePart || !functionPart || !projectPart) return "";
  return productEventPart
    ? `[${datePart}][${functionPart}][${projectPart}][${productEventPart}]`
    : `[${datePart}][${functionPart}][${projectPart}]`;
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
  return (rows || []).filter((row) => {
    return meIds.includes(row && row.assignee)
      && isFlowMateActiveStatus(row && row.status)
      && matchesFlowMateSearch(row || {}, query);
  });
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

const FLOWMATE_MONTH_EXPORT_START = "2026-01";
const FLOWMATE_MONTH_EXPORT_END = "2027-12";

function getFlowMateCurrentMonthKey(today = new Date()) {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getFlowMateMonthOptions(startMonth = FLOWMATE_MONTH_EXPORT_START, endMonth = FLOWMATE_MONTH_EXPORT_END) {
  const [startYear, startIndex] = String(startMonth).split("-").map(Number);
  const [endYear, endIndex] = String(endMonth).split("-").map(Number);
  const options = [];
  let year = startYear;
  let monthIndex = startIndex;
  while (year < endYear || (year === endYear && monthIndex <= endIndex)) {
    const key = `${year}-${String(monthIndex).padStart(2, "0")}`;
    const label = new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    options.push({ key, label });
    monthIndex += 1;
    if (monthIndex > 12) {
      monthIndex = 1;
      year += 1;
    }
  }
  return options;
}

function getFlowMateDefaultExportMonth(today = new Date()) {
  const current = getFlowMateCurrentMonthKey(today);
  if (current >= FLOWMATE_MONTH_EXPORT_START && current <= FLOWMATE_MONTH_EXPORT_END) return current;
  return FLOWMATE_MONTH_EXPORT_START;
}

function getFlowMateMonthLabel(monthKey) {
  const option = getFlowMateMonthOptions().find((item) => item.key === monthKey);
  return option ? option.label : monthKey;
}

function getFlowMateDateKeyFromFields(row, fields, today = new Date()) {
  if (!row) return "";
  const sourceFields = fields && fields.length ? fields : ["calendarDate", "dueDate"];
  for (const field of sourceFields) {
    const rawDate = row[field];
    if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))) return String(rawDate).slice(0, 10);
  }
  if (sourceFields.includes("calendarDate") || sourceFields.includes("dueDate")) {
    return getFlowMateCalendarDateKey(row, today);
  }
  return "";
}

function isFlowMateRowInMonth(row, monthKey, fields, today = new Date()) {
  const dateKey = getFlowMateDateKeyFromFields(row, fields, today);
  return Boolean(dateKey && monthKey && dateKey.slice(0, 7) === monthKey);
}

function filterFlowMateRowsByMonth(rows, monthKey, fields, today = new Date()) {
  return (rows || []).filter((row) => isFlowMateRowInMonth(row, monthKey, fields, today));
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
    && row.status === "queued"
    && !row.needsSplit
  );
}

function getFlowMateNavCounts(rows, currentUser, members) {
  return {
    "my-work": getFlowMateMyWorkRows(rows, currentUser, members).length,
    queue: getFlowMateQueueRows(rows).length,
  };
}

const FLOWMATE_GD_VE_NAMES = ["pond", "joe", "jo", "tong", "eye", "vee", "ploy"];

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
window.getFlowMateCreatedUuid = getFlowMateCreatedUuid;
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
window.getFlowMateCurrentMonthKey = getFlowMateCurrentMonthKey;
window.getFlowMateMonthOptions = getFlowMateMonthOptions;
window.getFlowMateDefaultExportMonth = getFlowMateDefaultExportMonth;
window.getFlowMateMonthLabel = getFlowMateMonthLabel;
window.getFlowMateDateKeyFromFields = getFlowMateDateKeyFromFields;
window.isFlowMateRowInMonth = isFlowMateRowInMonth;
window.filterFlowMateRowsByMonth = filterFlowMateRowsByMonth;
