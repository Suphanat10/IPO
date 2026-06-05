-- =====================================================
-- SEC source-file review / approval workflow + import gating
-- Run with: psql "$DATABASE_URL" -f db/migrations/0017_sec_review_workflow.sql
--
-- Extends sec_source_files so the manual-review dashboard can Approve /
-- Reject / Edit each extracted file, and so the pipeline can record which
-- rows were imported into ipo_financials (auto when format/validation pass,
-- or after a human approves). No raw bytes are stored — content_sha256 +
-- source_url + trans_file_seq already give per-download versioning and traceability.
-- =====================================================

ALTER TABLE sec_source_files
  -- approved | rejected | edited  (NULL = not yet reviewed by a human)
  ADD COLUMN IF NOT EXISTS review_action TEXT
    CHECK (review_action IS NULL OR review_action IN ('approved','rejected','edited')),
  -- The field set that was actually imported (may differ from extracted_fields
  -- when a reviewer edits values before approving). Kept for audit.
  ADD COLUMN IF NOT EXISTS final_fields  JSONB,
  -- Whether the extracted values reached ipo_financials, and when.
  ADD COLUMN IF NOT EXISTS imported      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imported_at   TIMESTAMPTZ,
  -- How the import was authorized: 'auto' (format + validation passed) or 'manual'.
  ADD COLUMN IF NOT EXISTS import_method TEXT
    CHECK (import_method IS NULL OR import_method IN ('auto','manual'));

CREATE INDEX IF NOT EXISTS sec_source_files_imported_idx
  ON sec_source_files (imported, detected_at DESC);
