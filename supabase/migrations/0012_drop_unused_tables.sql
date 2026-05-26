-- ================================================================
-- Drop unused underwriter/FA entity tables, junction tables,
-- stats views, and sync function.
-- The app uses TEXT[] arrays on `ipos` directly; these normalized
-- tables were never queried by application code.
-- ================================================================

-- 1. Drop views that depend on the tables
DROP VIEW IF EXISTS v_underwriter_stats;
DROP VIEW IF EXISTS v_fa_company_stats;

-- 2. Drop the sync function
DROP FUNCTION IF EXISTS sync_underwriters_from_ipos();

-- 3. Drop junction tables
DROP TABLE IF EXISTS ipo_fa;
DROP TABLE IF EXISTS ipo_underwriters;

-- 4. Drop entity tables
DROP TABLE IF EXISTS fa_companies;
DROP TABLE IF EXISTS underwriters;

-- 5. Remove orphaned validation rules
DELETE FROM validation_rules
WHERE key IN ('underwriter_relation_gap', 'fa_relation_gap');

DELETE FROM validation_results
WHERE rule_key IN ('underwriter_relation_gap', 'fa_relation_gap');

-- 6. Rebuild run_validations() without the dropped-table checks
CREATE OR REPLACE FUNCTION run_validations()
RETURNS TABLE(rule_key TEXT, count INT) AS $$
BEGIN
  DELETE FROM validation_results WHERE resolved = false;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_listing_date', 'error',
         'Symbol ' || symbol || ' has no listing_date'
  FROM ipos
  WHERE status = 'listed' AND listing_date IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'upcoming_missing_listing_date', 'warning',
         'Symbol ' || symbol || ' is upcoming but has no listing_date'
  FROM ipos
  WHERE status = 'upcoming' AND listing_date IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_market', 'warning',
         'Symbol ' || symbol || ' has no market'
  FROM ipos
  WHERE status != 'cancelled' AND (market IS NULL OR TRIM(market) = '')
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_ipo_price', 'error',
         'Symbol ' || symbol || ' has no ipo_price'
  FROM ipos
  WHERE status = 'listed' AND ipo_price IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'upcoming_missing_ipo_price', 'warning',
         'Symbol ' || symbol || ' is upcoming but has no ipo_price yet'
  FROM ipos
  WHERE status = 'upcoming' AND ipo_price IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_close_d1', 'warning',
         'Symbol ' || symbol || ' has no close_d1'
  FROM ipos
  WHERE status = 'listed' AND close_d1 IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_fa', 'warning',
         'Symbol ' || symbol || ' has no FA company assigned'
  FROM ipos
  WHERE (fa_companies IS NULL OR array_length(fa_companies, 1) IS NULL)
    AND status != 'cancelled'
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_lead_uw', 'warning',
         'Symbol ' || symbol || ' has no lead underwriter'
  FROM ipos
  WHERE (lead_uw IS NULL OR array_length(lead_uw, 1) IS NULL)
    AND status != 'cancelled'
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_offered_ratio', 'warning',
         'Symbol ' || i.symbol || ' missing offered_ratio_pct'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND f.offered_ratio_pct IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_existing_pct', 'warning',
         'Symbol ' || i.symbol || ' missing existing_shares_pct'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND f.existing_shares_pct IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_exec_pct', 'info',
         'Symbol ' || i.symbol || ' missing executive_total_pct'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND f.executive_total_pct IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'high_exec_ownership', 'info',
         'Symbol ' || i.symbol || ' executive_total_pct=' || f.executive_total_pct || ' exceeds 50%'
  FROM ipos i JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND f.executive_total_pct > 50
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_equity', 'warning',
         'Symbol ' || i.symbol || ' missing total_equity'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND f.total_equity IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_net_income', 'warning',
         'Symbol ' || i.symbol || ' missing net_income_latest'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND f.net_income_latest IS NULL
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'price_inconsistency', 'error',
         'Symbol ' || symbol || ' close_d1=' || close_d1 ||
         ' outside [' || low_d1 || ',' || high_d1 || ']'
  FROM ipos
  WHERE close_d1 IS NOT NULL AND high_d1 IS NOT NULL AND low_d1 IS NOT NULL
    AND (close_d1 > high_d1 OR close_d1 < low_d1)
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'upcoming_past_date', 'warning',
         'Symbol ' || symbol || ' marked upcoming but listing_date=' || listing_date || ' is past'
  FROM ipos
  WHERE status = 'upcoming' AND listing_date IS NOT NULL AND listing_date < CURRENT_DATE
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT a.id, 'duplicate_symbol', 'error',
         'Symbol ' || a.symbol || ' duplicates ' || b.symbol
  FROM ipos a
  JOIN ipos b ON LOWER(a.symbol) = LOWER(b.symbol) AND a.id <> b.id
  WHERE a.id > b.id
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT DISTINCT i.id, 'unmapped_fa', 'warning',
         'FA company "' || c || '" is not in fa_normalizations'
  FROM ipos i
  CROSS JOIN LATERAL UNNEST(i.fa_companies) c
  WHERE c IS NOT NULL AND c <> ''
    AND NOT EXISTS (SELECT 1 FROM fa_normalizations n WHERE n.raw_name = c)
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  RETURN QUERY
  SELECT vr.rule_key, COUNT(*)::int
  FROM validation_results vr
  WHERE vr.resolved = false
  GROUP BY vr.rule_key
  ORDER BY vr.rule_key;
END;
$$ LANGUAGE plpgsql;
