import { NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";

export async function GET() {
  const filePath = path.join(process.cwd(), "src/app/data/ipo.json");
  const raw = await readFile(filePath, "utf-8");
  const data = JSON.parse(raw);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
}
