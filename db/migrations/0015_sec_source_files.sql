-- =====================================================
-- SEC source-file staging registry (metadata only)
-- Run with: psql "$DATABASE_URL" -f db/migrations/0015_sec_source_files.sql
--
-- Records every financial-statement file the scraper downloads from
-- ก.ล.ต. (market.sec.or.th). We do NOT persist the raw bytes — only
-- metadata: format/sheet inspection, new/changed detection, validation
-- outcome, and whether it was imported or quarantined for manual review.
-- =====================================================

CREATE TABLE IF NOT EXISTS sec_source_files (
  id                 BIGSERIAL PRIMARY KEY,
  run_id             UUID REFERENCES scrape_runs(id) ON DELETE SET NULL,
  symbol             TEXT NOT NULL,
  ipo_id             BIGINT REFERENCES ipos(id) ON DELETE SET NULL,

  -- Source identity / versioning
  sec_trans_id       TEXT,
  trans_file_seq     INT,                  -- version marker parsed from the URL
  source_url         TEXT,
  file_name          TEXT,
  file_kind          TEXT,                 -- xlsx | xlsx-in-zip | docx | unknown
  byte_size          INT,
  content_sha256     TEXT,                 -- detects changes even when seq is unchanged

  -- Format / column inspection
  sheet_names        TEXT[],
  recognized_sheets  TEXT[],
  unknown_sheets     TEXT[],
  format_ok          BOOLEAN,

  -- Extracted data + outcome
  extracted_fields   JSONB,
  extracted_evidence JSONB,               -- field -> source text / sheet / row / column
  data_status        TEXT,                 -- new | changed | unchanged
  validation_status  TEXT,                 -- passed | failed | skipped
  validation_messages TEXT[],
  status             TEXT NOT NULL
                     CHECK (status IN ('imported','needs_review','unchanged','error')),
  review_reason      TEXT,

  -- Review workflow (mirrors validation_results)
  resolved           BOOLEAN DEFAULT false,
  resolved_by        TEXT,
  resolved_at        TIMESTAMPTZ,
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sec_source_files_needs_review_idx
  ON sec_source_files (status) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS sec_source_files_symbol_idx
  ON sec_source_files (symbol);
CREATE INDEX IF NOT EXISTS sec_source_files_run_idx
  ON sec_source_files (run_id);
CREATE INDEX IF NOT EXISTS sec_source_files_trans_idx
  ON sec_source_files (sec_trans_id, detected_at DESC);
