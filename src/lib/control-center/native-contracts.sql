-- Read-only function snapshot from jbavahimqjalvcfawgqw, 5 October 2026.
-- Offline test reference only; never apply this snapshot to production.
CREATE OR REPLACE FUNCTION activity_automation_private.has_accepted_brief(p_work uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.creative_kpi_brief_evidence a
 join public.creative_kpi_brief_evidence s on s.id=a.submission_id
 join public.creative_request_details d on d.work_item_id=s.work_item_id
 where a.work_item_id=p_work and a.action='accepted' and s.action='submitted'
 and s.id=(select max(id) from public.creative_kpi_brief_evidence where work_item_id=p_work and action='submitted')
 and s.brief_link=d.brief_link)
 and not exists(select 1 from activity_automation_private.production_output_bindings b
 join activity_automation_private.production_runs r on r.id=b.run_id
 where b.work_item_id=p_work and (r.stage<>'complete' or r.hold_reason is not null))
$function$;

CREATE OR REPLACE FUNCTION activity_automation_private.production_notification_ready(p_run uuid, p_event text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from activity_automation_private.production_runs r where r.id=p_run and exists(select 1 from activity_automation_private.production_observations o
 where o.activity=r.activity and o.project_code=r.project_code and o.period=r.period
 and o.working_sheet_linked and o.loot_confirmed and o.observed_at>=current_timestamp-interval '65 minutes') and
 (case when p_event='run_held' then r.stage='held' and r.hold_reason is not null and not exists(select 1 from activity_automation_private.production_observations o where o.activity=r.activity and o.project_code=r.project_code and o.period=r.period and o.state='done')
 when p_event='brief_ready' then r.stage='complete' and r.hold_reason is null
 and exists(select 1 from activity_automation_private.production_output_bindings b
  join public.work_items w on w.id=b.work_item_id
  join public.marketing_content_items m on m.id=b.content_item_id and m.flowmate_work_item_id=w.id
  join public.creative_request_details d on d.work_item_id=w.id
  where b.run_id=r.id and w.status='unassigned' and w.assignee_user_id is null and w.final_owner_member_id is null
  and w.archived_at is null and not coalesce(w.wip_counted,false) and w.assignee_other_name is null
  and w.display_id~'^CR-[0-9]+$' and d.brief_link='https://docs.google.com/presentation/d/'||b.slide_id||'/edit'
  and not exists(select 1 from activity_automation_private.output_bindings t where t.work_item_id=w.id)
  and exists(select 1 from public.creative_kpi_brief_evidence e where e.work_item_id=w.id and e.action='submitted' and e.brief_link=d.brief_link)
  and not activity_automation_private.has_accepted_brief(w.id))
 else false end))
$function$;

CREATE OR REPLACE FUNCTION activity_automation_private.production_working_sheet_draft(p_mid uuid, p_launch date, p_time time without time zone, p_note text, p_creative jsonb DEFAULT NULL::jsonb, p_inherit_creative boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.marketing_content_items; campaign text; launch date; at_time time;
 placement_note text; channels text[]; platforms text[]; mapped_count integer; subtype text;
begin
 select * into strict m from public.marketing_content_items where id=p_mid;
 select c.name into campaign from public.marketing_campaigns c where c.id=m.campaign_id;
 if campaign is distinct from 'Revenue' then raise exception 'Working Sheet Campaign requires review';end if;
 select cp.publish_date,cp.publish_time,cp.note into launch,at_time,placement_note
 from public.marketing_channel_placements cp where cp.content_item_id=m.id
 order by cp.publish_date nulls last,cp.publish_time nulls last,cp.channel limit 1;
 launch:=coalesce(m.source_start_date,launch,p_launch);at_time:=coalesce(m.source_start_time,at_time,p_time);
 if launch is distinct from p_launch or at_time is distinct from p_time then
  raise exception 'Working Sheet source schedule requires review';
 end if;
 if p_creative is not null and p_inherit_creative then
  subtype:=case when lower(coalesce(m.format,'')) like '%short%' or lower(coalesce(m.format,'')) like '%reel%' then 'video-under-1-min'
   when lower(coalesce(m.format,'')) like '%video%' then 'video-standard'
   when lower(coalesce(m.format,'')) like '%motion%' or lower(coalesce(m.format,'')) like '%gif%' then 'motion'
   when lower(coalesce(m.format,'')) like '%album%' then 'hero-album'
   when nullif(btrim(m.format),'') is not null then 'banner' end;
  if subtype is not null then p_creative:=p_creative||jsonb_build_object('subtype',subtype,
   'assetType',case when subtype like 'video-%' then 'general-video' when subtype='motion' then 'motion' else 'static-graphic' end);end if;
  select array_agg(channel order by channel) into channels from
   (select distinct cp.channel from public.marketing_channel_placements cp where cp.content_item_id=m.id) found_channels;
  if cardinality(channels)>0 then
   select array_agg(c.label order by c.code),count(*) into platforms,mapped_count
   from public.creative_channels c where c.code=any(channels) and c.active;
   if mapped_count<>cardinality(channels) then raise exception 'Working Sheet Creative channels invalid';end if;
   p_creative:=p_creative||jsonb_build_object('channels',channels,'platforms',platforms);
  end if;
 end if;
 return jsonb_build_object('productEvent',m.title,'campaign',campaign,'launchDate',launch,'publishTime',at_time,
  'briefNote',coalesce(nullif(btrim(m.details),''),nullif(btrim(placement_note),''),p_note),'creative',p_creative);
end $function$

