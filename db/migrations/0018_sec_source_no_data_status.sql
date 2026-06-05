-- =====================================================
-- Add 'no_data' to the sec_source_files status domain.
-- Run with: psql "$DATABASE_URL" -f db/migrations/0018_sec_source_no_data_status.sql
--
-- 'no_data' marks downloaded files we couldn't extract any numeric financial
-- field from (e.g. prose offering docs that aren't a financial statement).
-- They stay recorded for traceability but are excluded from the review queue,
-- so reviewers only see files that actually have values to approve/edit.
-- =====================================================

ALTER TABLE sec_source_files
  DROP CONSTRAINT IF EXISTS sec_source_files_status_check;

ALTER TABLE sec_source_files
  ADD CONSTRAINT sec_source_files_status_check
  CHECK (status IN ('imported','needs_review','unchanged','no_data','error'));
