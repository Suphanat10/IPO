import { query, isDatabaseConfigured } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guard";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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
