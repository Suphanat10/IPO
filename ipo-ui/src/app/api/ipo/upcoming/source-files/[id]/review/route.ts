import { isDatabaseConfigured } from "@/lib/db";
import {
  reviewSourceFile,
  type SecReviewAction,
  type FsFinancialFields,
} from "@/lib/sec-source-files";

const VALID_ACTIONS: SecReviewAction[] = ["approved", "rejected", "edited"];

export async function POST(
  request: Request,
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

  let body: { action?: string; fields?: FsFinancialFields; reviewer?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action as SecReviewAction;
  if (!VALID_ACTIONS.includes(action)) {
    return Response.json(
      { error: `action must be one of ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }
  if (action === "edited" && (!body.fields || typeof body.fields !== "object")) {
    return Response.json(
      { error: "edited action requires a `fields` object." },
      { status: 400 },
    );
  }

  try {
    const result = await reviewSourceFile(numId, action, {
      fields: body.fields,
      reviewer: body.reviewer ?? null,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
