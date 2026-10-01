# Activity Monitor workspace release — 1 Oct 2026

Monitor now shows shared scanner coverage separately from Battle Pass, separates complete outputs from newly created outputs, and defaults history to significant events. Waiting scans remain available under the scan filter. Golden Spin projects stay separate; the old Battle Pass console is available under Tools.

Incident review supports acknowledgment, resolution with matching output evidence, and archiving with an append-only audit. These actions do not confirm briefs, assign work, retry runners, or send notifications. Unbound incidents and uncertain notification delivery cannot be resolved using an unrelated complete output.

## Release scope

Three Monitor assets, one additive SQL delta, four tests, and three isolated SQL fixtures required by the tests. The fixtures are test data only and must never be applied to production. No Edge Functions or cron changes.

## Validation

- Release assembled from GitHub version2.1.1 commit `20e523199a3dd1564409d3c9f2df69ba31969e0a`.
- Release worktree: 94/94 tests passed using PGlite and Happy DOM.
- Earlier local broader suite: 132/132 passed.
- `npm run build:github`: passed, all generated assets unchanged.
- SQL delta applied successfully to the linked production project.
- Authenticated read-only RPC verification: both scanners fresh; shared scanner observed four families; five supported activity families.
- Golden Spin No.7 current output resolves to CR-1307. Historical held incident remains for Operations review.
- Unbound Battle Pass incident has no current output evidence.
- Anonymous action execution and authenticated private-schema access denied; review and audit tables have RLS enabled.
- Real incidents were not acknowledged, resolved, or archived during deployment.

Asset stamp: `20261001-workspace-v1`. Browser and Pages publication evidence is recorded in the local production result report after push.
