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

window.matchesFlowMateSearch = matchesFlowMateSearch;
window.getFlowMateCreatedDisplayId = getFlowMateCreatedDisplayId;
window.findFlowMateWorkItemById = findFlowMateWorkItemById;
window.buildFlowMateTemplateTitle = buildFlowMateTemplateTitle;
window.filterFlowMateAssigneeOptions = filterFlowMateAssigneeOptions;
window.getFlowMateMyWorkRows = getFlowMateMyWorkRows;
window.getFlowMateQueueRows = getFlowMateQueueRows;
window.getFlowMateNavCounts = getFlowMateNavCounts;
