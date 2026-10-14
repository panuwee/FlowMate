import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('rejects a known unchanged creative status before RPC but leaves real transitions to server validation', async () => {
  const rpc = vi.fn(async () => ({ data: { status: 'review' }, error: null }));
  const window: any = { flowmateSupabase: { rpc }, dispatchEvent: vi.fn() };
  const source = readFileSync('supabase-quick-task.js', 'utf8');
  const start = source.indexOf('async function transitionFlowMateCreativeStatus');
  const end = source.indexOf('window.transitionFlowMateCreativeStatus = transitionFlowMateCreativeStatus;');
  const change = runInNewContext(source.slice(start, end) + '\ntransitionFlowMateCreativeStatus;', {
    window, flowmateActorId: () => 'actor', CustomEvent: class { constructor(public type: string) {} },
  });
  await expect(change('CR-1', 'in_progress', { currentStatus: 'in_progress' })).rejects.toMatchObject({ code: 'FLOWMATE_STATUS_UNCHANGED' });
  expect(rpc).not.toHaveBeenCalled();
  await change('CR-1', 'review', { currentStatus: 'in_progress', deliveryLink: 'https://example.com/review' });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][0]).toBe('transition_creative_work_status');
});
