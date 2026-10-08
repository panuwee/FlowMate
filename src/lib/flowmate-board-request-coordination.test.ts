import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.useRealTimers());
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

function fixture(runtime: Record<string, unknown> = {}) {
  const listeners = new Map<string, Function[]>();
  const gates: Array<() => void> = [];
  const filters: Array<{ table: string; column: string; values: string[] }> = [];
  const from = vi.fn((table: string) => {
    const promise = new Promise(resolve => gates.push(() => resolve({ data: [], error: null })));
    const query: any = { then: promise.then.bind(promise) };
    for (const name of ['select', 'eq', 'is', 'not', 'order', 'limit', 'or']) query[name] = () => query;
    query.in = (column: string, values: string[]) => { filters.push({ table, column, values: [...values] }); return query; };
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
  runInNewContext(readFileSync('supabase-list-data.js', 'utf8') + '\nwindow.testRelated = loadFlowMateBoardRelatedData;', { window, console, Date, URL, setTimeout, clearTimeout, ...runtime });
  return { window, from, rpc, gates, filters, read: (options?: any) => window.loadFlowMateActiveBoard(options) };
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

it('diagnostics are opt-in, bounded, copied and contain no identities or raw caller values', async () => {
  const f = fixture();
  const first = f.read(); await flush(); f.gates.forEach(release => release()); await first;
  expect(f.window.flowmateBoardDebug.snapshot().records).toEqual([]);
  f.window.flowmateBoardDebug.enable();
  for (let i = 0; i < 105; i++) await f.read({ allowRecent: true, reason: 'secret@example.com?token=private' });
  const snapshot = f.window.flowmateBoardDebug.snapshot();
  expect(snapshot.records).toHaveLength(200);
  expect(snapshot.records.every((row: any) => row.reason === 'unknown')).toBe(true);
  expect(JSON.stringify(snapshot)).not.toMatch(/secret@|token=|private|actor|member/);
  snapshot.records[0].reason = 'tampered';
  expect(f.window.flowmateBoardDebug.snapshot().records[0].reason).toBe('unknown');
  f.window.dispatchEvent({ type: 'flowmate:auth-changed' });
  expect(f.window.flowmateBoardDebug.snapshot().records).toEqual([]);
  f.window.flowmateBoardDebug.disable();
  expect(f.window.flowmateBoardDebug.snapshot().enabled).toBe(false);
});

it('diagnostics distinguish actual loads, shared callers, recent reuse and queued mutation', async () => {
  const f = fixture(); f.window.flowmateBoardDebug.enable();
  const first = f.read({ reason: 'mount' }); const shared = f.read({ reason: 'focus' }); await flush();
  f.window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason: 'work_items' } });
  f.gates.slice(0, 5).forEach(release => release()); await flush();
  f.gates.slice(5).forEach(release => release()); await Promise.all([first, shared]);
  await f.read({ allowRecent: true, reason: 'focus' });
  const rows = f.window.flowmateBoardDebug.snapshot().records;
  expect(rows.filter((r: any) => r.event === 'start')).toHaveLength(2);
  expect(rows.filter((r: any) => r.event === 'end')).toHaveLength(2);
  expect(rows.some((r: any) => r.event === 'shared' && r.reason === 'focus')).toBe(true);
  expect(rows.some((r: any) => r.event === 'follow-up')).toBe(true);
  expect(rows.some((r: any) => r.event === 'recent')).toBe(true);
  expect(rows.filter((r: any) => r.event === 'end').every((r: any) => r.durationMs >= 0)).toBe(true);
});

it('release checking refuses unconfirmed origins without fetching or reloading', async () => {
  const f = fixture(); f.window.location = { origin: 'https://other.example', pathname: '/FlowMate/' };
  f.window.fetch = vi.fn(); f.window.location.reload = vi.fn();
  expect(await f.window.flowmateBoardDebug.checkRelease()).toEqual({ status: 'unsupported-origin' });
  expect(f.window.fetch).not.toHaveBeenCalled(); expect(f.window.location.reload).not.toHaveBeenCalled();
});

it('release checking detects changed stamps, omits credentials and leaves unsaved work untouched', async () => {
  const names = ['app.js', 'screens-b.js', 'supabase-list-data.js', 'supabase-quick-task.js'];
  const scripts = (stamp: string) => names.map(name => ({ src: `https://panuwee.github.io/FlowMate/${name}?v=${stamp}` }));
  let remote = scripts('new');
  const f = fixture({ document: { scripts: scripts('old') }, DOMParser: class { parseFromString() { return { scripts: remote }; } } });
  f.window.location = { origin: 'https://panuwee.github.io', pathname: '/FlowMate/', reload: vi.fn() };
  f.window.fetch = vi.fn(async () => ({ ok: true, text: async () => '<html/>' }));
  expect((await f.window.flowmateBoardDebug.checkRelease()).status).toBe('update-available');
  expect(f.window.fetch).toHaveBeenCalledWith('https://panuwee.github.io/FlowMate/', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  remote = scripts('old');
  expect((await f.window.flowmateBoardDebug.checkRelease()).status).toBe('current');
  remote = [];
  expect((await f.window.flowmateBoardDebug.checkRelease()).status).toBe('unknown');
  expect(f.window.location.reload).not.toHaveBeenCalled();
});

it('normalizes lane limits but separates different page sizes', async () => {
  const f = fixture();
  const calls = [f.read(), f.read({ laneLimits: { assigned: 50 } }), f.read({ laneLimits: { assigned: 100 } })];
  await flush(); expect(f.from).toHaveBeenCalledTimes(10);
  f.gates.forEach(release => release()); await Promise.all(calls);
});

it('related reads use identical deduplicated filters when Board rows arrive in a different order', async () => {
  const f = fixture();
  const items = [
    { id: 'b', requester_user_id: 'user-b', assignee_user_id: 'user-a', final_owner_member_id: 'member-b' },
    { id: 'a', requester_user_id: 'user-a', final_owner_member_id: 'member-a' },
  ];
  const first = f.window.testRelated([...items, items[0]]); await flush();
  f.gates.forEach(release => release()); await first;
  const initial = [...f.filters]; f.filters.length = 0;
  const next = f.window.testRelated([...items].reverse()); await flush();
  f.gates.forEach(release => release()); await next;
  expect(f.filters).toEqual(initial);
  expect(initial.filter(r => r.column === 'work_item_id').every(r => r.values.join(',') === 'a,b')).toBe(true);
  expect(initial.find(r => r.table === 'users')?.values).toEqual(['user-a', 'user-b']);
  expect(initial.find(r => r.table === 'team_members')?.values).toEqual(['member-a', 'member-b']);
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
