-- Deployed Creative Gantt uses this RPC; the view is only its fallback.
begin;
do $patch$ declare d text;a text;begin
 select pg_get_functiondef('public.flowmate_list_team_schedule()'::regprocedure) into d;
 if position('activity_automation_is_test' in d)=0 then
 a:='and wi.work_type = ''creative_request''';
 if position(a in d)=0 then raise exception 'team_schedule_rpc_anchor_changed';end if;
 d:=replace(d,a,a||E'\n    and not public.activity_automation_is_test(wi.id)');
 execute d;
 end if;
end $patch$;
commit;
notify pgrst,'reload schema';
