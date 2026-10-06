/* Report-only loader. Do not fall back to the legacy due-date export. */
(function (root) {
  async function loadFlowMateCreativeReport({ year, signal } = {}) {
    if (!Number.isInteger(Number(year)) || Number(year) < 2026 || Number(year) > 2100) throw new Error('Invalid Creative report year.');
    if (!root.flowmateSupabase) throw new Error('Supabase client is not ready.');
    const rows = [], ids = [], pageSize = 500;
    const checkCancelled = () => { if (signal?.aborted) throw new Error('Report load cancelled.'); };
    const queryError = error => new Error(error.code === '42P01' || error.code === 'PGRST205'
      ? 'Year-end reporting data is not installed yet. The prepared reporting SQL must be reviewed and applied before live use.'
      : error.code === '57014'
        ? 'Creative report timed out. Please retry or contact the administrator.'
        : `Creative report could not be loaded completely (${/^[A-Z0-9]+$/.test(error.code || '') ? error.code : 'unknown'}). Please refresh or contact the administrator.`);
    // Discover the complete permitted task set cheaply before evaluating history.
    // Include older and archived tasks: they may have events in the selected year.
    let expectedCount = null;
    for (let offset = 0; ; offset += pageSize) {
      checkCancelled();
      let query = root.flowmateSupabase.from('work_items').select('id', { count: 'exact' })
        .eq('work_type', 'creative_request').lt('created_at', `${Number(year) + 1}-01-01T00:00:00+07:00`)
        .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
      if (signal && query.abortSignal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      if (error) throw queryError(error);
      if (!Array.isArray(data)) throw new Error('Creative report returned incomplete data.');
      if (!Number.isInteger(count)) throw new Error('Creative report row count could not be verified.');
      if (expectedCount != null && expectedCount !== count) throw new Error('Report data changed during loading. Please refresh.');
      expectedCount = count;
      ids.push(...data.map(row => row.id));
      if (data.length < pageSize) break;
    }
    if (ids.length !== expectedCount || ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Creative report is incomplete. Please refresh or contact the administrator.');
    async function loadBatch(batch) {
      checkCancelled();
      let query = root.flowmateSupabase.from('flowmate_creative_kpi_progression_v').select('*', { count: 'exact' })
        .in('work_item_id', batch)
        .or(`created_year.eq.${year},review_year.eq.${year},first_delivery_year.eq.${year},started_year.eq.${year},and(is_open.eq.true,created_year.lte.${year})`)
        .order('work_item_id', { ascending: true }).range(0, batch.length - 1);
      if (signal && query.abortSignal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      checkCancelled();
      // Only timeouts may reduce batch size; never hide a permission/schema error.
      if (error?.code === '57014' && batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        await loadBatch(batch.slice(0, middle));
        await loadBatch(batch.slice(middle));
        return;
      }
      if (error) throw queryError(error);
      if (!Array.isArray(data) || !Number.isInteger(count) || count !== data.length || data.some(row => !batch.includes(row.work_item_id))) throw new Error('Creative report is incomplete. Please refresh or contact the administrator.');
      rows.push(...data);
    }
    // Sequential bounded reads avoid both full-year history scans and request fan-out.
    for (let offset = 0; offset < ids.length; offset += 40) await loadBatch(ids.slice(offset, offset + 40));
    rows.sort((a, b) => String(a.work_item_id).localeCompare(String(b.work_item_id)));
    if (new Set(rows.map(r => r.work_item_id)).size !== rows.length) throw new Error('Report data changed during loading. Refresh before exporting.');
    let calendarQuery = root.flowmateSupabase.from('flowmate_non_working_days').select('day', { count: 'exact', head: true })
      .eq('active', true).in('scope', ['all', 'gdve']).gte('day', `${year}-01-01`).lt('day', `${Number(year) + 1}-01-01`);
    if (signal && calendarQuery.abortSignal) calendarQuery = calendarQuery.abortSignal(signal);
    const calendar = await calendarQuery;
    if (calendar.error) throw new Error('The report calendar could not be verified. Please refresh.');
    return { rows, asOf: new Date().toISOString(), calendarActiveN: calendar.count };
  }
  root.loadFlowMateCreativeReport = loadFlowMateCreativeReport;
  // Match requester_monthly_v's aggregates over the same permission-filtered facts.
  // Bound expensive fact evaluation by task IDs instead of scanning the rollup view.
  function buildRequesterMonthly(rows) {
    const groups = new Map();
    for (const row of rows) {
      if (!row.review_submitted_at) continue;
      const month = row.review_month;
      for (const person of [false, true]) {
        const key = JSON.stringify([month, person, ...(person ? [row.requester_user_id, row.requester_name, row.requester_team] : [])]);
        if (!groups.has(key)) groups.set(key, { rows: [], scope: person ? 'person' : 'team', review_month: month, person_id: person ? row.requester_user_id : null, person_name: person ? row.requester_name ?? 'Unknown requester' : 'All Requesters', person_group: person ? row.requester_team ?? 'N/A' : 'All teams' });
        groups.get(key).rows.push(row);
      }
    }
    const percentile = (values, p) => { if (!values.length) return null; const position = (values.length - 1) * p, low = Math.floor(position), high = Math.ceil(position); return values[low] + (values[high] - values[low]) * (position - low); };
    const rate = (n, d) => d ? 100 * n / d : null;
    return [...groups.values()].map(({ rows: facts, ...group }) => {
      const n = facts.length, result = { ...group, n, small_sample: n < 5 };
      for (const [prefix, field, includeP15] of [['brief_lead', 'brief_to_launch_working_days', true], ['review_response', 'review_first_response_working_days', false], ['review_decision', 'review_decision_working_days', false]]) {
        const values = facts.filter(r => r[field] != null).map(r => Number(r[field])).sort((a, b) => a - b);
        if (values.some(v => !Number.isFinite(v))) throw new Error('Requester KPI facts are incomplete. Please retry.');
        result[prefix + '_n'] = values.length;
        for (const p of includeP15 ? [15, 50, 85] : [50, 85]) result[prefix + '_p' + p] = percentile(values, p / 100);
        result[prefix + '_avg'] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        result[prefix + '_missing_n'] = n - values.length;
      }
      const count = predicate => facts.filter(predicate).length;
      result.brief_late_or_same_day_n = count(r => r.brief_to_launch_working_days != null && Number(r.brief_to_launch_working_days) <= 0);
      result.review_sla_denominator = count(r => r.review_sla_eligible === true);
      result.review_sla_n = count(r => r.review_sla_eligible === true && r.review_sla_met === true);
      result.review_sla_pct = rate(result.review_sla_n, result.review_sla_denominator);
      result.pending_review_over_sla_n = count(r => r.review_sla_eligible === true && r.review_sla_met === false && r.first_requester_activity_at == null);
      result.brief_quality_denominator = count(r => r.first_assignment_result != null);
      result.brief_complete_first_pass_n = count(r => r.brief_complete_first_pass === true);
      result.brief_complete_first_pass_pct = rate(result.brief_complete_first_pass_n, result.brief_quality_denominator);
      result.rework_exception_n = count(r => r.rework_at != null);
      result.rework_exception_pct = rate(result.rework_exception_n, n);
      result.exception_n = count(r => r.exception_flags?.length > 0 || r.data_quality_flags?.length > 0);
      return result;
    }).sort((a, b) => String(a.review_month).localeCompare(String(b.review_month)) || a.scope.localeCompare(b.scope) || String(a.person_id).localeCompare(String(b.person_id)));
  }
  async function loadFlowMateRequesterKpiMonthly({ signal } = {}) {
    const client = root.flowmateSupabase;
    if (!client) throw new Error('Supabase client is not ready.');
    const ids = [], rows = [], size = 500;
    let expected;
    const cancelled = () => { if (signal?.aborted) throw new Error('Requester report load cancelled.'); };
    const read = async query => { cancelled(); if (signal && query.abortSignal) query = query.abortSignal(signal); const response = await query; cancelled(); return response; };
    for (let offset = 0; ; offset += size) {
      const { data, count, error } = await read(client.from('work_items').select('id', { count: 'exact' }).eq('work_type', 'creative_request').order('id', { ascending: true }).range(offset, offset + size - 1));
      if (error || !Array.isArray(data) || !Number.isInteger(count) || (expected != null && expected !== count)) throw new Error('Requester task scope could not be verified. Please retry.');
      expected = count; ids.push(...data.map(r => r.id)); if (data.length < size) break;
    }
    if (ids.length !== expected || ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Requester task scope is incomplete. Please retry.');
    const fields = 'work_item_id,review_submitted_at,review_month,requester_user_id,requester_name,requester_team,brief_to_launch_working_days,review_first_response_working_days,review_decision_working_days,review_sla_eligible,review_sla_met,first_requester_activity_at,first_assignment_result,brief_complete_first_pass,rework_at,exception_flags,data_quality_flags';
    async function batch(items) {
      const { data, count, error } = await read(client.from('flowmate_creative_kpi_facts_v').select(fields, { count: 'exact' }).in('work_item_id', items).not('review_submitted_at', 'is', null).order('work_item_id', { ascending: true }).range(0, items.length - 1));
      if (error?.code === '57014' && items.length > 1) { const mid = Math.ceil(items.length / 2); await batch(items.slice(0, mid)); await batch(items.slice(mid)); return; }
      if (error) throw new Error(`Requester report could not be loaded (${/^[A-Z0-9]+$/.test(error.code || '') ? error.code : 'unknown'}). Please retry.`);
      if (!Array.isArray(data) || !Number.isInteger(count) || count !== data.length || data.some(r => !items.includes(r.work_item_id) || fields.split(',').some(f => !(f in r)) || !r.review_submitted_at || !r.review_month)) throw new Error('Requester KPI facts are incomplete. Please retry.');
      rows.push(...data);
    }
    for (let offset = 0; offset < ids.length; offset += 40) await batch(ids.slice(offset, offset + 40));
    if (new Set(rows.map(r => r.work_item_id)).size !== rows.length) throw new Error('Requester data changed during loading. Please retry.');
    return buildRequesterMonthly(rows);
  }
  root.loadFlowMateRequesterKpiMonthly = loadFlowMateRequesterKpiMonthly;
  if (typeof module === 'object' && module.exports) module.exports = { loadFlowMateCreativeReport, loadFlowMateRequesterKpiMonthly, buildRequesterMonthly };
})(typeof window !== 'undefined' ? window : globalThis);
