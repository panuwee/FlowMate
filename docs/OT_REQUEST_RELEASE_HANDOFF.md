# OT Request Release Handoff

## Local verification

- Focused regression verification: `npm.cmd test -- src/lib/ot-request.uat.test.ts src/lib/workflow-mvp.uat.test.ts src/lib/product-book-cms.uat.test.ts src/lib/flowmate-board-integration.uat.test.ts` passed 67/67 tests across 4 files.
- Full automated verification: `npm.cmd test` passed 492/492 tests across 16 files.
- Next production build: `npm.cmd run build` completed successfully and generated all 4 static pages.
- Static release generation: the first `npm.cmd run build:github` updated only `screens-ot.js` and `app.js`; both the immediate second run and the final rerun reported `No output changed.`
- Secret scan: `npx.cmd secretlint "**/*"` exited successfully with no finding output.
- Whitespace check: `git diff --check` passed with no whitespace errors.
- Release tokens: `app.css`, `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.js`, and `app.js` use `20260807-02` on `index.html`, `home/index.html`, and `product-book/index.html`. Unrelated asset tokens were not changed.
- Accessibility/static assertions cover labelled ProductSwitch grouping, alert/status announcements, polite live updates, action descriptions, current-page state, visible keyboard focus, responsive OT table containment, and the existing dark-theme token surface.
- Scope expansion: release-token-only expectations were mechanically updated in `src/lib/workflow-mvp.uat.test.ts`, `src/lib/product-book-cms.uat.test.ts`, and `src/lib/flowmate-board-integration.uat.test.ts`. Task 8 accessibility behavior required `screens-ot.jsx` and its generated `screens-ot.js`. No other product files were added to the approved scope.

### Browser QA boundary

- Local server: `local-server.cjs` served `http://127.0.0.1:4193/` with HTTP 200. Its directory handling returned HTTP 404 for `/home/`; it requires the explicit `/home/index.html` file locally even though production hosting is expected to resolve the `/home` directory entry.
- Browser setup selected the Codex in-app Browser and loaded its local-development, screenshot, and viewport guidance. The first bounded workflow intended to inspect the root DOM and console produced no result and was manually aborted after 388.7 seconds.
- One permitted recovery check then returned `Browser is not available` for the selected Browser binding. Browser work stopped at that point; no alternative browser was substituted.
- Requested routes were not rendered and remain unverified: `/home`, `/#ot-request`, `/#ot-request/my-requests`, `/#ot-request/manager`, and `/#ot-request/root-causes`.
- Requested viewports were not applied and remain unverified: desktop 1440x1000 and mobile 390x844, in both light and dark themes.
- Screenshot evidence paths: none. No screenshot was produced before the Browser became unavailable.
- Console, page identity, nonblank content, overlays, keyboard interaction, responsive visual layout, product switching, and deep-link interaction remain unverified in a rendered browser.
- No working signed-in local OT harness was found or used. Employee privacy/data, request warning and consent flows, actual confirmation, assigned-manager grouping, root-cause data, OT Owner navigation, compliance review, export, and data-backed empty/error/loading states remain unverified. No auth identity, role, live Supabase response, or production state was fabricated.

## Production steps not performed locally

1. Back up Supabase.
2. Run `supabase/ot_request.sql` using Run without RLS.
3. Run `supabase/ot_request_verify.sql` and confirm every expected count/invariant.
4. Upload exactly these non-entry frontend runtime/source files through the approved manual GitHub web UI workflow: `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.jsx`, `screens-ot.js`, `app.jsx`, `app.js`, `app.css`, and `build-github.cjs`. Tests and this handoff are repository verification evidence, not deployed runtime files.
5. Upload `index.html`, `home/index.html`, and `product-book/index.html` last so no entry page requests the new release token before its runtime files exist.
6. Hard-refresh and run production smoke tests with employee, assigned approver, OT Owner, and HR/Admin accounts. Cover the five routes above at desktop and mobile sizes, light and dark themes, keyboard focus, loading/error/empty states, consent and actual confirmation, manager Function grouping, root-cause copy, compliance review, and export behavior.

## Rollback boundary

- Frontend rollback: restore the previous runtime/source files and all three entry pages together. Restore the entry pages last so they always point to an available runtime set.
- Database rollback: do not drop, truncate, overwrite, or delete OT history. Deactivate the OT module and revoke OT RPC execution pending a reviewed rollback migration.

No production SQL, deployment, GitHub upload, payroll integration, or live role verification was performed locally.
