const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Execute the real loader with deferred responses. No network or credentials.
function fixture({ count = 160, signal } = {}) {
  const pending = [], calls = [];
  let active = 0, peak = 0;
  const ids = Array.from({ length: count }, (_, i) => String(i).padStart(4, '0'));
  const root = { flowmateSupabase: { from(table) {
    const args = {}, query = {};
    for (const method of ['select','eq','lt','gte','in','or','order','range','abortSignal']) {
      query[method] = (...values) => { args[method] = values; return query; };
    }
    query.then = (resolve, reject) => {
      calls.push(table);
      if (table === 'work_items') return Promise.resolve({ data: ids.map(id => ({ id })), count: ids.length }).then(resolve,reject);
      if (table === 'flowmate_non_working_days') return Promise.resolve({ count: 0 }).then(resolve,reject);
      active++; peak = Math.max(peak, active);
      return new Promise(done => pending.push({ ids: args.in[1], finish(response) {
        active--;
        done(response || { data: args.in[1].map(work_item_id => ({ work_item_id })), count: args.in[1].length });
      }})).then(resolve,reject);
    };
    return query;
  }}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../supabase-creative-kpi-report.js'),'utf8'), { window: root });
  return { pending, calls, peak: () => peak, load: () => root.loadFlowMateCreativeReport({ year: 2026, signal }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('overlaps two history batches, stays bounded and returns stable complete output', async () => {
  const f = fixture(); const result = f.load(); await flush();
  assert.equal(f.pending.length, 2, 'the second batch must start without waiting for the first');
  f.pending[1].finish(); await flush();
  assert.equal(f.pending.length, 3);
  f.pending[2].finish(); await flush();
  f.pending[3].finish(); f.pending[0].finish();
  const report = await result;
  assert.equal(f.peak(), 2); assert.equal(report.rows.length, 160);
  assert.equal(report.rows[0].work_item_id,'0000');
  assert.equal(report.rows[159].work_item_id,'0159');
});

test('permission failure stops queued batches and never returns partial data', async () => {
  const f = fixture(); const result = f.load();
  const rejected = assert.rejects(result,/42501/); await flush();
  assert.equal(f.pending.length, 2);
  f.pending[0].finish({ error: { code: '42501' } }); await flush();
  f.pending[1].finish(); await rejected;
  assert.equal(f.pending.length, 2);
  assert.equal(f.calls.includes('flowmate_non_working_days'), false);
});

test('cancellation drains active work without starting queued batches', async () => {
  const signal = { aborted: false }, f = fixture({ signal });
  const result = f.load(), rejected = assert.rejects(result,/cancelled/); await flush();
  assert.equal(f.pending.length, 2); signal.aborted = true;
  f.pending[0].finish(); f.pending[1].finish(); await rejected;
  assert.equal(f.pending.length, 2);
});

test('timeout splitting shares the two-worker limit and preserves every row', async () => {
  const f = fixture({count: 80}), result = f.load(); await flush();
  assert.equal(f.pending.length, 2);
  f.pending[0].finish({error:{code:'57014'}}); await flush();
  assert.equal(f.pending[2].ids.length,20);
  f.pending[2].finish(); await flush();
  f.pending[3].finish(); f.pending[1].finish();
  assert.equal((await result).rows.length,80); assert.equal(f.peak(),2);
});
