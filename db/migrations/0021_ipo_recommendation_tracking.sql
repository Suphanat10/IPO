-- =====================================================
-- IPO recommendation snapshots and post-listing outcomes
-- =====================================================

CREATE TABLE IF NOT EXISTS ipo_recommendation_snapshots (
  id                    BIGSERIAL PRIMARY KEY,
  ipo_id                BIGINT NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  symbol                TEXT NOT NULL,
  snapshot_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  snapshot_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  source                TEXT NOT NULL DEFAULT 'upcoming_recommendations',

  listing_date          DATE,
  ipo_price             NUMERIC(12,4),
  decision              TEXT NOT NULL CHECK (decision IN ('BUY','NEUTRAL','AVOID')),
  score                 NUMERIC(8,6) NOT NULL,
  win_rate              NUMERIC(8,4),
  avg_return_d1         NUMERIC(10,4),
  target_pct            NUMERIC(10,4),
  target_price          NUMERIC(12,4),

  fa_person             TEXT,
  fa_company            TEXT,
  lead_uw               TEXT,
  fa_persons            TEXT[],
  fa_companies          TEXT[],
  lead_uws              TEXT[],
  co_uws                TEXT[],

  reasons               JSONB NOT NULL DEFAULT '[]'::jsonb,
  component_scores      JSONB NOT NULL DEFAULT '{}'::jsonb,

  actual_status         TEXT NOT NULL DEFAULT 'pending'
                        CHECK (actual_status IN ('pending','cancelled','listed_missing_return','resolved')),
  outcome_checked_at    TIMESTAMPTZ,
  actual_open_d1        NUMERIC(12,4),
  actual_high_d1        NUMERIC(12,4),
  actual_low_d1         NUMERIC(12,4),
  actual_close_d1       NUMERIC(12,4),
  actual_close_1w       NUMERIC(12,4),
  actual_close_1m       NUMERIC(12,4),
  actual_close_3m       NUMERIC(12,4),
  actual_close_6m       NUMERIC(12,4),
  actual_return_open_d1 NUMERIC(10,4),
  actual_return_high_d1 NUMERIC(10,4),
  actual_return_low_d1  NUMERIC(10,4),
  actual_return_d1      NUMERIC(10,4),
  actual_return_1w      NUMERIC(10,4),
  actual_return_1m      NUMERIC(10,4),
  actual_return_3m      NUMERIC(10,4),
  actual_return_6m      NUMERIC(10,4),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ipo_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ipo_rec_snapshots_symbol
  ON ipo_recommendation_snapshots(symbol);

CREATE INDEX IF NOT EXISTS idx_ipo_rec_snapshots_date
  ON ipo_recommendation_snapshots(snapshot_date DESC, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_ipo_rec_snapshots_decision
  ON ipo_recommendation_snapshots(decision);

DROP TRIGGER IF EXISTS trg_ipo_rec_snapshots_touch ON ipo_recommendation_snapshots;
CREATE TRIGGER trg_ipo_rec_snapshots_touch
  BEFORE UPDATE ON ipo_recommendation_snapshots
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE VIEW v_latest_ipo_recommendation_snapshots AS
SELECT DISTINCT ON (ipo_id)
  *
FROM ipo_recommendation_snapshots
ORDER BY ipo_id, snapshot_date DESC, snapshot_at DESC, id DESC;

CREATE OR REPLACE VIEW v_ipo_recommendation_outcomes AS
SELECT
  s.id,
  s.ipo_id,
  s.symbol,
  COALESCE(i.company_name_th, i.company_name) AS company_name,
  i.market,
  i.industry,
  i.sector,
  s.snapshot_date,
  s.snapshot_at,
  s.listing_date AS predicted_listing_date,
  i.listing_date AS actual_listing_date,
  s.ipo_price AS predicted_ipo_price,
  i.ipo_price AS actual_ipo_price,
  s.decision,
  s.score,
  s.win_rate,
  s.avg_return_d1,
  s.target_pct,
  s.target_price,
  s.fa_person,
  s.fa_company,
  s.lead_uw,
  s.fa_persons,
  s.fa_companies,
  s.lead_uws,
  s.co_uws,
  s.reasons,
  s.component_scores,
  s.actual_status,
  s.outcome_checked_at,
  s.actual_open_d1,
  s.actual_high_d1,
  s.actual_low_d1,
  s.actual_close_d1,
  s.actual_close_1w,
  s.actual_close_1m,
  s.actual_close_3m,
  s.actual_close_6m,
  s.actual_return_open_d1,
  s.actual_return_high_d1,
  s.actual_return_low_d1,
  s.actual_return_d1,
  s.actual_return_1w,
  s.actual_return_1m,
  s.actual_return_3m,
  s.actual_return_6m,
  CASE
    WHEN s.actual_status = 'cancelled' THEN 'cancelled'
    WHEN s.actual_return_d1 IS NULL THEN 'pending'
    WHEN s.decision = 'BUY' AND s.actual_return_d1 > 0 THEN 'hit'
    WHEN s.decision = 'AVOID' AND s.actual_return_d1 <= 0 THEN 'hit'
    WHEN s.decision = 'NEUTRAL' AND s.actual_return_d1 BETWEEN -10 AND 10 THEN 'neutral_hit'
    ELSE 'miss'
  END AS outcome_result,
  CASE
    WHEN s.actual_return_d1 IS NULL OR s.actual_status = 'cancelled' THEN NULL
    WHEN s.decision = 'BUY' THEN s.actual_return_d1 > 0
    WHEN s.decision = 'AVOID' THEN s.actual_return_d1 <= 0
    WHEN s.decision = 'NEUTRAL' THEN s.actual_return_d1 BETWEEN -10 AND 10
    ELSE NULL
  END AS prediction_correct
FROM v_latest_ipo_recommendation_snapshots s
JOIN ipos i ON i.id = s.ipo_id;

