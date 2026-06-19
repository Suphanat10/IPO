-- Speed up IPO list filters and distinct dropdown option queries.

CREATE INDEX IF NOT EXISTS idx_ipos_industry
  ON ipos(industry);

CREATE INDEX IF NOT EXISTS idx_ipos_sector
  ON ipos(sector);
