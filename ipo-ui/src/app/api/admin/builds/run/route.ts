import { exec } from "node:child_process";
import { query, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 10;

let runningPromise: Promise<void> | null = null;
let runningId: number | null = null;

function runBuildInBackground(runId: number) {
  if (runningPromise) return runningPromise;

  runningId = runId;
  runningPromise = new Promise<void>((res) => {
    const child = exec(`node scripts/build-from-db.mjs`, {
      env: { ...process.env, BUILD_RUN_ID: String(runId) },
    });

    child.stdout?.on("data", (b) => {
      process.stdout.write(`[build #${runId}] ${b}`);
    });
    child.stderr?.on("data", (b) => {
      process.stderr.write(`[build #${runId}] ${b}`);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        query(
          "UPDATE build_runs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2 AND status = 'running'",
          [`Process exited with code ${code}`, runId],
        ).catch(() => {});
      }
      runningPromise = null;
      runningId = null;
      res();
    });
    child.on("error", (err) => {
      query(
        "UPDATE build_runs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2 AND status = 'running'",
        [err.message, runId],
      ).catch(() => {});
      runningPromise = null;
      runningId = null;
      res();
    });
  });

  return runningPromise;
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  let triggerType = "manual";
  try {
    const body = await request.json();
    if (body && typeof body.trigger_type === "string") {
      triggerType = body.trigger_type;
    }
  } catch {
    // empty body is fine
  }

  // Block if a build is actually running in this process
  if (runningPromise && runningId) {
    return Response.json({
      runId: runningId,
      status: "running",
      message: "A build is already running",
    });
  }

  // Clean up stale queued/running rows (server restart, crash, etc.)
  await query(
    `UPDATE build_runs SET status = 'failed', finished_at = NOW(), error_message = 'Stale: cleaned up — no active process' WHERE status IN ('queued', 'running') AND (started_at IS NULL OR started_at < NOW() - INTERVAL '${STALE_MINUTES} minutes')`,
  );

  const runs = await query<{ id: number }>(
    "INSERT INTO build_runs (trigger_type, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id",
    [triggerType],
  );
  const run = runs[0];

  if (!run) {
    return Response.json(
      { error: "Failed to create build run" },
      { status: 500 },
    );
  }

  runBuildInBackground(run.id).catch((e) => {
    console.error(`Build #${run.id} crashed:`, e);
  });

  return Response.json({
    runId: run.id,
    status: "running",
    message: "Build started",
  });
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json({ running: false });
  }

  return Response.json({
    running: runningPromise != null,
    runId: runningId,
  });
}
