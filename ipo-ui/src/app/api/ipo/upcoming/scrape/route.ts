import { isDatabaseConfigured } from "@/lib/db";
import { ScrapeAlreadyRunningError, triggerScrape } from "@/lib/scraper-runner";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** When CRON_SECRET is set, the public cron entry (GET) must present it as a
 *  Bearer token — this is what Vercel Cron sends. Without it, anyone hitting
 *  the URL could repeatedly kick off the 300s scrape job. If the secret is
 *  unset (local/personal dev) the gate is a no-op so nothing breaks. */
function cronSecretRejection(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function startScrape(triggeredBy: string) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    const { runId, completion } = await triggerScrape(triggeredBy);
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

export async function GET(request: Request) {
  const rejected = cronSecretRejection(request);
  if (rejected) return rejected;
  return startScrape("vercel-cron");
}

export async function POST() {
  return startScrape("admin");
}
