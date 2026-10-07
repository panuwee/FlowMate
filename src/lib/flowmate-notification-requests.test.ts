import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('supabase-quick-task.js', 'utf8');
const notificationCode = source.slice(source.indexOf('function flowmateNotificationDateTimeLabel'),
  source.indexOf('window.dismissReadFlowMateNotifications = dismissReadFlowMateNotifications;') +
  'window.dismissReadFlowMateNotifications = dismissReadFlowMateNotifications;'.length);
const row = (title = 'Current title') => ({ id: 'n1', work_item_id: 'w1', title: 'Notification',
  metadata: { display_id: 'CR-1' }, read_at: null, created_at: '2026-10-07T03:00:00Z',
  work_item: { id: 'w1', display_id: 'CR-1', title, status: 'review' } });
function setup() {
  const listeners: Record<string, Function[]> = {};
  const requests: any[] = [];
  const from = vi.fn((table: string) => {
    let resolve: (v: any) => void = () => {};
    const promise = new Promise(r => { resolve = r; });
    const request: any = { table, resolve, fields: '', filters: [] };
    requests.push(request);
    const query: any = { then: (ok: any, fail: any) => promise.then(ok, fail) };
    query.select = (fields: string) => { request.fields = fields; return query; };
    for (const method of ['is', 'order', 'limit']) query[method] = (...args: any[]) => {
      request.filters.push([method, ...args]); return query;
    };
    return query;
  });
  const window: any = {
    FLOWMATE_CURRENT_USER: { id: 'actor' }, FLOWMATE_ACTIVE_TEAM: 'gdve', FLOWMATE_ACTIVE_PRODUCT: 'flowmate',
    flowmateSupabase: { from, rpc: vi.fn(async () => ({ data: { read_at: 'now' }, error: null })) },
    addEventListener: (name: string, fn: Function) => (listeners[name] ||= []).push(fn),
  };
  runInNewContext(notificationCode, { window, console, Date });
  return { window, requests, from, load: window.loadFlowMateNotifications,
    emit: (detail: any) => listeners['flowmate:refresh-request'].forEach(fn => fn({ detail })) };
}

