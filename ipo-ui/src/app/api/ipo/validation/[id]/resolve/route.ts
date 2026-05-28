import { query, isDatabaseConfigured } from "@/lib/db";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const numId = Number(id);

  try {
    await query(
      "UPDATE validation_results SET resolved = true, resolved_at = now() WHERE id = $1",
      [numId],
    );
    return Response.json({ id: numId, resolved: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
