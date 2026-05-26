-- ================================================================
-- QA/UAT feedback improvements
-- - Rebuild underwriter/FA relation sync so raw arrays and junction
--   tables stay aligned after CSV import and upcoming scraper runs.
-- - Add validation rules for data-quality warnings observed in UAT.
-- ================================================================

INSERT INTO validation_rules (key, description, severity, scope) VALUES
  ('missing_market',              'IPO is missing market',                                      'warning', 'ipo'),
  ('upcoming_missing_listing_date','Upcoming IPO has no listing_date for countdown/reporting',  'warning', 'ipo'),
  ('upcoming_missing_ipo_price',   'Upcoming IPO has no ipo_price yet',                          'warning', 'ipo'),
  ('underwriter_relation_gap',    'Lead underwriter array is not synced to relation table',     'warning', 'ipo'),
  ('fa_relation_gap',             'FA company array is not synced to relation table',           'warning', 'ipo'),
  ('high_exec_ownership',         'Executive ownership is above 50%',                           'info',    'financials')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  scope = EXCLUDED.scope,
  active = true;

CREATE OR REPLACE FUNCTION sync_underwriters_from_ipos()
RETURNS TABLE(action TEXT, count BIGINT) AS $$
DECLARE
  inserted_uw BIGINT := 0;
  inserted_fa BIGINT := 0;
  rebuilt_uw BIGINT := 0;
  rebuilt_fa BIGINT := 0;
BEGIN
  WITH all_uw AS (
    SELECT DISTINCT TRIM(name) AS name
    FROM (
      SELECT UNNEST(COALESCE(lead_uw, ARRAY[]::text[])) AS name FROM ipos
      UNION ALL
      SELECT UNNEST(COALESCE(co_uws, ARRAY[]::text[])) AS name FROM ipos
    ) s
    WHERE TRIM(COALESCE(name, '')) <> ''
  ),
  ins AS (
    INSERT INTO underwriters (name)
    SELECT name FROM all_uw
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_uw FROM ins;

  WITH all_fa AS (
    SELECT DISTINCT TRIM(name) AS name
    FROM (
      SELECT UNNEST(COALESCE(fa_companies, ARRAY[]::text[])) AS name FROM ipos
    ) s
    WHERE TRIM(COALESCE(name, '')) <> ''
  ),
  ins AS (
    INSERT INTO fa_companies (name, normalized_name)
    SELECT a.name, COALESCE(n.normalized_name, a.name)
    FROM all_fa a
    LEFT JOIN fa_normalizations n ON n.raw_name = a.name
    ON CONFLICT (name) DO UPDATE SET
      normalized_name = COALESCE(fa_companies.normalized_name, EXCLUDED.normalized_name)
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_fa FROM ins;

  DELETE FROM ipo_underwriters iu
  USING ipos i
  WHERE iu.ipo_id = i.id
    AND (
      COALESCE(array_length(i.lead_uw, 1), 0) > 0
      OR COALESCE(array_length(i.co_uws, 1), 0) > 0
    );

  WITH lead_links AS (
    SELECT i.id AS ipo_id, u.id AS underwriter_id, 'lead'::text AS role, x.ord::int AS position
    FROM ipos i
    CROSS JOIN LATERAL UNNEST(COALESCE(i.lead_uw, ARRAY[]::text[])) WITH ORDINALITY AS x(name, ord)
    JOIN underwriters u ON u.name = TRIM(x.name)
    WHERE TRIM(COALESCE(x.name, '')) <> ''
  ),
  co_links AS (
    SELECT i.id AS ipo_id, u.id AS underwriter_id, 'co'::text AS role, x.ord::int AS position
    FROM ipos i
    CROSS JOIN LATERAL UNNEST(COALESCE(i.co_uws, ARRAY[]::text[])) WITH ORDINALITY AS x(name, ord)
    JOIN underwriters u ON u.name = TRIM(x.name)
    WHERE TRIM(COALESCE(x.name, '')) <> ''
  ),
  ins AS (
    INSERT INTO ipo_underwriters (ipo_id, underwriter_id, role, position)
    SELECT ipo_id, underwriter_id, role, position
    FROM (
      SELECT * FROM lead_links
      UNION ALL
      SELECT * FROM co_links
    ) links
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO rebuilt_uw FROM ins;

  DELETE FROM ipo_fa fl
  USING ipos i
  WHERE fl.ipo_id = i.id
    AND COALESCE(array_length(i.fa_companies, 1), 0) > 0;

  WITH fa_links AS (
    SELECT
      i.id AS ipo_id,
      f.id AS fa_company_id,
      NULLIF(
        TRIM(
          CASE
            WHEN i.fa_persons IS NOT NULL AND array_length(i.fa_persons, 1) >= x.ord::int
            THEN i.fa_persons[x.ord::int]
            ELSE NULL
          END
        ),
        ''
      ) AS fa_person,
      x.ord::int AS position
    FROM ipos i
    CROSS JOIN LATERAL UNNEST(COALESCE(i.fa_companies, ARRAY[]::text[])) WITH ORDINALITY AS x(name, ord)
    JOIN fa_companies f ON f.name = TRIM(x.name)
    WHERE TRIM(COALESCE(x.name, '')) <> ''
  ),
  ins AS (
    INSERT INTO ipo_fa (ipo_id, fa_company_id, fa_person, position)
    SELECT ipo_id, fa_company_id, fa_person, position
    FROM fa_links
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO rebuilt_fa FROM ins;

  RETURN QUERY VALUES
    ('underwriters_inserted', inserted_uw),
    ('fa_companies_upserted', inserted_fa),
    ('ipo_underwriter_links_rebuilt', rebuilt_uw),
    ('ipo_fa_links_rebuilt', rebuilt_fa);
END;
$$ LANGUAGE plpgsql;

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
  SELECT i.id, 'underwriter_relation_gap', 'warning',
         'Symbol ' || i.symbol || ' has lead_uw values but no lead relation rows'
  FROM ipos i
  WHERE COALESCE(array_length(i.lead_uw, 1), 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM ipo_underwriters iu
      WHERE iu.ipo_id = i.id AND iu.role = 'lead'
    )
  ON CONFLICT ON CONSTRAINT validation_results_ipo_id_rule_key_key DO NOTHING;

  INSERT INTO validation_results (ipo_id, rule_key, severity, message)
  SELECT i.id, 'fa_relation_gap', 'warning',
         'Symbol ' || i.symbol || ' has fa_companies values but no FA relation rows'
  FROM ipos i
  WHERE COALESCE(array_length(i.fa_companies, 1), 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM ipo_fa fl
      WHERE fl.ipo_id = i.id
    )
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
