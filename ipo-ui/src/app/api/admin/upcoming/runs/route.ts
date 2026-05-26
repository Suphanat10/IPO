import { query, isDatabaseConfigured } from "@/lib/db";

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
};

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database is not configured." }, { status: 503 });
  }

  const rows = await query<RunRow>(
    `SELECT id, source, status, triggered_by, started_at, finished_at,
            duration_ms, total_fetched, inserted_count, updated_count,
            unchanged_count, failed_count, error_message
     FROM scrape_runs
     ORDER BY started_at DESC
     LIMIT 50`,
  );

  return Response.json({ runs: rows });
}
