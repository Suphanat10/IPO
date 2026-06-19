import { NextResponse } from "next/server";
import { readSlice, ARTIFACT_CACHE_HEADERS } from "@/lib/artifact";

// Small first-paint slice: summary tables, options, peer/sector stats,
// tierThresholds, globalBase, fundamentalsBySymbol, counts. See builder.ts.
export async function GET() {
  const data = await readSlice("summary");
  return NextResponse.json(data, { headers: ARTIFACT_CACHE_HEADERS });
}
