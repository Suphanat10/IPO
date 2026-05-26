import { query, isDatabaseConfigured } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guard";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    await requirePermission(request, "builds:read");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const data = await query(
      "SELECT * FROM build_runs ORDER BY started_at DESC LIMIT 20",
    );
    return Response.json({ runs: data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
