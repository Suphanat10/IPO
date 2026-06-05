import { query, isDatabaseConfigured } from "@/lib/db";
import { parsePositiveIdParam } from "@/lib/admin/ipo-api-validation";
import { isIpoSectionKey } from "@/lib/admin/ipo-sections";
import type { IpoSectionVerification } from "@/lib/db-types";

export const dynamic = "force-dynamic";

// Toggle the verification state of a single IPO form section. Each section
// (identity / fa / day1 / post_ipo / financials) can be verified independently
// instead of resolving the whole record at once.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { id } = await ctx.params;
  const numId = parsePositiveIdParam(id);
  if (numId == null) {
    return Response.json({ error: "Invalid IPO id" }, { status: 400 });
  }

  let body: { section?: unknown; verified?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isIpoSectionKey(body.section)) {
    return Response.json({ error: "Invalid section" }, { status: 400 });
  }
  if (typeof body.verified !== "boolean") {
    return Response.json({ error: "verified must be a boolean" }, { status: 400 });
  }
  const section = body.section;
  const verified = body.verified;

  try {
    const rows = await query<{ verified_sections: Record<string, IpoSectionVerification> | null }>(
      "SELECT verified_sections FROM ipos WHERE id = $1 LIMIT 1",
      [numId],
    );
    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const next = { ...(rows[0].verified_sections ?? {}) };
    if (verified) {
      next[section] = { verified: true, at: new Date().toISOString() };
    } else {
      delete next[section];
    }

    await query("UPDATE ipos SET verified_sections = $1::jsonb WHERE id = $2", [
      JSON.stringify(next),
      numId,
    ]);

    return Response.json({ id: numId, verified_sections: next });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
