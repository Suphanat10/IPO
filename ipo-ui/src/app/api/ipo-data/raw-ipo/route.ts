import { NextResponse } from "next/server";
import {
  readSlice,
  paginateParams,
  ARTIFACT_CACHE_HEADERS,
} from "@/lib/artifact";

// rawIpo slice. Full array by default (the FA/lead-co analytics aggregate over
// all rows); pass ?page&pageSize for a paged list view.
export async function GET(request: Request) {
  const slice = await readSlice<{ rawIpo: unknown[] }>("rawipo");
  const pg = paginateParams(request.url);
  if (!pg) {
    return NextResponse.json(slice, { headers: ARTIFACT_CACHE_HEADERS });
  }
  const start = (pg.page - 1) * pg.pageSize;
  return NextResponse.json(
    {
      rawIpo: slice.rawIpo.slice(start, start + pg.pageSize),
      total: slice.rawIpo.length,
      page: pg.page,
      pageSize: pg.pageSize,
    },
    { headers: ARTIFACT_CACHE_HEADERS },
  );
}
