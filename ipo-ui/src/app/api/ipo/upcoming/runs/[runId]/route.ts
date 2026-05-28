import { query, isDatabaseConfigured } from "@/lib/db";
import { cleanupStaleScrapeRuns } from "@/lib/scrape-runs";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  source: string;
  status: string;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_fetched: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  failed_count: number;
  error_message: string | null;
  log_excerpt: string | null;
};

type ItemRow = {
  id: number;
  symbol: string;
  ipo_id: number | null;
  action: string;
  diff: Record<string, { before: unknown; after: unknown }> | null;
  scraped_data: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database is not configured." }, { status: 503 });
  }

  await cleanupStaleScrapeRuns();

  const { runId } = await params;
  if (!runId) {
    return Response.json({ error: "Missing runId" }, { status: 400 });
  }

  const runs = await query<RunRow>(
    `SELECT id, source, status, triggered_by, started_at, finished_at,
            duration_ms, total_fetched, inserted_count, updated_count,
            unchanged_count, failed_count, error_message, log_excerpt
     FROM scrape_runs WHERE id = $1 LIMIT 1`,
    [runId],
  );
  const run = runs[0];

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const items = await query<ItemRow>(
    `SELECT id, symbol, ipo_id, action, diff, scraped_data, error_message, created_at
     FROM scrape_run_items WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId],
  );

  return Response.json({ run, items });
}
