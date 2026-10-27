// Generates review artifacts only; never connects to a database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {variantInstaller,reportQuery,buildGateProbeSuite}=require('./creative-kpi-probe-variants.cjs');
const root=path.resolve(__dirname,'..');
function periodInstaller(base){
 let sql=variantInstaller(base,'shared-report-gate');
 sql=sql.replaceAll('flowmate_creative_kpi_report_fast','flowmate_creative_kpi_report_period')
  .replaceAll('(integer,uuid[])','(integer,integer,uuid[])')
  .replace('p_year integer, p_work_item_ids uuid[] default null','p_year integer, p_month integer default null, p_work_item_ids uuid[] default null')
  .replace('declare v_result jsonb;','declare v_result jsonb; v_month_start timestamptz; v_month_end timestamptz;')
  .replace("  if p_work_item_ids is not null",`  if p_month is not null and (p_month < 1 or p_month > 12) then
    raise exception 'Invalid Creative report month' using errcode='22023';
  end if;
  if (select provolatile <> 's' from pg_proc where oid='public.flowmate_kpi_can_view()'::regprocedure) then
    raise exception 'Report gate is no longer stable' using errcode='55000';
  end if;
  if p_month is not null then
    v_month_start := make_date(p_year,p_month,1)::timestamp at time zone 'Asia/Bangkok';
    v_month_end := (make_date(p_year,p_month,1)::timestamp + interval '1 month') at time zone 'Asia/Bangkok';
  end if;
  if p_work_item_ids is not null`)
  .replace('select * from public.work_items\n','select * from public.work_items scope_item\n')
  .replace('and (p_work_item_ids is null or id=any(p_work_item_ids))',`and (p_work_item_ids is null or id=any(p_work_item_ids))
      -- A superset of every selected-month cohort. Creation month alone loses
      -- cross-year deliveries, first reviews, starts and existing open work.
      and (p_month is null
        or (created_at >= v_month_start and created_at < v_month_end)
        or (created_at < v_month_end and status not in ('delivered','cancelled'))
        or exists (select 1 from public.work_item_events period_event
          where period_event.work_item_id=scope_item.id
            and period_event.created_at >= v_month_start and period_event.created_at < v_month_end))`)
  .replace(`where created_year=p_year or review_year=p_year or first_delivery_year=p_year
      or started_year=p_year or (is_open=true and created_year<=p_year)`,`where (created_year=p_year or review_year=p_year or first_delivery_year=p_year
      or started_year=p_year or (is_open=true and created_year<=p_year))
      and (p_month is null
        or (created_at >= v_month_start and created_at < v_month_end)
        or (review_submitted_at >= v_month_start and review_submitted_at < v_month_end)
        or (delivery_at >= v_month_start and delivery_at < v_month_end)
        or (acknowledge_at >= v_month_start and acknowledge_at < v_month_end)
        or (is_open=true and created_at < v_month_end))`)
  .replace("'version',1,'year',p_year,","'version',1,'year',p_year,'month',p_month,'scope',case when p_month is null then 'year' else 'month' end,")
  .replace('Creative KPI v1. Invoker RLS; statement-local history reuse; complete JSON envelope; no persisted report cache.',
   'Creative KPI period v1. Complete monthly or annual scope; invoker RLS; original formulas; statement-local reuse only.');
 if(!sql.includes('period_event.work_item_id')||!sql.includes('acknowledge_at >= v_month_start'))throw Error('Unexpected period source shape');
 return sql;
}
if(require.main===module){
 const base=fs.readFileSync(path.join(root,'supabase/creative_kpi_fast_report_20261027.sql'),'utf8');
 const sql=periodInstaller(base),hash=crypto.createHash('md5').update(sql.split('$fast_report$')[1]).digest('hex');
 fs.writeFileSync(path.join(root,'supabase/creative_kpi_period_report_20261027.sql'),sql);
 fs.writeFileSync(path.join(root,'supabase/creative_kpi_period_report_20261027_rollback.sql'),`-- Separate approval required. Revert the period frontend before removing this endpoint.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $rollback$
begin
 if to_regprocedure('public.flowmate_creative_kpi_report_period(integer,integer,uuid[])') is null then return; end if;
 if (select md5(prosrc) from pg_proc where oid='public.flowmate_creative_kpi_report_period(integer,integer,uuid[])'::regprocedure)<>'${hash}' then
  raise exception 'Unexpected period endpoint; inspect before removal';
 end if;
end $rollback$;
drop function if exists public.flowmate_creative_kpi_report_period(integer,integer,uuid[]);
commit;
`);
 console.log('Prepared period installer and guarded rollback locally; no database connection.');
}
function periodQuery(base,year=2026,month=10){
 if(!Number.isInteger(year)||year<2026||year>2100||!Number.isInteger(month)||month<1||month>12)throw Error('Invalid period probe');
 const sql=periodInstaller(base),start=sql.indexOf('\n  with '),end=sql.indexOf('  return v_result;');
 if(start<0||end<0)throw Error('Missing period query');
 return sql.slice(start,end).trim().replace(/\bp_year\b/g,String(year)).replace(/\bp_month\b/g,String(month))
  .replace(/\bp_work_item_ids\b/g,'null::uuid[]')
  .replace(/\bv_month_start\b/g,`(make_date(${year},${month},1)::timestamp at time zone 'Asia/Bangkok')`)
  .replace(/\bv_month_end\b/g,`((make_date(${year},${month},1)::timestamp + interval '1 month') at time zone 'Asia/Bangkok')`)
  .replace('into v_result from result_rows r;','as snapshot from result_rows r');
}
function buildPeriodProbes(base,actor,ids,year=2026,month=10){
 const parent=buildGateProbeSuite(base,actor,ids)['gate-1-parity-40.sql'];
 const prelude=parent.slice(0,parent.indexOf('with original as materialized'));
 const query=periodQuery(base,year,month);
 const start=`(make_date(${year},${month},1)::timestamp at time zone 'Asia/Bangkok')`;
 const end=`((make_date(${year},${month},1)::timestamp + interval '1 month') at time zone 'Asia/Bangkok')`;
 const filter=['created_at','review_submitted_at','delivery_at','acknowledge_at'].map(f=>`((value->>'${f}')::timestamptz >= ${start} and (value->>'${f}')::timestamptz < ${end})`).join(' or ');
 const parity=`with annual as materialized (${reportQuery(base,'shared-report-gate',String(year))}),
 monthly as materialized (${query}),
 expected as materialized(select value from annual,jsonb_array_elements(snapshot->'rows')
  where ${filter} or ((value->>'is_open')::boolean=true and (value->>'created_at')::timestamptz < ${end})),
 actual as materialized(select value from monthly,jsonb_array_elements(snapshot->'rows'))
 select jsonb_build_object('role',current_user,'year',${year},'month',${month},
  'annual_rows',(select (snapshot->>'rowCount')::integer from annual),
  'expected_month_rows',(select count(*) from expected),'actual_month_rows',(select count(*) from actual),
  'missing',(select count(*) from(select value from expected except all select value from actual)d),
  'extra',(select count(*) from(select value from actual except all select value from expected)d),
  'calendar_matches',(select a.snapshot->'calendarActiveN'=m.snapshot->'calendarActiveN' from annual a,monthly m)
 ) as monthly_parity;`;
 return {'period-1-full-month-parity.sql':prelude+parity+'\nrollback;\n',
  'period-2-month-plan.sql':prelude+'explain (analyze,buffers,format json)\n'+query+';\nrollback;\n'};
}
module.exports={periodInstaller,periodQuery,buildPeriodProbes};
