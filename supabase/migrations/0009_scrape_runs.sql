-- ================================================================
-- Track upcoming-IPO scrape runs + per-IPO results & diffs
-- ================================================================

CREATE TABLE IF NOT EXISTS scrape_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL DEFAULT 'set_api_scraper',
  status          TEXT NOT NULL DEFAULT 'running',  -- running | success | failed | partial
  triggered_by    TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,
  total_fetched   INTEGER DEFAULT 0,
  inserted_count  INTEGER DEFAULT 0,
  updated_count   INTEGER DEFAULT 0,
  unchanged_count INTEGER DEFAULT 0,
  failed_count    INTEGER DEFAULT 0,
  error_message   TEXT,
  log_excerpt     TEXT,
  raw_payload     JSONB
);

CREATE INDEX IF NOT EXISTS scrape_runs_started_at_idx
  ON scrape_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS scrape_run_items (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  ipo_id        BIGINT REFERENCES ipos(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,        -- inserted | updated | unchanged | failed
  diff          JSONB,                -- { field: { before, after } }
  scraped_data  JSONB,                -- raw scraped row
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scrape_run_items_run_idx
  ON scrape_run_items (run_id);

CREATE INDEX IF NOT EXISTS scrape_run_items_symbol_idx
  ON scrape_run_items (symbol);
