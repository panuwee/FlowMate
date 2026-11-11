const { test } = require('node:test');
const assert = require('node:assert/strict');
const kpi = require('../../creative-kpi-report.js');
const row = (id, extra = {}) => ({ work_item_id: id, display_id: id, title: id,
  owner_member_id_at_start: 'p1', owner_name_at_start: 'Ploy', owner_member_code: 'ploy',
  asset_type: 'static-graphic', asset_subtype: 'kv-design', asset_count: 1,
  status: 'delivered', created_at: '2026-07-01T00:00:00Z',
  delivered_at: '2026-08-01T02:00:00Z', ...extra });
const build = (rows, options = {}) => kpi.buildReport(rows, { year: 2026, asOf: '2026-11-11T09:00:00Z', ...options });
const sheet = (report, name) => kpi.buildWorkbook(report).find(s => s.name === name);
const records = s => s.rows.slice(1).map(values => Object.fromEntries(s.rows[0].map((key, i) => [key, values[i]])));

test('mixed CR counts once overall, splits requested counts by skill and retains secondary subtype in evidence', () => {
  const a = row('a', { asset_type_2: 'static-graphic', asset_subtype_2: 'resize', asset_count_2: 6 });
  const r = build([a, a]);
  assert.equal(r.monthly[7].deliveredN, 1);
  assert.equal(r.monthly[7].requestedAssetN, 7);
  const skills = records(sheet(r, 'Monthly skill summary'));
  assert.equal(skills.length, 2);
  assert.deepEqual(skills.map(s => s['Known requested assets (not actual)']).sort((a,b) => a-b), [1, 6]);
  assert.ok(skills.every(s => s['Delivered CRs using this skill (non-additive)'] === 1));
  const detail = records(sheet(r, 'CR Type Skill detail'));
  assert.equal(detail.length, 2);
  assert.ok(detail.every(s => s['Actual delivered count verification'] === 'Not verified / not collected'));
  assert.equal(records(sheet(r, 'Task evidence'))[0]['Second asset subtype'], 'resize');
});

test('duplicate skill slots sum quantities but deduplicate CRs; same-name owners remain separate', () => {
  const r = build([row('a', { asset_type_2: 'static-graphic', asset_subtype_2: 'kv-design', asset_count_2: 2 }), row('b', { owner_member_id_at_start: 'p2' })]);
  const skills = records(sheet(r, 'Monthly skill summary'));
  assert.equal(skills.length, 2);
  assert.deepEqual(skills.map(s => s['Known requested assets (not actual)']).sort(), [1, 3]);
  assert.ok(skills.every(s => s['Delivered CRs using this skill (non-additive)'] === 1));
  assert.equal(r.annual.deliveredN, 2);
});

test('missing or invalid counts stay blank; partial totals expose gaps and explicit zero survives', () => {
  const bad = [null, '', '   ', 'n/a', -1, 1.5, Infinity, true, []];
  const r = build(bad.map((value, i) => row(String(i), { asset_count: value })));
  assert.equal(r.annual.requestedAssetN, null);
  assert.equal(r.annual.missingAssetCountN, bad.length);
  assert.equal(records(sheet(r, 'Monthly skill summary'))[0]['Known requested assets (not actual)'], null);
  const mixed = build([row('zero', { asset_count: '0' }), row('known', { asset_count: '3' }), row('missing', { asset_count: null })]);
  assert.equal(mixed.annual.requestedAssetN, 3);
  assert.equal(mixed.annual.missingAssetCountN, 1);
  assert.equal(build([row('zero', { asset_count: 0 })]).annual.requestedAssetN, 0);
});

test('delivery cohort uses Bangkok month/year, excludes open, cancelled and future deliveries but retains detail', () => {
  const r = build([
    row('boundary', { delivered_at: '2026-07-31T17:00:00Z' }),
    row('prev', { delivered_at: '2025-12-31T16:59:59Z' }),
    row('open', { status: 'review', delivered_at: null }),
    row('cancelled', { status: 'cancelled' }),
    row('future', { delivered_at: '2026-12-01T00:00:00Z' }),
  ]);
  const skills = records(sheet(r, 'Monthly skill summary'));
  assert.equal(skills.length, 1);
  assert.equal(skills[0]['Delivery month (Bangkok)'], '2026-08');
  assert.equal(skills[0]['Delivered CRs using this skill (non-additive)'], 1);
  assert.equal(records(sheet(r, 'CR Type Skill detail')).filter(s => s['Monthly summary inclusion'] === 'Included').length, 1);
});

