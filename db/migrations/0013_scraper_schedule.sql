-- ================================================================
-- Configurable scraper schedule slots (admin-editable)
-- ================================================================

CREATE TABLE IF NOT EXISTS scraper_schedule (
  id          SERIAL PRIMARY KEY,
  hour        SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  minute      SMALLINT NOT NULL CHECK (minute >= 0 AND minute <= 59),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hour, minute)
);

-- Seed default schedule: 08:00 and 17:30 Bangkok time
INSERT INTO scraper_schedule (hour, minute, enabled, updated_by)
VALUES
  (8, 0, true, 'system'),
  (17, 30, true, 'system')
ON CONFLICT (hour, minute) DO NOTHING;
