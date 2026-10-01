const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.jsx', 'utf8');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function fixture() {
  const context = {
    MARKETING_PLAN_CHANNELS: [{ key: 'fb' }, { key: 'ig' }],
    getMarketingPlanTimelineWindow: () => ({ monthKeys: ['2026-10', '2026-11', '2026-12'] }),
    normalizeMarketingPlanWorkingStatus: value => value || 'planned',
  };
  vm.createContext(context);
  vm.runInContext(extract('function filterMarketingPlanRows(', 'function getMarketingPlanWorkingRowTeam('), context);
  return context;
}
test('Working Sheet uses launch month, preserves campaign and groups channel placements', () => {
  const context = fixture();
  const rows = ['fb', 'ig'].map(channel => ({ contentItemId: 'hero', campaignName: 'Thai Best [Sep-2026]', monthKey: '2026-09', publishDate: '2026-10-02', channel }));
  const grouped = context.groupMarketingPlanWorkingSheetRows(rows, '2026-10');
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].monthKey, '2026-10');
  assert.equal(grouped[0].campaignName, rows[0].campaignName);
  assert.equal(grouped[0].channels.length, 2);
  assert.equal(rows[0].monthKey, '2026-09');
});
test('launch date handles year boundary and missing date falls back to plan month', () => {
  const context = fixture();
  const normalized = context.normalizeMarketingPlanWorkingSheetMonths([{ monthKey: '2026-12', publishDate: '2027-01-02' }, { monthKey: '2026-10', publishDate: '' }]);
  assert.equal(normalized[0].monthKey, '2027-01');
  assert.equal(normalized[1].monthKey, '2026-10');
});
test('Working Sheet query selects launch dates across plan months and keeps cache separate', async () => {
  const calls = [];
  const query = { select() { return this; }, in(...args) { calls.push(['in', ...args]); return this; }, or(value) { calls.push(['or', value]); return this; }, order() { return this; }, then(resolve) { return Promise.resolve({ data: [] }).then(resolve); } };
  const context = fixture();
  Object.assign(context, {
    window: { flowmateSupabase: { from: () => query } },
    getMarketingPlanTimelineCacheKey: () => 'oct',
    getNextMarketingPlanMonthKey: () => '2027-01',
    marketingPlanTimelineCache: new Map(), marketingPlanTimelineRequests: new Map(),
    MARKETING_PLAN_TIMELINE_CACHE_TTL_MS: 60000, MARKETING_PLAN_TIMELINE_SELECT_COLUMNS: '*',
    normalizeMarketingPlanTimelineRow: row => row, sortMarketingPlanTimelineRows: rows => rows,
  });
  vm.runInContext(extract('async function loadMarketingPlanTimelineRows(', 'async function findOrCreateMarketingPlan('), context);
  await context.loadMarketingPlanTimelineRows('publish_date', '2026-10', { useLaunchMonth: true });
  assert.equal(calls[0][1], 'and(publish_date.gte.2026-10-01,publish_date.lt.2027-01-01),and(publish_date.is.null,month_key.in.(2026-10,2026-11,2026-12))');
  await context.loadMarketingPlanTimelineRows('publish_date', '2026-10');
  assert.equal(calls[1][0], 'in');
  assert.equal(context.marketingPlanTimelineCache.size, 2);
});
test('Creative Request source and built output omit the brief evidence block', () => {
  for (const file of ['screens-a.jsx', 'screens-a.js']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /FlowMateCreativeBriefEvidence|หลักฐานความพร้อมของบรีฟ|ยังไม่มีหลักฐานการส่งบรีฟ/);
  }
});
test('Working Sheet CSV includes October launches from September plans with the correct month', () => {
  const context = fixture();
  let output;
  Object.assign(context, {
    window: { flowmateDownloadCsv: (name, headers, data) => { output = data; } },
    getMarketingPlanMonthLabel: value => value,
    getMarketingPlanChannelLabel: value => value,
    getMarketingPlanStatusLabel: value => value,
    formatMarketingPlanTime: value => value,
    getMarketingPlanWorkingRowTeam: () => '',
    getMarketingPlanWorkingSheetStatus: () => 'planned',
  });
  vm.runInContext(extract('function exportMarketingPlanRowsCsv(', 'function MarketingPlanSubPicSearch('), context);
  const rows = [{ contentItemId: 'promo', monthKey: '2026-09', publishDate: '2026-10-02', channel: 'fb' }];
  assert.equal(context.exportMarketingPlanRowsCsv(context.groupMarketingPlanWorkingSheetRows(rows, '2026-10'), '2026-10'), 1);
  assert.equal(output[0][0], '2026-10');
});
