// Local diagnostics only. Does not connect to a database or install an endpoint.
const crypto = require('node:crypto');
const md5 = text => crypto.createHash('md5').update(text).digest('hex');
const originalBodyHash = '3ca563c345abb6afb12fab6055e1aab3';

function once(text, from, to) {
  if (text.split(from).length !== 2) throw Error('Unexpected KPI source shape: ' + from.slice(0, 60));
  return text.replace(from, to);
}

function variantInstaller(original, variant) {
  if (md5(original.split('$fast_report$')[1]) !== originalBodyHash) throw Error('Installed v1 baseline changed');
  if (variant === 'baseline') return original;
  if (variant === 'shared-report-gate') {
    const parent = variantInstaller(original, 'per-task-history');
    const start = parent.indexOf('\n  with kpi_scope as materialized (');
    const finish = parent.indexOf('  return v_result;');
    const query = parent.slice(start, finish);
    if ((query.match(/\bflowmate_kpi_can_view\(\)/g)||[]).length !== 6) throw Error('Unexpected report gate calls');
    const shared = query.replace(/\b(?:public\.)?flowmate_kpi_can_view\(\)/g, '(select allowed from kpi_access)')
      .replace('with kpi_scope as materialized (', 'with kpi_access as materialized (select public.flowmate_kpi_can_view() allowed), kpi_scope as materialized (');
    return parent.slice(0,start) + shared + parent.slice(finish);
  }
  if (!['shared-lookups', 'per-task-history'].includes(variant)) throw Error('Unknown diagnostic variant');
  // These substitutions affect only explicit view reads. All nested helper calls
  // and their RLS behavior remain unchanged. No privileged function is introduced.
  let sql = original.replace(/\b(?:public\.)?creative_request_details\b/g, 'kpi_details')
    .replace(/\b(?:public\.)?team_members\b/g, 'kpi_members')
    .replace(/\b(?:public\.)?users\b/g, 'kpi_users');
  const lookups = `), kpi_details as materialized (
    select d.* from public.creative_request_details d
    where d.work_item_id in (select id from kpi_work_items)
  ), kpi_members as materialized (
    select * from public.team_members
  ), kpi_users as materialized (
    select u.* from public.users u
    where u.id in (select requester_user_id from kpi_work_items)
  ), kpi_events as materialized (`;
  sql = once(sql, '), kpi_events as materialized (', lookups);
  if (variant === 'shared-lookups') return sql;
  // Keep the shared lookup sets outside the correlated subquery. Scope each
  // repeated history scan to one task, rather than scanning the annual CTE.
  const start = sql.indexOf('  with kpi_work_items as materialized (');
  const history = sql.indexOf('), kpi_events as materialized (', start);
  const end = sql.indexOf(',\n  result_rows as materialized (', history);
  if (start < 0 || history < 0 || end < 0) throw Error('Missing query boundaries');
  const outer = sql.slice(start, history).replace(/\bkpi_work_items\b/g, 'kpi_scope');
  const inner = sql.slice(history, end);
  sql = sql.slice(0, start) + outer + `), kpi_all_progression as (
    select task_report.* from kpi_scope task_scope
    cross join lateral (
      with kpi_work_items as materialized (select task_scope.*` + inner + `
      select * from kpi_progression
    ) task_report
  )` + sql.slice(end);
  return once(sql, 'select * from kpi_progression\n    where created_year', 'select * from kpi_all_progression\n    where created_year');
}

function reportQuery(original, variant, year = '2026', ids = 'null::uuid[]') {
  const sql = variantInstaller(original, variant);
  const start = sql.indexOf('\n  with ');
  if (start < 0) throw Error('Missing top-level report query');
  const query = sql.slice(start, sql.indexOf('  return v_result;')).trim();
  return query.replace(/\bp_year\b/g, '(' + year + ')')
    .replace(/\bp_work_item_ids\b/g, '(' + ids + ')')
    .replace('into v_result from result_rows r;', 'as snapshot from result_rows r');
}

