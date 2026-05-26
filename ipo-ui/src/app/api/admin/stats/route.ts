import { query, isDatabaseConfigured } from "@/lib/db";
import { syncMaturedIpoStatuses } from "@/lib/ipo-status";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  await syncMaturedIpoStatuses();

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
