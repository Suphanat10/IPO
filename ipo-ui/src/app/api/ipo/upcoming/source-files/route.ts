import { isDatabaseConfigured } from "@/lib/db";
import {
  getSecSourceFiles,
  type SecSourceFileStatus,
} from "@/lib/sec-source-files";

export const dynamic = "force-dynamic";

const VALID_STATUSES: SecSourceFileStatus[] = [
  "imported",
  "needs_review",
  "unchanged",
  "no_data",
  "error",
];

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const resolvedParam = url.searchParams.get("resolved");
  const limitParam = url.searchParams.get("limit");

  const status =
    statusParam && VALID_STATUSES.includes(statusParam as SecSourceFileStatus)
      ? (statusParam as SecSourceFileStatus)
      : undefined;
  const resolved =
    resolvedParam === "true"
      ? true
      : resolvedParam === "false"
        ? false
        : undefined;
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const files = await getSecSourceFiles({
      // Default to the review queue when no explicit filter is given.
      status: status ?? (resolvedParam === null && statusParam === null ? "needs_review" : status),
      resolved: resolved ?? (statusParam === null ? false : resolved),
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return Response.json({ files });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
