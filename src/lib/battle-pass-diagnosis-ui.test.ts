import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('battle-pass-diagnosis.js', 'utf8');
const ctx: any = {}; vm.runInNewContext(source, ctx);
const { reasons, actions, risks, failures, label } = ctx.BattlePassDiagnosis;
const routeSql = readFileSync('supabase/battle_pass_diagnosis.sql', 'utf8');
const dispatchSql = readFileSync('supabase/battle_pass_diagnosis_dispatch.sql', 'utf8');

describe('Recommended-action labels match the database allowlist exactly', () => {
  it('labels every allowed action and nothing extra', () => {
    const block = /v_act in \(([\s\S]*?)\)/.exec(routeSql)?.[1] ?? '';
    const fromSql = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
    expect(fromSql).toEqual([
      'manual_review', 'no_action', 'resume_from_create_cr',
      'retry_run', 'revalidate_source', 'wait_for_confirmation',
    ]);
    expect(Object.keys(actions).sort()).toEqual(fromSql);
  });
  it('never presents a risky action as safe', () => {
    expect(actions.retry_run).toContain('ต่ำ');
    expect(actions.manual_review).toContain('คนตรวจ');
    expect(actions.resume_from_create_cr).toContain('ห้ามสร้าง Brief ใหม่');
  });
});

describe('Route reasons are all explained to the operator', () => {
  it('covers every reason the gate can return', () => {
    const emitted = new Set([
      ...[...routeSql.matchAll(/'reason'\s*,\s*'([a-z_]+)'/g)].map(m => m[1]),
      ...[...routeSql.matchAll(/then\s+'([a-z_]+)'/g)].map(m => m[1]),
    ].filter(value => !['ai', 'runbook', 'none'].includes(value)));
    expect(emitted.size).toBeGreaterThan(5);
    for (const reason of emitted) expect(reasons[reason]).toBeTruthy();
  });
  it('tells the operator plainly when no AI was used', () => {
    expect(reasons.known_code).toContain('ไม่ต้องใช้ AI');
    expect(reasons.deterministic_state).toContain('ไม่ต้องใช้ AI');
    expect(reasons.cached_diagnosis_exists).toContain('ไม่เรียก AI ซ้ำ');
    expect(reasons.rate_limited).toContain('โควตา');
  });
});

describe('Manual override wording matches what the dispatcher actually permits', () => {
  it('explains each overridable reason', () => {
    const block = /v_reason in \(([^)]*)\)/.exec(dispatchSql)?.[1] ?? '';
    const overridable = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
    expect(overridable).toEqual(['deterministic_state', 'known_code', 'no_action_needed']);
    for (const reason of overridable) expect(reasons[reason]).toBeTruthy();
  });
});

describe('Risk and failure text', () => {
  it('translates the three risk levels the database accepts', () => {
    const block = /v_risk in \(([^)]*)\)/.exec(routeSql)?.[1] ?? '';
    const fromSql = [...block.matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort();
    expect(fromSql).toEqual(['high', 'low', 'medium']);
    for (const level of fromSql) expect(risks[level]).toBeTruthy();
  });
  it('explains an unconfigured Alpha connection so the cause is obvious', () => {
    expect(failures.alpha_not_configured).toContain('secrets');
    expect(failures.alpha_request_failed).toContain('API key');
    expect(failures.alpha_timeout).toContain('60');
  });
});

describe('label() falls back safely', () => {
  it('uses the mapped text when present', () => {
    expect(label(risks, 'high')).toBe('สูง');
  });
  it('uses the supplied fallback for an unknown key', () => {
    expect(label(reasons, 'brand_new_reason', 'สถานะ: ai')).toBe('สถานะ: ai');
  });
  it('echoes the key only as a last resort, never blank', () => {
    expect(label(reasons, 'brand_new_reason')).toBe('brand_new_reason');
    expect(label(reasons, undefined)).toBe('—');
  });
});
