import { isDatabaseConfigured } from "@/lib/db";
import { reprocessSourceFile } from "@/lib/sec-source-files";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const result = await reprocessSourceFile(numId);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
