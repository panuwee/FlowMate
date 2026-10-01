import { readFileSync } from 'node:fs';
import React from 'react';
import { transformAsync } from '@babel/core';
import { beforeAll, expect, it, vi } from 'vitest';

const source = readFileSync('screens-a.jsx', 'utf8');
const helper = source.slice(source.indexOf('function flowmateAutomationBriefReview('), source.indexOf('function DetailScreen('));
const state = new Function(helper + '; return flowmateAutomationBriefReview;')();
const submitted = { id: 19, action: 'submitted', brief_link: 'https://example.org/brief' };
const brief = { can_accept: true, history: [submitted] };
let render: Function;
beforeAll(async () => {
  const start = source.indexOf('      {isBattlePassAttribution && (battlePassAssignmentHeld');
  const end = source.indexOf('      {detailAttentionCodes.length', start);
  const jsx = source.slice(start, end).trim().slice(1, -1);
  const result = await transformAsync('return (' + jsx + ');', {
    babelrc: false, configFile: false, parserOpts: { allowReturnOutsideFunction: true },
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
  });
  render = new Function('React', 'ctx', 'with(ctx) {' + result!.code + '}');
});
function elements(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}
function fixture(overrides: any = {}) {
  const ctx = {
    isBattlePassAttribution: true, battlePassAssignmentHeld: true,
    currentBattlePassReview: { data: state(null, brief, submitted.brief_link) },
    w: { workItemId: 'cr-1327', briefLink: submitted.brief_link }, isArchivedDetail: false,
    pending: false, briefReviewComment: ' ตรวจครบแล้ว ', setBriefReviewComment: vi.fn(),
    setPending: vi.fn(), setDetailRefreshTick: vi.fn(), setActionMsg: vi.fn(), refreshDetailItem: vi.fn(),
    window: { flowmateSafeHttpUrl: (link: string) => link, flowmateSupabase: { rpc: vi.fn().mockResolvedValue({ data: {} }) } },
    ...overrides,
  };
  const nodes = elements(render(React, ctx));
  return { ctx, nodes, button: nodes.find(node => node.type === 'button') };
}
it.each([null, { held: true, state: 'complete' }])('allows Operations to review Activity and Battle Pass: %j', review => {
  expect(state(review, brief, submitted.brief_link)).toMatchObject({ held: true, can_accept: true });
});
it('rejects changed links, newer submissions and source holds', () => {
  expect(state(null, brief, 'https://example.org/changed').can_accept).toBe(false);
  const changed = { ...brief, history: [{ id: 20, action: 'submitted', brief_link: 'new' }, submitted, { action: 'accepted', submission_id: 19 }] };
  expect(state(null, changed, 'new')).toMatchObject({ held: true, can_accept: true });
  expect(state({ state: 'source_review' }, brief, submitted.brief_link).can_accept).toBe(false);
});
it('requires permission, a submission and an open task before showing the button', () => {
  expect(fixture({ currentBattlePassReview: { data: state(null, { ...brief, can_accept: false }, submitted.brief_link) } }).button).toBeUndefined();
  expect(fixture({ currentBattlePassReview: { data: state(null, { can_accept: true, history: [] }, '') } }).button).toBeUndefined();
  expect(fixture({ isArchivedDetail: true }).button).toBeUndefined();
});
it('requires a nonblank comment and prevents a pending click', async () => {
  for (const overrides of [{ briefReviewComment: '  ' }, { pending: true }]) {
    const { ctx, button } = fixture(overrides);
    expect(button.props.disabled).toBe(true);
    await button.props.onClick();
    expect(ctx.window.flowmateSupabase.rpc).not.toHaveBeenCalled();
  }
});
it.each(['cr-1326', 'cr-1327'])('submits the actual version and trimmed human comment for %s, then refreshes assignment', async workItemId => {
  const { ctx, button } = fixture({ w: { workItemId, briefLink: submitted.brief_link } });
  await button.props.onClick();
  expect(ctx.window.flowmateSupabase.rpc).toHaveBeenCalledOnce();
  expect(ctx.window.flowmateSupabase.rpc).toHaveBeenCalledWith('flowmate_creative_brief', {
    p_work_item_id: workItemId, p_action: 'accepted', p_reason: 'ตรวจครบแล้ว', p_submission_id: 19,
  });
  expect(ctx.refreshDetailItem).toHaveBeenCalledOnce();
  expect(ctx.setActionMsg).toHaveBeenCalledWith(expect.objectContaining({ tone: 'ok' }));
  expect(ctx.setPending).toHaveBeenLastCalledWith(false);
});
it('shows server rejection, refreshes stale evidence and preserves the typed comment', async () => {
  const { ctx, button } = fixture();
  ctx.window.flowmateSupabase.rpc.mockResolvedValue({ error: { message: 'The brief changed' } });
  await button.props.onClick();
  expect(ctx.setActionMsg).toHaveBeenCalledWith({ tone: 'bad', text: 'The brief changed' });
  expect(ctx.refreshDetailItem).not.toHaveBeenCalled();
  expect(ctx.setDetailRefreshTick).toHaveBeenCalledOnce();
  expect(ctx.setBriefReviewComment).not.toHaveBeenCalled();
});
it('shows accepted comment and removes the confirmation button after acceptance', () => {
  const accepted = { action: 'accepted', submission_id: 19, reason: 'Reviewed' };
  const data = state(null, { ...brief, history: [accepted, submitted] }, submitted.brief_link);
  expect(data.held).toBe(false);
  const { button, nodes } = fixture({ currentBattlePassReview: { data } });
  expect(button).toBeUndefined();
  expect(nodes.some(node => React.Children.toArray(node.props?.children).includes('Reviewed'))).toBe(true);
});
