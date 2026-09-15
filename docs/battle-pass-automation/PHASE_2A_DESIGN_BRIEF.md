# Phase 2A — Automation status and history

## Design opening prompt

Act as a senior product designer and frontend engineer for FlowMate, an internal campaign and creative workflow application. Design a read-only Battle Pass Automation status page for the Operations reviewer Aof and the account owner who connects Google. These users need to answer three practical questions without opening developer tools: is the system enabled, when did it last run, and what is it waiting for? Use the existing FlowMate blue, neutral slate text, pale grey background, white surfaces, and familiar system typography. Keep Thai text comfortably readable, with sufficient line spacing and clear focus indicators. Avoid decorative imagery, dense technical controls, or celebratory success treatment when only a scheduler dispatch succeeded.

Create a responsive page with a return link to FlowMate, a clear title, a short purpose statement, and a button labelled รีเฟรชสถานะ. State the time at which the server snapshot was read. Arrange three summary cards for effective automation enablement, the latest Worker outcome, and the latest recurring scheduler dispatch. Treat scheduler and Worker evidence as separate facts. A successful dispatch can coexist with a Worker waiting for confirmation or failing validation. Show unknown, absent, or stale evidence explicitly. Do not fabricate an upcoming successful execution or a completed brief.

Below the summary, show the latest production output sets by campaign month with verified-format links to Creative Request and Google Slides. Show review hold and release states accurately. Follow this with the latest fifty recorded invocations, a filter separating production from readiness checks, Thai-local timestamps, and expandable technical details containing Run ID, stage, and safe error code. Use text insertion and validated link construction instead of HTML from records. On mobile, stack summary cards and allow only the history table to scroll horizontally. Support loading, empty results, denied access, signed-out, and failed refresh states. Clear protected records on sign-out or access failure. Refresh reads the recorded snapshot; it never triggers a Worker, edits source data, changes a schedule, or grants access.

## Scope

- New standalone FlowMate page, linked from the app sidebar for the known owner/Aof identities and from Google connection page.
- Read-only RPC permits the active current Google connection owner or active Aof. UI visibility is convenience only; authorization is enforced in SQL.
- No changes to Worker, scheduler, source, Google files, assignment or notifications.
- October end-to-end acceptance remains outstanding from Phase 1B.
