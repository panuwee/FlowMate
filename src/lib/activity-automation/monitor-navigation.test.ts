import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Exercise the actual effect without rendering the unrelated application tree.
const app = readFileSync('app.jsx', 'utf8');
const declarationStart = app.indexOf('  const [automationAccess, setAutomationAccess]');
const start = app.indexOf('  useEffectApp(() => {\n    let cancelled = false;', declarationStart);
const end = app.indexOf('  const [realtimeState', start);
// Only the automation effect; Control Center has a separate team-scoped access check.
const declaration = app.slice(declarationStart, app.indexOf('\n', declarationStart));
const effect = new Function('useStateApp', 'useEffectApp', 'authState', 'window', declaration + app.slice(start, end));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function mount(result: Promise<any>, signedIn = true) {
  const states: any[] = []; const calls: string[] = []; let cleanup = () => {};
  effect(() => [{}, (state: any) => states.push(state)], (fn: any) => { cleanup = fn(); },
    { status: signedIn ? 'signed-in' : 'signed-out', user: signedIn ? { id: 'user-1' } : null },
    { flowmateSupabase: { rpc: (name: string) => { calls.push(name); return result; } } });
  return { states, calls, cleanup: () => cleanup() };
}
describe('Activity Automation navigation capability', () => {
  it('links to the case-sensitive new URL and preserves legacy deep links', () => {
    expect(app).toContain('new URL("home/Activity-Automation.html", document.baseURI)');
    const legacy = readFileSync('home/battle-pass-status.html', 'utf8');
    const script = legacy.match(/<script>([\s\S]*?)<\/script>/)![1];
    let target = '';
    new Function('window', script)({ location: { search: '?mode=test&run=abc', hash: '#detail', replace: (url: string) => { target = url; } } });
    expect(target).toBe('./Activity-Automation.html?mode=test&run=abc#detail');
    expect(readFileSync('home/Activity-Automation.html', 'utf8')).toContain('id="am-shell"');
  });
  it('uses the read capability, not hardcoded account IDs', async () => {
    const m = mount(Promise.resolve({ data: { data: { capabilities: { sharedRead: true, battlePassRead: false } } } }));
    await flush(); expect(m.states.at(-1)).toEqual({ userId: 'user-1', state: 'allowed' });
    expect(m.calls).toEqual(['activity_automation_monitor_access']); m.cleanup();
  });
  it('hides a confirmed denial but permits retry navigation on unavailable service', async () => {
    for (const [result, state] of [
      [{ error: { code: '42501' } }, 'denied'],
      [{ data: { data: { sharedRead: false, battlePassRead: false } } }, 'denied'],
      [{ error: { code: 'PGRST202' } }, 'unavailable'],
      [{ data: {} }, 'unavailable']
    ] as const) {
      const m = mount(Promise.resolve(result)); await flush();
      expect(m.states.at(-1).state).toBe(state); m.cleanup();
    }
  });
  it('does not reuse a response after sign-out or account switch', async () => {
    let resolve!: (value: any) => void;
    const m = mount(new Promise(r => { resolve = r; })); await flush(); m.cleanup();
    resolve({ data: { data: { sharedRead: true, battlePassRead: true } } }); await flush();
    expect(m.states).toEqual([{ userId: 'user-1', state: 'loading' }]);
  });
  it('does not query before sign-in', async () => {
    const m = mount(Promise.resolve({}), false); await flush(); expect(m.calls).toEqual([]); m.cleanup();
  });
});
