import path from "path";
import { readFile, access } from "fs/promises";

// Shared reader for build artifacts (ipo.json + the per-slice files under
// src/app/data/ipo/). Prefers the runtime-built /tmp copy first — on a
// read-only filesystem (Vercel) runBuild writes there — then falls back to the
// bundled file. Mirrors the original inline logic in /api/ipo-data.
export async function readArtifactRaw(
  primaryRelPath: string,
  tmpPath: string,
): Promise<string> {
  try {
    await access(tmpPath);
    return await readFile(tmpPath, "utf-8");
  } catch {
    return await readFile(path.join(process.cwd(), primaryRelPath), "utf-8");
  }
}

// The top-level ipo.json keys that make up each slice. Single source of truth:
// builder.ts writes the slice files from this map, and readSlice() derives a
// slice from the full ipo.json using the same map when a slice file is missing.
export const SLICE_KEYS: Record<string, string[]> = {
  summary: [
    "generatedAt",
    "counts",
    "faPersons",
    "faCompanies",
    "leadUnderwriters",
    "faPersonOptions",
    "faCompanyOptions",
    "leadUnderwriterOptions",
    "coUnderwriterOptions",
    "peerBySector",
    "peerByIndustry",
    "sectorParent",
    "sectorMapping",
    "knownSectors",
    "knownIndustries",
    "tierThresholds",
    "globalBase",
    "globalFundamentalStats",
    "fundamentalsBySymbol",
  ],
  leadco: ["leadCo", "leadCoIndex"],
  companies: ["companies"],
  rawipo: ["rawIpo"],
  details: ["ipoDetails"],
};

/** Project a slice payload out of a parsed full ipo.json object. */
export function extractSlice(
  full: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SLICE_KEYS[name] ?? []) out[key] = full[key];
  return out;
}

// Short-lived memo of the parsed full ipo.json, used only by the fallback path
// so a deploy that ships ipo.json but no slice files doesn't re-parse the full
// ~3.7MB artifact on every slice request. Read-only build data — safe to share.
let fullCache: { at: number; data: Record<string, unknown> } | null = null;
const FULL_CACHE_TTL_MS = 30_000;

async function readFullArtifact(): Promise<Record<string, unknown>> {
  if (fullCache && Date.now() - fullCache.at < FULL_CACHE_TTL_MS) {
    return fullCache.data;
  }
  const raw = await readArtifactRaw("src/app/data/ipo.json", "/tmp/ipo.json");
  const data = JSON.parse(raw) as Record<string, unknown>;
  fullCache = { at: Date.now(), data };
  return data;
}

/**
 * Read and parse one slice (summary | leadco | companies | rawipo | details).
 * Falls back to deriving the slice from the full ipo.json when the dedicated
 * slice file is absent — so a fresh deploy that only ships the git-tracked
 * ipo.json still serves every /api/ipo-data/* endpoint.
 */
export async function readSlice<T = unknown>(name: string): Promise<T> {
  try {
    const raw = await readArtifactRaw(
      `src/app/data/ipo/${name}.json`,
      `/tmp/ipo-${name}.json`,
    );
    return JSON.parse(raw) as T;
  } catch {
    const full = await readFullArtifact();
    return extractSlice(full, name) as T;
  }
}

export const ARTIFACT_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
} as const;

/**
 * Parse optional `?page` / `?pageSize` from a request URL. Returns null when
 * neither is present, signalling the caller to return the full slice (the
 * aggregate-analytics paths need the whole array; pagination is for list views).
 */
export function paginateParams(
  url: string,
): { page: number; pageSize: number } | null {
  const sp = new URL(url).searchParams;
  if (!sp.has("page") && !sp.has("pageSize")) return null;
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    Math.max(1, Number(sp.get("pageSize") ?? 50) || 50),
    1000,
  );
  return { page, pageSize };
}
