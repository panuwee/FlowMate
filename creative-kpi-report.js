/* Shared Creative report model: browser screen and workbook use the same facts. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FlowMateCreativeReport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const VERSION = '2026-09-11.1';
  const ROLES = Object.freeze({ jo: 'GD', tong: 'GD', eye: 'GD', ploy: 'GD', pond: 'VE', vee: 'VE' });
  const FLAG_LABELS = Object.freeze({ urgent: 'Urgent request', admin_override: 'Assignment override', rework: 'Returned for changes', cancelled_after_review: 'Cancelled after Review', assigned_after_due: 'Received after due date', short_status_interval_under_60s: 'Start to Review under 60 seconds; confirm timing', missing_first_draft_due: 'First-draft due date missing', missing_owner_at_start: 'Owner at start missing', missing_assigned_event: 'Assignment timestamp missing', missing_started_event: 'Start timestamp missing', missing_review_event: 'First Review timestamp missing', missing_brief_ready_proxy: 'Brief-ready evidence missing', owner_snapshot_fallback: 'Owner reconstructed from current assignment', review_decision_actor_mismatch: 'Review decided by another person', invalid_assigned_started_sequence: 'Assignment / start order needs review', invalid_started_review_sequence: 'Start / Review order needs review', unmapped_role: 'Role not mapped', test_title_requires_confirmation: 'Task title includes Test; confirm before evaluation' });
  const formatFlags = flags => (flags || []).map(flag => FLAG_LABELS[flag] || String(flag).replace(/_/g, ' ')).join('; ');
  const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const dateKey = value => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms + 7 * 3600000).toISOString().slice(0, 10) : '';
  };
  const inRange = (value, start, end, asOf) => {
    const key = dateKey(value);
    return !!key && key >= start && key < end && Date.parse(value) <= Date.parse(asOf);
  };
  const percentile = (values, p) => {
    const sorted = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p, lower = Math.floor(index), upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  const duration = (rows, key) => {
    const values = rows.map(r => r[key]).filter(v => v != null && v >= 0);
    return { n: values.length, missingN: rows.length - values.length, p50: percentile(values, .5), p85: percentile(values, .85) };
  };
  const rate = (rows, test) => ({ numerator: rows.filter(test).length, denominator: rows.length, pct: rows.length ? 100 * rows.filter(test).length / rows.length : null });
  function normalizeFacts(rows) {
    const unique = new Map();
    for (const row of rows || []) {
      if (!row.work_item_id) throw new Error('A report task is missing its stable ID. Refresh before exporting.');
      const productionSeconds = row.started_at && row.review_submitted_at ? (Date.parse(row.review_submitted_at) - Date.parse(row.started_at)) / 1000 : null;
      const tags = [...new Set((Array.isArray(row.ai_tags) ? row.ai_tags : []).map(t => String(t?.tag || t).trim()).filter(Boolean))];
      const flags = [...(row.data_quality_flags || []), ...(row.exception_flags || [])];
      const afterDue = !!row.due_date && !!row.assigned_at && dateKey(row.assigned_at) > row.due_date;
      const short = productionSeconds != null && productionSeconds >= 0 && productionSeconds < 60;
      if (afterDue) flags.push('assigned_after_due');
      if (short) flags.push('short_status_interval_under_60s');
      if (row.review_submitted_at && !row.due_date) flags.push('missing_first_draft_due');
      if (!row.owner_member_id_at_start) flags.push('missing_owner_at_start');
      if (/\[test\]/i.test(row.title || '')) flags.push('test_title_requires_confirmation');
      const role = ROLES[row.owner_member_code] || 'Unmapped';
      if (role === 'Unmapped') flags.push('unmapped_role');
      unique.set(row.work_item_id, {
        ...row, id: row.work_item_id, displayId: row.display_id || row.work_item_id,
        title: row.title || '(Untitled)', personId: row.owner_member_id_at_start || 'unassigned',
        personName: row.owner_name_at_start || 'Unknown owner', role,
        workType: row.asset_type || 'Unknown', tags, flags: [...new Set(flags)], afterDue, short,
        productionSeconds, productionDays: number(row.production_working_days),
        startDays: number(row.assigned_to_started_working_days), effort: number(row.effort_point),
      });
    }
    return [...unique.values()].sort((a, b) => a.displayId.localeCompare(b.displayId));
  }
  function summarize(rows, start, end, asOf, annual = false) {
    const today = dateKey(asOf);
    const drafts = rows.filter(r => inRange(r.review_submitted_at, start, end, asOf));
    const delivered = rows.filter(r => r.status === 'delivered' && inRange(r.delivered_at, start, end, asOf));
    const created = rows.filter(r => inRange(r.created_at, start, end, asOf));
    const active = rows.filter(r => r.created_at && dateKey(r.created_at) < end && Date.parse(r.created_at) <= Date.parse(asOf) && !['delivered', 'cancelled'].includes(r.status));
    const activity = rows.filter(r => drafts.includes(r) || delivered.includes(r) || created.includes(r));
    const measured = drafts.filter(r => r.status !== 'cancelled');
    const onTimeRows = measured.filter(r => r.due_date);
    const contextualRows = onTimeRows.filter(r => r.assigned_at && !r.afterDue && !r.short && !r.flags.includes('owner_snapshot_fallback'));
    const decisions = measured.filter(r => r.review_decided_at && Date.parse(r.review_decided_at) <= Date.parse(asOf) && ['approved', 'changes_requested'].includes(r.review_decision));
    const finalDueRows = delivered.filter(r => r.final_approved_due_date);
    const ai = activity.filter(r => r.tags.length);
    const periodStatus = start > today ? 'Future period' : today < end ? (annual ? 'Year to date' : 'Partial month') : activity.length ? 'Recorded data' : 'No recorded data';
    return {
      period: annual ? start.slice(0, 4) : start.slice(0, 7), periodStatus,
      n: drafts.length, reviewedN: drafts.length, deliveredN: delivered.length,
      activityN: activity.length, openN: active.length,
      start: duration(measured, 'startDays'), production: duration(measured, 'productionDays'),
      onTime: rate(onTimeRows, r => dateKey(r.review_submitted_at) <= r.due_date),
      contextOnTime: rate(contextualRows, r => dateKey(r.review_submitted_at) <= r.due_date),
      firstPass: rate(decisions, r => r.review_decision === 'approved' && !r.rework_at),
      finalOnTime: rate(finalDueRows, r => dateKey(r.delivered_at) <= r.final_approved_due_date),
      reworkN: measured.filter(r => r.rework_at && Date.parse(r.rework_at) <= Date.parse(asOf)).length,
      decisionMissingN: measured.length - decisions.length, finalDueMissingN: delivered.length - finalDueRows.length,
      shortProductionN: measured.filter(r => r.short).length, assignedAfterDueN: measured.filter(r => r.afterDue).length,
      firstDraftMissingDueN: measured.length - onTimeRows.length,
      cancelledN: drafts.filter(r => r.status === 'cancelled').length,
      qualityFlaggedN: activity.filter(r => r.flags.length).length,
      aiN: ai.length, aiDeliveredN: delivered.filter(r => r.tags.length).length,
      aiAdoption: rate(delivered, r => r.tags.length > 0),
      deliveredEffort: delivered.some(r => r.effort != null) ? delivered.reduce((n, r) => n + (r.effort || 0), 0) : null,
      effortMissingN: delivered.filter(r => r.effort == null).length,
    };
  }
  function buildReport(input, options = {}) {
    const year = Number(options.year), asOf = options.asOf || new Date().toISOString();
    if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error('Choose a valid report year (2026 or later).');
    if (!Number.isFinite(Date.parse(asOf))) throw new Error('Report snapshot time is invalid.');
    const filters = { year, role: options.role || '', personId: options.personId || '', workType: options.workType || '' };
    const all = normalizeFacts(input), start = `${year}-01-01`, end = `${year + 1}-01-01`;
    const relevant = all.filter(r => [r.created_at, r.review_submitted_at, r.delivered_at].some(d => inRange(d, start, end, asOf)) || (r.created_at && dateKey(r.created_at) < end && Date.parse(r.created_at) <= Date.parse(asOf) && !['delivered', 'cancelled'].includes(r.status)));
    const rows = relevant.filter(r => (!filters.role || r.role === filters.role) && (!filters.personId || r.personId === filters.personId) && (!filters.workType || r.workType === filters.workType));
    const monthlyFor = tasks => Array.from({ length: 12 }, (_, i) => {
      const monthStart = `${year}-${String(i + 1).padStart(2, '0')}-01`;
      const monthEnd = i === 11 ? end : `${year}-${String(i + 2).padStart(2, '0')}-01`;
      return summarize(tasks, monthStart, monthEnd, asOf);
    });
    const people = [...new Map(rows.map(r => [r.personId, { id: r.personId, name: r.personName, role: r.role }])).values()].sort((a, b) => a.name.localeCompare(b.name)).map(person => {
      const tasks = rows.filter(r => r.personId === person.id);
      return { ...person, annual: summarize(tasks, start, end, asOf, true), monthly: monthlyFor(tasks) };
    });
    return {
      version: VERSION, filters, asOf, start, end, rows, people,
      annual: summarize(rows, start, end, asOf, true), monthly: monthlyFor(rows),
      aiTasks: rows.filter(r => r.tags.length && [r.created_at, r.review_submitted_at, r.delivered_at].some(d => inRange(d, start, end, asOf))),
      availablePeople: [...new Map(relevant.filter(r => !filters.role || r.role === filters.role).map(r => [r.personId, { id: r.personId, name: r.personName, role: r.role }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
      workTypes: [...new Set(relevant.map(r => r.workType))].sort(),
      calendarActiveN: number(options.calendarActiveN),
      earliestReview: all.map(r => dateKey(r.review_submitted_at)).filter(Boolean).sort()[0] || null,
    };
  }
  function formatMetric(value, unit = '') {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (unit === 'days') return n > 0 && n < .1 ? '<0.1 d' : `${n.toFixed(1)} d`;
    if (unit === 'percent') return `${n.toFixed(1)}%`;
    return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1);
  }
  const summaryHeaders = ['Person', 'Role', 'Period', 'Coverage', 'Delivered tasks', 'First drafts submitted', 'Start P50 (working dates)', 'Start P85', 'Start eligible n', 'Start missing n', 'Production P50 (working dates)', 'Production P85', 'Production eligible n', 'Production missing n', 'Short status intervals (<60s)', 'First draft on time % (raw)', 'On time n', 'On time denominator', 'Received after due n', 'Context on time %', 'Context on time n', 'Context eligible n', 'Missing first-draft due n', 'First-pass approval %', 'First-pass n', 'Decided n', 'Pending / unverified decision n', 'Rework tasks', 'Final delivery on time %', 'Final on time n', 'Final eligible n', 'Missing final due n', 'AI-tagged activity tasks', 'AI-tagged delivered tasks', 'AI-tagged delivered %', 'Delivered planned effort', 'Missing effort n', 'Cancelled draft tasks', 'Flagged activity tasks'];
  const summaryRow = (person, role, s) => {
    const unavailable = s.activityN === 0 || ['Future period', 'No recorded data'].includes(s.periodStatus);
    return [person, role, s.period, s.periodStatus, unavailable ? null : s.deliveredN, unavailable ? null : s.reviewedN, s.start.p50, s.start.p85, s.start.n, s.start.missingN, s.production.p50, s.production.p85, s.production.n, s.production.missingN, s.shortProductionN, s.onTime.pct, s.onTime.numerator, s.onTime.denominator, s.assignedAfterDueN, s.contextOnTime.pct, s.contextOnTime.numerator, s.contextOnTime.denominator, s.firstDraftMissingDueN, s.firstPass.pct, s.firstPass.numerator, s.firstPass.denominator, s.decisionMissingN, s.reworkN, s.finalOnTime.pct, s.finalOnTime.numerator, s.finalOnTime.denominator, s.finalDueMissingN, unavailable ? null : s.aiN, unavailable ? null : s.aiDeliveredN, s.aiAdoption.pct, s.deliveredEffort, s.effortMissingN, s.cancelledN, s.qualityFlaggedN];
  };
  function buildWorkbook(report) {
    const f = report.filters;
    const taskHeaders = ['Task ID', 'Task name', 'Owner at start', 'Reporting role', 'Member code', 'Status at export', 'Asset type', 'Asset subtype', 'Requested asset count', 'Second asset type', 'Second asset count', 'Planned effort', 'Created at', 'Assigned at', 'Started at', 'First Review at', 'Delivered at', '1st draft due (current)', 'Final due (current)', 'Start working dates', 'Production working dates', 'Production raw seconds', 'Recorded Blocked working dates', 'AI tags (current)', 'Flags', 'Archived at', 'Review decision', 'Rework at', 'Stable task ID'];
    const taskRow = r => [r.displayId, r.title, r.personName, r.role, r.owner_member_code, r.status, r.workType, r.asset_subtype, r.asset_count, r.asset_type_2, r.asset_count_2, r.effort, r.created_at, r.assigned_at, r.started_at, r.review_submitted_at, r.delivered_at, r.due_date, r.final_approved_due_date, r.startDays, r.productionDays, r.productionSeconds, r.blocked_during_production_working_days, r.tags.join(', '), formatFlags(r.flags), r.archived_at, r.review_decision, r.rework_at, r.id];
    const readme = [
      ['Creative KPI evidence report', 'Value / definition'], ['Year', f.year], ['Role filter', f.role || 'All roles'], ['Person filter', report.availablePeople.find(p => p.id === f.personId)?.name || f.personId || 'All people'], ['Work type filter', f.workType || 'All types'], ['Snapshot time (ISO offset retained)', report.asOf], ['Report version', report.version],
      ['Source', 'FlowMate flowmate_creative_kpi_report_v; current permitted data; manual refresh'],
      ['Scope', 'Creative Requests only. Archived tasks included. Quick tasks excluded.'],
      ['Attribution', 'Owner at first start from existing facts; flagged fallback where unavailable. Not the final-delivery actor or collaborator allocation.'],
      ['Role mapping', 'Confirmed 2026-09-11: jo/tong/eye/ploy = GD; pond/vee = VE. Current reporting mapping, not historical role snapshots. Unmapped people are retained.'],
      ['Delivered tasks', 'Distinct tasks currently Delivered with delivered_at in the selected period, up to snapshot time. First drafts use first Review date separately.'],
      ['AI activity', 'Distinct currently tagged tasks created, first reviewed or delivered in the period. One task may be active in multiple months; annual total deduplicates IDs. AI delivered uses delivered_at.'],
      ['AI interpretation', 'Tag proves recorded adoption only. No recorded tag does not prove no AI use. No automatic time-saved or quality score.'],
      ['Timing unit', 'Working-date equivalents: 24-hour fractions on eligible Bangkok dates, not 8-hour days or actual labor hours. Existing GD/VE calendar formula retained.'],
      ['Calendar active dates loaded', report.calendarActiveN == null ? 'Unknown' : report.calendarActiveN],
      ['Calendar caveat', report.calendarActiveN === 0 ? 'No active holidays recorded for this year; weekdays only.' : 'Only recorded active holidays are deducted. Calendar changes can change historical results.'],
      ['Short production interval', 'Less than 60 raw elapsed seconds between Start and Review: requires workflow confirmation; raw metric is retained, not judged as real production speed.'],
      ['On-time raw', 'First Review Bangkok date <= current first-draft due. Cancelled tasks excluded from timing/rate samples but retained in submitted volume.'],
      ['Context on-time', 'Subset with assigned timestamp, received by due date, no short status interval and no owner-snapshot fallback. Not a performance rating. Read eligible n; fewer than 5 is insufficient.'],
      ['Final delivery on time', 'Delivered date <= current final-approved due date. Missing final due is excluded and counted. Requester waiting is not attributed automatically to Creative.'],
      ['Quality and decisions', 'First-pass depends on recorded requester decisions. Missing/other-actor decisions remain unverified. Rework reasons require human confirmation.'],
      ['Annual aggregation', 'Unique task IDs; pooled rate numerators/denominators; percentiles from task values, never average monthly percentages or medians.'],
      ['Coverage', 'Jan-Dec shown; future periods and no recorded data are not performance zero. Current year/month is partial. No full-month volume comparison against a partial month.'],
      ['Historical limits', 'Current due dates, tags, role mapping and status are mutable; no historical due/role freeze. Save this dated export for review.'],
      ['Manual evaluation', 'Lead evaluation fields are blank for human evidence. No automated grade, ranking, bonus or employment decision.'],
      ['Future collection', 'Due/role snapshots, rework reasons, verified work-start capture, quality rubric, collaboration evidence and AI use-case/benefit evidence need separate workflow implementation.'],
    ];
    const annualRows = report.people.map(p => summaryRow(p.name, p.role, p.annual));
    annualRows.push(summaryRow('Selected total (do not sum with people)', f.role || 'All roles', report.annual));
    return [
      { name: 'Read me', rows: readme, reportStyle: true },
      { name: 'Annual summary', rows: [summaryHeaders, ...annualRows], reportStyle: true },
      { name: 'Monthly detail', rows: [summaryHeaders, ...report.people.flatMap(p => p.monthly.map(s => summaryRow(p.name, p.role, s))), ...report.monthly.map(s => summaryRow('Selected total (do not sum with people)', f.role || 'All roles', s))], reportStyle: true },
      { name: 'Task evidence', rows: [taskHeaders, ...report.rows.map(taskRow)], reportStyle: true },
      { name: 'AI tasks', rows: [taskHeaders, ...report.aiTasks.map(taskRow)], reportStyle: true },
      { name: 'Quality & context', rows: [['Task ID', 'Task name', 'Owner', 'Role', 'Flags', 'Verified reason (Lead input)', 'Production defect / brief / preference / scope change (Lead input)', 'Evidence link (Lead input)'], ...report.rows.filter(r => r.flags.length || r.rework_at).map(r => [r.displayId, r.title, r.personName, r.role, formatFlags(r.flags), '', '', ''])], reportStyle: true },
      { name: 'Lead evaluation', rows: [['Person', 'Role', 'Period', 'Brief / brand quality (Lead input)', 'Craft / technical accuracy (Lead input)', 'GD: layout / readability; VE: pacing / audio / subtitles (Lead input)', 'Portfolio task IDs / links (Lead input)', 'Collaboration evidence (Lead input)', 'AI use case / validated benefit (Lead input)', 'Strength (Lead input)', 'Focus (Lead input)', 'Development plan (Lead input)', 'Reviewer', 'Review date'], ...report.people.map(p => [p.name, p.role, f.year, '', '', '', '', '', '', '', '', '', '', ''])], reportStyle: true },
    ];
  }
  return { VERSION, ROLES, dateKey, percentile, normalizeFacts, buildReport, buildWorkbook, formatMetric, formatFlags };
});
