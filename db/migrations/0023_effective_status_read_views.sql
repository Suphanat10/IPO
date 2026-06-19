-- Make read-facing views derive IPO status without mutating ipos.
-- This keeps GET requests read-only while past listing dates still appear as listed.

CREATE OR REPLACE VIEW v_ipo_completeness AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  i.market,
  i.industry,
  i.sector,
  CASE
    WHEN i.status = 'cancelled' THEN 'cancelled'
    WHEN i.listing_date IS NOT NULL
      AND i.listing_date <= ((now() AT TIME ZONE 'Asia/Bangkok')::date) THEN 'listed'
    WHEN i.status = 'listed' THEN 'listed'
    ELSE 'upcoming'
  END AS status,
  i.listing_date,
  i.updated_at,
  (i.listing_date          IS NOT NULL)::int                  AS has_listing_date,
  (i.ipo_price             IS NOT NULL)::int                  AS has_ipo_price,
  (i.market IS NOT NULL AND i.market <> '')::int              AS has_market,
  (i.sector IS NOT NULL AND i.sector <> '')::int              AS has_sector,
  ((i.fa_companies IS NOT NULL AND array_length(i.fa_companies,1) > 0))::int AS has_fa,
  ((i.lead_uw      IS NOT NULL AND array_length(i.lead_uw,1)      > 0))::int AS has_lead_uw,
  (i.close_d1              IS NOT NULL)::int                  AS has_close_d1,
  (f.gross_proceeds        IS NOT NULL)::int                  AS has_gross_proceeds,
  (f.total_expense         IS NOT NULL)::int                  AS has_total_expense,
  (f.offered_shares        IS NOT NULL)::int                  AS has_offered_shares,
  (f.offered_ratio_pct     IS NOT NULL)::int                  AS has_offered_ratio,
  (f.existing_shares_pct   IS NOT NULL)::int                  AS has_existing,
  (f.executive_total_pct   IS NOT NULL)::int                  AS has_exec,
  (f.total_assets          IS NOT NULL)::int                  AS has_total_assets,
  (f.total_liabilities     IS NOT NULL)::int                  AS has_total_liabilities,
  (f.total_equity          IS NOT NULL)::int                  AS has_equity,
  (f.revenue_latest        IS NOT NULL)::int                  AS has_revenue_latest,
  (f.net_income_latest     IS NOT NULL)::int                  AS has_net_income,
  ROUND(100.0 * (
    (i.listing_date          IS NOT NULL)::int +
    (i.ipo_price             IS NOT NULL)::int +
    (i.market IS NOT NULL AND i.market <> '')::int +
    (i.sector IS NOT NULL AND i.sector <> '')::int +
    ((i.fa_companies IS NOT NULL AND array_length(i.fa_companies,1) > 0))::int +
    ((i.lead_uw      IS NOT NULL AND array_length(i.lead_uw,1)      > 0))::int +
    (i.close_d1              IS NOT NULL)::int +
    (f.gross_proceeds        IS NOT NULL)::int +
    (f.total_expense         IS NOT NULL)::int +
    (f.offered_shares        IS NOT NULL)::int +
    (f.offered_ratio_pct     IS NOT NULL)::int +
    (f.existing_shares_pct   IS NOT NULL)::int +
    (f.executive_total_pct   IS NOT NULL)::int +
    (f.total_assets          IS NOT NULL)::int +
    (f.total_liabilities     IS NOT NULL)::int +
    (f.total_equity          IS NOT NULL)::int +
    (f.revenue_latest        IS NOT NULL)::int +
    (f.net_income_latest     IS NOT NULL)::int
  ) / 18.0, 1) AS completeness_pct
FROM ipos i
LEFT JOIN ipo_financials f ON f.ipo_id = i.id;

CREATE OR REPLACE VIEW v_dashboard_stats AS
WITH ipo_statuses AS (
  SELECT
    id,
    CASE
      WHEN status = 'cancelled' THEN 'cancelled'
      WHEN listing_date IS NOT NULL
        AND listing_date <= ((now() AT TIME ZONE 'Asia/Bangkok')::date) THEN 'listed'
      WHEN status = 'listed' THEN 'listed'
      ELSE 'upcoming'
    END AS effective_status
  FROM ipos
)
SELECT
  COUNT(*)                                                    AS total_ipos,
  COUNT(*) FILTER (WHERE effective_status = 'listed')         AS listed_count,
  COUNT(*) FILTER (WHERE effective_status = 'upcoming')       AS upcoming_count,
  COUNT(*) FILTER (WHERE effective_status = 'cancelled')      AS cancelled_count,
  (SELECT COUNT(*) FROM v_ipo_completeness
   WHERE completeness_pct = 100)                              AS complete_count,
  (SELECT COUNT(*) FROM v_ipo_completeness
   WHERE completeness_pct < 100)                              AS incomplete_count,
  (SELECT MAX(updated_at) FROM ipos)                          AS last_data_update,
  (SELECT MAX(finished_at) FROM build_runs WHERE status='success') AS last_build,
  (SELECT COUNT(*) FROM validation_results WHERE resolved=false AND severity='error')   AS error_count,
  (SELECT COUNT(*) FROM validation_results WHERE resolved=false AND severity='warning') AS warning_count,
  (SELECT COUNT(*) FROM validation_results WHERE resolved=false AND severity='info')    AS info_count
