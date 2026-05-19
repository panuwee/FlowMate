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

window.matchesFlowMateSearch = matchesFlowMateSearch;
window.getFlowMateCreatedDisplayId = getFlowMateCreatedDisplayId;
window.findFlowMateWorkItemById = findFlowMateWorkItemById;
window.buildFlowMateTemplateTitle = buildFlowMateTemplateTitle;
window.filterFlowMateAssigneeOptions = filterFlowMateAssigneeOptions;
