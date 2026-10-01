-- Synthetic production-mode records, local PGlite only.
insert into activity_automation_private.production_runs
 (id,activity,project_code,period,source_hash,stage,hold_reason,lease_token,lease_expires_at,source_model,source_validated_at,
 google_checkpoint,slide_id,slide_revision,google_verified_at,completed_at,created_at,updated_at)
values
 ('a0000000-0000-4000-8000-000000000001','membership','MEM-OCT','2026-10',repeat('a',64),'complete',null,null,null,
 '{"source":{"startDate":"2026-10-09","endDate":"2026-10-31","workingSheetUrl":"https://docs.google.com/spreadsheets/d/source_oct/edit"},"private":"DO_NOT_EXPOSE"}',
 '2026-09-22T01:00Z','{"productionContext":"DO_NOT_EXPOSE","built":{"private":"DO_NOT_EXPOSE"}}',
 'prod_slide','private_revision','2026-09-22T01:05Z','2026-09-22T01:06Z','2026-09-22T01:00Z','2026-09-22T01:06Z'),
 ('a0000000-0000-4000-8000-000000000002','golden_spin','GOLD-OCT','2026-10',repeat('b',64),'generation_pending',null,
 'e0000000-0000-4000-8000-000000000002',current_timestamp-interval '1 minute','{"private":"DO_NOT_EXPOSE"}',
 '2026-09-22T01:00Z','{"copyIntent":true,"productionContext":"DO_NOT_EXPOSE"}',null,null,null,null,'2026-09-22T01:00Z','2026-09-22T01:06Z'),
 ('a0000000-0000-4000-8000-000000000003','topup_promotion','TOP-OCT','2026-10',repeat('c',64),'generation_pending',null,
 'e0000000-0000-4000-8000-000000000003',current_timestamp+interval '1 hour','{}','2026-09-22T01:00Z',
 '{"populateIntent":true,"copyId":"private_copy_id","built":{"private":"DO_NOT_EXPOSE"}}',null,null,null,null,'2026-09-22T01:00Z','2026-09-22T01:06Z'),
 ('a0000000-0000-4000-8000-000000000004','conqueror_crate','CC-OCT','2026-10',repeat('d',64),'held','loot_not_confirmed',null,null,
 '{}','2026-09-22T01:00Z','{}',null,null,null,null,'2026-09-22T01:00Z','2026-09-22T01:06Z');
insert into public.work_items(id,display_id,status) values('b0000000-0000-4000-8000-000000000001','CR-2001','unassigned');
insert into public.marketing_content_items(id,flowmate_work_item_id) values('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001');
insert into public.creative_request_details values('b0000000-0000-4000-8000-000000000001','https://docs.google.com/presentation/d/prod_slide/edit');
insert into public.creative_kpi_brief_evidence values(100,'b0000000-0000-4000-8000-000000000001','submitted',null,'https://docs.google.com/presentation/d/prod_slide/edit');
insert into activity_automation_private.production_output_bindings(run_id,slide_id,slide_revision,work_item_id,content_item_id)
 values('a0000000-0000-4000-8000-000000000001','prod_slide','private_revision','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001');
insert into activity_automation_private.production_notification_outbox
 (id,run_id,event_kind,recipient_kind,payload,status,attempt_count,error_code,created_at,updated_at)
values
 ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','brief_ready','group','{"secret":"DO_NOT_EXPOSE"}','pending',0,null,'2026-09-22T01:06Z','2026-09-22T01:06Z'),
 ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000004','run_held','user','{"recipient":"DO_NOT_EXPOSE"}','uncertain',1,'send_unknown','2026-09-22T01:06Z','2026-09-22T01:06Z');
