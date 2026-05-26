import { query, isDatabaseConfigured } from "@/lib/db";
import { syncMaturedIpoStatuses } from "@/lib/ipo-status";
import { requirePermission } from "@/lib/auth-guard";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    await requirePermission(request, "validation:read");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    await syncMaturedIpoStatuses();
    const data = await query(
      `SELECT vr.*, i.symbol
       FROM validation_results vr
       LEFT JOIN ipos i ON i.id = vr.ipo_id
       WHERE vr.resolved = false
       ORDER BY vr.severity ASC, vr.detected_at DESC`,
    );
    return Response.json({ results: data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    await requirePermission(request, "validation:write");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    await syncMaturedIpoStatuses();
    const data = await query("SELECT run_validations() AS result");
    return Response.json({ summary: data[0]?.result ?? [] });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