describe('Notification reads (isolated mocks; no production calls)', () => {
  it('uses one left-embedded request, preserves filters and maps current work state', async () => {
    const h = setup(); const pending = h.load();
    expect(h.from).toHaveBeenCalledWith('notifications');
    expect(h.requests[0].fields).toContain('work_item:work_items!notifications_work_item_id_fkey(id,display_id,title,status)');
    expect(h.requests[0].fields).not.toContain('!inner');
    expect(h.requests[0].filters).toEqual([['is', 'dismissed_at', null], ['order', 'created_at', { ascending: false }], ['limit', 50]]);
    h.requests[0].resolve({ data: [row()], error: null });
    expect(await pending).toMatchObject([{ workItemId: 'CR-1', workItemTitle: 'Current title', workItemStatus: 'review', isRead: false }]);
    expect(h.from).toHaveBeenCalledTimes(1);
  });
  it('retains notifications when RLS hides the work item or no item is linked', async () => {
    const h = setup(); const pending = h.load();
    h.requests[0].resolve({ data: [{ ...row(), work_item: null }, { ...row(), id: 'n2', work_item_id: null, work_item: null, metadata: null }], error: null });
    const result = await pending;
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ workItemId: 'CR-1', workItemTitle: '', workItemStatus: '' });
    expect(result[1]).toMatchObject({ workItemId: '', workItemUuid: null });
  });
  it('shares overlapping reads but returns independent rows and never caches settled data', async () => {
    const h = setup(); const a = h.load(); const b = h.load();
    expect(h.from).toHaveBeenCalledTimes(1);
    h.requests[0].resolve({ data: [row()], error: null });
    const [first, second] = await Promise.all([a, b]);
    first[0].metadata.display_id = 'changed';
    expect(second[0].metadata.display_id).toBe('CR-1');
    const next = h.load();
    h.requests[1].resolve({ data: [row('Renamed')], error: null });
    expect((await next)[0].workItemTitle).toBe('Renamed');
    expect(h.from).toHaveBeenCalledTimes(2);
  });
  it.each(['user', 'workspace', 'product', 'client'])('isolates %s changes and rejects old results', async kind => {
    const h = setup(); const old = h.load();
    const rejected = expect(old).rejects.toMatchObject({ code: 'FLOWMATE_NOTIFICATIONS_SUPERSEDED' });
    if (kind === 'user') h.window.FLOWMATE_CURRENT_USER = { id: 'other' };
    if (kind === 'workspace') h.window.FLOWMATE_ACTIVE_TEAM = 'ops';
    if (kind === 'product') h.window.FLOWMATE_ACTIVE_PRODUCT = 'task-assign';
    if (kind === 'client') h.window.flowmateSupabase = { ...h.window.flowmateSupabase };
    const current = h.load();
    h.requests[1].resolve({ data: [row('New scope')], error: null });
    expect((await current)[0].workItemTitle).toBe('New scope');
    h.requests[0].resolve({ data: [row('Old scope')], error: null });
    await rejected;
  });
  it('does not publish an in-flight response after sign out', async () => {
    const h = setup(); const old = h.load(); h.window.FLOWMATE_CURRENT_USER = null;
    h.requests[0].resolve({ data: [row()], error: null });
    await expect(old).rejects.toMatchObject({ code: 'FLOWMATE_NOTIFICATIONS_SUPERSEDED' });
    await expect(h.load()).rejects.toThrow('Sign in');
  });
  it('invalidates mixed relevant events and preserves the replacement request when an old read completes', async () => {
    const h = setup(); const old = h.load();
    h.emit({ reasons: ['comments', 'work_items'] });
    const current = h.load();
    h.requests[0].resolve({ data: [row('Old')], error: null });
    await expect(old).rejects.toMatchObject({ code: 'FLOWMATE_NOTIFICATIONS_SUPERSEDED' });
    const shared = h.load();
    expect(h.from).toHaveBeenCalledTimes(2);
    h.requests[1].resolve({ data: [row('Fresh')], error: null });
    expect((await current)[0].workItemTitle).toBe('Fresh');
    expect((await shared)[0].workItemTitle).toBe('Fresh');
  });
  it('ignores unrelated events and invalidates unspecified full refreshes', async () => {
    const h = setup(); const old = h.load(); h.emit({ reason: 'comments' });
    const shared = h.load(); expect(h.from).toHaveBeenCalledTimes(1);
    h.requests[0].resolve({ data: [], error: null }); await Promise.all([old, shared]);
    const next = h.load(); h.emit({}); h.requests[1].resolve({ data: [], error: null });
    await expect(next).rejects.toMatchObject({ code: 'FLOWMATE_NOTIFICATIONS_SUPERSEDED' });
  });
  it.each(['markFlowMateNotificationRead', 'markAllFlowMateNotificationsRead', 'dismissReadFlowMateNotifications'])('%s prevents an old read from undoing successful mutations', async method => {
    const h = setup(); const old = h.load();
    await h.window[method]('n1');
    h.requests[0].resolve({ data: [row()], error: null });
    await expect(old).rejects.toMatchObject({ code: 'FLOWMATE_NOTIFICATIONS_SUPERSEDED' });
  });
  it('surfaces query failures and permits a later retry', async () => {
    const h = setup(); const a = h.load(); const b = h.load();
    h.requests[0].resolve({ data: null, error: { code: '42501', message: 'Denied' } });
    await expect(a).rejects.toMatchObject({ code: '42501' });
    await expect(b).rejects.toMatchObject({ code: '42501' });
    const retry = h.load(); h.requests[1].resolve({ data: [], error: null });
    expect(await retry).toEqual([]);
  });
});

describe('Notification UI refresh ordering', () => {
  function ui() {
    const app = readFileSync('app.jsx', 'utf8');
    const code = app.slice(app.indexOf('  async function refreshNotifications('), app.indexOf('  async function handleMarkNotificationRead('));
    const pending: any[] = [];
    const window: any = { FLOWMATE_CURRENT_USER: { id: 'actor' },
      loadFlowMateNotifications: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
      flowmateUserError: (_error: any, message: string) => message };
    const setNotifications = vi.fn(); const setNotificationLoadState = vi.fn();
    const refresh = runInNewContext(code + '\nrefreshNotifications;', { window, notificationRequestRef: { current: 0 }, setNotifications, setNotificationLoadState, console: { error: vi.fn() } });
    return { window, pending, refresh, setNotifications, setNotificationLoadState };
  }
  it('does not let an older success or failure overwrite the latest result', async () => {
    const h = ui(); const old = h.refresh(); const current = h.refresh();
    h.pending[1].resolve([{ id: 'fresh' }]); await current;
    h.pending[0].reject(new Error('late failure')); await old;
    expect(h.setNotifications.mock.calls).toEqual([[[{ id: 'fresh' }]]]);
  });
  it('does not publish after identity changes', async () => {
    const h = ui(); const old = h.refresh(); h.window.FLOWMATE_CURRENT_USER = { id: 'other' };
    h.pending[0].resolve([{ id: 'private' }]); await old;
    expect(h.setNotifications).not.toHaveBeenCalled();
  });
  it('propagates backend errors to the poller for backoff but handles manual refresh errors', async () => {
    const h = ui(); const poll = h.refresh({ throwOnError: true });
    h.pending[0].reject(new Error('outage')); await expect(poll).rejects.toThrow('outage');
    expect(h.setNotificationLoadState).toHaveBeenLastCalledWith({ status: 'error', message: 'Notification load failed.' });
    const manual = h.refresh(); h.pending[1].reject(new Error('outage'));
    expect(await manual).toEqual([]);
  });
});
