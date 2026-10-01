-- Isolated test schema additions only. Never apply to a real database.
create role service_role;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
alter table public.work_items add column work_type text,add column requester_team text,add column owning_team_code text;
alter table public.marketing_content_items add column flowmate_work_item_id uuid;
create table battle_pass_private.brief_bindings(brief_id uuid);
