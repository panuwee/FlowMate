/* Shared Creative report model: browser screen and workbook use the same facts. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FlowMateCreativeReport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '2026-11-11.1';
  const ROLES = Object.freeze({
    jo: 'GD',
    tong: 'GD',
    eye: 'GD',
    ploy: 'GD',
    pond: 'VE',
    vee: 'VE'
  });
  const FLAG_LABELS = Object.freeze({
    urgent: 'Urgent request',
    admin_override: 'Assignment override',
    rework: 'Returned for changes',
    cancelled_after_review: 'Cancelled after Review',
    assigned_after_due: 'Received after due date',
    short_status_interval_under_60s: 'Start to Review under 60 seconds; confirm timing',
    missing_first_draft_due: 'First-draft due date missing',
    missing_owner_at_start: 'Owner at start missing',
    missing_assigned_event: 'Assignment timestamp missing',
    missing_started_event: 'Start timestamp missing',
    missing_review_event: 'First Review timestamp missing',
    missing_brief_ready_proxy: 'Brief-ready evidence missing',
    owner_snapshot_fallback: 'Owner reconstructed from current assignment',
    review_decision_actor_mismatch: 'Review decided by another person',
    invalid_assigned_started_sequence: 'Assignment / start order needs review',
    invalid_started_review_sequence: 'Start / Review order needs review',
    unmapped_role: 'Role not mapped',
    test_title_requires_confirmation: 'Task title includes Test; confirm before evaluation'
  });
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
    const index = (sorted.length - 1) * p,
      lower = Math.floor(index),
      upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  const duration = (rows, key) => {
    const values = rows.map(r => r[key]).filter(v => v != null && v >= 0);
    return {
      n: values.length,
      missingN: rows.length - values.length,
      p50: percentile(values, .5),
      p85: percentile(values, .85)
    };
  };
  const rate = (rows, test) => ({
    numerator: rows.filter(test).length,
    denominator: rows.length,
    pct: rows.length ? 100 * rows.filter(test).length / rows.length : null
  });
  const timingGroup = (at, due, days) => !at || !due || days == null ? 'unknown' : dateKey(at) > due ? 'after_due' : days >= 2 ? 'adequate' : 'short';
  const groupLabels = {
    adequate: 'At least 2 working days',
    short: 'Less than 2 working days',
    after_due: 'After due date',
    unknown: 'Unknown'
  };
  const ownerFor = (row, kind) => row.owners[kind];
  const matches = (row, kind, filters = {}) => {
    const owner = ownerFor(row, kind);
    return (!filters.role || owner.role === filters.role) && (!filters.personId || owner.id === filters.personId);
  };
  // A line is a requested deliverable category, not a verified delivered asset.
  function requestedLines(row) {
    const lines = [{ slot: 'Primary', type: row.asset_type, skill: row.asset_subtype, rawCount: row.asset_count }];
    if ([row.asset_type_2, row.asset_subtype_2, row.asset_count_2].some(v => v != null && String(v).trim() !== '')) {
      lines.push({ slot: 'Secondary', type: row.asset_type_2, skill: row.asset_subtype_2, rawCount: row.asset_count_2 });
    }
    return lines.map(line => {
      const count = typeof line.rawCount === 'number' || (typeof line.rawCount === 'string' && line.rawCount.trim() !== '') ? number(line.rawCount) : null;
      return { ...line, type: String(line.type || '').trim(), skill: String(line.skill || '').trim(), count: Number.isSafeInteger(count) && count >= 0 ? count : null };
    });
  }
  function requestedTotals(lines) {
    const known = lines.filter(line => line.count != null);
    return { requestedAssetN: known.length ? known.reduce((sum, line) => sum + line.count, 0) : null, missingAssetCountN: lines.length - known.length };
  }
  const typeSkillLabel = code => {
    // Reuse the request form's labels when available; retain unknown codes in their own columns.
    if (typeof globalThis.getFlowMateCreativeTypeLabel === 'function') return globalThis.getFlowMateCreativeTypeLabel(code);
    return ({ 'kv-design': 'KV Design', 'cdn-design': 'CDN Design', 'hero-album': 'Hero Album (Banner x8)', 'video-under-1-min': 'Video Under 1 Min' })[code] || code.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };
  function normalizeFacts(rows) {
    const unique = new Map();
    for (const row of rows || []) {
      if (!row.work_item_id) throw new Error('A report task is missing its stable ID. Refresh before exporting.');
      const productionSeconds = row.started_at && row.review_submitted_at ? (Date.parse(row.review_submitted_at) - Date.parse(row.started_at)) / 1000 : null;
      const tags = [...new Set((Array.isArray(row.ai_tags) ? row.ai_tags : []).map(t => String(t?.tag || t).trim()).filter(Boolean))];
      const flags = [...(row.data_quality_flags || []), ...(row.exception_flags || [])];
      const evaluationDue = Object.hasOwn(row, 'evaluation_due') ? row.evaluation_due : row.due_date;
      const afterDue = !!evaluationDue && !!row.assigned_at && dateKey(row.assigned_at) > evaluationDue;
      const short = productionSeconds != null && productionSeconds >= 0 && productionSeconds < 60;
      if (afterDue) flags.push('assigned_after_due');
      if (short) flags.push('short_status_interval_under_60s');
      if (row.review_submitted_at && !row.due_date) flags.push('missing_first_draft_due');
      if (!row.owner_member_id_at_start) flags.push('missing_owner_at_start');
      if (/\[test\]/i.test(row.title || '')) flags.push('test_title_requires_confirmation');
      const role = ROLES[row.owner_member_code] || 'Unmapped';
      const progression = Object.hasOwn(row, 'delivery_at');
      const owners = Object.fromEntries(['delivery', 'review', 'start'].map(kind => {
        const snapshot = row[`${kind}_snapshot`],
          history = row[`${kind}_history_owner`];
        const o = snapshot || history;
        return [kind, o ? {
          id: o.owner_member_id || 'unassigned',
          name: o.owner_name || 'Unknown owner',
          role: ROLES[o.owner_code] || 'Unmapped',
          source: snapshot ? 'event_snapshot' : 'assignment_history'
        } : progression ? {
          id: 'unassigned',
          name: 'Unknown owner',
          role: 'Unmapped',
          source: 'missing'
        } : {
          id: row.owner_member_id_at_start || 'unassigned',
          name: row.owner_name_at_start || 'Unknown owner',
          role,
          source: 'legacy_owner_at_start'
        }];
      }));
      const deliveredTags = progression ? [...new Set(row.delivered_ai_tags || [])] : tags;
      if (progression && row.ai_evidence_source !== 'delivery_snapshot') flags.push('AI tags reflect current records');
      if (progression && row.deadline_source !== 'first_assignment_snapshot') flags.push('Current deadlines; historical agreement unknown');
      const mixedProduction = !!row.reassigned_during_production || (owners.start.id !== 'unassigned' && owners.review.id !== 'unassigned' && owners.start.id !== owners.review.id);
      if (mixedProduction) flags.push('Multiple owners during production; Lead review');
      if (progression && row.delivered_at && !row.delivery_at) flags.push('First Delivered event missing; volume not inferred');
      if (progression && Object.values(owners).some(o => o.source !== 'event_snapshot')) flags.push('Historical owner reconstructed or unknown');
      if (role === 'Unmapped') flags.push('unmapped_role');
      unique.set(row.work_item_id, {
        ...row,
        id: row.work_item_id,
        displayId: row.display_id || row.work_item_id,
        title: row.title || '(Untitled)',
        personId: row.owner_member_id_at_start || 'unassigned',
        personName: row.owner_name_at_start || 'Unknown owner',
        role,
        workType: row.asset_type || 'Unknown',
        tags,
        flags: [...new Set(flags)],
        afterDue,
        short,
        productionSeconds,
        productionDays: number(row.production_working_days),
        startDays: number(progression ? row.assigned_acknowledge_working_days : row.assigned_to_started_working_days),
        effort: number(row.effort_point),
        owners,
        reassigned_during_production: mixedProduction,
        deliveredTags,
        deliveryAt: progression ? row.delivery_at : row.status === 'delivered' ? row.delivered_at : null,
        acknowledgeAt: progression ? row.acknowledge_at : row.started_at,
        acknowledgeDays: number(row.acknowledge_working_days),
        queueDays: number(row.queue_working_days),
        launchDays: number(row.launch_buffer_working_days),
        evaluationDue: progression ? row.evaluation_due : row.due_date,
        evaluationLaunch: progression ? row.evaluation_launch : row.launch_date,
        createdGroup: timingGroup(row.created_at, row.created_due, number(row.created_buffer_working_days)),
        assignedGroup: timingGroup(row.assigned_at, row.assigned_due, number(row.assigned_buffer_working_days))
      });
    }
    return [...unique.values()].sort((a, b) => a.displayId.localeCompare(b.displayId));
  }
  function summarize(rows, start, end, asOf, annual = false, filters = {}) {
    const today = dateKey(asOf);
    const drafts = rows.filter(r => inRange(r.review_submitted_at, start, end, asOf) && matches(r, 'review', filters));
    const delivered = rows.filter(r => inRange(r.deliveryAt, start, end, asOf) && matches(r, 'delivery', filters));
    const acknowledged = rows.filter(r => inRange(r.acknowledgeAt, start, end, asOf) && matches(r, 'start', filters));
    const created = rows.filter(r => inRange(r.created_at, start, end, asOf));
    const active = rows.filter(r => r.created_at && dateKey(r.created_at) < end && Date.parse(r.created_at) <= Date.parse(asOf) && !['delivered', 'cancelled'].includes(r.status));
    const activity = rows.filter(r => drafts.includes(r) || delivered.includes(r) || acknowledged.includes(r) || created.includes(r));
    const measured = drafts.filter(r => r.status !== 'cancelled');
    const onTimeRows = measured.filter(r => r.evaluationDue);
    const contextualRows = onTimeRows.filter(r => r.assigned_at && !r.afterDue && !r.short && !r.flags.includes('owner_snapshot_fallback'));
    const decisions = measured.filter(r => r.review_decided_at && Date.parse(r.review_decided_at) <= Date.parse(asOf) && ['approved', 'changes_requested'].includes(r.review_decision));
    const finalDueRows = delivered.filter(r => r.final_approved_due_date);
    const ai = activity.filter(r => r.tags.length);
    const periodStatus = start > today ? 'Future period' : today < end ? annual ? 'Year to date' : 'Partial month' : activity.length ? 'Recorded data' : 'No recorded data';
    return {
      period: annual ? start.slice(0, 4) : start.slice(0, 7),
      periodStatus,
      n: drafts.length,
      reviewedN: drafts.length,
      deliveredN: delivered.length,
      activityN: activity.length,
      openN: active.length,
      start: duration(acknowledged, 'startDays'),
      acknowledge: duration(acknowledged, 'acknowledgeDays'),
      queue: duration(acknowledged, 'queueDays'),
      production: duration(measured.filter(r => !filters.personId || !r.reassigned_during_production), 'productionDays'),
      mixedProductionN: measured.filter(r => r.reassigned_during_production).length,
      launch: {
        n: measured.filter(r => r.launchDays != null).length,
        missingN: measured.filter(r => r.launchDays == null).length,
        p50: percentile(measured.map(r => r.launchDays), .5),
        p85: percentile(measured.map(r => r.launchDays), .85)
      },
      onTime: rate(onTimeRows, r => dateKey(r.review_submitted_at) <= r.evaluationDue),
      contextOnTime: rate(contextualRows, r => dateKey(r.review_submitted_at) <= r.evaluationDue),
      firstPass: rate(decisions, r => r.review_decision === 'approved' && !r.rework_at),
      finalOnTime: rate(finalDueRows, r => dateKey(r.delivered_at) <= r.final_approved_due_date),
      reworkN: measured.filter(r => r.rework_at && Date.parse(r.rework_at) <= Date.parse(asOf)).length,
      decisionMissingN: measured.length - decisions.length,
      finalDueMissingN: delivered.length - finalDueRows.length,
      shortProductionN: measured.filter(r => r.short).length,
      assignedAfterDueN: measured.filter(r => r.afterDue).length,
      firstDraftMissingDueN: measured.length - onTimeRows.length,
      cancelledN: drafts.filter(r => r.status === 'cancelled').length,
      qualityFlaggedN: activity.filter(r => r.flags.length).length,
      aiN: ai.length,
      aiDeliveredN: delivered.filter(r => r.deliveredTags.length).length,
      aiAdoption: rate(delivered, r => r.deliveredTags.length > 0),
      timing: Object.fromEntries(['created', 'assigned'].map(kind => [kind, Object.fromEntries(Object.keys(groupLabels).map(g => {
        const sample = drafts.filter(r => r[`${kind}Group`] === g),
          eligible = sample.filter(r => r.evaluationDue);
        return [g, {
          n: sample.length,
          onTime: rate(eligible, r => dateKey(r.review_submitted_at) <= r.evaluationDue)
        }];
      }))])),
      deliveredEffort: delivered.some(r => r.effort != null) ? delivered.reduce((n, r) => n + (r.effort || 0), 0) : null,
      ...requestedTotals(delivered.flatMap(requestedLines)),
      effortMissingN: delivered.filter(r => r.effort == null).length
    };
  }
  function buildReport(input, options = {}) {
    const year = Number(options.year),
      asOf = options.asOf || new Date().toISOString();
    if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error('Choose a valid report year (2026 or later).');
    if (!Number.isFinite(Date.parse(asOf))) throw new Error('Report snapshot time is invalid.');
    const month = options.month ? Number(options.month) : null;
    if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error('Invalid report month.');
    const monthlyOnly = options.coverage === 'month';
    if (monthlyOnly && month == null) throw new Error('A complete month is required for monthly coverage.');
    const filters = {
      year,
      month,
      role: options.role || '',
      personId: options.personId || '',
      workType: options.workType || '',
      timingSource: options.timingSource === 'created' ? 'created' : 'assigned',
      timingGroup: Object.hasOwn(groupLabels, options.timingGroup) ? options.timingGroup : ''
    };
    const all = normalizeFacts(input),
      start = `${year}-01-01`,
      end = `${year + 1}-01-01`;
    const relevant = all.filter(r => [r.created_at, r.review_submitted_at, r.deliveryAt, r.acknowledgeAt].some(d => inRange(d, start, end, asOf)) || r.created_at && dateKey(r.created_at) < end && Date.parse(r.created_at) <= Date.parse(asOf) && !['delivered', 'cancelled'].includes(r.status));
    const rows = relevant.filter(r => Object.keys(r.owners).some(k => matches(r, k, filters)) && (!filters.workType || r.workType === filters.workType) && (!filters.timingGroup || r[`${filters.timingSource}Group`] === filters.timingGroup));
    const monthlyFor = (tasks, scope = filters) => Array.from({
      length: 12
    }, (_, i) => {
      const monthStart = `${year}-${String(i + 1).padStart(2, '0')}-01`;
      const monthEnd = i === 11 ? end : `${year}-${String(i + 2).padStart(2, '0')}-01`;
      return summarize(tasks, monthStart, monthEnd, asOf, false, scope);
    });
    const availablePeople = [...new Map(relevant.flatMap(r => Object.values(r.owners)).filter(o => !filters.role || o.role === filters.role).map(o => [o.id, o])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const people = monthlyOnly ? [] : availablePeople.filter(o => !filters.personId || o.id === filters.personId).map(person => {
      const scope = {
          ...filters,
          personId: person.id
        },
        tasks = rows.filter(r => Object.keys(r.owners).some(k => matches(r, k, scope)));
      return {
        ...person,
        annual: summarize(tasks, start, end, asOf, true, scope),
        monthly: monthlyFor(tasks, scope)
      };
    });
    const annual = monthlyOnly ? null : summarize(rows, start, end, asOf, true, filters),
      monthly = monthlyOnly ? null : monthlyFor(rows);
    const selectedStart = month ? `${year}-${String(month).padStart(2, '0')}-01` : start;
    const selectedEnd = month ? month === 12 ? end : `${year}-${String(month + 1).padStart(2, '0')}-01` : end;
    const selectedRows = rows.filter(r => [['review', 'review_submitted_at'], ['delivery', 'deliveryAt'], ['start', 'acknowledgeAt']].some(([k, d]) => matches(r, k, filters) && inRange(r[d], selectedStart, selectedEnd, asOf)));
    return {
      version: VERSION,
      coverage: monthlyOnly ? 'month' : 'year',
      filters,
      asOf,
      start,
      end,
      rows,
      people,
      annual,
      monthly,
      selected: monthlyOnly ? summarize(rows, selectedStart, selectedEnd, asOf, false, filters) : month ? monthly[month - 1] : annual,
      selectedRows,
      timingOverview: summarize(relevant.filter(r => Object.keys(r.owners).some(k => matches(r,k,filters)) && (!filters.workType || r.workType===filters.workType)),selectedStart,selectedEnd,asOf,!month,filters).timing,
      aiTasks: rows.filter(r => r.deliveredTags.length && matches(r, 'delivery', filters) && inRange(r.deliveryAt, selectedStart, selectedEnd, asOf)),
      availablePeople,
      workTypes: [...new Set(relevant.map(r => r.workType))].sort(),
      calendarActiveN: number(options.calendarActiveN),
      earliestReview: all.map(r => dateKey(r.review_submitted_at)).filter(Boolean).sort()[0] || null
    };
  }
  function formatMetric(value, unit = '') {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (unit === 'days') return n > 0 && n < .1 ? '<0.1 d' : `${n.toFixed(1)} d`;
    if (unit === 'percent') return `${n.toFixed(1)}%`;
    return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1);
  }
  const summaryHeaders = ['Person','Role','Period','Coverage','Delivered tasks','AI Delivered tasks','AI Delivered %','First Draft on time %','On time n','On time eligible n','First Draft due missing n','Days before Launch P50','Launch eligible n','Launch missing n','Production P50','Production P85','Production eligible n','Production missing n','Created to Started P50','Created to Started P85','Acknowledge eligible n','Acknowledge missing n','Created to Assigned P50','Assigned to Started P50','Multiple-owner production tasks','Short status intervals','Flagged tasks', 'Known requested assets on delivered CRs (not actual)', 'Missing / invalid requested-count lines on delivered CRs'];
  const summaryRow = (person,role,s) => {
    const blank = !s.activityN || s.periodStatus === 'Future period';
    return [person,role,s.period,s.periodStatus,blank?null:s.deliveredN,blank?null:s.aiDeliveredN,s.aiAdoption.pct,s.onTime.pct,s.onTime.numerator,s.onTime.denominator,s.firstDraftMissingDueN,s.launch.p50,s.launch.n,s.launch.missingN,s.production.p50,s.production.p85,s.production.n,s.production.missingN,s.acknowledge.p50,s.acknowledge.p85,s.acknowledge.n,s.acknowledge.missingN,s.queue.p50,s.start.p50,s.mixedProductionN,s.shortProductionN,s.qualityFlaggedN,s.requestedAssetN,blank?null:s.missingAssetCountN];
  };
  function buildWorkbook(report) {
    if (report.coverage === 'month') throw new Error('Wait for the complete annual report before exporting.');
    const f = report.filters;
    const taskHeaders = ['Task ID', 'Task name', 'Requester', 'Start owner', 'Review owner', 'Delivered owner', 'Review role', 'Delivery role', 'Current status', 'Created at', 'Assigned at', 'Acknowledged at', 'First Review at', 'First Delivered at', 'Due used', 'Current due', 'Launch used', 'Deadline source', 'AI tags used', 'AI source', 'Created timing context', 'Assigned timing context', 'Created to Started days', 'Assigned to Started days', 'Production days', 'Raw production days', 'Recorded blocked days', 'Days before Launch', 'Delivered event count', 'Owner evidence', 'Brief evidence', 'Date change history', 'Flags', 'Stable ID'];
    const taskRow = r => [r.displayId, r.title, r.requester_name || '', r.owners.start.name, r.owners.review.name, r.owners.delivery.name, r.owners.review.role, r.owners.delivery.role, r.status, r.created_at, r.assigned_at, r.acknowledgeAt, r.review_submitted_at, r.deliveryAt, r.evaluationDue, r.due_date, r.evaluationLaunch, r.deadline_source || 'current_dates', r.deliveredTags.join(', '), r.ai_evidence_source || 'current_tags', groupLabels[r.createdGroup], groupLabels[r.assignedGroup], r.acknowledgeDays, r.startDays, r.productionDays, r.raw_production_working_days, r.blocked_during_production_working_days, r.launchDays, r.delivered_event_n, JSON.stringify(r.owners), JSON.stringify(r.brief_evidence || []), JSON.stringify(r.deadline_history || []), formatFlags(r.flags), r.id];
    taskHeaders.push('Asset type', 'Asset subtype', 'Requested asset count (not actual)', 'Second asset type', 'Second asset subtype', 'Second requested asset count (not actual)');
    const evidenceRow = r => [...taskRow(r), r.asset_type, r.asset_subtype, r.asset_count, r.asset_type_2, r.asset_subtype_2, r.asset_count_2];
    const skillHeaders = ['Delivery month (Bangkok)', 'Person', 'Role', 'Member ID', 'Asset type code', 'Type / Skill code', 'Type / Skill', 'Delivered CRs using this skill (non-additive)', 'Known requested assets (not actual)', 'Missing / invalid requested-count lines'];
    const skillGroups = new Map();
    const skillDetails = report.rows.filter(r => matches(r, 'delivery', f)).flatMap(r => requestedLines(r).map(line => {
      const delivered = inRange(r.deliveryAt, report.start, report.end, report.asOf);
      const month = delivered ? dateKey(r.deliveryAt).slice(0, 7) : '';
      const label = line.skill ? typeSkillLabel(line.skill) : 'Unspecified skill';
      if (delivered) {
        const key = JSON.stringify([month, r.owners.delivery.id, r.owners.delivery.role, line.type, line.skill]);
        if (!skillGroups.has(key)) skillGroups.set(key, { month, person: r.owners.delivery.name, role: r.owners.delivery.role, personId: r.owners.delivery.id, type: line.type, skill: line.skill, label, ids: new Set(), lines: [] });
        const group = skillGroups.get(key);
        group.ids.add(r.id);
        group.lines.push(line);
      }
      return [r.displayId, r.title, r.owners.delivery.name, r.owners.delivery.role, r.owners.delivery.id, r.status, month, r.deliveryAt, line.slot, line.type, line.skill, label, line.count, line.count == null ? 'Missing / invalid' : 'Recorded request', 'Not verified / not collected', delivered ? 'Included' : 'No delivery event in selected year', r.id];
    }));
    const skillRows = [...skillGroups.values()].sort((a, b) => JSON.stringify([a.month, a.person, a.personId, a.type, a.skill]).localeCompare(JSON.stringify([b.month, b.person, b.personId, b.type, b.skill]))).map(group => {
      const totals = requestedTotals(group.lines);
      return [group.month, group.person, group.role, group.personId, group.type, group.skill, group.label, group.ids.size, totals.requestedAssetN, totals.missingAssetCountN];
    });
    const readme = [['Creative KPI monthly progression', 'Definition'], ['Year', f.year], ['Selected month', f.month || 'Whole year'], ['Role', f.role || 'All'], ['Person', report.availablePeople.find(p => p.id === f.personId)?.name || 'All'], ['Work type', f.workType || 'All'], ['Snapshot', report.asOf], ['Version', report.version], ['Source', 'flowmate_creative_kpi_progression_v; permitted Creative Requests only, archived included'], ['Delivered', 'First recorded Delivered event per Task, counted once even after reopening. Missing first event is not inferred from current status.'], ['AI Delivered', 'Only Delivered tasks in the selected period. New work: tags frozen at first Delivered; historical rows: current tags explicitly labelled. Tag counts are not a quality score.'], ['Attribution', 'First Draft: owner at Review; Delivered: owner at delivery; Acknowledge: owner at start. Snapshot preferred, assignment-history reconstruction labelled, unknown retained.'], ['Acknowledge', 'Created to first Assigned -> In progress, grouped by start month. Queue and Assigned -> Started are shown separately.'], ['Production', 'Existing production formula retained; first Review month. Multiple-owner tasks excluded from individual production duration and separately counted; team elapsed duration remains contextual.'], ['Punctuality', 'First Review Bangkok date <= first-assignment due snapshot, or labelled current due for legacy rows. Current and baseline deadlines both retained. Date changes are evidence, not automatic approval.'], ['Before Launch', 'Signed working-date gap from first Review to baseline Launch; positive=before, negative=after. First Review month.'], ['Timing groups', 'Created and Assigned compared with their due snapshot or current due: >=2 days, <2 days, after due, unknown. These do not prove brief completeness or individual fault.'], ['Time unit', '24-hour fractions of eligible Bangkok working dates; not office hours or actual labor. P50=median; P85=85th percentile.'], ['Calendar', report.calendarActiveN == null ? 'Unknown' : report.calendarActiveN], ['Calendar caveat', 'Only recorded holidays are excluded. Calendar changes can affect historical values.'], ['Scope of sheets', 'Selected summary, Task evidence, AI tasks and Timing context match the selected month. Annual and Monthly detail retain full-year progression under the same person/role/type filters.'], ['Year aggregation', 'Recompute from unique tasks, not averages of monthly rates or medians. Event owners can differ; task evidence is not a sum of individual sheets.'], ['Coverage', 'Partial month/year clearly labelled; future or no sample is blank, not performance zero. Short status intervals require confirmation.'], ['Historical limits', 'No invented snapshots. Missing events, current tags/dates and reconstructed owners are labelled. No automated individual blame or rating.']];
    readme.push(...[["CR versus project","Delivered tasks count distinct Creative Requests, not projects or campaigns."],["Type / Skill detail","One row per primary / secondary requested asset slot in the full-year filtered CR set, attributed to the delivery owner. Type / Skill is deliverable subtype, not all craft skills used. Unknown and missing skills stay visible."],["Monthly skill summary","Full-year progression matching Monthly detail: first recorded Delivered event and delivery owner, even after reopening. Bangkok month, current person/role/type/timing filters. CR counts per skill are non-additive; use Monthly detail for distinct overall CR counts. Missing delivery events are not inferred."],["Requested assets, not actual","Current requested quantities, not verified output. Known sums can be incomplete; missing, invalid, negative or fractional counts are blank and counted separately. Explicit zero is retained. No package-size multiplication, inferred actual count or revision counting."],["Work type filter scope","Existing filter selects CRs by primary asset type. Both primary and secondary requested asset slots are exported for each selected CR, even when the secondary type differs."]]);
    readme.push(['Timing filter',f.timingGroup ? `${f.timingSource}: ${groupLabels[f.timingGroup]}` : 'All timing groups']);
    const annualRows = report.people.map(p => summaryRow(p.name, p.role, p.annual));
    annualRows.push(summaryRow('Selected total (do not sum with people)', f.role || 'All roles', report.annual));
    return [{
      name: 'Read me',
      rows: readme,
      reportStyle: true
    }, {
      name: 'Annual summary',
      rows: [summaryHeaders, ...annualRows],
      reportStyle: true
    }, {
      name: 'Monthly detail',
      rows: [summaryHeaders, ...report.people.flatMap(p => p.monthly.map(s => summaryRow(p.name, p.role, s))), ...report.monthly.map(s => summaryRow('Selected total (do not sum with people)', f.role || 'All roles', s))],
      reportStyle: true
    }, {
      name: 'Task evidence',
      rows: [taskHeaders, ...report.selectedRows.map(evidenceRow)],
      reportStyle: true
    }, {
      name: 'AI tasks',
      rows: [taskHeaders, ...report.aiTasks.map(evidenceRow)],
      reportStyle: true
    }, {
      name: 'Selected summary',
      rows: [summaryHeaders, summaryRow('Selected total', f.role || 'All', report.selected)],
      reportStyle: true
    }, {
      name: 'Timing context',
      rows: [['Period', 'Context (all timing groups)', 'Group', 'Tasks', 'On time n', 'Eligible n', 'On time %'], ...['created', 'assigned'].flatMap(kind => Object.entries(report.timingOverview[kind]).map(([group, v]) => [report.selected.period, kind, groupLabels[group], v.n, v.onTime.numerator, v.onTime.denominator, v.onTime.pct]))],
      reportStyle: true
    }, {
      name: 'Quality & context',
      rows: [['Task ID', 'Task name', 'Owner', 'Role', 'Flags', 'Verified reason (Lead input)', 'Production defect / brief / preference / scope change (Lead input)', 'Evidence link (Lead input)'], ...report.rows.filter(r => r.flags.length || r.rework_at).map(r => [r.displayId, r.title, r.personName, r.role, formatFlags(r.flags), '', '', ''])],
      reportStyle: true
    }, {
      name: 'Lead evaluation',
      rows: [['Person', 'Role', 'Period', 'Brief / brand quality (Lead input)', 'Craft / technical accuracy (Lead input)', 'GD: layout / readability; VE: pacing / audio / subtitles (Lead input)', 'Portfolio task IDs / links (Lead input)', 'Collaboration evidence (Lead input)', 'AI use case / validated benefit (Lead input)', 'Strength (Lead input)', 'Focus (Lead input)', 'Development plan (Lead input)', 'Reviewer', 'Review date'], ...report.people.map(p => [p.name, p.role, f.year, '', '', '', '', '', '', '', '', '', '', ''])],
      reportStyle: true
    },
      { name: 'CR Type Skill detail', rows: [['CR ID', 'Task name', 'Delivery owner', 'Role', 'Member ID', 'Status at export', 'Delivery month (Bangkok)', 'Delivered at', 'Asset slot', 'Asset type code', 'Type / Skill code', 'Type / Skill', 'Requested asset count (not actual)', 'Requested count coverage', 'Actual delivered count verification', 'Monthly summary inclusion', 'Stable task ID'], ...skillDetails], reportStyle: true },
      { name: 'Monthly skill summary', rows: [skillHeaders, ...skillRows], reportStyle: true },
      { name: 'Self evaluation', rows: [['Person', 'Role', 'Month', 'Coverage', 'Delivered CRs', 'Known requested assets (not actual)', 'Missing / invalid requested-count lines', 'Highlight CR IDs / portfolio links (Self input)', 'My contribution / collaboration (Self input)', 'Strength / quality evidence (Self input)', 'Challenges / scope changes (Self input)', 'New skills / learning (Self input)', 'AI use case / validated benefit (Self input)', 'Next month development plan (Self input)'], ...report.people.flatMap(p => p.monthly.filter(s => s.activityN > 0).map(s => [p.name, p.role, s.period, s.periodStatus, s.deliveredN, s.requestedAssetN, s.missingAssetCountN, '', '', '', '', '', '', '']))], reportStyle: true },
    ];
  }
  return {
    VERSION,
    ROLES,
    dateKey,
    percentile,
    normalizeFacts,
    buildReport,
    buildWorkbook,
    formatMetric,
    formatFlags,
    groupLabels,
    timingGroup
  };
});
