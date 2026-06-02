-- =====================================================
-- Underwriter + FA Company directories + junction tables
-- Pulls the multi-value TEXT[] columns on `ipos` into proper
-- entities so we can build stats, normalize names, and join.
-- The TEXT[] columns on `ipos` are kept for back-compat /
-- raw ingestion; junction tables are the source of truth
-- after CSV import.
-- =====================================================

-- 1. Directories ------------------------------------------------
CREATE TABLE IF NOT EXISTS underwriters (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  short_name      TEXT,
  license_no      TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_underwriters_name_lower
  ON underwriters (LOWER(name));

CREATE TABLE IF NOT EXISTS fa_companies (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  normalized_name TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fa_companies_name_lower
  ON fa_companies (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_fa_companies_normalized
  ON fa_companies (normalized_name);

-- 2. Junction tables -------------------------------------------
CREATE TABLE IF NOT EXISTS ipo_underwriters (
  ipo_id          BIGINT NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  underwriter_id  BIGINT NOT NULL REFERENCES underwriters(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('lead','co')),
  position        INT,
  PRIMARY KEY (ipo_id, underwriter_id, role)
);

CREATE INDEX IF NOT EXISTS idx_ipo_uw_role
  ON ipo_underwriters (role);
CREATE INDEX IF NOT EXISTS idx_ipo_uw_uw
  ON ipo_underwriters (underwriter_id);

CREATE TABLE IF NOT EXISTS ipo_fa (
  id              BIGSERIAL PRIMARY KEY,
  ipo_id          BIGINT NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  fa_company_id   BIGINT NOT NULL REFERENCES fa_companies(id) ON DELETE CASCADE,
  fa_person       TEXT,
  position        INT
);

-- Postgres can't use COALESCE in a PRIMARY KEY; emulate via a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ipo_fa_unique
  ON ipo_fa (ipo_id, fa_company_id, COALESCE(fa_person, ''));
CREATE INDEX IF NOT EXISTS idx_ipo_fa_company
  ON ipo_fa (fa_company_id);
CREATE INDEX IF NOT EXISTS idx_ipo_fa_person
  ON ipo_fa (fa_person);

-- 3. Touch triggers --------------------------------------------
DROP TRIGGER IF EXISTS trg_underwriters_touch ON underwriters;
CREATE TRIGGER trg_underwriters_touch
  BEFORE UPDATE ON underwriters
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_fa_companies_touch ON fa_companies;
CREATE TRIGGER trg_fa_companies_touch
  BEFORE UPDATE ON fa_companies
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4. Backfill from existing TEXT[] columns ---------------------
-- Run once after deployment; safe to re-run (ON CONFLICT guards).
CREATE OR REPLACE FUNCTION sync_underwriters_from_ipos()
RETURNS TABLE(action TEXT, count BIGINT) AS $$
DECLARE
  inserted_uw    BIGINT;
  inserted_fa    BIGINT;
  inserted_links BIGINT;
BEGIN
  -- underwriter directory
  WITH all_uw AS (
    SELECT DISTINCT TRIM(name) AS name
    FROM (
      SELECT UNNEST(lead_uw) AS name FROM ipos WHERE lead_uw IS NOT NULL
      UNION ALL
      SELECT UNNEST(co_uws)  AS name FROM ipos WHERE co_uws  IS NOT NULL
    ) s
    WHERE TRIM(COALESCE(name,'')) <> ''
  ),
  ins AS (
    INSERT INTO underwriters (name)
    SELECT name FROM all_uw
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_uw FROM ins;

  -- fa_companies directory
  WITH all_fa AS (
    SELECT DISTINCT TRIM(name) AS name
    FROM (
      SELECT UNNEST(fa_companies) AS name FROM ipos WHERE fa_companies IS NOT NULL
    ) s
    WHERE TRIM(COALESCE(name,'')) <> ''
  ),
  ins AS (
    INSERT INTO fa_companies (name, normalized_name)
    SELECT a.name, COALESCE(n.normalized_name, a.name)
    FROM all_fa a
    LEFT JOIN fa_normalizations n ON n.raw_name = a.name
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_fa FROM ins;

  -- ipo_underwriters links (lead first, then co)
  WITH new_links AS (
    INSERT INTO ipo_underwriters (ipo_id, underwriter_id, role, position)
    SELECT i.id, u.id, 'lead', x.ord
    FROM ipos i
    CROSS JOIN LATERAL UNNEST(i.lead_uw) WITH ORDINALITY AS x(name, ord)
    JOIN underwriters u ON u.name = TRIM(x.name)
    WHERE TRIM(COALESCE(x.name,'')) <> ''
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_links FROM new_links;

  WITH new_links AS (
    INSERT INTO ipo_underwriters (ipo_id, underwriter_id, role, position)
    SELECT i.id, u.id, 'co', x.ord
    FROM ipos i
    CROSS JOIN LATERAL UNNEST(i.co_uws) WITH ORDINALITY AS x(name, ord)
    JOIN underwriters u ON u.name = TRIM(x.name)
    WHERE TRIM(COALESCE(x.name,'')) <> ''
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT inserted_links + COUNT(*) INTO inserted_links FROM new_links;

  -- ipo_fa links (zip fa_companies with fa_persons by position)
  INSERT INTO ipo_fa (ipo_id, fa_company_id, fa_person, position)
  SELECT
    i.id,
    f.id,
    CASE
      WHEN i.fa_persons IS NOT NULL AND array_length(i.fa_persons,1) >= x.ord
      THEN TRIM(i.fa_persons[x.ord])
      ELSE NULL
    END,
    x.ord
  FROM ipos i
  CROSS JOIN LATERAL UNNEST(i.fa_companies) WITH ORDINALITY AS x(name, ord)
  JOIN fa_companies f ON f.name = TRIM(x.name)
  WHERE TRIM(COALESCE(x.name,'')) <> ''
  ON CONFLICT DO NOTHING;

  RETURN QUERY VALUES
    ('underwriters_inserted', inserted_uw),
    ('fa_companies_inserted', inserted_fa),
    ('ipo_underwriter_links', inserted_links);
END;
$$ LANGUAGE plpgsql;

-- 5. Stats views -----------------------------------------------
-- Lead underwriter performance — drives /admin Lead-Co page
CREATE OR REPLACE VIEW v_underwriter_stats AS
SELECT
  u.id,
  u.name,
  COUNT(*)                                       AS ipo_count,
  SUM(CASE WHEN i.close_d1 > i.ipo_price THEN 1 ELSE 0 END) AS positive_d1,
  ROUND(AVG(
    CASE WHEN i.ipo_price IS NOT NULL AND i.ipo_price > 0
      THEN (i.close_d1 - i.ipo_price) / i.ipo_price * 100
    END
  )::numeric, 2) AS avg_return_d1_pct,
  ROUND(100.0 * SUM(CASE WHEN i.close_d1 > i.ipo_price THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*),0), 2) AS win_rate_pct
FROM underwriters u
JOIN ipo_underwriters iu ON iu.underwriter_id = u.id AND iu.role = 'lead'
JOIN ipos i ON i.id = iu.ipo_id
WHERE i.status = 'listed' AND i.close_d1 IS NOT NULL AND i.ipo_price IS NOT NULL
GROUP BY u.id, u.name;

CREATE OR REPLACE VIEW v_fa_company_stats AS
SELECT
  f.id,
  f.name,
  f.normalized_name,
  COUNT(*)                                       AS ipo_count,
  SUM(CASE WHEN i.close_d1 > i.ipo_price THEN 1 ELSE 0 END) AS positive_d1,
  ROUND(AVG(
    CASE WHEN i.ipo_price IS NOT NULL AND i.ipo_price > 0
      THEN (i.close_d1 - i.ipo_price) / i.ipo_price * 100
    END
  )::numeric, 2) AS avg_return_d1_pct,
  ROUND(100.0 * SUM(CASE WHEN i.close_d1 > i.ipo_price THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*),0), 2) AS win_rate_pct
FROM fa_companies f
JOIN ipo_fa fl ON fl.fa_company_id = f.id
JOIN ipos i ON i.id = fl.ipo_id
WHERE i.status = 'listed' AND i.close_d1 IS NOT NULL AND i.ipo_price IS NOT NULL
GROUP BY f.id, f.name, f.normalized_name;

-- 6. Missing-data dashboard view -------------------------------
-- Wide table showing which fields are blank per IPO. Powers the
-- "Missing Data" admin page so reviewers can target gaps.
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

-- 7. Recent changes view (Last Update page) --------------------
CREATE OR REPLACE VIEW v_recent_updates AS
SELECT
  i.id,
  i.symbol,
  i.company_name,
  i.status,
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
