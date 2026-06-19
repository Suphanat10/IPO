-- =====================================================
-- Widen NUMERIC columns to prevent "numeric field overflow"
-- The original NUMERIC(8,4) percent columns only accept up to 9999.9999.
-- Bump every numeric column to a much wider type so any reasonable input fits.
-- Existing data is preserved (NUMERIC widening is lossless).
--
-- Postgres won't ALTER a column that a VIEW depends on, so we drop the
-- dependent views (CASCADE) first, alter the columns, then rebuild the views.
-- =====================================================

-- 1. Drop dependent views (CASCADE walks the dependency tree)
DROP VIEW IF EXISTS v_ipo_missing_fields CASCADE;
DROP VIEW IF EXISTS v_upcoming_ipos       CASCADE;
DROP VIEW IF EXISTS v_dashboard_stats     CASCADE;
DROP VIEW IF EXISTS v_ipo_completeness    CASCADE;
-- These two stats views (added in 0005) also read ipos.close_d1/ipo_price, so
-- they block the ALTER below too. They are unused by the app and get dropped
-- permanently in 0012/0020, so we drop without rebuilding.
DROP VIEW IF EXISTS v_underwriter_stats   CASCADE;
DROP VIEW IF EXISTS v_fa_company_stats    CASCADE;

-- 2. Widen ipo_financials columns
ALTER TABLE ipo_financials
  ALTER COLUMN gross_proceeds      TYPE NUMERIC(24, 4),
  ALTER COLUMN total_expense       TYPE NUMERIC(24, 4),
  ALTER COLUMN offered_ratio_pct   TYPE NUMERIC(20, 6),
  ALTER COLUMN existing_shares_pct TYPE NUMERIC(20, 6),
  ALTER COLUMN executive_total_pct TYPE NUMERIC(20, 6),
  ALTER COLUMN total_assets        TYPE NUMERIC(24, 4),
  ALTER COLUMN total_liabilities   TYPE NUMERIC(24, 4),
  ALTER COLUMN total_equity        TYPE NUMERIC(24, 4),
  ALTER COLUMN revenue_latest      TYPE NUMERIC(24, 4),
  ALTER COLUMN revenue_prev        TYPE NUMERIC(24, 4),
  ALTER COLUMN net_income_latest   TYPE NUMERIC(24, 4),
  ALTER COLUMN net_income_prev     TYPE NUMERIC(24, 4);

-- 3. Widen ipos columns (prices)
ALTER TABLE ipos
  ALTER COLUMN ipo_price TYPE NUMERIC(18, 4),
  ALTER COLUMN open_d1   TYPE NUMERIC(18, 4),
  ALTER COLUMN high_d1   TYPE NUMERIC(18, 4),
  ALTER COLUMN low_d1    TYPE NUMERIC(18, 4),
  ALTER COLUMN close_d1  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_d2  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_d3  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_d4  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_d5  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_1w  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_1m  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_3m  TYPE NUMERIC(18, 4),
  ALTER COLUMN close_6m  TYPE NUMERIC(18, 4);

-- 4. Rebuild views (copied verbatim from 0002_views.sql + 0005_underwriters_fa_companies.sql)
CREATE OR REPLACE VIEW v_ipo_completeness AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  i.market,
  i.industry,
  i.sector,
  i.status,
  i.listing_date,
  i.updated_at,
  (i.listing_date          IS NOT NULL)::int AS has_listing_date,
  (i.ipo_price             IS NOT NULL)::int AS has_ipo_price,
  (i.close_d1              IS NOT NULL)::int AS has_close_d1,
  ((i.fa_companies IS NOT NULL AND array_length(i.fa_companies,1) > 0))::int AS has_fa,
  ((i.lead_uw      IS NOT NULL AND array_length(i.lead_uw,1)      > 0))::int AS has_lead_uw,
  (f.offered_ratio_pct     IS NOT NULL)::int AS has_offered_ratio,
  (f.existing_shares_pct   IS NOT NULL)::int AS has_existing,
  (f.executive_total_pct   IS NOT NULL)::int AS has_exec,
  (f.total_equity          IS NOT NULL)::int AS has_equity,
  (f.net_income_latest     IS NOT NULL)::int AS has_net_income,
  ROUND(100.0 * (
    (i.listing_date IS NOT NULL)::int +
    (i.ipo_price    IS NOT NULL)::int +
    (i.close_d1     IS NOT NULL)::int +
    ((i.fa_companies IS NOT NULL AND array_length(i.fa_companies,1) > 0))::int +
    ((i.lead_uw      IS NOT NULL AND array_length(i.lead_uw,1)      > 0))::int +
    (f.offered_ratio_pct   IS NOT NULL)::int +
    (f.existing_shares_pct IS NOT NULL)::int +
    (f.executive_total_pct IS NOT NULL)::int +
    (f.total_equity        IS NOT NULL)::int +
    (f.net_income_latest   IS NOT NULL)::int
  ) / 10.0, 1) AS completeness_pct
