# Workgrid Control Center — Local implementation control plane v0.6

Spec: [v0.6](WORKGRID_CONTROL_CENTER_SPEC_20261005.md). Plan: [v0.6](WORKGRID_CONTROL_CENTER_IMPLEMENTATION_PLAN_20261005.md).

## Charter

Mode: Build, local only. The original v0.6 request authorized document delivery. After receiving the updated spec/plan and pilot decisions, the user said “ok please proceed next step” on 5 October 2026. This turn implements and verifies the local MVP. Production SQL, real provider messages, deployment, commit/push and cleanup remain separate gates.

Objective: configure Creative Assign/Review, Quick Task Assign and Activity notification destinations through an authenticated UI, with dynamic recipients, team-scoped proposals, auditable configuration and safe delivery.

Non-goals: AI write operations, module retirement, changing SeaTalk app lifecycle or group membership, and automatically authorizing production rollout.

## Baseline

- Canonical checkout retained at `C:/SeaTH/Projects/flowmate`, branch `version2.1`, HEAD `77136ab`; existing unrelated dirty changes preserved.
- Live read-only GitHub check: default `version2.1.1`, HEAD `5b75e061bfa4a7d7c21f1cc28eb740b741db5daa`; cached `github/version2.1.1` matches.
- Five checkouts registered including root. No new worktree, no cleanup. New components use separate files; integration changes are scoped additions.
- Existing Creative dispatcher accepts only assignment; Review is new implementation. Task Assign schema is available in its retained checkout; Activity has separate provider/outbox contracts.
- Supabase changelog and official RLS/functions docs checked before SQL authoring. No production database query/apply in this execution.

## Task matrix

| Task | Virtual workstream | Deliverable | Dependencies | Status |
| --- | --- | --- | --- | --- |
| P0 | Architecture/integration | baseline + contracts | none | local source reviewed; production baseline pending |
| P1 | UX/product | standalone admin page and offline demo | P0 | local demo verified |
| P2 | Backend/security | private configuration/proposals/audit RPCs | P0 | synthetic database tests passed |
| P3 | Integration | event-aware outbox + SeaTalk worker | P2 | synthetic adapter + mocked provider tests passed |
| P4 | UI | config forms, review/apply, delivery history | P1/P2 | local UI/build verified; deployed integration pending |
| P5 | QA | isolated SQL/domain/provider/browser checks | P3/P4 | local checks passed; full tenant migration/UAT pending |
| P6 | Release | approved live pilot and rollout | P5 + explicit approvals/tenant evidence | pending authorization |

Virtual workstreams describe responsibilities of this implementation; no new agents were spawned for this turn. Evidence below defines what is verified locally.

## Contracts and decision rules

- Latest pilot decisions: Pond Fulltime (already tested per user), Folk Freelance group `Njk2MTczMDEwNTg2`, Admin and Bot credential owner Panu. Marketing/eSports destinations will be entered later through UI; they do not block this pilot.
- Activity success requires the full expected output set for the run/version, plus existing readiness gates. Partial output never produces a success notification.
- Freelance messages are limited to notice of a new Task or a Task needing review; no task details, attachments or raw logs. Folk replaces Boss as the pilot; existing Boss/Tong routes are not changed by this document update.
- Native member identity and effective roles remain canonical; never infer lead rights from ordinary membership. Explicit Control Center reviewers must also retain active membership in their team.
- Configuration is revisioned and backend validated; provider verification is server-written evidence, never a browser checkbox.
- Review uses transition instance and actual requester, Assign actual assignee; no per-name source routing.
- New sending starts disabled. Feature cutover must not leave old and new senders owning the same event.
- No ordinary files/logs hold app secrets, access tokens or service-role keys.
- Test provider calls are mocked during local checks. Offline demo never invokes a production/provider endpoint.

## Verification log

| Check | Evidence | Scope |
| --- | --- | --- |
| Isolated tests | `node_modules/.bin/vitest.cmd run --config src/lib/control-center/vitest.config.mjs`: 61 passed, 4 files | 30 database, 8 legacy/Activity adapter, 17 mocked provider, 6 DOM UI cases; zero tenant/provider calls |
| Worker TypeScript | `tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --skipLibCheck supabase/functions/workgrid-control-center/index.ts`: passed | Compile check, not Deno deployment |
| Static browser build | `npm.cmd run build:github`: passed | Generated `workgrid-control-center.js` and additive app/Team Members navigation changes; unrelated files retained |
| Rendered browser | Offline demo loaded; Folk form → Review → Apply with synthetic ID `123`; updated version/value visible; error/warn console empty | Local synthetic data only; not real Folk identity or production integration |
| Mobile layout | 390px viewport; document/body width 375px, no horizontal document overflow | Responsive records inspected; viewport reset afterward |
| Provider contracts | Contacts uses `emails` array + active employee; group pagination; token expiry/cache; genuine mentions; partial-step persistence and uncertain results | Mocked tests, not tenant-ready claims |

The first staging-cutover test run exposed leaked enabled-rule state in the synthetic fixture. Resetting fixture rules/profiles between cases resolved it; the final isolated suite passed. Production preflight remains required.

Local sending defaults disabled. No production SQL application, deployment, actual TEST message, commit/push, branch switch or cleanup occurred. Existing checkouts are retained; no new worktree.

## Remaining release gates

