-- security_migration_01.sql — additive and idempotent. Apply through DATABASE_URL
-- as one pool.query(wholeFile), not the Supabase SQL editor (see CLAUDE.md).

-- 1. Screenshots: the old read policy let ANY role (anon included) list every
--    user's folder in the bucket. The bucket is public, so the app's public URLs
--    keep working without a SELECT policy; listing is limited to your own folder.
DROP POLICY IF EXISTS "screenshots_read" ON storage.objects;
CREATE POLICY "screenshots_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Achievements: `key` was unique across ALL users, so the second user to open
--    Goals hit a duplicate-key error. Unique per user instead.
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS achievements_key_key;
DO $$ BEGIN
  ALTER TABLE achievements ADD CONSTRAINT achievements_user_key_key UNIQUE (user_id, key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
