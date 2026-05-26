-- =====================================================
-- Derived views for dashboard
-- =====================================================

CREATE OR REPLACE VIEW v_ipo_completeness AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
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
