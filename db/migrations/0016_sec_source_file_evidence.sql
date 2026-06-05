-- =====================================================
-- Add field-level parser evidence to SEC source-file review
-- Run with: psql "$DATABASE_URL" -f db/migrations/0016_sec_source_file_evidence.sql
-- =====================================================

ALTER TABLE sec_source_files
  ADD COLUMN IF NOT EXISTS extracted_evidence JSONB;
