-- Per-section human verification for an IPO's admin data.
--
-- Each key is a form section (identity / fa / day1 / post_ipo / financials);
-- the value records whether a human has verified that section and when, e.g.
--   { "identity": { "verified": true, "at": "2026-06-05T03:00:00.000Z" } }
-- An absent key means the section has not been verified yet. This lets the
-- admin console mark each section of a stock as checked independently instead
-- of resolving the whole record at once.

ALTER TABLE ipos
  ADD COLUMN IF NOT EXISTS verified_sections jsonb NOT NULL DEFAULT '{}'::jsonb;
