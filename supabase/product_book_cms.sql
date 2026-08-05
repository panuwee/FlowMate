-- FlowMate Product Book Mini CMS
-- Version: 2026-08-03
--
-- Purpose
--   * Published Product Book pages remain visible while Ops edits a draft.
--   * Every active Ops user or Admin may save, publish, archive, and restore patches.
--   * Other active FlowMate users can read published, non-archived patches only.
--   * Browser writes are RPC-only and always resolve the actor from auth.uid().
--
-- Supabase SQL Editor: choose "Run without RLS". This script enables and
-- configures RLS itself; do not use the editor's automatic RLS option.

begin;

do $block$
begin
  if to_regclass('public.users') is null
     or to_regclass('public.user_team_memberships') is null
     or to_regprocedure('public.is_active_app_user()') is null then
    raise exception
      'Product Book CMS requires users, user_team_memberships, and is_active_app_user(); run the FlowMate access/workspace SQL first';
  end if;
end
$block$;

create table if not exists public.product_book_patches (
  id uuid primary key default gen_random_uuid(),
  patch_code text not null,
  normalized_patch_code text generated always as (lower(trim(patch_code))) stored,
  product text not null default 'FC Online',
  milestone text not null default 'MS',
  release_year integer not null,
  release_month integer not null,
  created_by_user_id uuid not null references public.users(id) on update cascade on delete restrict,
  updated_by_user_id uuid not null references public.users(id) on update cascade on delete restrict,
  archived_at timestamptz,
  archived_by_user_id uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_book_patch_code_required check (length(trim(patch_code)) between 3 and 32),
  constraint product_book_patch_code_shape check (patch_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$'),
  constraint product_book_release_year_range check (release_year between 2020 and 2100),
  constraint product_book_release_month_range check (release_month between 1 and 12)
);

create unique index if not exists product_book_patches_normalized_code_uidx
on public.product_book_patches(normalized_patch_code);

create index if not exists product_book_patches_release_idx
on public.product_book_patches(release_year desc, release_month desc);

create index if not exists product_book_patches_active_idx
on public.product_book_patches(release_year desc, release_month desc)
where archived_at is null;

create table if not exists public.product_book_patch_revisions (
  id uuid primary key default gen_random_uuid(),
  patch_id uuid not null references public.product_book_patches(id) on update cascade on delete cascade,
  revision_number integer not null,
  status text not null default 'draft',
  title text not null default '',
  month_label text not null default '',
  audience text[] not null default array['Ops', 'Marketing', 'Esport']::text[],
  source_type text not null default 'manual-markdown',
  source_pdf_url text not null default '',
  summary_language text not null default 'th',
  tags text[] not null default '{}'::text[],
  top_updates_markdown text not null default '',
  content_markdown text not null default '',
  created_by_user_id uuid not null references public.users(id) on update cascade on delete restrict,
  updated_by_user_id uuid not null references public.users(id) on update cascade on delete restrict,
  published_by_user_id uuid references public.users(id) on update cascade on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_book_revision_number_positive check (revision_number > 0),
  constraint product_book_revision_status check (status in ('draft', 'published', 'superseded')),
  constraint product_book_revision_language_required check (length(trim(summary_language)) between 2 and 12),
  unique (patch_id, revision_number)
);

create unique index if not exists product_book_one_draft_revision_uidx
on public.product_book_patch_revisions(patch_id)
where status = 'draft';

create unique index if not exists product_book_one_published_revision_uidx
on public.product_book_patch_revisions(patch_id)
where status = 'published';

create index if not exists product_book_revision_patch_status_idx
on public.product_book_patch_revisions(patch_id, status, revision_number desc);

create or replace function public.product_book_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function public.product_book_set_updated_at()
from public, anon, authenticated;

drop trigger if exists product_book_patches_set_updated_at on public.product_book_patches;
create trigger product_book_patches_set_updated_at
before update on public.product_book_patches
for each row execute function public.product_book_set_updated_at();

drop trigger if exists product_book_revisions_set_updated_at on public.product_book_patch_revisions;
create trigger product_book_revisions_set_updated_at
before update on public.product_book_patch_revisions
for each row execute function public.product_book_set_updated_at();

create or replace function public.product_book_can_publish()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and (
        u.role = 'admin'
        or
        lower(regexp_replace(trim(coalesce(u.requester_team, '')), '[^a-zA-Z]', '', 'g'))
          in ('ops', 'operation', 'operations')
        or exists (
          select 1
          from public.user_team_memberships membership
          where membership.user_id = u.id
            and lower(trim(membership.team_code)) = 'ops'
        )
      )
  );
