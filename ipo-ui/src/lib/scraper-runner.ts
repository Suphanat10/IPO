import { spawn } from "node:child_process";
import { query } from "./db";

type ScrapeRunInsertRow = {
  id: string | null;
  lock_acquired: boolean;
  running_count: number;
};

const SCRAPER_LOCK_KEY_1 = 481516234;
const SCRAPER_LOCK_KEY_2 = 108;
const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000;

export class ScrapeAlreadyRunningError extends Error {
  constructor(message = "Another scrape is already running") {
    super(message);
    this.name = "ScrapeAlreadyRunningError";
  }
}

export async function triggerScrape(triggeredBy: string): Promise<{ runId: string }> {
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
  const scriptPath = "scripts/scrape_upcoming_ipos.py";
  const pythonCmd = process.env.PYTHON_BIN ?? "python";
  const timeoutMs = Number(process.env.SCRAPER_RUN_TIMEOUT_MS ?? DEFAULT_RUN_TIMEOUT_MS);

  const startedAt = Date.now();
  const logChunks: string[] = [];
  let finalized = false;

  const child = spawn(
    pythonCmd,
    [scriptPath, "--run-id", runId],
    {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    },
  );

  child.stdout?.on("data", (buf: Buffer) => {
    logChunks.push(buf.toString());
  });
  child.stderr?.on("data", (buf: Buffer) => {
    logChunks.push(buf.toString());
  });

  async function markFailed(errorMessage: string) {
    if (finalized) return;
    finalized = true;
    const duration = Date.now() - startedAt;
    const logExcerpt = logChunks.join("").slice(-8000);
    await query(
      `UPDATE scrape_runs
       SET status = 'failed', finished_at = now(), duration_ms = $1, error_message = $2, log_excerpt = $3
       WHERE id = $4`,
      [duration, errorMessage, logExcerpt, runId],
    );
  }

  const timeoutId = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => {
        logChunks.push(`\nScraper timed out after ${timeoutMs} ms; terminating child process.\n`);
        child.kill();
        markFailed(`Scraper timed out after ${timeoutMs} ms`).catch((err) => {
          console.error("Failed to record scraper timeout", err);
        });
      }, timeoutMs)
    : null;

  child.on("close", async (code) => {
    if (timeoutId) clearTimeout(timeoutId);
    if (finalized) return;
    const duration = Date.now() - startedAt;
    const logExcerpt = logChunks.join("").slice(-8000);

    try {
      if (code === 0) {
        finalized = true;
        await query(
          "UPDATE scrape_runs SET duration_ms = $1, log_excerpt = $2 WHERE id = $3",
          [duration, logExcerpt, runId],
        );
      } else {
        finalized = true;
        await query(
          `UPDATE scrape_runs SET status = 'failed', finished_at = now(), duration_ms = $1, error_message = $2, log_excerpt = $3 WHERE id = $4`,
          [duration, `Python exit code ${code}`, logExcerpt, runId],
        );
      }
    } catch (err) {
      console.error("Failed to finalize scrape_runs row", err);
    }
  });

  child.on("error", async (err) => {
    if (timeoutId) clearTimeout(timeoutId);
    try {
      await markFailed(`Failed to spawn python: ${err.message}`);
    } catch (innerErr) {
      console.error("Failed to record spawn error", innerErr);
    }
  });

  child.unref();

  return { runId };
}
