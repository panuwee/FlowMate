import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";

// Existing releases use date + hash, sequence or a named change. Read the
// whole token, and compare each asset across pages; do not pin an old date.
export const CACHE_TOKEN_PATTERN = /^\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ENTRY_PAGES = ["index.html", "home/index.html", "product-book/index.html"];
export function entryAssetVersion(html: string, asset: string): string {
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => new URL(match[1], "https://flowmate.test/"))
    .filter(url => url.pathname.split("/").at(-1) === asset);
  expect(references, `${asset}: exactly one reference`).toHaveLength(1);
  const version = references[0].searchParams.get("v") || "";
  expect(version, `${asset}: complete cache token`).toMatch(CACHE_TOKEN_PATTERN);
  return version;
}
export function assertEntryCacheContract() {
  const stampSource = readFileSync(resolve(process.cwd(), "scripts/release-stamp.cjs"), "utf8");
  const manifest = stampSource.match(/const VERSIONED_ASSETS = \[([\s\S]*?)\];/);
  expect(manifest, "release asset manifest").not.toBeNull();
  const assets = [...manifest![1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  expect(assets).toContain("app.js");
  expect(assets).toContain("screens-task-assign.js");
  const entries = ENTRY_PAGES.map(page => readFileSync(resolve(process.cwd(), page), "utf8"));
  for (const asset of [...assets, "search-utils.js"]) {
    const versions = entries.map(html => entryAssetVersion(html, asset));
    expect(new Set(versions).size, `${asset}: same token on all entry pages`).toBe(1);
  }
}
