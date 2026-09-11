/* Report-only loader. Do not fall back to the legacy due-date export. */
(function (root) {
  async function loadFlowMateCreativeReport({ year, signal } = {}) {
    if (!Number.isInteger(Number(year)) || Number(year) < 2026 || Number(year) > 2100) throw new Error('Invalid Creative report year.');
    if (!root.flowmateSupabase) throw new Error('Supabase client is not ready.');
    const rows = [], pageSize = 500;
    let expectedCount = null;
    for (let offset = 0; ; offset += pageSize) {
      if (signal?.aborted) throw new Error('Report load cancelled.');
      let query = root.flowmateSupabase.from('flowmate_creative_kpi_report_v').select('*', { count: 'exact' })
        .or(`created_year.eq.${year},review_year.eq.${year},delivery_year.eq.${year},and(is_open.eq.true,created_year.lte.${year})`)
        .order('work_item_id', { ascending: true }).range(offset, offset + pageSize - 1);
      if (signal && query.abortSignal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205'
        ? 'Year-end reporting data is not installed yet. The prepared reporting SQL must be reviewed and applied before live use.'
        : 'Creative report could not be loaded completely. Please refresh or contact the administrator.');
      if (!Array.isArray(data)) throw new Error('Creative report returned incomplete data.');
      if (!Number.isInteger(count)) throw new Error('Creative report row count could not be verified.');
      if (expectedCount != null && expectedCount !== count) throw new Error('Report data changed during loading. Please refresh.');
      expectedCount = count;
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    if (rows.length !== expectedCount) throw new Error('Creative report is incomplete. Please refresh or contact the administrator.');
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