FROM ipo_statuses;

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
  (i.listing_date - ((now() AT TIME ZONE 'Asia/Bangkok')::date)) AS days_until,
  c.completeness_pct
FROM (
  SELECT
    ipos.*,
    CASE
      WHEN status = 'cancelled' THEN 'cancelled'
      WHEN listing_date IS NOT NULL
        AND listing_date <= ((now() AT TIME ZONE 'Asia/Bangkok')::date) THEN 'listed'
      WHEN status = 'listed' THEN 'listed'
      ELSE 'upcoming'
    END AS effective_status
  FROM ipos
) i
LEFT JOIN v_ipo_completeness c ON c.id = i.id
WHERE i.effective_status = 'upcoming'
ORDER BY i.listing_date ASC NULLS LAST;

CREATE OR REPLACE VIEW v_ipo_missing_fields AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  CASE
    WHEN i.status = 'cancelled' THEN 'cancelled'
    WHEN i.listing_date IS NOT NULL
      AND i.listing_date <= ((now() AT TIME ZONE 'Asia/Bangkok')::date) THEN 'listed'
    WHEN i.status = 'listed' THEN 'listed'
    ELSE 'upcoming'
  END AS status,
  i.listing_date,
  i.updated_at,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN i.listing_date IS NULL                             THEN 'listing_date'        END,
    CASE WHEN i.ipo_price    IS NULL                             THEN 'ipo_price'           END,
    CASE WHEN i.market IS NULL OR i.market = ''                  THEN 'market'              END,
    CASE WHEN i.sector IS NULL OR i.sector = ''                  THEN 'sector'              END,
    CASE WHEN i.fa_companies IS NULL
           OR array_length(i.fa_companies,1) IS NULL             THEN 'fa_companies'        END,
    CASE WHEN i.lead_uw      IS NULL
           OR array_length(i.lead_uw,1)      IS NULL             THEN 'lead_uw'             END,
    CASE WHEN i.close_d1     IS NULL                             THEN 'close_d1'            END,
    CASE WHEN f.gross_proceeds      IS NULL                      THEN 'gross_proceeds'      END,
    CASE WHEN f.total_expense       IS NULL                      THEN 'total_expense'       END,
    CASE WHEN f.offered_shares      IS NULL                      THEN 'offered_shares'      END,
    CASE WHEN f.offered_ratio_pct   IS NULL                      THEN 'offered_ratio_pct'   END,
    CASE WHEN f.existing_shares_pct IS NULL                      THEN 'existing_shares_pct' END,
    CASE WHEN f.executive_total_pct IS NULL                      THEN 'executive_total_pct' END,
    CASE WHEN f.total_assets        IS NULL                      THEN 'total_assets'        END,
    CASE WHEN f.total_liabilities   IS NULL                      THEN 'total_liabilities'   END,
    CASE WHEN f.total_equity        IS NULL                      THEN 'total_equity'        END,
    CASE WHEN f.revenue_latest      IS NULL                      THEN 'revenue_latest'      END,
    CASE WHEN f.net_income_latest   IS NULL                      THEN 'net_income_latest'   END
  ], NULL) AS missing_fields,
  c.completeness_pct
FROM ipos i
LEFT JOIN ipo_financials f ON f.ipo_id = i.id
LEFT JOIN v_ipo_completeness c ON c.id = i.id;

CREATE OR REPLACE VIEW v_recent_updates AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  CASE
    WHEN i.status = 'cancelled' THEN 'cancelled'
    WHEN i.listing_date IS NOT NULL
      AND i.listing_date <= ((now() AT TIME ZONE 'Asia/Bangkok')::date) THEN 'listed'
    WHEN i.status = 'listed' THEN 'listed'
    ELSE 'upcoming'
  END AS status,
  i.updated_at,
  i.updated_by,
  GREATEST(i.updated_at, COALESCE(f.updated_at, i.updated_at)) AS last_touched_at,
  CASE
    WHEN f.updated_at IS NOT NULL AND f.updated_at > i.updated_at THEN 'financials'
    ELSE 'core'
  END AS last_touched_part
FROM ipos i
LEFT JOIN ipo_financials f ON f.ipo_id = i.id
ORDER BY GREATEST(i.updated_at, COALESCE(f.updated_at, i.updated_at)) DESC;
