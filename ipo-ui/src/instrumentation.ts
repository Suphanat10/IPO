export async function register() {
  // This app deploys as a single long-running Docker container (not serverless
  // and not horizontally scaled), so the in-process scheduler is the owner of
  // scheduled scrapes. On Vercel/multi-replica hosts, prefer an external cron
  // (see vercel.json) and set SCHEDULER_DISABLED=1 to avoid duplicate triggers.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.SCHEDULER_DISABLED !== "1"
  ) {
    const { startScheduler } = await import("./lib/scraper-scheduler");
    startScheduler();
  }
}
