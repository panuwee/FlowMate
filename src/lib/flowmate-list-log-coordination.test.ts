import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function fixture() {
  const listeners = new Map<string, Function[]>();
  const gates: Array<(value: any) => void> = [];
  const filters: Array<{ table: string; column: string; values: string[] }> = [];
  const from = vi.fn((table: string) => {
    const promise = new Promise(resolve => gates.push(resolve));
    const q: any = { then: promise.then.bind(promise) };
    for (const method of ['select', 'eq', 'is', 'order', 'or']) q[method] = () => q;
    q.in = (column: string, values: string[]) => { filters.push({ table, column, values: [...values] }); return q; };
    return q;
  });
  const window: any = {
    FLOWMATE_CURRENT_USER: { id: 'actor', team_member_id: 'member', role: 'member' },
    FLOWMATE_ACTIVE_TEAM: 'ops', FLOWMATE_ACTIVE_PRODUCT: 'flowmate', flowmateSupabase: { from },
    MEMBERS: [], MEMBERS_BY_ID: {}, TEAMS: [],
    addEventListener: (name: string, fn: Function) => listeners.set(name, [...(listeners.get(name) || []), fn]),
    dispatchEvent: (event: any) => (listeners.get(event.type) || []).forEach(fn => fn(event)),
  };
  runInNewContext(readFileSync('supabase-list-data.js', 'utf8'), {
    window, console, Date, URL, setTimeout, clearTimeout, CustomEvent: class { constructor(public type: string, public detail: any) {} },
  });
  return { window, from, gates, filters, read: (options: any = {}) => window.loadFlowMateOperationalRows(options) };
}
const empty = { data: [], error: null };

it('canonical List filters stay identical for reordered rows without changing visible row order', async () => {
  const f = fixture();
  const items = ['b', 'a'].map(id => ({ id, display_id: id, title: id, status: 'assigned',
    work_type: 'creative_request', requester_user_id: 'user-' + id, final_owner_member_id: 'member-' + id }));
  const first = f.read(); f.gates[0]({ data: items, error: null }); await flush();
  f.gates.slice(1).forEach(resolve => resolve(empty)); const rows = await first;
  expect(rows.map((r: any) => r.id)).toEqual(['b', 'a']);
  const initial = [...f.filters]; f.filters.length = 0;
  const offset = f.gates.length;
  const next = f.read({ force: true }); f.gates[offset]({ data: [...items].reverse(), error: null }); await flush();
  f.gates.slice(offset + 1).forEach(resolve => resolve(empty)); await next;
  expect(f.filters).toEqual(initial);
  expect(initial.find(r => r.table === 'checklist_items')?.values).toEqual(['a', 'b']);
  expect(initial.find(r => r.table === 'users')?.values).toEqual(['user-a', 'user-b']);
});

it('a related-query error drains remaining reads before another full List batch can start', async () => {
  const f = fixture(); const read = f.read();
  const rejected = expect(read).rejects.toMatchObject({ message: 'related failure' });
  f.gates[0]({ data: [{ id: 'a', display_id: 'a', work_type: 'creative_request', status: 'assigned' }], error: null }); await flush();
  expect(f.from).toHaveBeenCalledTimes(5);
  f.gates[1]({ data: [], error: new Error('related failure') }); await flush();
  const shared = f.read({ force: true }); const alsoRejected = expect(shared).rejects.toMatchObject({ message: 'related failure' });
  expect(f.from).toHaveBeenCalledTimes(5);
  f.gates.slice(2).forEach(resolve => resolve(empty)); await rejected; await alsoRejected;
  const retry = f.read(); expect(f.from).toHaveBeenCalledTimes(6); f.gates[5](empty); await retry;
});

it('a mutation arriving during the follow-up still queues fresh data without a parallel read', async () => {
  const f = fixture(); const first = f.read();
  f.window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason: 'work_items' } });
  f.gates[0](empty); await flush(); expect(f.from).toHaveBeenCalledTimes(2);
  f.window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason: 'work_items' } });
  const shared = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(2);
  f.gates[1](empty); await flush(); expect(f.from).toHaveBeenCalledTimes(3);
  f.gates[2](empty); await Promise.all([first, shared]);
});

it('List diagnostics retain profile/realtime/reason with no identity and expose the shared debug alias', async () => {
  const f = fixture(); expect(f.window.flowmateRequestDebug).toBe(f.window.flowmateBoardDebug);
  f.window.flowmateRequestDebug.enable(); f.window.FLOWMATE_REALTIME_STATE.status = 'degraded';
  const read = f.read({ reason: 'poll' }); f.gates[0](empty); await read;
  const rows = f.window.flowmateRequestDebug.snapshot().records;
  expect(rows.some((r: any) => r.consumer === 'list' && r.profile === 'operational' && r.reason === 'poll' && r.realtime === 'degraded')).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/actor|member/);
});

it('failed full List reads do not poison subsequent retries', async () => {
  const f = fixture(); const read = f.read();
  const rejected = expect(read).rejects.toMatchObject({ message: 'query failed' });
  f.gates[0]({ data: [], error: new Error('query failed') }); await rejected;
  const retry = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(2);
  f.gates[1](empty); await retry;
});

it('force refresh bypasses settled rows while same-profile overlapping reads stay shared', async () => {
  const f = fixture(); const first = f.read(); f.gates[0](empty); await first;
  await f.read(); expect(f.from).toHaveBeenCalledTimes(1);
  const manual = f.read({ force: true }); const shared = f.read({ force: true });
  expect(f.from).toHaveBeenCalledTimes(2); f.gates[1](empty); await Promise.all([manual, shared]);
});

it('many invalidations during one List read queue one fresh follow-up instead of overlapping batches', async () => {
  const f = fixture(); const requests = [f.read()];
  for (let i = 0; i < 14; i++) {
    f.window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason: 'work_items' } });
    requests.push(f.read({ force: true }));
  }
  await flush(); expect(f.from).toHaveBeenCalledTimes(1);
  f.gates[0](empty); await flush(); expect(f.from).toHaveBeenCalledTimes(2);
  f.gates[1](empty); await Promise.all(requests);
});

it('same-user member and Supabase-client changes reject old flights and never share cached rows', async () => {
  const f = fixture(); const old = f.read(); const rejected = expect(old).rejects.toMatchObject({ code: 'FLOWMATE_LIST_SUPERSEDED' });
  f.window.FLOWMATE_CURRENT_USER.team_member_id = 'another-member';
  const next = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(2);
  f.gates[0](empty); f.gates[1](empty); await rejected; await next;
  f.window.flowmateSupabase = { from: f.from };
  const changed = f.read(); await flush(); expect(f.from).toHaveBeenCalledTimes(3);
  f.gates[2](empty); await changed;
});
