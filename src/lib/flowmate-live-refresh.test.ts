import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function eventTarget() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  return {
    addEventListener(type: string, fn: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (event: any) => void) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event: any) { for (const fn of listeners.get(event.type) || []) fn(event); },
  };
}

function browser() {
  const window: any = { ...eventTarget(), FLOWMATE_CURRENT_USER: { id: 'test-user' } };
  const document = { ...eventTarget(), hidden: false };
  runInNewContext(readFileSync('supabase-list-data.js', 'utf8'), {
    window, document, console: { warn: vi.fn() }, Date, setTimeout, clearTimeout,
    CustomEvent: class {
      constructor(public type: string, public init: any = {}) {}
      get detail() { return this.init.detail; }
    },
  });
  const change = (reason: string) => window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reason } });
  const focus = () => document.dispatchEvent({ type: 'visibilitychange' });
  return { window, document, change, focus };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Live refresh request reduction (no network)', () => {
  it('preserves poll, focus, reconnect and mutation reasons through the shared callback', async () => {
    const { window, focus, change } = browser();
    const refresh = vi.fn(async () => {});
    const stop = window.attachFlowMateLiveRefresh(refresh);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenLastCalledWith({ reason: 'poll' });
    focus(); await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenLastCalledWith({ reason: 'focus' });
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    window.dispatchEvent({ type: 'flowmate:realtime-state' }); await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenLastCalledWith({ reason: 'reconnect' });
    change('work_items'); await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenLastCalledWith({ reason: 'data-change' });
    stop();
  });
  it('uses the opt-in connected cadence and restores fallback and reconnect refresh', async () => {
    const { window, change } = browser();
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    const refresh = vi.fn(async () => {});
    const stop = window.attachFlowMateLiveRefresh(refresh, { realtimeIntervalMs: 180_000, ignoreReasons: ['notifications'] });
    await vi.advanceTimersByTimeAsync(60_000);
    change('notifications');
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    window.FLOWMATE_REALTIME_STATE.status = 'degraded';
    window.dispatchEvent({ type: 'flowmate:realtime-state' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    window.dispatchEvent({ type: 'flowmate:realtime-state' });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(3);
    window.FLOWMATE_REALTIME_STATE.status = 'syncing';
    window.dispatchEvent({ type: 'flowmate:realtime-state' });
    expect(refresh).toHaveBeenCalledTimes(3);
    window.dispatchEvent({ type: 'flowmate:refresh-request', detail: { reasons: ['notifications', 'work_items'] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(4);
    stop();
    window.FLOWMATE_REALTIME_STATE.status = 'degraded';
    window.dispatchEvent({ type: 'flowmate:realtime-state' });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('keeps non-opt-in consumers on one minute even with connected realtime', async () => {
    const { window } = browser();
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    const refresh = vi.fn(async () => {});
    const stop = window.attachFlowMateLiveRefresh(refresh);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it('reduces idle connected polling from 60 to 20 per hour without hiding a tab', async () => {
    const { window } = browser();
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    const normal = vi.fn(async () => {}), optimized = vi.fn(async () => {});
    const stopNormal = window.attachFlowMateLiveRefresh(normal);
    const stopOptimized = window.attachFlowMateLiveRefresh(optimized, { realtimeIntervalMs: 180_000 });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(normal).toHaveBeenCalledTimes(60);
    expect(optimized).toHaveBeenCalledTimes(20);
    stopNormal(); stopOptimized();
  });

  it('does not reset failure backoff on disconnect or fetch a hidden tab on reconnect', async () => {
    const { window, document, focus } = browser();
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const stop = window.attachFlowMateLiveRefresh(refresh, { realtimeIntervalMs: 180_000 });
    await vi.advanceTimersByTimeAsync(180_000);
    window.FLOWMATE_REALTIME_STATE.status = 'degraded';
    window.dispatchEvent({ type: 'flowmate:realtime-state' });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    document.hidden = true;
    window.FLOWMATE_REALTIME_STATE.status = 'connected';
    window.dispatchEvent({ type: 'flowmate:realtime-state' });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    document.hidden = false;
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it('shares overlapping work-item reads across profiles but fetches fresh after invalidation', async () => {
    const { window, change } = browser();
    let release!: (value: any) => void;
    const pending = new Promise(resolve => { release = resolve; });
    const from = vi.fn(() => {
      const q: any = { then: (resolve: any, reject: any) => pending.then(resolve, reject) };
      for (const method of ['select', 'is', 'eq', 'in', 'or', 'order']) q[method] = () => q;
      return q;
    });
    window.flowmateSupabase = { from };
    const a = window.loadFlowMateNavigationRows();
    const b = window.loadFlowMateOperationalRows();
    expect(from).toHaveBeenCalledTimes(1);
    change('work_items');
    const c = window.loadFlowMateNavigationRows();
    expect(from).toHaveBeenCalledTimes(2);
    release({ data: [], error: null });
    await Promise.all([a, b, c]);
  });

  it('never shares work-item requests across user, workspace or My Work scopes', async () => {
    const { window } = browser();
    const from = vi.fn(() => {
      const q: any = { then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
      for (const method of ['select', 'is', 'eq', 'in', 'or', 'order']) q[method] = () => q;
      return q;
    });
    window.flowmateSupabase = { from };
    window.FLOWMATE_ACTIVE_TEAM = 'mkt';
    const requests = [window.loadFlowMateNavigationRows(), window.loadFlowMateMyWorkRows()];
    window.FLOWMATE_ACTIVE_TEAM = 'ops';
    requests.push(window.loadFlowMateNavigationRows());
    window.FLOWMATE_CURRENT_USER = { id: 'another-user' };
    requests.push(window.loadFlowMateNavigationRows());
    expect(from).toHaveBeenCalledTimes(4);
    await Promise.all(requests);
  });

  it('an old completion cannot remove a newer in-flight request after invalidation', async () => {
    const { window, change } = browser();
    const releases: Array<(value: any) => void> = [];
    const from = vi.fn(() => {
      const pending = new Promise(resolve => releases.push(resolve));
      const q: any = { then: (resolve: any, reject: any) => pending.then(resolve, reject) };
      for (const method of ['select', 'is', 'eq', 'in', 'or', 'order']) q[method] = () => q;
      return q;
    });
    window.flowmateSupabase = { from };
    const old = window.loadFlowMateNavigationRows();
    change('work_items');
    const fresh = window.loadFlowMateOperationalRows();
    releases[0]({ data: [], error: null });
    await old;
    const shared = window.loadFlowMateListRows();
    expect(from).toHaveBeenCalledTimes(2);
    releases[1]({ data: [], error: null });
    await Promise.all([fresh, shared]);
  });

  it('restarts the minute timer after an event instead of polling again one second later', async () => {
    const { window, change } = browser();
    const refresh = vi.fn(async () => {});
    const stop = window.attachFlowMateLiveRefresh(refresh);
    await vi.advanceTimersByTimeAsync(59_000);
    change('work_items');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
  });

  it('shares focus with an in-flight request but queues one follow-up for multiple data changes', async () => {
    const { window, change, focus } = browser();
    let release!: () => void;
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }))
      .mockResolvedValue(undefined);
    const stop = window.attachFlowMateLiveRefresh(refresh);
    change('work_items');
    focus();
    expect(refresh).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);

    let releaseChange!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>(resolve => { releaseChange = resolve; }));
    change('work_items');
    change('assignment_runs');
    change('work_items');
    focus();
    releaseChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not load a hidden tab on events or timers and refreshes on return', async () => {
    const { window, document, change, focus } = browser();
    const refresh = vi.fn(async () => {});
    const stop = window.attachFlowMateLiveRefresh(refresh);
    document.hidden = true;
    change('work_items');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).not.toHaveBeenCalled();
    document.hidden = false;
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('backs off failed requests and restores the minute cadence on success', async () => {
    const { window } = browser();
    const refresh = vi.fn().mockRejectedValueOnce(new Error('test-only outage')).mockResolvedValue(undefined);
    const stop = window.attachFlowMateLiveRefresh(refresh);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it('cancels a queued follow-up and future polls when the consumer unmounts', async () => {
    const { window, change } = browser();
    let release!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const stop = window.attachFlowMateLiveRefresh(refresh);
    change('work_items');
    change('notifications');
    stop();
    release();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retains mixed realtime reasons so both task and notification consumers refresh once', async () => {
    const { window } = browser();
    const changes = new Map<string, () => void>();
    const channel: any = {
      on(_type: string, filter: any, callback: () => void) { changes.set(filter.table, callback); return channel; },
      subscribe(callback: (status: string) => void) { callback('SUBSCRIBED'); return channel; },
    };
    window.flowmateSupabase = { channel: () => channel };
    window.startFlowMateRealtime();
    const taskRefresh = vi.fn(async () => {}), notificationRefresh = vi.fn(async () => {});
    const stopTasks = window.attachFlowMateLiveRefresh(taskRefresh, { reasons: ['work_items'] });
    const stopNotifications = window.attachFlowMateLiveRefresh(notificationRefresh, { reasons: ['notifications'] });
    changes.get('work_items')!();
    changes.get('notifications')!();
    await vi.advanceTimersByTimeAsync(700);
    expect(taskRefresh).toHaveBeenCalledTimes(1);
    expect(notificationRefresh).toHaveBeenCalledTimes(1);
    stopTasks(); stopNotifications();
  });

  it('filters unrelated events without postponing the fallback poll', async () => {
    const { window, change } = browser();
    const refresh = vi.fn(async () => {});
    const stop = window.attachFlowMateLiveRefresh(refresh, { reasons: ['notifications'] });
    await vi.advanceTimersByTimeAsync(59_000);
    change('comments');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('the app notification consumer ignores checklist/comment events and still reacts to notifications', async () => {
    const { window, change } = browser();
    const app = readFileSync('app.jsx', 'utf8');
    const wiring = app.indexOf('window.attachFlowMateLiveRefresh(loadRows, {');
    const start = app.lastIndexOf('useEffectApp(() => {', wiring);
    const effectEnd = '}, [authState.status, authState.user && authState.user.id]);';
    const end = app.indexOf(effectEnd, wiring) + effectEnd.length;
    const notificationSource = readFileSync('supabase-quick-task.js', 'utf8');
    const sourceEnd = 'window.dismissReadFlowMateNotifications = dismissReadFlowMateNotifications;';
    runInNewContext(notificationSource.slice(notificationSource.indexOf('function flowmateNotificationDateTimeLabel'),
      notificationSource.indexOf(sourceEnd) + sourceEnd.length), { window, console, Date });
    let cleanup!: () => void;
    const refreshNotifications = vi.fn(async () => []);
    runInNewContext(app.slice(start, end), {
      window, authState: { status: 'signed-in' }, notifications: [], refreshNotifications,
      notificationRequestRef: { current: 0 },
      setNotifications: vi.fn(), setIsNotificationCenterOpen: vi.fn(),
      useEffectApp: (effect: () => (() => void)) => { cleanup = effect(); },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshNotifications).toHaveBeenCalledTimes(1);
    change('comments'); change('checklist_items');
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshNotifications).toHaveBeenCalledTimes(1);
    change('notifications');
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshNotifications).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('a notification event during a read queues fresh data without losing the event', async () => {
    const { window, change } = browser();
    const source = readFileSync('supabase-quick-task.js', 'utf8');
    const end = 'window.dismissReadFlowMateNotifications = dismissReadFlowMateNotifications;';
    runInNewContext(source.slice(source.indexOf('function flowmateNotificationDateTimeLabel'), source.indexOf(end) + end.length), { window, console, Date });
    const pending: Array<(value: any) => void> = [];
    window.flowmateSupabase = { from: vi.fn(() => {
      const p = new Promise(resolve => pending.push(resolve));
      const q: any = { then: (ok: any, fail: any) => p.then(ok, fail) };
      for (const name of ['select', 'is', 'order', 'limit']) q[name] = () => q;
      return q;
    }) };
    const rendered: any[] = [];
    const refresh = async () => {
      try { rendered.push(await window.loadFlowMateNotifications()); }
      catch (error: any) { if (error.code !== 'FLOWMATE_NOTIFICATIONS_SUPERSEDED') throw error; }
    };
    const stop = window.attachFlowMateLiveRefresh(refresh, { reasons: window.FLOWMATE_NOTIFICATION_REFRESH_REASONS });
    change('notifications');
    change('work_items');
    pending[0]({ data: [{ id: 'old' }], error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(rendered).toEqual([]);
    expect(pending).toHaveLength(2);
    pending[1]({ data: [{ id: 'fresh' }], error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(rendered[0][0].id).toBe('fresh');
    stop();
  });

  it('keeps the task-list cache on notification-only realtime changes', async () => {
    const { window, change } = browser();
    const from = vi.fn(() => {
      const q: any = { then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
      for (const method of ['select', 'is', 'eq', 'in', 'or', 'order']) q[method] = () => q;
      return q;
    });
    window.flowmateSupabase = { from };
    await window.loadFlowMateNavigationRows();
    const initial = from.mock.calls.length;
    change('notifications');
    await window.loadFlowMateNavigationRows();
    expect(from).toHaveBeenCalledTimes(initial);
    change('work_items');
    await window.loadFlowMateNavigationRows();
    expect(from.mock.calls.length).toBeGreaterThan(initial);
  });
});
