import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('Log optimization request sharing scope (no network)', () => {
  it('keeps Task Assign cross-team, active-team, product and member filters separate', async () => {
    const window: any = {
      FLOWMATE_CURRENT_USER: { id: 'actor', team_member_id: 'member-1' },
      FLOWMATE_ACTIVE_TEAM: 'ops', FLOWMATE_ACTIVE_PRODUCT: 'task-assign',
      getFlowMateActiveTeam: () => 'ops', addEventListener: vi.fn(),
    };
    let release!: (value: any) => void;
    const pending = new Promise(resolve => { release = resolve; });
    const from = vi.fn(() => {
      const query: any = { then: (resolve: any, reject: any) => pending.then(resolve, reject) };
      for (const method of ['select', 'is', 'eq', 'in', 'or', 'order']) query[method] = () => query;
      return query;
    });
    window.flowmateSupabase = { from };
    const read = runInNewContext(readFileSync('supabase-list-data.js', 'utf8') + '\nloadFlowMateWorkItemsForList;', {
      window, console, Date, setTimeout, clearTimeout,
    });
    const requests = [read({ profile: 'summary' }), read({ profile: 'operational' })];
    expect(from).toHaveBeenCalledTimes(1);
    requests.push(read({ allTaskTeams: true }));
    expect(from).toHaveBeenCalledTimes(2);
    window.FLOWMATE_ACTIVE_PRODUCT = 'flowmate';
    requests.push(read({ profile: 'summary' }));
    expect(from).toHaveBeenCalledTimes(3);
    window.FLOWMATE_CURRENT_USER.team_member_id = 'member-2';
    requests.push(read({ profile: 'summary' }));
    expect(from).toHaveBeenCalledTimes(4);
    release({ data: [{ id: 'task' }], error: null });
    const results = await Promise.all(requests);
    results[0].data[0].id = 'changed-in-one-consumer';
    expect(results[1].data[0].id).toBe('task');
    await read({ profile: 'summary' });
    expect(from).toHaveBeenCalledTimes(5);
  });
});
