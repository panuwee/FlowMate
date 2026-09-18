begin;
select set_config('request.jwt.claim.sub','6e274581-5905-4146-a3eb-871f9c847bc6',true);
set local role authenticated;
select count(*) total_visible, count(*) filter(where public.activity_automation_is_test(work_item_id)) test_visible from public.flowmate_list_team_schedule();
reset role;
rollback;
