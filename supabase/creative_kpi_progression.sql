-- Prepared for review: local application/tests only until production approval.
-- Requires creative_kpi_year_end_report.sql and the existing collaboration helpers.
begin;
create schema if not exists flowmate_kpi_private;
revoke all on schema flowmate_kpi_private from public, anon, authenticated;

create table if not exists public.creative_kpi_milestones (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  milestone text not null check (milestone in ('created','assigned','started','review','delivered')),
  occurred_at timestamptz not null,
  owner_member_id uuid,
  owner_name text,
  owner_code text,
  due_date date,
  launch_date date,
  ai_tags text[] not null default '{}',
  primary key (work_item_id, milestone)
);
create table if not exists public.creative_kpi_brief_evidence (
  id bigint generated always as identity primary key,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  action text not null check (action in ('submitted','accepted')),
  submission_id bigint references public.creative_kpi_brief_evidence(id),
  actor_user_id uuid not null,
  occurred_at timestamptz not null default now(),
  reason text not null default '',
  brief_link text not null,
  constraint brief_action_link check ((action = 'submitted' and submission_id is null) or (action = 'accepted' and submission_id is not null))
);
create index if not exists creative_kpi_brief_task_idx on public.creative_kpi_brief_evidence(work_item_id, id desc);
create unique index if not exists creative_kpi_brief_accept_once_idx on public.creative_kpi_brief_evidence(submission_id) where action = 'accepted';
alter table public.creative_kpi_milestones enable row level security;
alter table public.creative_kpi_brief_evidence enable row level security;
revoke all on public.creative_kpi_milestones, public.creative_kpi_brief_evidence from public, anon, authenticated;
revoke all on sequence public.creative_kpi_brief_evidence_id_seq from public, anon, authenticated;
grant select on public.creative_kpi_milestones, public.creative_kpi_brief_evidence to authenticated;
drop policy if exists creative_kpi_milestones_read on public.creative_kpi_milestones;
create policy creative_kpi_milestones_read on public.creative_kpi_milestones for select to authenticated
  using ((select public.flowmate_kpi_can_view()) or public.flowmate_can_read_work_item(work_item_id, (select auth.uid())));
drop policy if exists creative_kpi_brief_read on public.creative_kpi_brief_evidence;
create policy creative_kpi_brief_read on public.creative_kpi_brief_evidence for select to authenticated
  using ((select public.flowmate_kpi_can_view()) or public.flowmate_can_read_work_item(work_item_id, (select auth.uid())));

-- A trigger is the only writer of milestone snapshots. No historical backfill.
create or replace function flowmate_kpi_private.capture_milestone()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_target text;
begin
  if new.work_type::text <> 'creative_request' then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.creative_kpi_milestones
      (work_item_id,milestone,occurred_at,owner_member_id,owner_name,owner_code,due_date,launch_date)
    select new.id,'created',new.created_at,new.final_owner_member_id,tm.display_name,tm.member_code,new.due_date,new.launch_date
    from (select 1) x left join public.team_members tm on tm.id = new.final_owner_member_id
    on conflict do nothing;
  else
    if new.due_date is distinct from old.due_date or new.launch_date is distinct from old.launch_date then
      insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata)
      values(new.id,auth.uid(),'updated',jsonb_build_object('action','kpi_dates_changed','due_from',old.due_date,'due_to',new.due_date,'launch_from',old.launch_date,'launch_to',new.launch_date,'approval','not_recorded_by_this_event'));
    end if;
    if new.status is not distinct from old.status then return new; end if;
  end if;
  v_target := new.status::text;
  v_kind := case v_target when 'assigned' then 'assigned' when 'in_progress' then 'started' when 'review' then 'review' when 'delivered' then 'delivered' end;
  if v_kind is null then return new; end if;
  -- Acknowledge requires an actual Assigned -> In progress transition.
  if v_kind = 'started' and (tg_op = 'INSERT' or old.status::text <> 'assigned') then return new; end if;
  if v_kind = 'review' and (tg_op = 'INSERT' or old.status::text <> 'in_progress') then return new; end if;
  if exists(select 1 from public.work_item_events e where e.work_item_id=new.id and e.to_status::text=v_target
    and (v_kind <> 'review' or e.from_status::text='in_progress')
    and (v_kind <> 'started' or e.from_status::text='assigned')) then return new; end if;
  -- Older delivered_at is evidence of a previous delivery, even if its event is missing.
  if tg_op='UPDATE' and v_kind='delivered' and old.delivered_at is not null then return new; end if;
  insert into public.creative_kpi_milestones
    (work_item_id,milestone,occurred_at,owner_member_id,owner_name,owner_code,due_date,launch_date,ai_tags)
  select new.id,v_kind,now(),new.final_owner_member_id,tm.display_name,tm.member_code,new.due_date,new.launch_date,
    case when v_kind='delivered' then public.flowmate_kpi_ai_tags(new.id) else '{}'::text[] end
  from (select 1) x left join public.team_members tm on tm.id=new.final_owner_member_id
  on conflict do nothing;
  return new;