function buildProbeSuite(original, actor, ids, expectedBodyHash = originalBodyHash) {
  if (!/^[0-9a-f-]{36}$/.test(actor) || ids.length > 40 || !ids.length ||
      ids.some(id => !/^[0-9a-f-]{36}$/.test(id))) throw Error('Invalid diagnostic scope');
  if (!/^[0-9a-f]{32}$/.test(expectedBodyHash)) throw Error('Invalid endpoint hash');
  variantInstaller(original, 'baseline');
  const body = original.split('$fast_report$')[1];
  const sourceGuard = body.slice(body.indexOf('  if md5('), body.indexOf('  with kpi_work_items'));
  if (!sourceGuard.includes('KPI source changed')) throw Error('Missing drift guard');
  const prelude = `-- PREPARED ONLY. Requires new approval; do not install any function.
begin read only;
set local statement_timeout='8s';
set local lock_timeout='1s';
set local search_path=pg_catalog,public;
select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true);
set local role authenticated;
do $preflight$
begin
  if auth.uid() is null or not coalesce(public.flowmate_kpi_can_view(),false) then
    raise exception 'KPI access denied';
  end if;
  if to_regprocedure('public.flowmate_creative_kpi_report_fast(integer,uuid[])') is null then
    raise exception 'Expected installed v1 endpoint is absent';
  end if;
  if (select md5(prosrc) <> '${expectedBodyHash}' or prosecdef
      from pg_proc where oid='public.flowmate_creative_kpi_report_fast(integer,uuid[])'::regprocedure) then
    raise exception 'Installed v1 endpoint changed';
  end if;
${sourceGuard}
end $preflight$;
`;
  const idSql = `array[${ids.map(id => `'${id}'::uuid`).join(',')}]`;
  const originalRows = `select to_jsonb(p) value from public.flowmate_creative_kpi_progression_v p
    where work_item_id=any(${idSql}) and(created_year=2026 or review_year=2026 or first_delivery_year=2026 or started_year=2026 or(is_open and created_year<=2026))`;
  const parity = `with original as materialized (${originalRows}),
    shared_snapshot as materialized (${reportQuery(original,'shared-lookups','2026',idSql)}),
    task_snapshot as materialized (${reportQuery(original,'per-task-history','2026',idSql)}),
    shared_rows as materialized(select value from shared_snapshot,jsonb_array_elements(snapshot->'rows')),
    task_rows as materialized(select value from task_snapshot,jsonb_array_elements(snapshot->'rows'))
    select jsonb_build_object('original_count',(select count(*) from original),
      'shared_count',(select count(*) from shared_rows),'task_count',(select count(*) from task_rows),
      'shared_missing',(select count(*) from(select * from original except all select * from shared_rows)d),
      'shared_extra',(select count(*) from(select * from shared_rows except all select * from original)d),
      'task_missing',(select count(*) from(select * from original except all select * from task_rows)d),
      'task_extra',(select count(*) from(select * from task_rows except all select * from original)d),
      'role',current_user) as parity;`;
  const suite = {'next-1-parity-40.sql': prelude + parity + '\nrollback;\n'};
  ['baseline','shared-lookups','per-task-history'].forEach((variant,i) => {
    suite[`next-${i+2}-${variant}-year.sql`] = prelude +
      'explain (analyze,buffers,format json)\n' + reportQuery(original,variant) + ';\nrollback;\n';
  });
  return suite;
}

function buildGateProbeSuite(original, actor, ids) {
  // Reuse the reviewed read-only preflight, adding a stability requirement for
  // statement-local gate reuse. This never changes task-level RLS checks.
  const previous = buildProbeSuite(original,actor,ids)['next-1-parity-40.sql'];
  let prelude = previous.slice(0, previous.indexOf('with original as materialized'));
  prelude = prelude.replace('end $preflight$;', `  if (select provolatile <> 's' from pg_proc where oid='public.flowmate_kpi_can_view()'::regprocedure) then
    raise exception 'Report gate is no longer stable';
  end if;
end $preflight$;`);
  const idSql = `array[${ids.map(id=>`'${id}'::uuid`).join(',')}]`;
  const parity = `with original as materialized (
    select to_jsonb(p) value from public.flowmate_creative_kpi_progression_v p
    where work_item_id=any(${idSql}) and(created_year=2026 or review_year=2026 or first_delivery_year=2026 or started_year=2026 or(is_open and created_year<=2026))
  ), candidate as materialized (${reportQuery(original,'shared-report-gate','2026',idSql)}),
  candidate_rows as materialized(select value from candidate,jsonb_array_elements(snapshot->'rows'))
  select jsonb_build_object('original_count',(select count(*) from original),
    'candidate_count',(select count(*) from candidate_rows),
    'missing',(select count(*) from(select * from original except all select * from candidate_rows)d),
    'extra',(select count(*) from(select * from candidate_rows except all select * from original)d),
    'role',current_user) as parity;`;
  return {
    'gate-1-parity-40.sql':prelude+parity+'\nrollback;\n',
    'gate-2-year.sql':prelude+'explain (analyze,buffers,format json)\n'+reportQuery(original,'shared-report-gate')+';\nrollback;\n'
  };
}

module.exports = {variantInstaller, reportQuery, buildProbeSuite, buildGateProbeSuite, originalBodyHash};
