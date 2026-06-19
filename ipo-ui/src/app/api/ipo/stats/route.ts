import { query, isDatabaseConfigured } from "@/lib/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const [statsRows, buildsRows] = await Promise.all([
    query("SELECT * FROM v_dashboard_stats LIMIT 1"),
    query(
      "SELECT id, status, finished_at, duration_ms, artifact_size FROM build_runs ORDER BY started_at DESC LIMIT 5",
    ),
  ]);

  return Response.json({
    stats: statsRows[0] ?? null,
    recentBuilds: buildsRows,
  });
}