end $$;
revoke all on function flowmate_kpi_private.capture_milestone() from public, anon, authenticated;
drop trigger if exists creative_kpi_capture_milestone on public.work_items;
create trigger creative_kpi_capture_milestone after insert or update of status,due_date,launch_date on public.work_items
for each row execute function flowmate_kpi_private.capture_milestone();

-- Returns permissions and state as well as handling the two explicit actions.
-- Caller identity always comes from auth.uid(); no client-supplied actor/time.
create or replace function public.flowmate_creative_brief(p_work_item_id uuid, p_action text default 'read', p_reason text default '', p_submission_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_task public.work_items; v_owner uuid; v_lead boolean;
  v_submit boolean; v_accept boolean; v_latest public.creative_kpi_brief_evidence; v_id bigint; v_link text;
begin
  if v_actor is null or not exists(select 1 from public.users where id=v_actor and is_active) then raise exception 'Not authorized' using errcode='42501'; end if;
  v_lead := coalesce(public.flowmate_kpi_can_view(),false);
  if not (v_lead or public.flowmate_can_read_work_item(p_work_item_id,v_actor)) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_task from public.work_items where id=p_work_item_id for update;
  if not found or v_task.work_type::text <> 'creative_request' then raise exception 'Creative task not found'; end if;
  select user_id into v_owner from public.team_members where id=v_task.final_owner_member_id;
  select brief_link into v_link from public.creative_request_details where work_item_id=p_work_item_id;
  v_submit := v_task.requester_user_id=v_actor and v_task.archived_at is null and v_task.status::text not in ('delivered','cancelled');
  v_accept := (coalesce(v_owner=v_actor,false) or v_lead) and v_task.archived_at is null and v_task.status::text not in ('delivered','cancelled');
  select * into v_latest from public.creative_kpi_brief_evidence where work_item_id=p_work_item_id and action='submitted' order by id desc limit 1;
  if p_action='submitted' then
    if not coalesce(v_submit,false) then raise exception 'Only the requester can submit this brief' using errcode='42501'; end if;
    if coalesce(trim(v_link),'')='' then raise exception 'Add the brief link before submitting'; end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'Describe this brief version or what changed'; end if;
    insert into public.creative_kpi_brief_evidence(work_item_id,action,actor_user_id,reason,brief_link)
    values(p_work_item_id,'submitted',v_actor,trim(p_reason),v_link) returning id into v_id;
  elsif p_action='accepted' then
    if not coalesce(v_accept,false) then raise exception 'Only the owner or Lead can accept this brief' using errcode='42501'; end if;
    if v_latest.id is null or p_submission_id is distinct from v_latest.id then raise exception 'The brief changed. Refresh before accepting'; end if;
    if exists(select 1 from public.creative_kpi_brief_evidence where submission_id=v_latest.id) then raise exception 'This brief version is already accepted'; end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'Record confirmation or the reason for accepting on behalf of the owner'; end if;
    insert into public.creative_kpi_brief_evidence(work_item_id,action,submission_id,actor_user_id,reason,brief_link)
    values(p_work_item_id,'accepted',v_latest.id,v_actor,trim(p_reason),v_latest.brief_link) returning id into v_id;
  elsif p_action <> 'read' then raise exception 'Unknown brief action'; end if;
  if v_id is not null then
    insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata)
    values(p_work_item_id,v_actor,'updated',jsonb_build_object('action','brief_'||p_action,'evidence_id',v_id,'submission_id',p_submission_id,'reason',trim(p_reason),'on_behalf',p_action='accepted' and v_owner is distinct from v_actor));
  end if;
  return jsonb_build_object('can_submit',coalesce(v_submit,false),'can_accept',coalesce(v_accept,false),
    'history',coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from public.creative_kpi_brief_evidence e where e.work_item_id=p_work_item_id),'[]'::jsonb));
