import { isDatabaseConfigured } from "@/lib/db";
import { ScrapeAlreadyRunningError, triggerScrape } from "@/lib/scraper-runner";
import { after } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    const { runId, completion } = await triggerScrape("admin");
    after(() => completion);
    return Response.json({ runId, status: "running" }, { status: 202 });
  } catch (e) {
    if (e instanceof ScrapeAlreadyRunningError) {
      return Response.json(
        { error: "มี scraper กำลังทำงานอยู่ / Another scrape is already running" },
        { status: 409 },
      );
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to start scrape" },
      { status: 500 },
    );
  }
}
