import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("Product Book Mini CMS", () => {
  const sql = read("supabase", "product_book_cms.sql");
  const app = read("app.jsx");
  const client = read("supabase-product-book.js");
  const css = read("app.css");
  const docs = read("docs", "PRODUCT_BOOK_MINI_CMS.md");
  const entryPaths = [
    ["index.html"],
    ["home", "index.html"],
    ["product-book", "index.html"],
  ];

  it("keeps patch identity separate from draft and published revisions", () => {
    expect(sql).toContain("create table if not exists public.product_book_patches");
    expect(sql).toContain("create table if not exists public.product_book_patch_revisions");
    expect(sql).toContain("where status = 'draft'");
    expect(sql).toContain("where status = 'published'");
    expect(sql).toContain("set status = 'superseded'");
    expect(sql).toContain("set status = 'published'");
  });

  it("enforces active Ops-or-Admin publishing on the backend from auth.uid", () => {
    expect(sql).toContain("create or replace function public.product_book_can_publish()");
    expect(sql).toContain("where u.id = auth.uid()");
    expect(sql).toContain("from public.user_team_memberships membership");
    expect(sql).toContain("u.role = 'admin'");
    expect(sql).toContain("lower(trim(membership.team_code)) = 'ops'");
    expect(sql).toContain("Only active Team Ops users or Admins can publish Product Book");
    expect(sql).not.toMatch(/p_actor(_user)?_id/i);
    expect(sql).not.toMatch(/\b(Panu|Gear|Mac)\b/i);
  });

  it("keeps table writes RPC-only and grants only authenticated RPC execution", () => {
    expect(sql).toContain("alter table public.product_book_patches enable row level security");
    expect(sql).toContain("alter table public.product_book_patch_revisions enable row level security");
    expect(sql).toContain("revoke all on table public.product_book_patches from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.product_book_patch_revisions from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.product_book_save_draft(jsonb) to authenticated");
    expect(sql).toContain("grant execute on function public.product_book_publish(text) to authenticated");
  });

  it("keeps published revisions in history and blocks duplicate normalized IDs and broken Thai text", () => {
    expect(sql).toContain("normalized_patch_code text generated always as (lower(trim(patch_code))) stored");
    expect(sql).toContain("product_book_patches_normalized_code_uidx");
    expect(sql).toContain("create or replace function public.product_book_list_revisions(p_patch_code text)");
    expect(sql).toContain("revision.status in ('published', 'superseded')");
    expect(sql).toContain("create or replace function public.product_book_contains_mojibake");
    expect(sql).toContain("for v_code in 128..159 loop");
    expect(sql).toContain("Publishing blocked: broken Thai encoding was detected");
    expect(app).toContain("function productBookHasMojibake(value)");
    expect(app).toContain("The current version remains available in Version History.");
  });

  it("loads CMS data with a static published fallback on every Product Book entry", () => {
    for (const path of entryPaths) {
      const html = read(...path);
      expect(html).toContain('supabase-product-book.js?v=20260803-5');
      expect(html).toContain('app.js?v=20260807-01');
      expect(html.indexOf("supabase-product-book.js")).toBeLessThan(html.indexOf("app.js"));
    }
    expect(app).toContain("getProductBookStaticPublishedPatches");
    expect(app).toContain("Showing the static published fallback");
    expect(app).toContain("window.loadProductBookPatches");
  });

  it("shows management to Ops and Admins and supports the no-approval workflow", () => {
    expect(app).toContain("function isProductBookOpsUser(user)");
    expect(app).toContain('currentUser.role === "admin"');
    expect(app).toContain('normalizeFlowMateTeamKey(value) === "ops"');
    expect(app).toContain('"Manage Product Book"');
    expect(app).toContain('"Save draft"');
    expect(app).toContain('"Publish"');
    expect(app).toContain('"Duplicate latest"');
    expect(app).toContain('}, "Edit")');
    expect(app).toContain("Version History");
    expect(app).toContain("const PRODUCT_BOOK_TAG_ALIASES");
    expect(app).toContain("const PRODUCT_BOOK_PATCH_TAG_ALIASES");
    expect(app).toContain('"MS26.08"');
    expect(app).toContain('qol: ["key highlight 3"]');
    expect(app).toContain("searchTerms.map(term => candidates.find");
    expect(app).toContain("function getProductBookKeyHighlightTags(markdown)");
    expect(app).toContain('"Generate Tags"');
    expect(app).toContain("Tags generated from Key Highlight headings.");
    expect(app).toContain('qol: ["quality of life", "ui/ux"]');
    expect(app).not.toContain("preferredExists || preferred");
    expect(app).not.toContain("Approve Product Book");
    expect(app).toContain("The current Published page is unchanged.");
  });

  it("exposes the expected Supabase client contract", async () => {
    const calls: Array<{ name: string; params: unknown }> = [];
    const context = {
      window: {
        flowmateSupabase: {
          rpc: async (name: string, params: unknown) => {
            calls.push({ name, params });
            return { data: name === "product_book_list_patches" ? [{ id: "MS26.08" }] : { ok: true }, error: null };
          },
        },
      },
    };
    vm.runInNewContext(client, context);
    const rows = await (context.window as any).loadProductBookPatches({ includeDrafts: true, includeArchived: true });
    expect(rows).toEqual([{ id: "MS26.08" }]);
    expect(calls[0]).toEqual({
      name: "product_book_list_patches",
      params: { p_include_drafts: true, p_include_archived: true },
    });
    await (context.window as any).loadProductBookPatchRevisions("MS26.08");
    expect(calls[1]).toEqual({
      name: "product_book_list_revisions",
      params: { p_patch_code: "MS26.08" },
    });
  });

  it("documents Markdown, SQL mode, roles, and archive behavior", () => {
    expect(docs).toContain("# Product Book Mini CMS");
    expect(docs).toContain("Run without RLS");
    expect(docs).toContain("ทีม Ops ที่ Active");
    expect(docs).toContain("ไม่มีขั้น Approve");
    expect(docs).toContain("Static fallback");
    expect(docs).toContain("Archive");
  });

  it("preserves the Product Book sticky regression guard and responsive CMS layout", () => {
    expect(css).toContain(".product-book-cms__layout");
    expect(css).toContain("grid-template-columns: 260px minmax(0, 1fr)");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).not.toContain("box-shadow: 0 -28px");
    expect(css).toContain(".app__main--product-book {\n  padding: 0 var(--s-6) var(--s-7);");
  });

  it("removes native patch-button rectangles while preserving the active left indicator", () => {
    expect(app).toContain('className: `nav-item product-book-patch-nav ${mode === "view"');
    const patchNavCss = css.slice(
      css.indexOf(".product-book-patch-nav {"),
      css.indexOf("}", css.indexOf(".product-book-patch-nav {")) + 1,
    );

    expect(patchNavCss).toContain("width: 100%");
    expect(patchNavCss).toContain("border-top: 0");
    expect(patchNavCss).toContain("border-right: 0");
    expect(patchNavCss).toContain("border-bottom: 0");
    expect(patchNavCss).toContain("background: transparent");
    expect(patchNavCss).toContain("font: inherit");
    expect(patchNavCss).toContain("text-align: left");
    expect(patchNavCss).not.toContain("border-left: 0");
    expect(css).toContain(".nav-item.is-active");
    expect(css).toContain("border-left-color: var(--garena-red)");
  });
});
