-- =====================================================
-- Row Level Security
-- App uses Supabase Auth — admin-only access pattern
-- =====================================================

-- Helper: is current user admin?
-- Either custom JWT claim "role"='admin', or row in admin_users table.

CREATE TABLE IF NOT EXISTS admin_users (
  user_id    UUID PRIMARY KEY,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
      OR (auth.jwt() ->> 'role') = 'admin';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE ipos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_financials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_normalizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs           ENABLE ROW LEVEL SECURITY;

-- Drop + recreate policies (idempotent re-run)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ipos','ipo_financials','fa_normalizations','sectors',
    'validation_rules','validation_results',
    'build_runs','build_logs','audit_logs','sync_jobs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON %I', t);
    EXECUTE format($p$
      CREATE POLICY admin_all ON %I
      FOR ALL TO authenticated
      USING (is_admin())
      WITH CHECK (is_admin())
    $p$, t);
  END LOOP;
END $$;

-- Service role bypasses RLS automatically; no extra policy needed.
