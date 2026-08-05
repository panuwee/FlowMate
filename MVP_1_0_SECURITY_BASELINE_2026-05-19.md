# FlowMate MVP 1.0 Security Baseline

Date: 2026-05-19
Project: FlowMate MVP 1.0
Deploy target: https://panuwee.github.io/FlowMate/

## Result

MVP 1.0 security baseline passed for pilot readiness.

## Verified Checks

- Google Workspace login works for allowed users.
- Supabase SQL was run in the required order for MVP 1.0.
- Creative Request creation works.
- Assignment Engine works.
- Permission / RLS checks work.
- B-003 actor spoof risk is closed:
  - Sending `p_actor_user_id` for another active user returns HTTP 400.
  - Expected error: `Actor mismatch: request actor does not match authenticated user`.
  - No spoofed quick task is created.
- B-006 RLS null bypass is closed:
  - Signed-out / incognito query to `work_items` returns `data: []`.
  - No real work item rows are visible without an authenticated session.

## Test Evidence

- Automated tests: `33/33 passed`
- Manual B-003 test: passed on 2026-05-19
- Manual B-006 test: passed on 2026-05-19

## Notes For MVP 1.1

- Keep RPC actor handling based on `auth.uid()`.
- Do not reintroduce `or public.current_app_user_id() is null` in RLS policies.
- Future cleanup can remove `p_actor_user_id` from RPC signatures and frontend calls entirely.