$function$;

revoke all on function public.product_book_can_publish()
from public, anon, authenticated;
grant execute on function public.product_book_can_publish()
to authenticated;

create or replace function public.product_book_contains_mojibake(p_value text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_code integer;
  v_value text := coalesce(p_value, '');
begin
  if position(chr(65533) in v_value) > 0
     or position('เน€' in v_value) > 0 then
    return true;
  end if;

  -- C1 control characters are a reliable marker in the broken UTF-8 strings
  -- previously found in the static monthly Product Book files.
  for v_code in 128..159 loop
    if position(chr(v_code) in v_value) > 0 then
      return true;
    end if;
  end loop;
  return false;
end
$function$;

revoke all on function public.product_book_contains_mojibake(text)
from public, anon, authenticated;

alter table public.product_book_patches enable row level security;
alter table public.product_book_patch_revisions enable row level security;

drop policy if exists "active users can read product book patch identities"
on public.product_book_patches;
create policy "active users can read product book patch identities"
on public.product_book_patches for select
using ((select public.is_active_app_user()));

drop policy if exists "active users can read allowed product book revisions"
on public.product_book_patch_revisions;
create policy "active users can read allowed product book revisions"
on public.product_book_patch_revisions for select
using (
  (select public.is_active_app_user())
  and (
    status = 'published'
    or (select public.product_book_can_publish())
  )
);

revoke all on table public.product_book_patches from public, anon, authenticated;
revoke all on table public.product_book_patch_revisions from public, anon, authenticated;

create or replace function public.product_book_list_patches(
  p_include_drafts boolean default false,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_is_publisher boolean := public.product_book_can_publish();
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_app_user() then
    raise exception 'Active FlowMate sign-in required';
  end if;

  select coalesce(jsonb_agg(row_payload order by release_year desc, release_month desc, patch_code desc), '[]'::jsonb)
  into v_result
  from (
    select
      p.release_year,
      p.release_month,
      p.patch_code,
      jsonb_build_object(
        'id', p.patch_code,
        'name', p.patch_code,
        'title', coalesce(chosen.title, ''),
        'product', p.product,
        'milestone', p.milestone,
        'year', p.release_year,
        'month', p.release_month,
        'monthLabel', coalesce(nullif(chosen.month_label, ''), to_char(make_date(p.release_year, p.release_month, 1), 'FMMonth YYYY')),
        'audience', coalesce(chosen.audience, '{}'::text[]),
        'status', chosen.status,
        'sourceType', coalesce(chosen.source_type, 'manual-markdown'),
        'sourcePdfUrl', coalesce(chosen.source_pdf_url, ''),
        'summaryLanguage', coalesce(chosen.summary_language, 'th'),
        'tags', coalesce(chosen.tags, '{}'::text[]),
        'topUpdatesMarkdown', coalesce(chosen.top_updates_markdown, ''),
        'contentMarkdown', coalesce(chosen.content_markdown, ''),
        'revisionNumber', chosen.revision_number,
        'hasDraft', draft_revision.id is not null,
        'hasPublished', published_revision.id is not null,
        'publishedAt', published_revision.published_at,
        'archivedAt', p.archived_at
      ) as row_payload
    from public.product_book_patches p
    left join public.product_book_patch_revisions draft_revision
      on draft_revision.patch_id = p.id and draft_revision.status = 'draft'
    left join public.product_book_patch_revisions published_revision
      on published_revision.patch_id = p.id and published_revision.status = 'published'
    cross join lateral (
      select revision.*
      from public.product_book_patch_revisions revision
      where revision.id = case
        when v_is_publisher and p_include_drafts and draft_revision.id is not null then draft_revision.id
        else published_revision.id
      end
    ) chosen
    where (p.archived_at is null or (v_is_publisher and p_include_archived))
      and (chosen.status = 'published' or (v_is_publisher and p_include_drafts))
  ) visible_rows;

  return v_result;
end
$function$;

create or replace function public.product_book_save_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_patch_code text := upper(trim(coalesce(p_payload->>'patchCode', p_payload->>'id', '')));
  v_title text := trim(coalesce(p_payload->>'title', ''));
  v_product text := trim(coalesce(p_payload->>'product', 'FC Online'));
  v_milestone text := upper(trim(coalesce(p_payload->>'milestone', 'MS')));
  v_year integer;
  v_month integer;
  v_patch public.product_book_patches%rowtype;
  v_revision public.product_book_patch_revisions%rowtype;
  v_revision_number integer;
  v_audience text[];
  v_tags text[];
begin
  if v_actor_id is null or not public.product_book_can_publish() then
    raise exception 'Only active Team Ops users or Admins can manage Product Book';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Product Book payload must be an object';
  end if;

  begin
    v_year := (p_payload->>'year')::integer;
    v_month := (p_payload->>'month')::integer;
  exception when others then
    raise exception 'Release year and month are required';
  end;

  if v_patch_code !~ '^[A-Z0-9][A-Z0-9._-]{2,31}$' then
    raise exception 'Patch ID must use 3-32 letters, numbers, dot, dash, or underscore';
  end if;
  if v_year not between 2020 and 2100 or v_month not between 1 and 12 then
    raise exception 'Release year or month is invalid';
  end if;
  if length(v_title) > 240 then
    raise exception 'Title must be 240 characters or fewer';
  end if;

  select * into v_patch
  from public.product_book_patches p
  where p.normalized_patch_code = lower(v_patch_code)
  for update;

  if found and v_patch.archived_at is not null then
    raise exception 'Restore this Product Book patch before editing it';
  end if;

  if not found then
    insert into public.product_book_patches (
      patch_code, product, milestone, release_year, release_month,
      created_by_user_id, updated_by_user_id
    ) values (
      v_patch_code, coalesce(nullif(v_product, ''), 'FC Online'), coalesce(nullif(v_milestone, ''), 'MS'),
      v_year, v_month, v_actor_id, v_actor_id
    ) returning * into v_patch;
  else
    update public.product_book_patches
    set patch_code = v_patch_code,
        product = coalesce(nullif(v_product, ''), product),
        milestone = coalesce(nullif(v_milestone, ''), milestone),
        release_year = v_year,
        release_month = v_month,
        updated_by_user_id = v_actor_id
    where id = v_patch.id
    returning * into v_patch;
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_revision_number
  from public.product_book_patch_revisions
  where patch_id = v_patch.id;

  select coalesce(array_agg(trim(value)) filter (where trim(value) <> ''), '{}'::text[])
  into v_audience
  from jsonb_array_elements_text(coalesce(p_payload->'audience', '[]'::jsonb)) value;

  select coalesce(array_agg(trim(value)) filter (where trim(value) <> ''), '{}'::text[])
  into v_tags
  from jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb)) value;

  select * into v_revision
  from public.product_book_patch_revisions revision
  where revision.patch_id = v_patch.id and revision.status = 'draft'
  for update;

  if not found then
    insert into public.product_book_patch_revisions (
      patch_id, revision_number, status, title, month_label, audience,
      source_type, source_pdf_url, summary_language, tags,
      top_updates_markdown, content_markdown,
      created_by_user_id, updated_by_user_id
    ) values (
      v_patch.id, v_revision_number, 'draft', v_title,
      trim(coalesce(p_payload->>'monthLabel', '')), v_audience,
      trim(coalesce(p_payload->>'sourceType', 'manual-markdown')),
      trim(coalesce(p_payload->>'sourcePdfUrl', '')),
      trim(coalesce(p_payload->>'summaryLanguage', 'th')), v_tags,
      coalesce(p_payload->>'topUpdatesMarkdown', ''),
      coalesce(p_payload->>'contentMarkdown', ''),
      v_actor_id, v_actor_id
    ) returning * into v_revision;
  else
    update public.product_book_patch_revisions
    set title = v_title,
        month_label = trim(coalesce(p_payload->>'monthLabel', '')),
        audience = v_audience,
        source_type = trim(coalesce(p_payload->>'sourceType', 'manual-markdown')),
        source_pdf_url = trim(coalesce(p_payload->>'sourcePdfUrl', '')),
        summary_language = trim(coalesce(p_payload->>'summaryLanguage', 'th')),
        tags = v_tags,
        top_updates_markdown = coalesce(p_payload->>'topUpdatesMarkdown', ''),
        content_markdown = coalesce(p_payload->>'contentMarkdown', ''),
        updated_by_user_id = v_actor_id
    where id = v_revision.id
    returning * into v_revision;
  end if;

  return jsonb_build_object(
    'patchCode', v_patch.patch_code,
    'revisionNumber', v_revision.revision_number,
    'status', v_revision.status,
    'savedAt', v_revision.updated_at
  );
