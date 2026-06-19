import { query, isDatabaseConfigured } from "@/lib/db";
import { syncMaturedIpoStatuses } from "@/lib/ipo-status";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
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

export async function POST() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    await syncMaturedIpoStatuses();
    const data = await query("SELECT run_validations() AS result");
    return Response.json({ summary: data[0]?.result ?? [] });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
