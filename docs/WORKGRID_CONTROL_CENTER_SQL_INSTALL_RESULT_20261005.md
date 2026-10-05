# Workgrid Control Center v0.6 — SQL installed, sending disabled

5 October 2026 · Tenant `workgrid-test` / `jbavahimqjalvcfawgqw`.

## Authorization and applied scope

User explicitly approved **อนุมัติติดตั้ง SQL แบบปิดส่ง** for the two reviewed installers, followed by read-only verification. Applied sequentially using Supabase migrations; both returned success.

| Migration | Reviewed source | SHA-256 |
| --- | --- | --- |
| workgrid_control_center_v06_disabled | supabase/workgrid_control_center.sql | ea040a8d18d7f3e9f78b96e4b8f3b281744c3954329eaf9e8eb90a0839525508 |
| workgrid_control_center_v06_inactive_adapters | supabase/workgrid_control_center_adapters.sql | eff29ac979e29715a3b1f65b50bc8a0f2df7d5046e4b6f13dd2bfb5dadf5ca28 |

Approved file hashes rechecked before execution. No changes to those SQL files were required during application.

## Verified after installation

| Check | Result |
| --- | --- |
| runtime_enabled | false |
| Creative / FlowMate Bot | both draft |
| Enabled rules | 0 |
| Profiles / deliveries / ownership | 0 / 0 / 0 |
| Private tables | all 11 have RLS; anon/authenticated lack direct SELECT and INSERT/UPDATE/DELETE privileges |
| Public WCC RPC ACL | anon denied; UI RPCs authenticated only; worker RPCs service_role only |
| Private helper function ACL | anon/authenticated/service_role direct execute denied |
| Function search_path | explicitly empty for WCC functions |
| WCC triggers | six installed/enabled: work observer, Creative legacy guard, Activity bridge, manifest capture, two cutover guards |
| Legacy route table integrity | MD5 `5710838378c76bcb70c5de2290ab215a`, identical before/after |
| Schedulers | all five job IDs/names/schedules/active states identical before/after; no WCC job created |
| Native Activity settings | enabled / notifier_enabled / scheduler_enabled remain true |

Native Creative/Activity pending and in-flight counts were zero before installation. This is a snapshot, not a persistent drain guarantee or cutover authorization.

Installed trigger observers can record future work events/manifests, but sending remains disabled and ownership is empty. Existing outputs were not backfilled. Native notification paths remain responsible for existing recipients.

## Tenant role checks

Ran explicit `BEGIN READ ONLY`, `SET LOCAL ROLE`, transaction-local JWT claim settings, assertion blocks and rollback. No role grants, reviewer assignments, profiles, tasks or deliveries were created for these checks.

- Panu under authenticated role: `wcc_access()` true; workspace reports Admin and runtime false. Direct private-table reads and server RPC calls denied.
- Folk under authenticated role with no reviewer designation: access false; workspace and runtime impact denied.
- anon: workspace/access RPC calls denied.
- service_role: read-only server context available; browser workspace RPC denied.

These are SQL role/claim simulations against the installed tenant, not real browser login or end-to-end UAT. No designated leads exist yet; lead-specific behavior remains covered by offline tests until a lead is selected and configured.

## Not applied / remaining

No Edge Function deployment, UI publication, commit/push, secret changes, WCC scheduler creation, recipient activation, legacy ownership cutover, TEST message or actual Review/Assign canary. All existing checkouts retained; no worktree created or removed.

Next phase: Panu configures approved server credentials, confirm the canonical HTTPS Workgrid URL, then explicitly authorize deployment of the new worker and scoped UI. Verify actual authenticated UI and connections before requesting approval for TEST to Folk GroupID `Njk2MTczMDEwNTg2` and Pond direct chat. Runtime must remain off through those preparation steps.

Earlier local evidence: 72 tests, worker TypeScript check and release manifest hashes. Those do not prove live provider delivery. See [Preflight](WORKGRID_CONTROL_CENTER_PRODUCTION_PREFLIGHT_20261005.md) and [Local handoff](WORKGRID_CONTROL_CENTER_LOCAL_HANDOFF_20261005.md).
