-- REVIEW ONLY: production apply requires explicit approval.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = public, pg_catalog;
DO $patch$
DECLARE wanted record; actual record;
BEGIN
  FOR wanted IN SELECT * FROM jsonb_to_recordset($baseline$[{"cmd":"DELETE","qual":"(is_active_app_user() AND (EXISTS ( SELECT 1\n   FROM marketing_content_items mci\n  WHERE ((mci.id = marketing_channel_placements.content_item_id) AND (is_admin_app_user() OR (mci.pic_user_id = auth.uid()) OR (mci.sub_pic_user_id = auth.uid()))))))","roles":["public"],"tablename":"marketing_channel_placements","permissive":"PERMISSIVE","policyname":"pic or sub pic can delete marketing channel placements","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(is_active_app_user() AND (EXISTS ( SELECT 1\n   FROM marketing_content_items mci\n  WHERE ((mci.id = marketing_channel_placements.content_item_id) AND (is_admin_app_user() OR (mci.pic_user_id = auth.uid()) OR (mci.sub_pic_user_id = auth.uid()))))))","roles":["public"],"tablename":"marketing_channel_placements","permissive":"PERMISSIVE","policyname":"pic or sub pic can update marketing channel placements","schemaname":"public","with_check":"is_active_app_user()"},{"cmd":"DELETE","qual":"(is_active_app_user() AND (is_admin_app_user() OR (pic_user_id = auth.uid()) OR (sub_pic_user_id = auth.uid())))","roles":["public"],"tablename":"marketing_content_items","permissive":"PERMISSIVE","policyname":"pic or sub pic can delete marketing content items","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(is_active_app_user() AND (is_admin_app_user() OR (pic_user_id = auth.uid()) OR (sub_pic_user_id = auth.uid())))","roles":["public"],"tablename":"marketing_content_items","permissive":"PERMISSIVE","policyname":"pic or sub pic can update marketing content items","schemaname":"public","with_check":"is_active_app_user()"}]$baseline$::jsonb)
 AS x(tablename text, policyname text, cmd text, roles text[], permissive text, qual text, with_check text) LOOP
    SELECT * INTO actual FROM pg_policies WHERE schemaname='public'
      AND tablename=wanted.tablename AND policyname=wanted.policyname;
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing policy: %', wanted.policyname; END IF;
    IF actual.cmd IS DISTINCT FROM wanted.cmd OR actual.roles::text[] IS DISTINCT FROM wanted.roles
      OR actual.permissive IS DISTINCT FROM wanted.permissive
      OR actual.with_check IS DISTINCT FROM wanted.with_check
      OR actual.qual IS DISTINCT FROM wanted.qual THEN
      RAISE EXCEPTION 'Policy drift; stop and review: %', wanted.policyname;
    END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', wanted.policyname, wanted.tablename,
      replace(wanted.qual, 'auth.uid()', '(select auth.uid())'));
  END LOOP;
END
$patch$;
COMMIT;