FROM ipos i
LEFT JOIN ipo_financials f ON f.ipo_id = i.id;

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM ipos)                                    AS total_ipos,
  (SELECT COUNT(*) FROM ipos WHERE status = 'listed')            AS listed_count,
  (SELECT COUNT(*) FROM ipos WHERE status = 'upcoming')          AS upcoming_count,
  (SELECT COUNT(*) FROM ipos WHERE status = 'cancelled')         AS cancelled_count,
  (SELECT COUNT(*) FROM v_ipo_completeness
   WHERE completeness_pct = 100)                                 AS complete_count,
  (SELECT COUNT(*) FROM v_ipo_completeness
   WHERE completeness_pct < 100)                                 AS incomplete_count,
  (SELECT MAX(updated_at) FROM ipos)                             AS last_data_update,
  (SELECT MAX(finished_at) FROM build_runs WHERE status='success') AS last_build,
  (SELECT COUNT(*) FROM validation_results WHERE resolved=false AND severity='error')   AS error_count,
  (SELECT COUNT(*) FROM validation_results WHERE resolved=false AND severity='warning') AS warning_count,
  (SELECT COUNT(*) FROM validation_results WHERE resolved=false AND severity='info')    AS info_count;

CREATE OR REPLACE VIEW v_upcoming_ipos AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  i.market,
  i.industry,
  i.sector,
  i.listing_date,
  i.ipo_price,
  (i.listing_date - CURRENT_DATE) AS days_until,
  c.completeness_pct
FROM ipos i
LEFT JOIN v_ipo_completeness c ON c.id = i.id
WHERE i.status = 'upcoming'
ORDER BY i.listing_date ASC NULLS LAST;

CREATE OR REPLACE VIEW v_ipo_missing_fields AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  i.status,
  i.listing_date,
  i.updated_at,
  CASE WHEN i.listing_date IS NULL                  THEN 'listing_date'        END AS f_listing_date,
  CASE WHEN i.ipo_price    IS NULL                  THEN 'ipo_price'           END AS f_ipo_price,
  CASE WHEN i.close_d1     IS NULL                  THEN 'close_d1'            END AS f_close_d1,
  CASE WHEN i.fa_companies IS NULL
         OR array_length(i.fa_companies,1) IS NULL  THEN 'fa_companies'        END AS f_fa,
  CASE WHEN i.lead_uw      IS NULL
         OR array_length(i.lead_uw,1)      IS NULL  THEN 'lead_uw'             END AS f_lead_uw,
  CASE WHEN f.offered_ratio_pct   IS NULL           THEN 'offered_ratio_pct'   END AS f_offered_ratio,
  CASE WHEN f.existing_shares_pct IS NULL           THEN 'existing_shares_pct' END AS f_existing,
  CASE WHEN f.executive_total_pct IS NULL           THEN 'executive_total_pct' END AS f_exec,
  CASE WHEN f.total_equity        IS NULL           THEN 'total_equity'        END AS f_equity,
  CASE WHEN f.net_income_latest   IS NULL           THEN 'net_income_latest'   END AS f_net_income,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN i.listing_date IS NULL                THEN 'listing_date'        END,
    CASE WHEN i.ipo_price    IS NULL                THEN 'ipo_price'           END,
    CASE WHEN i.close_d1     IS NULL                THEN 'close_d1'            END,
    CASE WHEN i.fa_companies IS NULL
           OR array_length(i.fa_companies,1) IS NULL THEN 'fa_companies'       END,
    CASE WHEN i.lead_uw      IS NULL
           OR array_length(i.lead_uw,1)      IS NULL THEN 'lead_uw'            END,
    CASE WHEN f.offered_ratio_pct   IS NULL          THEN 'offered_ratio_pct'  END,
    CASE WHEN f.existing_shares_pct IS NULL          THEN 'existing_shares_pct' END,
    CASE WHEN f.executive_total_pct IS NULL          THEN 'executive_total_pct' END,
    CASE WHEN f.total_equity        IS NULL          THEN 'total_equity'       END,
    CASE WHEN f.net_income_latest   IS NULL          THEN 'net_income_latest'  END
  ], NULL) AS missing_fields,
  c.completeness_pct
FROM ipos i
LEFT JOIN ipo_financials f ON f.ipo_id = i.id
LEFT JOIN v_ipo_completeness c ON c.id = i.id;