end
$function$;

create or replace function public.product_book_publish(p_patch_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_patch public.product_book_patches%rowtype;
  v_draft public.product_book_patch_revisions%rowtype;
begin
  if v_actor_id is null or not public.product_book_can_publish() then
    raise exception 'Only active Team Ops users or Admins can publish Product Book';
  end if;

  select * into v_patch
  from public.product_book_patches p
  where p.normalized_patch_code = lower(trim(coalesce(p_patch_code, '')))
  for update;

  if not found then raise exception 'Product Book patch not found'; end if;
  if v_patch.archived_at is not null then raise exception 'Restore this Product Book patch before publishing it'; end if;

  select * into v_draft
  from public.product_book_patch_revisions revision
  where revision.patch_id = v_patch.id and revision.status = 'draft'
  for update;

  if not found then raise exception 'Save a draft before publishing'; end if;
  if length(trim(v_draft.title)) = 0 then raise exception 'Title is required before publishing'; end if;
  if length(trim(v_draft.top_updates_markdown || v_draft.content_markdown)) = 0 then
    raise exception 'Markdown content is required before publishing';
  end if;
  if length(trim(v_draft.source_pdf_url)) > 0
     and v_draft.source_pdf_url !~* '^https?://' then
    raise exception 'Source PDF URL must start with http:// or https://';
  end if;
  if public.product_book_contains_mojibake(v_draft.title)
     or public.product_book_contains_mojibake(v_draft.top_updates_markdown)
     or public.product_book_contains_mojibake(v_draft.content_markdown) then
    raise exception 'Publishing blocked: broken Thai encoding was detected. Replace the mojibake text and try again';
  end if;

  update public.product_book_patch_revisions
  set status = 'superseded', updated_by_user_id = v_actor_id
  where patch_id = v_patch.id and status = 'published';

  update public.product_book_patch_revisions
  set status = 'published',
      published_at = now(),
      published_by_user_id = v_actor_id,
      updated_by_user_id = v_actor_id
  where id = v_draft.id
  returning * into v_draft;

  update public.product_book_patches
  set updated_by_user_id = v_actor_id
  where id = v_patch.id;

  return jsonb_build_object(
    'patchCode', v_patch.patch_code,
    'revisionNumber', v_draft.revision_number,
    'status', v_draft.status,
    'publishedAt', v_draft.published_at
  );
end
$function$;

create or replace function public.product_book_list_revisions(p_patch_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_app_user() then
    raise exception 'Active FlowMate sign-in required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.patch_code,
    'name', p.patch_code,
    'title', revision.title,
    'product', p.product,
    'milestone', p.milestone,
    'year', p.release_year,
    'month', p.release_month,
    'monthLabel', coalesce(nullif(revision.month_label, ''), to_char(make_date(p.release_year, p.release_month, 1), 'FMMonth YYYY')),
    'audience', revision.audience,
    'status', revision.status,
    'sourceType', revision.source_type,
    'sourcePdfUrl', revision.source_pdf_url,
    'summaryLanguage', revision.summary_language,
    'tags', revision.tags,
    'topUpdatesMarkdown', revision.top_updates_markdown,
    'contentMarkdown', revision.content_markdown,
    'revisionNumber', revision.revision_number,
    'publishedAt', revision.published_at
  ) order by revision.revision_number desc), '[]'::jsonb)
  into v_result
  from public.product_book_patches p
  join public.product_book_patch_revisions revision on revision.patch_id = p.id
  where p.normalized_patch_code = lower(trim(coalesce(p_patch_code, '')))
    and p.archived_at is null
    and revision.status in ('published', 'superseded');

  return v_result;
