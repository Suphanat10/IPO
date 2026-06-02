-- =====================================================
-- Add new columns to ipos table for upcoming IPO data
-- =====================================================

ALTER TABLE ipos
  ADD COLUMN IF NOT EXISTS par_value            NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS company_name_th      TEXT,
  ADD COLUMN IF NOT EXISTS business_description TEXT,
  ADD COLUMN IF NOT EXISTS filing_status        TEXT;
