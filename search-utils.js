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

window.matchesFlowMateSearch = matchesFlowMateSearch;
