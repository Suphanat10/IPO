// Helper to auto-trigger a build after data mutations.
// Called from API route handlers after a successful write.
//
// Strategy: fire-and-forget POST to /api/admin/builds/run.
// The endpoint deduplicates concurrent triggers itself.

let pendingTimer: NodeJS.Timeout | null = null;

/**
 * Schedule a build, debounced — multiple rapid writes coalesce into one build.
 * Returns immediately; the build runs in the background.
 */
export function scheduleAutoBuild(reason: string) {
  if (pendingTimer) clearTimeout(pendingTimer);

  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    triggerBuildNow(reason).catch((err) => {
      console.error(`Auto-build trigger failed (${reason}):`, err);
    });
  }, 3000); // 3-second debounce so bulk edits don't fire N builds
}

async function triggerBuildNow(reason: string): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  const url = base.startsWith("http") ? base : `https://${base}`;

  try {
    await fetch(`${url}/api/admin/builds/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger_type: `auto:${reason}` }),
    });
  } catch (err) {
    // Best-effort — never throw from a trigger
    console.warn(`scheduleAutoBuild fetch failed:`, err);
  }
}
