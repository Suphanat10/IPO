import { NextResponse } from "next/server";
import {
  readSlice,
  paginateParams,
  ARTIFACT_CACHE_HEADERS,
} from "@/lib/artifact";

// ipoDetails slice. Full array by default (consumers build a bySymbol map);
// pass ?page&pageSize for a paged list view.
export async function GET(request: Request) {
  const slice = await readSlice<{ ipoDetails: unknown[] }>("details");
  const pg = paginateParams(request.url);
  if (!pg) {
    return NextResponse.json(slice, { headers: ARTIFACT_CACHE_HEADERS });
  }
  const start = (pg.page - 1) * pg.pageSize;
  return NextResponse.json(
    {
      ipoDetails: slice.ipoDetails.slice(start, start + pg.pageSize),
      total: slice.ipoDetails.length,
      page: pg.page,
      pageSize: pg.pageSize,
    },
    { headers: ARTIFACT_CACHE_HEADERS },
  );
}