test('missing skills remain explicit and unknown codes survive; filter scope retains secondary lines of selected CR', () => {
  const rows = [row('a', { asset_subtype: null, asset_type_2: 'general-video', asset_subtype_2: 'new-video-skill', asset_count_2: 2 }), row('b', { owner_member_id_at_start: 'p2', owner_member_code: 'pond', asset_type: 'general-video' })];
  const r = build(rows, { personId: 'p1', role: 'GD', workType: 'static-graphic' });
  const skills = records(sheet(r, 'Monthly skill summary'));
  assert.equal(skills.length, 2);
  assert.ok(skills.some(s => s['Type / Skill'] === 'Unspecified skill'));
  assert.ok(skills.some(s => s['Type / Skill code'] === 'new-video-skill'));
  assert.equal(r.annual.requestedAssetN, 3);
  assert.equal(r.annual.deliveredN, 1);
});

test('empty export has headers only; summary rows and self evaluation keep totals and editable fields aligned', () => {
  const empty = build([]);
  for (const name of ['CR Type Skill detail', 'Monthly skill summary', 'Self evaluation']) assert.equal(sheet(empty, name).rows.length, 1);
  const r = build([row('a', { asset_subtype: 'hero-album', asset_count: 1 })]);
  assert.equal(r.annual.requestedAssetN, 1); // Do not infer eight assets from a package label.
  for (const s of kpi.buildWorkbook(r)) assert.ok(s.rows.every(row => row.length === s.rows[0].length), s.name);
  const august = records(sheet(r, 'Monthly detail')).find(s => s.Person === 'Ploy' && s.Period === '2026-08');
  assert.equal(august['Known requested assets on delivered CRs (not actual)'], 1);
  const evaluation = records(sheet(r, 'Self evaluation')).find(s => s.Month === '2026-08');
  assert.equal(evaluation['Delivered CRs'], 1);
  assert.equal(evaluation['My contribution / collaboration (Self input)'], '');
});

test('skill volume follows first delivery event and delivery owner after reopening, with year and timing filters retained', () => {
  const owner = (id, code) => ({ owner_member_id: id, owner_name: code, owner_code: code });
  const input = row('reopened', {
    status: 'in_progress', delivery_at: '2026-08-01T02:00:00Z', delivered_at: '2026-10-01T00:00:00Z',
    review_submitted_at: '2026-07-20T00:00:00Z',
    delivery_snapshot: owner('ve', 'vee'), review_snapshot: owner('gd', 'ploy'), start_snapshot: owner('gd', 'ploy'),
    assigned_at: '2026-07-02T00:00:00Z', assigned_due: '2026-07-10', assigned_buffer_working_days: 1,
  });
  const r = build([input], { month: 10, personId: 've', role: 'VE', timingGroup: 'short' });
  const skills = records(sheet(r, 'Monthly skill summary'));
  assert.equal(skills.length, 1);
  assert.equal(skills[0]['Delivery month (Bangkok)'], '2026-08');
  assert.equal(skills[0]['Member ID'], 've');
  assert.equal(r.monthly[7].requestedAssetN, 1);
  assert.equal(r.selected.requestedAssetN, null);
  assert.equal(records(sheet(r, 'CR Type Skill detail'))[0]['Delivery owner'], 'vee');
  assert.equal(records(sheet(build([input], { personId: 'gd' }), 'Monthly skill summary')).length, 0);
  assert.equal(records(sheet(build([{ ...input, delivery_at: null }]), 'Monthly skill summary')).length, 0);
  assert.equal(records(sheet(build([input], { timingGroup: 'adequate' }), 'Monthly skill summary')).length, 0);
});
