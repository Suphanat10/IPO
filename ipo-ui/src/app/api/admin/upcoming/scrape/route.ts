import { isDatabaseConfigured } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guard";
import { logScraperEvent } from "@/lib/audit";
import { ScrapeAlreadyRunningError, triggerScrape } from "@/lib/scraper-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let session;
  try {
    session = await requirePermission(request, "scraper:trigger");
  } catch (response) {
    return response as Response;
  }

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    const { runId } = await triggerScrape(session.email);
    await logScraperEvent({
      request,
      actorUserId: session.userId,
      actorEmail: session.email,
      entity: "scrape_runs",
      entityId: runId,
      action: "scraper_triggered",
      diff: {
        triggered_by: session.email,
        run_id: runId,
      },
    });
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
