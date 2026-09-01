#!/usr/bin/env node
/*
 * Generates one deterministic cache/version stamp for the files already
 * staged for a commit. The stamp uses Bangkok's calendar date plus a content
 * fingerprint, so retrying the same commit keeps the same visible version.
 */
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENTRY_PAGES = ["index.html", "home/index.html", "product-book/index.html"];
const VERSIONED_ASSETS = ["app.css", "ot-request-domain.js", "supabase-ot-request.js", "screens-ot.js", "app.js"];
const EXCLUDED_FROM_FINGERPRINT = ENTRY_PAGES.map(file => `:(exclude)${file}`);

function getBangkokDateStamp() {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${fields.year}${fields.month}${fields.day}`;
}

function getStagedFingerprint() {
  const diff = execFileSync("git", ["diff", "--cached", "--binary", "--", ".", ...EXCLUDED_FROM_FINGERPRINT], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return crypto.createHash("sha256").update(diff || "release-only").digest("hex").slice(0, 6);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const stamp = process.env.FLOWMATE_RELEASE_STAMP || `${getBangkokDateStamp()}-${getStagedFingerprint()}`;
let changed = 0;
for (const entry of ENTRY_PAGES) {
  const target = path.join(ROOT, entry);
  const source = fs.readFileSync(target, "utf8");
  let next = source;
  for (const asset of VERSIONED_ASSETS) {
    next = next.replace(new RegExp(`(${escapeRegExp(asset)})\\?v=[^"']+`, "g"), `$1?v=${stamp}`);
  }
  if (next !== source) {
    fs.writeFileSync(target, next, "utf8");
    changed += 1;
  }
}

console.log(`FlowMate release stamp v${stamp} ${changed ? `updated ${changed} entry page(s)` : "already synchronized"}.`);
