-- =============================================================================
-- Pulse Journal — Dragon migration 05: import hashes v2 + deleted-row memory.
-- Additive and idempotent. Apply through DATABASE_URL as one pool.query(wholeFile).
-- =============================================================================

-- The import hash is now built from parsed numbers (a re-saved export still
-- matches). scripts/dragon-rehash.mjs moves each row's old raw-text hash here
-- before writing the new one, so the change can be undone (--revert).
ALTER TABLE dragon_transactions ADD COLUMN IF NOT EXISTS import_hash_v1 TEXT;

-- Import hashes of rows the user deleted, so a re-import can say "you deleted
-- this before" instead of quietly bringing it back.
CREATE TABLE IF NOT EXISTS dragon_deleted_imports (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_hash TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, import_hash)
);
ALTER TABLE dragon_deleted_imports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "dragon_deleted_imports_all" ON dragon_deleted_imports FOR ALL
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON dragon_deleted_imports FROM anon, authenticated;
