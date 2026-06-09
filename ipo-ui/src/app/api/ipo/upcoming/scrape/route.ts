import { isDatabaseConfigured } from "@/lib/db";
import { ScrapeAlreadyRunningError, triggerScrape } from "@/lib/scraper-runner";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorizedCronResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function validateCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      return unauthorizedCronResponse("CRON_SECRET is not configured.", 500);
    }
    return null;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return unauthorizedCronResponse("Unauthorized cron request.", 401);
  }

  return null;
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
  const unauthorized = validateCronRequest(request);
  if (unauthorized) return unauthorized;

  return startScrape("vercel-cron");
}

export async function POST() {
  return startScrape("admin");
}
