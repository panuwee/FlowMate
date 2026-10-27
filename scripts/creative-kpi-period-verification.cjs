// Prepared post-install reads. Never connects to a database.
const crypto=require('node:crypto');
const {periodInstaller,buildPeriodProbes,periodQuery}=require('./build-creative-kpi-period.cjs');
const {reportQuery}=require('./creative-kpi-probe-variants.cjs');
function buildPeriodVerification(base,actor,ids,year=2026,month=10){
 const before=buildPeriodProbes(base,actor,ids,year,month)['period-1-full-month-parity.sql'];
 const signature='public.flowmate_creative_kpi_report_period(integer,integer,uuid[])';
 const hash=crypto.createHash('md5').update(periodInstaller(base).split('$fast_report$')[1]).digest('hex');
 const guard=`  if to_regprocedure('${signature}') is null then
    raise exception 'Period endpoint is absent';
  end if;
  if (select md5(prosrc)<>'${hash}' or prosecdef from pg_proc where oid='${signature}'::regprocedure)
    or has_function_privilege('anon','${signature}','execute')
    or not has_function_privilege('authenticated','${signature}','execute') then
    raise exception 'Unexpected period endpoint body or permissions';
  end if;
`;
 const guarded=before.replace('end $preflight$;',guard+'end $preflight$;');
 const parity=guarded.replace(reportQuery(base,'shared-report-gate',String(year)),`select public.flowmate_creative_kpi_report_period(${year},null) as snapshot`)
  .replace(periodQuery(base,year,month),`select public.flowmate_creative_kpi_report_period(${year},${month}) as snapshot`);
 if(parity===guarded||parity.includes('cross join lateral'))throw Error('Unexpected verification query shape');
 const prelude=parity.slice(0,parity.indexOf('with annual as materialized'));
 const start=`(make_date(${year},${month},1)::timestamp at time zone 'Asia/Bangkok')`;
 const end=`((make_date(${year},${month},1)::timestamp + interval '1 month') at time zone 'Asia/Bangkok')`;
 const delivered=`(value->>'delivery_at')::timestamptz >= ${start} and (value->>'delivery_at')::timestamptz < ${end}
  and (value->>'delivery_at')::timestamptz <= (snapshot->>'asOf')::timestamptz`;
 const timing=prelude+`with started as materialized(select clock_timestamp() at),
 report as materialized(select started.at,public.flowmate_creative_kpi_report_period(${year},${month}) snapshot from started),
 report_rows as materialized(select value from report,jsonb_array_elements(snapshot->'rows'))
 select jsonb_build_object('elapsed_ms',round(extract(epoch from(clock_timestamp()-report.at))*1000),
 'year',snapshot->'year','month',snapshot->'month','scope',snapshot->'scope',
 'row_count',snapshot->'rowCount','returned_rows',jsonb_array_length(snapshot->'rows'),
 'calendar_active',snapshot->'calendarActiveN','as_of',snapshot->'asOf',
 'delivered',(select count(*) from report_rows where ${delivered}),
 'ai_delivered',(select count(*) from report_rows where ${delivered} and jsonb_array_length(value->'delivered_ai_tags')>0),
 'role',current_user,
 'security_definer',(select prosecdef from pg_proc where oid='${signature}'::regprocedure),
 'anon_can_execute',has_function_privilege('anon','${signature}','execute')
 ) as period_verification from report;
rollback;
`;
 return {'verify-period-installed-parity.sql':parity,'verify-period-installed-timing.sql':timing};
}
module.exports={buildPeriodVerification};