- Revalidate the complete installed tenant schema/ACLs and native worker signatures against a fresh intended GitHub baseline. Synthetic fixtures do not prove production compatibility.
- Import and compare existing routes without sending; preserve Pond/Tong defaults. This import has not run and activation without the migration comparison is not approved.
- Provision secure Bot credential references by Panu, map actual Folk member/SeaTalk identity, and verify Folk/Operations groups with each correct Bot.
- Drain or explicitly coordinate legacy in-flight deliveries before ownership cutover. Local adapters preserve them; they cannot recall provider calls already made.
- Current Activity bundle contract is the native one-bundle-per-run finalizer (CR + Working Sheet + verified Slides + evidence + all planned channel placements). New multi-bundle producers need an explicit manifest adapter; no generic partial-success shortcut.
- Dedicated `activity.failed` producer is not exposed in UI; native held/source/scheduler events cover supported blockers. Do not advertise unsupported catalog entries as working events.
- Browser checks used offline data. Real authenticated UI-to-backend UAT, retention decision, authorized TEST messages, deployment and live verification remain P6 gates.

Setup, use and rollback: [Local handoff](WORKGRID_CONTROL_CENTER_LOCAL_HANDOFF_20261005.md).

## Production preflight / release preparation — 5 October 2026

- Read-only tenant discovery confirmed canonical Folk/Pond/Panu/Tong, prerequisite helper signatures/ACL metadata, native Activity finalizer/readiness contracts, outbox status constraints and existing active schedulers. No secret values or cron command bodies read.
- User supplied the full member roster and Folk SeaTalk ID `1353300313`; Folk pilot is explicitly Creative / Review in ops. Other missing bindings remain available for later UI entry; no automatic subscriptions or activation inferred.
- Fresh GitHub release SHA `4663e6f66b8dd72f7cf4e3b6cfe641b67d172459`; release advanced during preparation and overlay was refreshed, preserving released Task Assign sources/build entry and excluding unrelated root modifications.
- Read-only preflight SQL and repeatable local packaging script added. Release manifest records file hashes; review diffs are against the intended release, not dirty root HEAD.
- Focused native-contract offline rehearsal completed after preflight; live permissions/credentials/TEST remain pending; production readiness is not asserted. [Detailed report](WORKGRID_CONTROL_CENTER_PRODUCTION_PREFLIGHT_20261005.md).
- All five existing checkouts retained. No new worktree, commit, push, SQL apply, deployment, runtime/scheduler changes or actual messages.

## Focused native-contract rehearsal — 5 October 2026

72 tests passed: 30 DB / 18 adapter / 18 mocked provider / 6 UI. Replaced boolean readiness mock with live-read native SQL function definitions, using synthetic data and required dependency tables. Full tenant stack/finalizer/provider delivery was not executed.

Found and fixed a local adapter false negative when Working Sheet inheritance changes subtype/channels. New immutable activity_manifests are captured on native binding insertion in the finalization transaction; missing channel/changed counts or identities cancel success, and prior outputs without a manifest remain suppressed. Existing native readiness still applies at enqueue and immediately before send.

Added worker guard and regression test to reject missing Freelance/group destinations, even if a cached direct-chat employee identity exists. No DM fallback. Worker TypeScript check passed. Test snapshot definitions require statement terminators when combined; fixed the local snapshot format and reran the suite successfully.

Next approval scope is disabled SQL installation + read-only verification only. No implicit publication, deployment, actual messages or cutover.

## Approved SQL installation — 5 October 2026

User approved disabled installation; both installer and inactive adapters applied successfully in `jbavahimqjalvcfawgqw`. Runtime false, two Bots draft, enabled rules/profiles/deliveries/ownership zero. Eleven private tables RLS enabled; API/private helper ACLs verified. Read-only tenant role/claim checks passed for Panu Admin, Folk ordinary member, anon and service_role. No live browser UAT or lead designation inferred.

Legacy route table digest unchanged; all five cron job identities/schedules/active states unchanged; Activity generation/notifier/scheduler flags unchanged. No deployment, actual messages, credentials changes, WCC scheduler, commit/push or cleanup. See [Installation result](WORKGRID_CONTROL_CENTER_SQL_INSTALL_RESULT_20261005.md).

## Deployment preparation — 5 October 2026

Read only server secret names through the Supabase CLI; existing Creative/FlowMate credential names and shared URL name present. No values read/copied/changed. Added worker aliases restricted to the two known refs and exact matching server App IDs, with explicit dedicated WCC secret precedence. Added explicit deploy.ts Edge entrypoint and dedicated WCC_WORKGRID_BASE_URL preference. User confirmed https://panuwee.github.io/FlowMate/home/; server setting is pending deployment authorization.

79 tests passed / 4 files; entrypoint TypeScript check passed. Initial URL-precedence run exposed the generic synthetic env stub returning a fake value for every absent name; corrected the fixture to represent the absent dedicated URL, then the final full suite passed. All provider calls mocked; no deployment or real verification/message yet.

D1 review: new worker deployment + dedicated non-secret URL only, sending off, no UI publication/commit/push/scheduler/TEST. [Deployment review](WORKGRID_CONTROL_CENTER_DEPLOY_REVIEW_20261005.md). Existing worktrees retained.

## Approved worker deployment D1 — 5 October 2026

User explicitly approved D1. Dedicated WCC_WORKGRID_BASE_URL set to the confirmed home URL; only new workgrid-control-center Edge Function deployed (version 1, ACTIVE). Actual endpoint returned OPTIONS 204 and unauthenticated verify/dispatch POST 401. Runtime false, rules/ownership/deliveries zero, both Bots draft after deployment. No SeaTalk calls, messages, UI publication, commit/push, WCC scheduler or worktree changes. [Worker result](WORKGRID_CONTROL_CENTER_WORKER_DEPLOY_RESULT_20261005.md).

