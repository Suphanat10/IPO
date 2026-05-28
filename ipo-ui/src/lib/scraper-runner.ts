import { query } from "./db";
import { cleanupStaleScrapeRuns, getScraperTimeoutMs } from "./scrape-runs";
import { runScraper } from "./scraper";

type ScrapeRunInsertRow = {
  id: string | null;
  lock_acquired: boolean;
  running_count: number;
};

const SCRAPER_LOCK_KEY_1 = 481516234;
const SCRAPER_LOCK_KEY_2 = 108;

export class ScrapeAlreadyRunningError extends Error {
  constructor(message = "Another scrape is already running") {
    super(message);
    this.name = "ScrapeAlreadyRunningError";
  }
}

export async function triggerScrape(triggeredBy: string): Promise<{ runId: string; completion: Promise<void> }> {
  await cleanupStaleScrapeRuns();

  const runs = await query<ScrapeRunInsertRow>(
    `WITH lock AS (
       SELECT pg_try_advisory_xact_lock($2::int, $3::int) AS acquired
     ),
     running AS (
       SELECT COUNT(*)::int AS cnt FROM scrape_runs WHERE status = 'running'
     ),
     inserted AS (
       INSERT INTO scrape_runs (status, triggered_by)
       SELECT 'running', $1
       FROM lock, running
       WHERE lock.acquired = true AND running.cnt = 0
       RETURNING id
     )
     SELECT inserted.id, lock.acquired AS lock_acquired, running.cnt AS running_count
     FROM lock
     CROSS JOIN running
     LEFT JOIN inserted ON true`,
    [triggeredBy, SCRAPER_LOCK_KEY_1, SCRAPER_LOCK_KEY_2],
  );
  const run = runs[0];

  if (!run?.id) {
    if (!run?.lock_acquired) {
      throw new ScrapeAlreadyRunningError("Another scrape is starting");
    }
    if (Number(run?.running_count ?? 0) > 0) {
      throw new ScrapeAlreadyRunningError("Another scrape is already running");
    }
    throw new Error("Failed to create scrape run");
  }

  const runId = run.id;
  const timeoutMs = getScraperTimeoutMs();

  const completion = (async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Scraper timed out after ${timeoutMs} ms`)), timeoutMs);
    });

    try {
      await Promise.race([runScraper(runId), timeoutPromise]);
    } catch (err) {
      try {
        await query(
          `UPDATE scrape_runs SET status = 'failed', finished_at = now(),
           duration_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int,
           error_message = $1 WHERE id = $2 AND status = 'running'`,
          [err instanceof Error ? err.message : String(err), runId],
        );
      } catch (dbErr) {
        console.error("[scraper-runner] Failed to record scraper error", dbErr);
      }
    }
  })();

  return { runId, completion };
}
