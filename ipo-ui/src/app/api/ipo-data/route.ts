import { NextResponse } from "next/server";
import { readArtifactRaw, ARTIFACT_CACHE_HEADERS } from "@/lib/artifact";

// Full ipo.json blob. Kept for back-compat; new client code fetches the smaller
// per-slice endpoints under /api/ipo-data/* instead.
export async function GET() {
  const raw = await readArtifactRaw("src/app/data/ipo.json", "/tmp/ipo.json");
  const data = JSON.parse(raw);

  return NextResponse.json(data, { headers: ARTIFACT_CACHE_HEADERS });
}
