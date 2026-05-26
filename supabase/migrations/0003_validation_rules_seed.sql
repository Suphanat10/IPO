-- =====================================================
-- Seed default validation rules + check function
-- =====================================================

INSERT INTO validation_rules (key, description, severity, scope) VALUES
  ('missing_listing_date',     'IPO is missing first_trade_date / listing_date',  'error',   'ipo'),
  ('missing_ipo_price',        'IPO is missing ipo_price',                         'error',   'ipo'),
  ('missing_close_d1',         'Listed IPO is missing close_d1 (day-1 close)',     'warning', 'ipo'),
  ('missing_fa',               'IPO has no FA (person or company)',                'warning', 'ipo'),
  ('missing_lead_uw',          'IPO has no lead underwriter',                      'warning', 'ipo'),
  ('missing_offered_ratio',    'Financials missing offered_ratio_pct',             'warning', 'financials'),
  ('missing_existing_pct',     'Financials missing existing_shares_pct',           'warning', 'financials'),
  ('missing_exec_pct',         'Financials missing executive_total_pct',           'info',    'financials'),
  ('missing_equity',           'Financials missing total_equity',                  'warning', 'financials'),
  ('missing_net_income',       'Financials missing net_income_latest',             'warning', 'financials'),
  ('price_inconsistency',      'close_d1 differs from open_d1 high/low bounds',    'error',   'ipo'),
  ('duplicate_symbol',         'Symbol appears more than once',                    'error',   'ipo'),
  ('unmapped_fa',              'FA company name has no normalization entry',       'warning', 'global'),
  ('upcoming_past_date',       'Upcoming IPO has a listing_date in the past',      'warning', 'ipo')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- run_validations() — wipes + re-detects all issues
-- Call from API: SELECT run_validations();
-- =====================================================
CREATE OR REPLACE FUNCTION run_validations()
RETURNS TABLE(rule_key TEXT, count INT) AS $$
BEGIN
  -- clear unresolved (keep resolved history)
  DELETE FROM validation_results WHERE resolved = false;

  -- missing_listing_date: listed but no date
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_listing_date', 'error',
         'Symbol ' || symbol || ' has no listing_date'
  FROM ipos
  WHERE status = 'listed' AND listing_date IS NULL
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- missing_ipo_price
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_ipo_price', 'error',
         'Symbol ' || symbol || ' has no ipo_price'
  FROM ipos
  WHERE status != 'cancelled' AND ipo_price IS NULL
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- missing_close_d1 (only for listed)
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_close_d1', 'warning',
         'Symbol ' || symbol || ' has no close_d1'
  FROM ipos
  WHERE status = 'listed' AND close_d1 IS NULL
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- missing_fa
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_fa', 'warning',
         'Symbol ' || symbol || ' has no FA company assigned'
  FROM ipos
  WHERE (fa_companies IS NULL OR array_length(fa_companies,1) IS NULL)
    AND status != 'cancelled'
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- missing_lead_uw
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'missing_lead_uw', 'warning',
         'Symbol ' || symbol || ' has no lead underwriter'
  FROM ipos
  WHERE (lead_uw IS NULL OR array_length(lead_uw,1) IS NULL)
    AND status != 'cancelled'
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- financials checks
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_offered_ratio', 'warning',
         'Symbol ' || i.symbol || ' missing offered_ratio_pct'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND (f.offered_ratio_pct IS NULL)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_existing_pct', 'warning',
         'Symbol ' || i.symbol || ' missing existing_shares_pct'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND (f.existing_shares_pct IS NULL)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_exec_pct', 'info',
         'Symbol ' || i.symbol || ' missing executive_total_pct'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND (f.executive_total_pct IS NULL)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_equity', 'warning',
         'Symbol ' || i.symbol || ' missing total_equity'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND (f.total_equity IS NULL)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'missing_net_income', 'warning',
         'Symbol ' || i.symbol || ' missing net_income_latest'
  FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  WHERE i.status != 'cancelled' AND (f.net_income_latest IS NULL)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- price_inconsistency: close_d1 outside [low_d1, high_d1]
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'price_inconsistency', 'error',
         'Symbol ' || symbol || ' close_d1=' || close_d1 ||
         ' outside [' || low_d1 || ',' || high_d1 || ']'
  FROM ipos
  WHERE close_d1 IS NOT NULL AND high_d1 IS NOT NULL AND low_d1 IS NOT NULL
    AND (close_d1 > high_d1 OR close_d1 < low_d1)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- upcoming_past_date
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT id, 'upcoming_past_date', 'warning',
         'Symbol ' || symbol || ' marked upcoming but listing_date=' || listing_date || ' is past'
  FROM ipos
  WHERE status = 'upcoming' AND listing_date IS NOT NULL AND listing_date < CURRENT_DATE
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- duplicate_symbol (case-insensitive)
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT a.id, 'duplicate_symbol', 'error',
         'Symbol ' || a.symbol || ' duplicates ' || b.symbol
  FROM ipos a
  JOIN ipos b ON LOWER(a.symbol) = LOWER(b.symbol) AND a.id <> b.id
  WHERE a.id > b.id
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- unmapped_fa — FA companies that appear in ipos but not in fa_normalizations
  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT DISTINCT i.id, 'unmapped_fa', 'warning',
         'FA company "' || c || '" is not in fa_normalizations'
  FROM ipos i
  CROSS JOIN LATERAL UNNEST(i.fa_companies) c
  WHERE c IS NOT NULL AND c <> ''
    AND NOT EXISTS (SELECT 1 FROM fa_normalizations n WHERE n.raw_name = c)
  ON CONFLICT (ipo_id, rule_key) DO NOTHING;

  -- return summary
  RETURN QUERY
  SELECT vr.rule_key, COUNT(*)::int
  FROM validation_results vr
  WHERE vr.resolved = false
  GROUP BY vr.rule_key
  ORDER BY vr.rule_key;
END;
$$ LANGUAGE plpgsql;
