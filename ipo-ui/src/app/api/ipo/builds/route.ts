import { query, isDatabaseConfigured } from "@/lib/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
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
