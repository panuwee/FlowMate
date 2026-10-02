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
    const end = app.indexOf('}, [authState.status]);', wiring) + '}, [authState.status]);'.length;
    let cleanup!: () => void;
    const refreshNotifications = vi.fn(async () => []);
    runInNewContext(app.slice(start, end), {
      window, authState: { status: 'signed-in' }, notifications: [], refreshNotifications,
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
