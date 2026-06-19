import { NextResponse } from "next/server";
import { readSlice, ARTIFACT_CACHE_HEADERS } from "@/lib/artifact";

// Heavy slice: { leadCo, leadCoIndex }. The lead/co analytics aggregate over
// the whole index, so this is served whole (no pagination).
export async function GET() {
  const data = await readSlice("leadco");
  return NextResponse.json(data, { headers: ARTIFACT_CACHE_HEADERS });
}
