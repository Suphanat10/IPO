import { query, isDatabaseConfigured } from "@/lib/db";

export async function POST() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const ghToken = process.env.GH_TOKEN;
  const ghRepo = process.env.GH_REPO;
  const ghWorkflow = process.env.GH_WORKFLOW ?? "build.yml";

  // Clean up stale queued/running rows from previous crashes
  await query(
    "UPDATE build_runs SET status = 'failed', finished_at = NOW(), error_message = 'Stale: cleaned up by trigger' WHERE status IN ('queued', 'running') AND (started_at IS NULL OR started_at < NOW() - INTERVAL '10 minutes')",
  );

  const runs = await query<{ id: number }>(
    "INSERT INTO build_runs (trigger_type, status, started_at) VALUES ('manual', 'running', NOW()) RETURNING id",
  );
  const run = runs[0];

  if (!run) {
    return Response.json(
      { error: "Failed to create build run" },
      { status: 500 },
    );
  }

  if (ghToken && ghRepo) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ghRepo}/actions/workflows/${ghWorkflow}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { run_id: String(run.id) },
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        await query(
          "UPDATE build_runs SET status = 'failed', finished_at = now(), error_message = $1 WHERE id = $2",
          ["GitHub dispatch failed: " + res.status + " " + text, run.id],
        );
        return Response.json(
          { error: `GitHub Actions dispatch failed: ${res.status}`, runId: run.id },
          { status: 502 },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await query(
        "UPDATE build_runs SET status = 'failed', finished_at = now(), error_message = $1 WHERE id = $2",
        [msg, run.id],
      );
      return Response.json(
        { error: "GitHub dispatch failed", runId: run.id },
        { status: 502 },
      );
    }
  } else {
    await query(
      "UPDATE build_runs SET status = 'failed', finished_at = now(), error_message = $1 WHERE id = $2",
      ["GH_TOKEN / GH_REPO not set. Configure in .env.local.", run.id],
    );
  }

  return Response.json({ runId: run.id });
}
