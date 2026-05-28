-- =====================================================
-- IPO Admin Dashboard — Initial Schema
-- Run on Supabase via: supabase db push  OR  paste into SQL Editor
-- =====================================================

-- =====================================================
-- 1. Core IPO data
-- =====================================================
CREATE TABLE IF NOT EXISTS ipos (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL UNIQUE,
  company_name    TEXT,
  market          TEXT,
  industry        TEXT,
  sector          TEXT,
  status          TEXT NOT NULL DEFAULT 'listed'
                  CHECK (status IN ('upcoming','listed','cancelled')),
  listing_date    DATE,

  -- prices / returns
  ipo_price       NUMERIC(12,4),
  open_d1         NUMERIC(12,4),
  high_d1         NUMERIC(12,4),
  low_d1          NUMERIC(12,4),
  close_d1        NUMERIC(12,4),
  close_d2        NUMERIC(12,4),
  close_d3        NUMERIC(12,4),
  close_d4        NUMERIC(12,4),
  close_d5        NUMERIC(12,4),
  close_1w        NUMERIC(12,4),
  close_1m        NUMERIC(12,4),
  close_3m        NUMERIC(12,4),
  close_6m        NUMERIC(12,4),

  -- FA / Underwriter (Thai source strings; arrays for multi-value)
  fa_persons      TEXT[],
  fa_companies    TEXT[],
  lead_uw         TEXT[],
  co_uws          TEXT[],

  -- Metadata
  source          TEXT DEFAULT 'csv_import',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  updated_by      UUID
);

CREATE INDEX IF NOT EXISTS idx_ipos_status        ON ipos(status);
CREATE INDEX IF NOT EXISTS idx_ipos_listing_date  ON ipos(listing_date DESC);
CREATE INDEX IF NOT EXISTS idx_ipos_symbol_lower  ON ipos(LOWER(symbol));

-- =====================================================
-- 2. Financials (1-to-1 with ipos)
-- =====================================================
CREATE TABLE IF NOT EXISTS ipo_financials (
  ipo_id              BIGINT PRIMARY KEY REFERENCES ipos(id) ON DELETE CASCADE,
  gross_proceeds      NUMERIC(20,2),
  total_expense       NUMERIC(20,2),
  offered_shares      BIGINT,
  offered_ratio_pct   NUMERIC(8,4),
  existing_shares_pct NUMERIC(8,4),
  executive_total_pct NUMERIC(8,4),
  total_assets        NUMERIC(20,2),
  total_liabilities   NUMERIC(20,2),
  total_equity        NUMERIC(20,2),
  revenue_latest      NUMERIC(20,2),
  revenue_prev        NUMERIC(20,2),
  net_income_latest   NUMERIC(20,2),
  net_income_prev     NUMERIC(20,2),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 3. Reference tables
-- =====================================================
CREATE TABLE IF NOT EXISTS fa_normalizations (
  raw_name        TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sectors (
  symbol          TEXT PRIMARY KEY,
  market          TEXT,
  industry        TEXT,
  sector          TEXT
);

-- =====================================================
-- 4. Validation system
-- =====================================================
CREATE TABLE IF NOT EXISTS validation_rules (
  id              BIGSERIAL PRIMARY KEY,
  key             TEXT UNIQUE NOT NULL,
  description     TEXT NOT NULL,
  severity        TEXT NOT NULL
                  CHECK (severity IN ('error','warning','info')),
  scope           TEXT NOT NULL,
  active          BOOLEAN DEFAULT true,
  sql_check       TEXT
);

CREATE TABLE IF NOT EXISTS validation_results (
  id              BIGSERIAL PRIMARY KEY,
  ipo_id          BIGINT REFERENCES ipos(id) ON DELETE CASCADE,
  rule_key        TEXT REFERENCES validation_rules(key) ON DELETE CASCADE,
  severity        TEXT NOT NULL,
  message         TEXT,
  resolved        BOOLEAN DEFAULT false,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  detected_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ipo_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_validation_unresolved
  ON validation_results(severity) WHERE resolved = false;

-- =====================================================
-- 5. Build pipeline
-- =====================================================
CREATE TABLE IF NOT EXISTS build_runs (
  id              BIGSERIAL PRIMARY KEY,
  triggered_by    UUID,
  trigger_type    TEXT NOT NULL,
  status          TEXT NOT NULL
                  CHECK (status IN ('queued','running','success','failed')),
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INT,
  artifact_size   INT,
  artifact_sha    TEXT,
  git_commit      TEXT,
  error_message   TEXT,
  github_run_url  TEXT
);

CREATE INDEX IF NOT EXISTS idx_build_runs_started ON build_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS build_logs (
  id              BIGSERIAL PRIMARY KEY,
  run_id          BIGINT REFERENCES build_runs(id) ON DELETE CASCADE,
  ts              TIMESTAMPTZ DEFAULT now(),
  level           TEXT,
  message         TEXT
);

CREATE INDEX IF NOT EXISTS idx_build_logs_run ON build_logs(run_id, ts);

-- =====================================================
-- 6. Sync jobs
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_jobs (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,
  status          TEXT NOT NULL,
  rows_inserted   INT DEFAULT 0,
  rows_updated    INT DEFAULT 0,
  rows_skipped    INT DEFAULT 0,
  error_message   TEXT,
  ran_at          TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 7. Triggers
-- =====================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ipos_touch ON ipos;
CREATE TRIGGER trg_ipos_touch
  BEFORE UPDATE ON ipos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_ipo_fin_touch ON ipo_financials;
CREATE TRIGGER trg_ipo_fin_touch
  BEFORE UPDATE ON ipo_financials
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
