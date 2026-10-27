// Reads an explicitly supplied local diagnostic JSON file; never opens a URL.
const fs = require('node:fs');

function summarizeTiming(data, targetMs = 3000) {
  if (data?.version !== 1 || data.clock !== 'navigation' || !data.marks || !Number.isFinite(targetMs) || targetMs <= 0) {
    throw Error('Invalid diagnostic envelope or target');
  }
  const marks = data.marks;
  for (const value of Object.values(marks)) if (!Number.isFinite(value) || value < 0) throw Error('Invalid timing mark');
  const duration = (start, end) => {
    if (marks[start] === undefined || marks[end] === undefined) return null;
    if (marks[end] < marks[start]) throw Error('Timing marks are out of order');
    return Math.round((marks[end] - marks[start]) * 10) / 10;
  };
  const cached = !!data.cache?.month || !!data.cache?.year;
  duration('monthCommitMs', 'monthPaintOpportunityMs');
  duration('yearCommitMs', 'yearPaintOpportunityMs');
  const calculations = {};
  for (const name of ['month', 'year', 'monthFiltered', 'yearFiltered']) {
    const value = data.calculations?.[name];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) throw Error('Invalid calculation duration');
    calculations[name] = value;
  }
  const commitMs = marks.monthCommitMs ?? null;
  const paintMs = marks.monthPaintOpportunityMs ?? null;
  const failed = marks.monthFailedMs !== undefined;
  // An absent paint opportunity (e.g. a background tab) cannot prove success.
  const verdict = cached ? 'ineligible-cached' : failed ? 'failed-request'
    : commitMs !== null && commitMs > targetMs ? 'over-target'
    : paintMs !== null ? paintMs <= targetMs ? 'within-target' : 'over-target'
    : 'incomplete';
  return {
    targetMs, verdict,
    authMs: duration('authStartMs', 'authResolvedMs'),
    authToScreenMs: duration('authResolvedMs', 'screenEffectMs'),
    screenMountedAtMs: marks.screenEffectMs ?? null,
    monthlyRequestAndValidationMs: duration('monthRequestStartMs', 'monthResponseValidatedMs'),
    monthlyResponseToCommitMs: duration('monthResponseValidatedMs', 'monthCommitMs'),
    monthlyCommitAtMs: commitMs, monthlyPaintOpportunityAtMs: paintMs,
    annualRequestAndValidationMs: duration('yearRequestStartMs', 'yearResponseValidatedMs'),
    annualCommitAtMs: marks.yearCommitMs ?? null,
    annualPaintOpportunityAtMs: marks.yearPaintOpportunityMs ?? null,
    calculationsMs: calculations
  };
}

if (require.main === module) {
  try {
    if (!process.argv[2]) throw Error('Usage: node scripts/check-creative-kpi-timing.cjs <local-timing.json>');
    const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const results = (Array.isArray(input) ? input : [input]).map(item => summarizeTiming(item));
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = results.every(item => item.verdict === 'within-target') ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
module.exports = { summarizeTiming };
