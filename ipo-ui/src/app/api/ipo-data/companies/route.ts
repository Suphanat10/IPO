import { NextResponse } from "next/server";
import {
  readSlice,
  paginateParams,
  ARTIFACT_CACHE_HEADERS,
} from "@/lib/artifact";

// Companies slice. Returns the full array by default (analytics/autocomplete
// need it whole); pass ?page&pageSize for a paged list view.
export async function GET(request: Request) {
  const slice = await readSlice<{ companies: unknown[] }>("companies");
  const pg = paginateParams(request.url);
  if (!pg) {
    return NextResponse.json(slice, { headers: ARTIFACT_CACHE_HEADERS });
  }
  const start = (pg.page - 1) * pg.pageSize;
  return NextResponse.json(
    {
      companies: slice.companies.slice(start, start + pg.pageSize),
      total: slice.companies.length,
      page: pg.page,
      pageSize: pg.pageSize,
    },
    { headers: ARTIFACT_CACHE_HEADERS },
  );
}
