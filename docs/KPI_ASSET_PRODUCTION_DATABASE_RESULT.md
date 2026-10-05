# KPI asset evidence — production database result

Applied 2026-10-05 after explicit user authorization for SQL installation and frontend release.

Project: `jbavahimqjalvcfawgqw`. Migration: **20261005064805 · creative_link_asset_evidence**.
Frontend release: **20261005-74c906**, publication pending at the time this document was committed.

Before installation, the exact SQL was rehearsed inside a rollback transaction on the real schema, using an authenticated role context. Assertions passed for first draft and final asset capture, stable retry ID/event, changed payload rejection, server actor/type metadata, unchanged work status, denied direct event UPDATE, retained proof after link soft removal and denied missing actor/anonymous execution. Both notifications and test rows remained transaction-local. Subsequent reads confirmed the temporary schema, links and events were rolled back.

Installation succeeded. Read-back verified both columns, private SECURITY DEFINER writer with empty search_path, public SECURITY INVOKER RPC, authenticated execute and denied anon execute. Both original tables still have RLS enabled and authenticated direct INSERT/UPDATE remains denied. All 332 existing links remain General; zero links were reclassified and zero rehearsal links persist.

This is database verification, not a real-user browser submission. No persistent synthetic evidence was created. C01/C02 remain No Data until real typed links are submitted.

The SQL file's initial local-review comment describes its original preparation state; this approved migration supersedes that state without changing the reviewed file contents or release hashes.
