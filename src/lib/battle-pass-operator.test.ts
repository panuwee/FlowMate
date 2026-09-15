import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('battle-pass-operator.js', 'utf8');
const ctx: any = {}; vm.runInNewContext(source, ctx);
const { labels, codes, describe: explain } = ctx.BattlePassOperator;
const sql = readFileSync('supabase/battle_pass_operator_actions.sql', 'utf8');

describe('Operator action labels stay in step with the database', () => {
  it('labels exactly the four actions the CHECK constraint allows', () => {
    const allowed = /action in \(([^)]+)\)/.exec(sql)?.[1] ?? '';
    const fromSql = [...allowed.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
    expect(fromSql).toEqual(['pause', 'resume', 'retry', 'run_now']);
    expect(Object.keys(labels).sort()).toEqual(fromSql);
  });
  it('gives every label Thai text, never a raw code', () => {
    for (const [code, text] of Object.entries(labels)) {
      expect(text).not.toBe(code);
      expect(String(text)).toMatch(/[฀-๿]/);
    }
  });
});

describe('Held runs are explained as blocked, never as retryable', () => {
  it('explains a source hold and says retry is not allowed', () => {
    const message = explain('Held for review (source_changed): retry blocked, reconcile the source first');
    expect(message).toContain('ถูกพักไว้ให้คนตรวจ');
    expect(message).toContain('source_changed');
    expect(message).toContain('ไม่อนุญาต');
    expect(message).toContain('ข้อมูลเก่า');
  });
  it('explains the post-finalize hold the same protective way', () => {
    const message = explain('Held for review (source_changed_after_finalize): retry blocked, reconcile the source first');
    expect(message).toContain('source_changed_after_finalize');
    expect(message).toContain('ไม่อนุญาต');
  });
  it('does not echo a hold reason that fails the safe-code pattern', () => {
    const message = explain('Held for review (<script>alert(1)</script>): retry blocked');
    expect(message).toBeNull();
  });
});

describe('Refusals are translated, not swallowed', () => {
  it.each([
    ['Automation is paused', 'ถูกพักอยู่'],
    ['Completed month cannot be retried', 'เสร็จแล้ว'],
    ['Run already in flight', 'กำลังทำงานอยู่'],
    ['No production run for this period', 'ยังไม่มีรอบทำงาน'],
    ['Invalid production period', 'ไม่ถูกต้อง'],
  ])('translates %s', (message, expected) => {
    expect(explain(message)).toContain(expected);
  });
  it('translates the state guard, which carries a variable state name', () => {
    expect(explain('Only a failed run can be retried (current state is running)'))
      .toContain('เฉพาะรอบที่ล้มเหลว');
  });
  it('returns null for an unknown message so the caller shows its generic fallback', () => {
    expect(explain('some unmapped database error')).toBeNull();
    expect(explain(undefined)).toBeNull();
  });
});

describe('Action status codes have human text', () => {
  it('covers every failure code the status RPC can emit', () => {
    const rpc = readFileSync('supabase/battle_pass_operator_run.sql', 'utf8');
    const emitted = [...rpc.matchAll(/'code','([a-z_]+)'/g)].map(m => m[1]);
    expect(emitted.length).toBeGreaterThan(0);
    for (const code of emitted) expect(codes[code]).toBeTruthy();
  });
});
