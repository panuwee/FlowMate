import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Campaign creation authorization (isolated Postgres)", () => {
  it("creates for active roles, rejects inactive/anonymous users and protects existing campaigns", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create schema flowmate_members_private;
        create function flowmate_members_private.guard_viewer_write() returns trigger
        language plpgsql security definer set search_path = '' as $$begin
          if exists(select 1 from public.users where id=auth.uid() and role='viewer') then
            raise exception 'Viewer access is read-only' using errcode='42501'; end if;
          return null;
        end$$;
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('test.actor', true), '')::uuid
        $$;
        create table public.users(id uuid primary key, is_active boolean, role text);
        insert into public.users values
          ('00000000-0000-0000-0000-000000000001', true, 'admin'),
          ('00000000-0000-0000-0000-000000000002', true, 'member'),
          ('00000000-0000-0000-0000-000000000003', true, 'viewer'),
          ('00000000-0000-0000-0000-000000000004', false, 'member');
        create function public.is_active_app_user() returns boolean language sql stable security definer as $$
          select exists(select 1 from public.users where id = auth.uid() and is_active)
        $$;
        create function public.is_admin_app_user() returns boolean language sql stable security definer as $$
          select exists(select 1 from public.users where id = auth.uid() and is_active and role='admin')
        $$;
        create function public.marketing_normalize_campaign_tag_name(text) returns text language sql immutable as $$select lower(btrim($1))$$;
        create table public.marketing_campaign_functions(code text primary key, active boolean);
        insert into public.marketing_campaign_functions values ('marketing', true), ('inactive', false);
        create table public.marketing_campaign_tags(
          id uuid primary key default gen_random_uuid(), name text not null,
          normalized_name text generated always as (public.marketing_normalize_campaign_tag_name(name)) stored unique,
          function_code text references public.marketing_campaign_functions(code),
          created_by_user_id uuid references public.users(id), updated_by_user_id uuid references public.users(id),
          archived_at timestamptz, updated_at timestamptz default now()
        );
        create table public.marketing_campaigns(campaign_tag_id uuid, name text);
        grant usage on schema public, auth to authenticated;
        grant select on public.marketing_campaign_tags to authenticated;
      `);
      const catalog = readFileSync("supabase/workflow_mvp_catalogs.sql", "utf8");
      await db.exec(catalog.slice(catalog.indexOf("create or replace function public.marketing_upsert_campaign_tag("), catalog.indexOf("create or replace function public.marketing_archive_campaign_tag(")));
      const planner = readFileSync("supabase/marketing_campaign_planner.sql", "utf8");
      await db.exec(planner.slice(planner.indexOf("create or replace function public.marketing_campaign_planner_can_manage()"), planner.indexOf("-- One row per content item")));
      await db.exec(`
        create trigger flowmate_viewer_write_guard before insert or update or delete or truncate
        on public.marketing_campaign_tags for each statement execute function flowmate_members_private.guard_viewer_write();
        create trigger flowmate_viewer_write_guard before insert or update or delete or truncate
        on public.marketing_campaign_planner_details for each statement execute function flowmate_members_private.guard_viewer_write();
        create table public.other_module(id int);
        grant insert on public.other_module to authenticated;
        create trigger flowmate_viewer_write_guard before insert or update or delete or truncate
        on public.other_module for each statement execute function flowmate_members_private.guard_viewer_write();
      `);
      await db.exec(readFileSync("supabase/marketing_campaign_planner_create_access.sql", "utf8"));
      const actor = async (n: number | null) => {
        await db.exec("reset role");
        await db.query("select set_config('test.actor', $1, false)", [n ? `00000000-0000-0000-0000-00000000000${n}` : ""]);
        await db.exec("set role authenticated");
      };
      const create = (name: string, fn = "marketing", start: string | null = null, end: string | null = null) =>
        db.query<{ id: string }>("select public.marketing_campaign_planner_create($1,$2,'tagline',$3::date,$4::date) as id", [name, fn, start, end]);
      for (const n of [1, 2, 3]) {
        await actor(n);
        expect((await db.query<{ allowed: boolean }>("select public.marketing_campaign_planner_can_create() as allowed")).rows[0].allowed).toBe(true);
        await create(`Role ${n} [Oct-2026]`);
      }
      for (const n of [4, null]) {
        await actor(n);
        await expect(create("Blocked [Oct-2026]")).rejects.toThrow("Active sign-in is required");
      }
      await actor(3);
      await expect(create("Role 2 [Oct-2026]")).rejects.toThrow("already exists");
      await expect(create("Missing suffix")).rejects.toThrow("Summer Sale");
      await expect(create("Inactive function [Oct-2026]", "inactive")).rejects.toThrow("inactive campaign function");
      await expect(create("Invalid dates [Oct-2026]", "marketing", "2026-10-05", "2026-10-01")).rejects.toThrow("planner_date_order");
      await expect(create("Missing end [Oct-2026]", "marketing", "2026-10-05")).rejects.toThrow("planner_date_pair");
      await expect(db.query("select public.marketing_campaign_planner_create('Long tagline [Oct-2026]','marketing',repeat('x',301),null,null)")).rejects.toThrow();
      await expect(db.query("select public.marketing_campaign_planner_save(id,'Changed [Oct-2026]','marketing','',null,null,updated_at) from public.marketing_campaign_tags limit 1")).rejects.toThrow("Only Admin");
      await expect(db.query("select public.marketing_upsert_campaign_tag(id,'Changed [Oct-2026]','marketing') from public.marketing_campaign_tags limit 1")).rejects.toThrow("Viewer access is read-only");
      await expect(db.query("update public.marketing_campaign_planner_details set tagline='changed'")).rejects.toThrow("Viewer access is read-only");
      await expect(db.query("insert into public.other_module values(1)")).rejects.toThrow("Viewer access is read-only");
      // Member UPDATE remains filtered out by RLS.
      await actor(2);
      expect((await db.query("update public.marketing_campaign_planner_details set tagline='changed'")).affectedRows).toBe(0);
      await expect(db.query("select public.marketing_upsert_campaign_tag(id,'Changed [Oct-2026]','marketing') from public.marketing_campaign_tags limit 1")).rejects.toThrow("Only Admin");
      await db.exec("reset role");
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.marketing_campaign_tags")).rows[0].count).toBe(3);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.marketing_campaign_planner_details")).rows[0].count).toBe(3);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.marketing_campaign_planner_details where tagline='tagline'")).rows[0].count).toBe(3);
      await db.exec("set role anon");
      await expect(create("Anonymous [Oct-2026]")).rejects.toThrow("permission denied");
    } finally { await db.close(); }
  }, 30000);
});
