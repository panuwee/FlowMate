const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.jsx', 'utf8');
function fixture() {
  const context = {
    MARKETING_PLAN_TIMELINE_COUNT_CHANNELS: [{ key: 'facebook' }],
    getMarketingPlanTimelineWindow: () => ({ monthKeys: ['2026-10', '2026-11', '2026-12'] }),
    getMarketingPlanCampaignKey: name => name,
    getMarketingPlanViewStatus: row => row.placementStatus || 'planned',
    getMarketingPlanAssetFirstPublishDate: asset => asset.placements.map(row => row.publishDate).filter(Boolean).sort()[0] || '9999-12-31',
    getMarketingPlanTierRank: tier => ({ S: 0, A: 1, B: 2 }[tier] ?? 3),
  };
  vm.createContext(context);
  const start = source.indexOf('function getMarketingPlanTimelineChannelCountsByDay(');
  const end = source.indexOf('const MARKETING_PLAN_CHANNELS', start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}
function rows() {
  return [
    ['cover', 'Facebook cover', '2026-10-01', '2026-10'],
    ['hero', 'Hero Album', '2026-10-02', '2026-09'],
    ['tips', 'Pro-Player tips', '2026-10-08', '2026-09'],
    ['september', 'September content', '2026-09-30', '2026-10'],
    ['january', 'January content', '2027-01-01', '2026-10'],
  ].map(([id, title, date, month]) => ({ campaignName: 'Thai Best 2026 [Sep-2026]', campaignId: 'thai-best', contentItemId: id, contentTitle: title, placementId: id, publishDate: date, monthKey: month, channel: 'facebook', contentTier: 'B' }));
}
test('October Campaign Timeline includes all three Thai Best launches across plan months', () => {
  const input = rows();
  const grouped = fixture().groupMarketingPlanTimelineRows(input, '2026-10');
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].name, 'Thai Best 2026 [Sep-2026]');
  assert.deepEqual(Array.from(grouped[0].assets, asset => asset.title), ['Facebook cover', 'Hero Album', 'Pro-Player tips']);
  assert.deepEqual(Array.from(grouped[0].assets, asset => asset.placements[0].publishDate), ['2026-10-01', '2026-10-02', '2026-10-08']);
  assert.equal(input[1].monthKey, '2026-09');
});
test('daily counters use launch month and exclude launches outside the visible window', () => {
  const counts = fixture().getMarketingPlanTimelineChannelCountsByDay(rows(), '2026-10');
  assert.deepEqual(Object.keys(counts), ['2026-10-01', '2026-10-02', '2026-10-08']);
  assert.equal(counts['2026-10-02'].facebook, 1);
  assert.equal(counts['2026-10-08'].facebook, 1);
});
test('Campaign Timeline opts into launch-date loading for both initial and refreshed data', () => {
  const start = source.indexOf('async function loadTimelineRows(');
  const end = source.indexOf('useEffectApp(', start);
  assert.match(source.slice(start, end), /loadMarketingPlanTimelineRows\("campaign", selectedMonth, \{ \.\.\.options, useLaunchMonth: true \}\)/);
});
test('rendered Campaign Timeline contains the three content rows and their date badges', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const context = fixture();
  const dates = ['2026-10-01', '2026-10-02', '2026-10-08'];
  const states = [rows(), '2026-10', ['2026-10'], [], [], [], { status: 'live' }];
  let stateIndex = 0;
  Object.assign(context, {
    React, window: {},
    useStateApp: () => [states[stateIndex++], () => {}],
    useEffectApp: () => {}, useRefApp: () => ({ current: null }),
    MARKETING_TIMELINE_COLLAPSE_KEY: 'timeline', MARKETING_ESPORT_TIMELINE_COLLAPSE_KEY: 'esport',
    MARKETING_PLAN_FUNCTION_FILTER_OPTIONS: [], MARKETING_PLAN_WORKING_STATUS_OPTIONS: [],
    getMarketingPlanCurrentMonthKey: () => '2026-10',
    getMarketingPlanTimelineWindow: () => ({ monthKeys: ['2026-10', '2026-11', '2026-12'], monthGroups: [{ key: '2026-10', label: 'Oct 2026', days: dates }], days: dates.map(key => ({ key, day: Number(key.slice(-2)), label: key })) }),
    filterMarketingPlanRowsByFunctions: input => input,
    filterMarketingPlanRowsByVisibleCampaignTags: input => input,
    isMarketingPlanPublishableChannel: () => true,
    prioritizeMarketingPlanCampaignsForDate: input => input,
    getMarketingPlanTodayKey: () => '2026-10-01',
    getMarketingPlanStatusClass: () => 'planned',
    formatMarketingPlanTime: value => value,
    formatMarketingPlanBadgeTime: () => '',
    getMarketingPlanChannelAbbrev: () => 'FB', getMarketingPlanChannelLabel: () => 'Facebook',
    getMarketingCampaignFunctionStyle: () => ({}), getMarketingPlanMonthLabel: () => 'Oct 2026',
    getMarketingPlanTimelineAssetMeta: asset => asset.format || '',
    Icon: () => null, MarketingPlanFunctionFilter: () => null,
  });
  const start = source.indexOf('function MarketingPlanTimelineScreen(');
  const end = source.indexOf('function MarketingPlanChannelPlanScreen(', start);
  vm.runInContext(source.slice(start, end), context);
  const html = renderToStaticMarkup(React.createElement(context.MarketingPlanTimelineScreen));
  for (const title of ['Facebook cover', 'Hero Album', 'Pro-Player tips']) assert.ok(html.includes(title));
  for (const date of dates) assert.ok(html.includes(`Facebook - ${date} - planned`));
  assert.equal((html.match(/class="badge planned marketing-timeline-badge"/g) || []).length, 3);
});
