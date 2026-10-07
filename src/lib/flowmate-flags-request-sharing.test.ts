import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const pending: Array<{ resolve: (value: any) => void; reject: (error: Error) => void }> = [];
  const filters: string[][] = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe('work_item_flags_v');
    const promise = new Promise((resolve, reject) => pending.push({ resolve, reject }));
    const query: any = { then: promise.then.bind(promise) };
    query.select = (columns: string) => {
      expect(columns).toBe('work_item_id,is_overdue,is_due_soon,is_queued,is_blocked');
      return query;
    };
    query.in = (column: string, ids: string[]) => {
      expect(column).toBe('work_item_id'); filters.push([...ids]); return query;
    };
    return query;
  });
  const window: any = {
    FLOWMATE_CURRENT_USER: { id: 'user-a', team_member_id: 'member-a' },
    FLOWMATE_ACTIVE_TEAM: 'ops', FLOWMATE_ACTIVE_PRODUCT: 'flowmate',
    flowmateSupabase: { from }, addEventListener: vi.fn(),
  };
  const api = runInNewContext(readFileSync('supabase-list-data.js', 'utf8') +
    '\n({ read: loadFlowMateFlagsForWorkItems, invalidate: invalidateFlowMateListRowsCache });',
    { window, console, Date, setTimeout, clearTimeout });
  return { ...api, window, from, pending, filters };
}
const result = () => ({ data: [{ work_item_id: 'a', is_overdue: false }], error: null });

describe('Flags overlapping reads (isolated; no network)', () => {
  it('shares the same ID set, clones data and fetches again after completion', async () => {
    const f = fixture();
    const ids = ['b', 'a', 'b'];
    const first = f.read(ids), second = f.read(['a', 'b']);
    await Promise.resolve();
    expect(f.from).toHaveBeenCalledTimes(1);
    expect(f.filters).toEqual([['a', 'b']]);
    expect(ids).toEqual(['b', 'a', 'b']);
    f.pending[0].resolve(result());
    const [a, b] = await Promise.all([first, second]);
    a.data[0].is_overdue = true;
    expect(b.data[0].is_overdue).toBe(false);
    const next = f.read(['a', 'b']); await Promise.resolve();
    expect(f.from).toHaveBeenCalledTimes(2);
    f.pending[1].resolve(result()); await next;
  });

  it('does not share different IDs, actors, memberships, workspaces, products or clients', async () => {
    const f = fixture(), reads = [f.read(['a'])];
    reads.push(f.read(['b']));
    f.window.FLOWMATE_CURRENT_USER.id = 'user-b'; reads.push(f.read(['a']));
    f.window.FLOWMATE_CURRENT_USER.team_member_id = 'member-b'; reads.push(f.read(['a']));
    f.window.FLOWMATE_ACTIVE_TEAM = 'mkt'; reads.push(f.read(['a']));
    f.window.FLOWMATE_ACTIVE_PRODUCT = 'task-assign'; reads.push(f.read(['a']));
    f.window.flowmateSupabase = { from: f.from }; reads.push(f.read(['a']));
    await Promise.resolve(); expect(f.from).toHaveBeenCalledTimes(7);
    f.pending.forEach(p => p.resolve(result())); await Promise.all(reads);
  });

  it('makes no request for an empty ID set', async () => {
    const f = fixture(); expect(await f.read([])).toEqual({ data: [], error: null });
    expect(f.from).not.toHaveBeenCalled();
  });

  it('preserves API errors and retries after the failed response', async () => {
    const f = fixture(); const a = f.read(['a']), b = f.read(['a']);
    await Promise.resolve();
    const failure = { data: null, error: { code: '42501', message: 'denied' } };
    f.pending[0].resolve(failure);
    expect(await a).toEqual(failure); expect(await b).toEqual(failure);
    const retry = f.read(['a']); await Promise.resolve(); expect(f.from).toHaveBeenCalledTimes(2);
    f.pending[1].resolve(result()); await retry;
  });

  it('releases rejected requests so network recovery can retry', async () => {
    const f = fixture(); const a = f.read(['a']), b = f.read(['a']);
    const settled = Promise.allSettled([a, b]); await Promise.resolve();
    f.pending[0].reject(new Error('network unavailable'));
    expect((await settled).every(x => x.status === 'rejected')).toBe(true);
    const retry = f.read(['a']); await Promise.resolve(); expect(f.from).toHaveBeenCalledTimes(2);
    f.pending[1].resolve(result()); await retry;
  });

  it('invalidation starts a fresh read and old completion cannot evict it', async () => {
    const f = fixture(); const old = f.read(['a']); await Promise.resolve();
    f.invalidate(); const fresh = f.read(['a']); await Promise.resolve();
    f.pending[0].resolve(result()); await old;
    const shared = f.read(['a']); await Promise.resolve(); expect(f.from).toHaveBeenCalledTimes(2);
    f.pending[1].resolve(result()); await Promise.all([fresh, shared]);
  });
});
