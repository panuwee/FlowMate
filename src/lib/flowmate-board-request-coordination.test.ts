import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.useRealTimers());
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

function fixture() {
  const listeners = new Map<string, Function[]>();
  const gates: Array<() => void> = [];
  const from = vi.fn(() => {
    const promise = new Promise(resolve => gates.push(() => resolve({ data: [], error: null })));
    const query: any = { then: promise.then.bind(promise) };
    for (const name of ['select', 'eq', 'is', 'in', 'order', 'limit', 'or']) query[name] = () => query;
    return query;
  });
  const rpc = vi.fn(async () => ({ data: { counts: {} }, error: null }));
  const window: any = {
    FLOWMATE_CURRENT_USER: { id: 'actor', team_member_id: 'member' },
    FLOWMATE_ACTIVE_TEAM: 'mkt', FLOWMATE_ACTIVE_PRODUCT: 'flowmate',
    flowmateSupabase: { from, rpc },
    addEventListener: (name: string, fn: Function) => listeners.set(name, [...(listeners.get(name) || []), fn]),
    dispatchEvent: (event: any) => (listeners.get(event.type) || []).forEach(fn => fn(event)),
  };
  runInNewContext(readFileSync('supabase-list-data.js', 'utf8'), { window, console, Date, setTimeout, clearTimeout });
  return { window, from, rpc, gates, read: (options?: any) => window.loadFlowMateActiveBoard(options) };
}

it('fourteen overlapping Board callers issue one set of five lane reads and one summary', async () => {
  const f = fixture();
  const requests = Array.from({ length: 14 }, () => f.read());
  await Promise.resolve();
  const count = f.from.mock.calls.length;
  f.gates.forEach(release => release());
  const results = await Promise.all(requests);
  expect(count).toBe(5);
  expect(f.rpc).toHaveBeenCalledTimes(1);
  results[0].lanes.assigned.message = 'changed';
  expect(results[1].lanes.assigned.message).toBe('');
});

it('normalizes lane limits but separates different page sizes', async () => {
  const f = fixture();
  const calls = [f.read(), f.read({ laneLimits: { assigned: 50 } }), f.read({ laneLimits: { assigned: 100 } })];
  await flush(); expect(f.from).toHaveBeenCalledTimes(10);
  f.gates.forEach(release => release()); await Promise.all(calls);
});

it('coalesces many data-change events into one follow-up before returning fresh data', async () => {
  const f = fixture();
  const first = f.read(); await flush();
  for (let i = 0; i < 14; i++) f.window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason: 'work_items' } });
  const second = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(5);
  f.gates.slice(0, 5).forEach(release => release()); await flush();
  expect(f.from).toHaveBeenCalledTimes(10);
  f.gates.slice(5).forEach(release => release()); await Promise.all([first, second]);
  expect(f.rpc).toHaveBeenCalledTimes(2);
});

it('only passive reads reuse two-second results; manual reads and data changes stay fresh', async () => {
  vi.useFakeTimers();
  const f = fixture(); const first = f.read(); await flush();
  f.gates.forEach(release => release()); await first;
  await f.read({ allowRecent: true }); expect(f.from).toHaveBeenCalledTimes(5);
  const manual = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(10);
  f.gates.slice(5).forEach(release => release()); await manual;
  f.window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason: 'work_status_changed' } });
  const changed = f.read({ allowRecent: true }); await flush(); expect(f.from).toHaveBeenCalledTimes(15);
  f.gates.slice(10).forEach(release => release()); await changed;
  vi.advanceTimersByTime(2001);
  const expired = f.read({ allowRecent: true }); await flush(); expect(f.from).toHaveBeenCalledTimes(20);
  f.gates.slice(15).forEach(release => release()); await expired;
});

it.each(['actor', 'member', 'team', 'product', 'client', 'auth-object'])(
  'rejects old results when %s changes and reads the new scope separately', async kind => {
    const f = fixture(); const old = f.read(); const oldOutcome = Promise.allSettled([old]); await flush();
    if (kind === 'actor') f.window.FLOWMATE_CURRENT_USER.id = 'other';
    if (kind === 'member') f.window.FLOWMATE_CURRENT_USER.team_member_id = 'other';
    if (kind === 'team') f.window.FLOWMATE_ACTIVE_TEAM = 'ops';
    if (kind === 'product') f.window.FLOWMATE_ACTIVE_PRODUCT = 'other-product';
    if (kind === 'client') f.window.flowmateSupabase = { from: f.from, rpc: f.rpc };
    if (kind === 'auth-object') f.window.FLOWMATE_CURRENT_USER = { ...f.window.FLOWMATE_CURRENT_USER };
    // Product scope currently distinguishes FlowMate and Task Assign only.
    if (kind === 'product') f.window.FLOWMATE_ACTIVE_PRODUCT = 'task-assign';
    const fresh = kind === 'product' ? null : f.read(); await flush();
    f.gates.forEach(release => release());
    const result = (await oldOutcome)[0];
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason.code).toBe('FLOWMATE_BOARD_SUPERSEDED');
    if (fresh) await fresh;
  },
);

it('drains pending lanes on summary error and permits a later retry', async () => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ data: null, error: new Error('unavailable') } as any);
  const first = f.read(), second = f.read();
  const failures = Promise.allSettled([first, second]); await flush();
  expect(f.from).toHaveBeenCalledTimes(5);
  f.gates.forEach(release => release());
  expect((await failures).every(x => x.status === 'rejected')).toBe(true);
  const retry = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(10);
  f.gates.slice(5).forEach(release => release()); await retry;
});

it('queued UI callbacks reuse the same recent Board result after mount finishes', async () => {
  const f = fixture();
  const source = readFileSync('screens-b.jsx', 'utf8');
  const helpers = source.slice(0, source.indexOf('function ListScreen'));
  const coordinate = runInNewContext(helpers + '\nrunFlowMateBoardRefresh;', {
    window: f.window, React: {}, Date, setTimeout, clearTimeout,
  });
  const calls = Array.from({ length: 14 }, () => coordinate('scope', () => f.read({ allowRecent: true })));
  await flush(); f.gates.forEach(release => release()); await Promise.all(calls);
  expect(f.from).toHaveBeenCalledTimes(5); expect(f.rpc).toHaveBeenCalledTimes(1);
});