end
$function$;

create or replace function public.product_book_archive(p_patch_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_patch public.product_book_patches%rowtype;
begin
  if v_actor_id is null or not public.product_book_can_publish() then
    raise exception 'Only active Team Ops users or Admins can archive Product Book';
  end if;
  update public.product_book_patches
  set archived_at = coalesce(archived_at, now()),
      archived_by_user_id = v_actor_id,
      updated_by_user_id = v_actor_id
  where normalized_patch_code = lower(trim(coalesce(p_patch_code, '')))
  returning * into v_patch;
  if not found then raise exception 'Product Book patch not found'; end if;
  return jsonb_build_object('patchCode', v_patch.patch_code, 'archivedAt', v_patch.archived_at);
end
$function$;

create or replace function public.product_book_restore(p_patch_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_patch public.product_book_patches%rowtype;
begin
  if v_actor_id is null or not public.product_book_can_publish() then
    raise exception 'Only active Team Ops users or Admins can restore Product Book';
  end if;
  update public.product_book_patches
  set archived_at = null,
      archived_by_user_id = null,
      updated_by_user_id = v_actor_id
  where normalized_patch_code = lower(trim(coalesce(p_patch_code, '')))
  returning * into v_patch;
  if not found then raise exception 'Product Book patch not found'; end if;
  return jsonb_build_object('patchCode', v_patch.patch_code, 'archivedAt', null);
end
$function$;

revoke all on function public.product_book_list_patches(boolean, boolean) from public, anon, authenticated;
revoke all on function public.product_book_save_draft(jsonb) from public, anon, authenticated;
revoke all on function public.product_book_publish(text) from public, anon, authenticated;
revoke all on function public.product_book_archive(text) from public, anon, authenticated;
revoke all on function public.product_book_restore(text) from public, anon, authenticated;
revoke all on function public.product_book_list_revisions(text) from public, anon, authenticated;

grant execute on function public.product_book_list_patches(boolean, boolean) to authenticated;
grant execute on function public.product_book_save_draft(jsonb) to authenticated;
grant execute on function public.product_book_publish(text) to authenticated;
grant execute on function public.product_book_archive(text) to authenticated;
grant execute on function public.product_book_restore(text) to authenticated;
grant execute on function public.product_book_list_revisions(text) to authenticated;

commit;

-- Structural verification after running in Supabase SQL Editor:
-- select
--   to_regclass('public.product_book_patches') as patches_table,
--   to_regclass('public.product_book_patch_revisions') as revisions_table,
--   to_regprocedure('public.product_book_list_patches(boolean,boolean)') as list_rpc,
--   to_regprocedure('public.product_book_save_draft(jsonb)') as save_rpc,
--   to_regprocedure('public.product_book_publish(text)') as publish_rpc;
--
-- SQL Editor does not carry the browser user's auth.uid(). Verify Team Ops
-- permission behavior from the signed-in FlowMate UI after deployment.
-- select public.product_book_list_patches(true, true) as ops_cms_product_book;