end $$;
revoke all on function public.flowmate_creative_brief(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.flowmate_creative_brief(uuid,text,text,bigint) to authenticated;

-- Explicit event evidence. Legacy owner is reconstructed from assignment history
-- and labelled; do not quietly substitute today's owner for a missing snapshot.
create or replace function public.flowmate_kpi_owner_at(p_work_item_id uuid,p_at timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  with changes as (
    select ar.final_owner_member_id as member_id, ar.ran_at as at, ar.id::text as tie, 0 as priority
    from public.assignment_runs ar where ar.work_item_id=p_work_item_id and ar.ran_at<=p_at and ar.final_owner_member_id is not null
    union all
    select case when e.metadata->>'new_member_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e.metadata->>'new_member_id')::uuid end,
      e.created_at,e.id::text,1
    from public.work_item_events e where e.work_item_id=p_work_item_id and e.created_at<=p_at
      and e.metadata->>'action'='assignee_changed' and e.metadata ? 'new_member_id'
  ), latest as (select * from changes order by at desc,priority desc,tie desc limit 1)
  select jsonb_build_object('owner_member_id',l.member_id,'owner_name',tm.display_name,'owner_code',tm.member_code)
  from latest l left join public.team_members tm on tm.id=l.member_id where public.flowmate_kpi_can_view();
$$;
revoke all on function public.flowmate_kpi_owner_at(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.flowmate_kpi_owner_at(uuid,timestamptz) to authenticated;
create or replace view public.flowmate_creative_kpi_progression_v with (security_invoker=true) as
with base as (
  select r.*, d.at as first_delivered_at, a.at as acknowledged_at,
    coalesce(ds.occurred_at,d.at) as delivery_at,
    coalesce(ast.occurred_at,a.at) as acknowledge_at,
    case when cs.work_item_id is null then r.due_date else cs.due_date end as created_due,
    case when ass.work_item_id is null then r.due_date else ass.due_date end as assigned_due,
    case when ass.work_item_id is null then r.due_date else ass.due_date end as evaluation_due,
    case when ass.work_item_id is null then r.launch_date else ass.launch_date end as evaluation_launch,
    case when ass.work_item_id is null then 'current_dates' else 'first_assignment_snapshot' end as deadline_source,
    case when ds.work_item_id is null then r.ai_tags else ds.ai_tags end as delivered_ai_tags,
    case when ds.work_item_id is null then 'current_tags' else 'delivery_snapshot' end as ai_evidence_source,
    case when ds.work_item_id is not null then to_jsonb(ds) else null end as delivery_snapshot,
    case when rs.work_item_id is not null then to_jsonb(rs) else null end as review_snapshot,
    case when ast.work_item_id is not null then to_jsonb(ast) else null end as start_snapshot,
    public.flowmate_kpi_owner_at(r.work_item_id,d.at) as delivery_history_owner,
    public.flowmate_kpi_owner_at(r.work_item_id,r.review_submitted_at) as review_history_owner,
    public.flowmate_kpi_owner_at(r.work_item_id,a.at) as start_history_owner,
    exists(select 1 from public.work_item_events e where e.work_item_id=r.work_item_id and e.metadata->>'action'='assignee_changed'
      and e.created_at >= r.started_at and e.created_at <= r.review_submitted_at) as reassigned_during_production,
    (select count(*)::integer from public.work_item_events e where e.work_item_id=r.work_item_id and e.to_status::text='delivered') as delivered_event_n,
    (select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb) from public.creative_kpi_brief_evidence b where b.work_item_id=r.work_item_id) as brief_evidence,
    (select coalesce(jsonb_agg(jsonb_build_object('at',e.created_at,'actor',e.actor_user_id,'change',e.metadata) order by e.created_at),'[]'::jsonb)
      from public.work_item_events e where e.work_item_id=r.work_item_id and e.metadata->>'action'='kpi_dates_changed') as deadline_history
  from public.flowmate_creative_kpi_report_v r
  left join lateral (select min(e.created_at) as at from public.work_item_events e where e.work_item_id=r.work_item_id and e.to_status::text='delivered') d on true
  left join lateral (select min(e.created_at) as at from public.work_item_events e where e.work_item_id=r.work_item_id and e.from_status::text='assigned' and e.to_status::text='in_progress') a on true
  left join public.creative_kpi_milestones cs on cs.work_item_id=r.work_item_id and cs.milestone='created'
  left join public.creative_kpi_milestones ass on ass.work_item_id=r.work_item_id and ass.milestone='assigned'
  left join public.creative_kpi_milestones ast on ast.work_item_id=r.work_item_id and ast.milestone='started'
  left join public.creative_kpi_milestones rs on rs.work_item_id=r.work_item_id and rs.milestone='review'
  left join public.creative_kpi_milestones ds on ds.work_item_id=r.work_item_id and ds.milestone='delivered'
  where public.flowmate_kpi_can_view()
)
select base.*,
  extract(year from delivery_at at time zone 'Asia/Bangkok')::integer as first_delivery_year,
  extract(year from acknowledge_at at time zone 'Asia/Bangkok')::integer as started_year,
  public.flowmate_kpi_working_duration_days(created_at,acknowledge_at,'gdve') as acknowledge_working_days,
  public.flowmate_kpi_working_duration_days(created_at,assigned_at,'gdve') as queue_working_days,
  public.flowmate_kpi_working_duration_days(assigned_at,acknowledge_at,'gdve') as assigned_acknowledge_working_days,
  public.flowmate_kpi_working_date_gap((review_submitted_at at time zone 'Asia/Bangkok')::date,evaluation_launch,'gdve') as launch_buffer_working_days,
  public.flowmate_kpi_working_date_gap((created_at at time zone 'Asia/Bangkok')::date,created_due,'gdve') as created_buffer_working_days,
  public.flowmate_kpi_working_date_gap((assigned_at at time zone 'Asia/Bangkok')::date,assigned_due,'gdve') as assigned_buffer_working_days
from base;
revoke all on public.flowmate_creative_kpi_progression_v from public,anon,authenticated;
grant select on public.flowmate_creative_kpi_progression_v to authenticated;
commit;
