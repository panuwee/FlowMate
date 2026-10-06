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
  if (typeof module === 'object' && module.exports) module.exports = { loadFlowMateCreativeReport };
})(typeof window !== 'undefined' ? window : globalThis);
