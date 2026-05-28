import { query } from "./db";

type StaleRunRow = {
  id: string;
};

const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000;
const STALE_RUN_GRACE_MS = 5 * 60 * 1000;

export function getScraperTimeoutMs(): number {
  return Number(process.env.SCRAPER_RUN_TIMEOUT_MS ?? DEFAULT_RUN_TIMEOUT_MS);
}

export function getStaleRunMs(): number {
  return Number(process.env.SCRAPER_STALE_RUN_MS ?? getScraperTimeoutMs() + STALE_RUN_GRACE_MS);
}

export async function cleanupStaleScrapeRuns(): Promise<number> {
  const staleMs = getStaleRunMs();
  if (!Number.isFinite(staleMs) || staleMs <= 0) return 0;

  const message = `Stale scrape run cleaned up after ${Math.round(staleMs / 60000)} minutes`;
  const rows = await query<StaleRunRow>(
    `UPDATE scrape_runs
     SET status = 'failed',
         finished_at = now(),
         duration_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int,
         error_message = COALESCE(error_message, $2),
         log_excerpt = COALESCE(log_excerpt, $2)
     WHERE status = 'running'
       AND started_at < now() - ($1::double precision * interval '1 millisecond')
     RETURNING id`,
    [staleMs, message],
  );
  return rows.length;
}
