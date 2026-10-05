# Link Zone asset evidence — local design

Engineering Design Opening Prompt: act as a Staff Frontend Engineer designing a small FlowMate form change for requesters, GD/VE owners and supervisors. Capture the deliverable stage and server time during normal work. Preserve existing typography, surface tokens, spacing, responsive form grid and keyboard focus. Add a labelled type selector before URL with General / 1st Draft / Final Asset. Show stage labels on saved links, saving feedback, and a clear schema-unavailable error. Never infer stage from a URL/description or silently drop a selected stage. Never infer work acceptance from the label before the business rule is approved.

Confirmed scope: local implementation and tests, then a reviewable release package. No production SQL, commit/push or deployment.

Keep the original add-link RPC and RLS. Typed asset submission additionally requires the receiver or authorized supervisor with existing collaboration authority. Keep proof in server-created work_item_events even if the visible link is soft removed. Use request-key idempotency.

Confirmed: Final Asset is submission for acceptance only. Adding it does not complete the work. Completion requires Approved Delivered or a status transition to Delivered. Preserve those existing workflow endpoints for completion KPI. Keep the Link type selector without helper text underneath, as requested.

Updated KPI rule: C01 uses the first typed 1st Draft link event against work_items.due_date (Asset First Draft Due). C02 uses the first typed Final Asset link event against work_items.final_approved_due_date (Asset Final/Approved Due). C03 is removed. Adding Final Asset does not complete work; Delivered remains separate. No stage is inferred from historical untyped links.
