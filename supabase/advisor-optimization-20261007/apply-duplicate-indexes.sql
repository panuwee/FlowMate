-- REVIEW ONLY. Explicit production approval required. No CASCADE.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $patch$
DECLARE pair record; dropped record; kept record; drop_oid oid; keep_oid oid;
BEGIN
  FOR pair IN SELECT * FROM (VALUES
    ('public','idx_assignment_runs_item_ran','idx_assignment_runs_work_item'),
    ('private','creative_seatalk_thread_group_thread_key','creative_seatalk_threads_group_id_thread_id_key')
  ) AS pairs(schema_name, drop_name, keep_name) LOOP
    drop_oid := to_regclass(format('%I.%I',pair.schema_name,pair.drop_name));
    keep_oid := to_regclass(format('%I.%I',pair.schema_name,pair.keep_name));
    IF drop_oid IS NULL OR keep_oid IS NULL THEN RAISE EXCEPTION 'Index missing; review %',pair; END IF;
    SELECT * INTO STRICT dropped FROM pg_index WHERE indexrelid=drop_oid;
    SELECT * INTO STRICT kept FROM pg_index WHERE indexrelid=keep_oid;
    IF NOT dropped.indisvalid OR NOT kept.indisvalid OR NOT dropped.indisready OR NOT kept.indisready
      OR dropped.indisprimary OR dropped.indisreplident OR dropped.indisclustered
      OR (SELECT relam FROM pg_class WHERE oid=drop_oid) IS DISTINCT FROM (SELECT relam FROM pg_class WHERE oid=keep_oid)
      OR ROW(dropped.indrelid,dropped.indnatts,dropped.indnkeyatts,dropped.indisunique,dropped.indnullsnotdistinct,
             dropped.indkey::text,dropped.indclass::text,dropped.indcollation::text,dropped.indoption::text,
             dropped.indexprs::text,dropped.indpred::text)
        IS DISTINCT FROM
         ROW(kept.indrelid,kept.indnatts,kept.indnkeyatts,kept.indisunique,kept.indnullsnotdistinct,
             kept.indkey::text,kept.indclass::text,kept.indcollation::text,kept.indoption::text,
             kept.indexprs::text,kept.indpred::text)
      OR EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=drop_oid)
      OR EXISTS(SELECT 1 FROM pg_depend WHERE refclassid='pg_class'::regclass AND refobjid=drop_oid)
    THEN RAISE EXCEPTION 'Index differs or has dependencies; stop: %',pair.drop_name; END IF;
    EXECUTE format('DROP INDEX %I.%I',pair.schema_name,pair.drop_name);
  END LOOP;
END
$patch$;
COMMIT;
