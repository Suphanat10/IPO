import { NextResponse } from "next/server";
import path from "path";
import { readFile, access } from "fs/promises";

export async function GET() {
  // Primary path (works locally + CI builds)
  const primaryPath = path.join(process.cwd(), "src/app/data/ipo.json");
  // Fallback path (Vercel serverless — filesystem is read-only, builds write to /tmp)
  const tmpPath = "/tmp/ipo.json";

  let raw: string;
  try {
    // Try /tmp first (freshest data from runtime builds on Vercel)
    await access(tmpPath);
    raw = await readFile(tmpPath, "utf-8");
  } catch {
    // Fall back to bundled file
    raw = await readFile(primaryPath, "utf-8");
  }

  const data = JSON.parse(raw);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
}
