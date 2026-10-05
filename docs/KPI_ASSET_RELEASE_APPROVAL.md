# KPI asset links — production release approval package

Prepared 2026-10-05, Asia/Bangkok. Status: awaiting explicit production SQL and publication authorization.

Release stamp: **20261005-74c906**. Base and fresh GitHub `version2.1.1`: `8c1f62984a8f78ebd6afcce77766891e4f70bb5e`.
File hashes: `docs/KPI_ASSET_RELEASE_MANIFEST.json`.

## Production preflight (read-only)

Project: `jbavahimqjalvcfawgqw`.

- Both Asset Due fields exist as dates on `work_items`.
- `work_item_links.link_kind` and `link_request_key` do not exist; typed-link RPC is not installed.
- Original `add_work_item_link(text,text,text)` returns the inserted link ID and collaboration event ID. Its event contains action, URL, actor and link ID required by the new wrapper.
- Canonical read, collaboration and KPI gate functions exist with the expected signatures.
- Link/event tables have RLS enabled. Authenticated has no direct INSERT/UPDATE privileges.
- Existing viewer and team guards remain attached. Notifications run on INSERT; enriching the event metadata by UPDATE does not trigger those INSERT notifications again.
- Fresh GitHub HEAD and release branch match the local package base. No branch switch, commit, push or merge performed.

## Proposed SQL action

Rehearse and apply `supabase/creative_link_asset_evidence.sql` on the named production project after approval. Adds two columns, valid-kind constraint, retry-key unique index, a private checked writer and authenticated public invoker RPC. Keeps original RPC, RLS and workflow completion rules. Captures server time/actor; no historical classification, fabricated scores or automatic Delivered transition.

Verify installed schema, function ACLs, guards and transactional retry/permission behavior. No persistent synthetic work/link records or notifications are part of this approval request. Real-user evidence-write E2E remains a separate verification claim.

## Proposed frontend publication

After SQL verification, create a scoped commit, push to GitHub `version2.1.1`, allow its existing Pages deployment, and verify live assets against the manifest plus the rendered KPI/Link Zone UI. Recheck the remote immediately before push; preserve any newer work.

Includes typed Add Link, C01 first draft submission vs Asset First Draft Due, C02 final asset submission vs Asset Final/Approved Due, C03 removal, English KPI copy and removed explanatory blocks. C04 completion remains Delivered.

Exclude standalone synthetic preview and unrelated `output/campaign-planner/`. Retain the worktree after release; cleanup is not requested.

## Evidence and limits

Previously verified 74 Node tests + 12 Vitest tests. After stamping, 27 KPI workspace tests passed again. Build, strict TypeScript and rendered local UI were verified. The preceding broad legacy UAT run had two outdated navigation-string failures; they are documented and not repaired in this change.

Until users submit real typed links, C01/C02 can legitimately remain No Data. Due dates are current Asset Due values; edits can change results after refresh. A frontend rollback keeps additive storage and evidence intact; destructive database rollback is outside this package.
