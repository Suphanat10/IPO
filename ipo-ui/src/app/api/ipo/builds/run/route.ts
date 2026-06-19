import pool, { query, isDatabaseConfigured } from "@/lib/db";
import { runBuild } from "@/lib/builder";
import { after } from "next/server";
import type { PoolClient } from "pg";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 10;
const BUILD_LOCK_NAMESPACE = 743_101;
const BUILD_LOCK_ID = 1;

let runningPromise: Promise<void> | null = null;
let runningId: number | null = null;

async function tryAcquireBuildLock(): Promise<PoolClient | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [BUILD_LOCK_NAMESPACE, BUILD_LOCK_ID],
    );
    if (rows[0]?.locked) return client;
    client.release();
    return null;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function releaseBuildLock(client: PoolClient) {
  try {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [
      BUILD_LOCK_NAMESPACE,
      BUILD_LOCK_ID,
    ]);
  } catch (error) {
    console.error(
      "[build] failed to release advisory lock:",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    client.release();
  }
}

async function getActiveBuildRun() {
  const rows = await query<{ id: number }>(
    `SELECT id FROM build_runs
     WHERE status IN ('queued', 'running')
     ORDER BY started_at DESC NULLS LAST, id DESC
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

function runBuildInBackground(runId: number, lockClient: PoolClient) {
  runningId = runId;
  runningPromise = (async () => {
    try {
      await runBuild(runId);
    } catch (err) {
      console.error(`[build #${runId}] failed:`, err);
      // runBuild already updates build_runs on failure.
    } finally {
      runningPromise = null;
      runningId = null;
      await releaseBuildLock(lockClient);
    }
  })();

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
    // Empty body is fine.
  }

  const lockClient = await tryAcquireBuildLock();
  if (!lockClient) {
    const activeRun = await getActiveBuildRun();
    return Response.json({
      runId: activeRun?.id ?? null,
      status: "running",
      message: "A build is already running",
    });
  }

  try {
    await query(
      `UPDATE build_runs
       SET status = 'failed',
           finished_at = NOW(),
           error_message = 'Stale: cleaned up - no active build lock'
       WHERE status IN ('queued', 'running')
         AND (started_at IS NULL OR started_at < NOW() - ($1::int * INTERVAL '1 minute'))`,
      [STALE_MINUTES],
    );

    const activeRun = await getActiveBuildRun();
    if (activeRun) {
      await releaseBuildLock(lockClient);
      return Response.json({
        runId: activeRun.id,
        status: "running",
        message: "A build run is already recorded as active",
      });
    }

    const runs = await query<{ id: number }>(
      "INSERT INTO build_runs (trigger_type, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id",
      [triggerType],
    );
    const run = runs[0];

    if (!run) {
      await releaseBuildLock(lockClient);
      return Response.json(
        { error: "Failed to create build run" },
        { status: 500 },
      );
    }

    const completion = runBuildInBackground(run.id, lockClient);
    after(() => completion);

    return Response.json({
      runId: run.id,
      status: "running",
      message: "Build started",
    });
  } catch (error) {
    await releaseBuildLock(lockClient);
    throw error;
  }
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json({ running: false });
  }

  const activeRun = await getActiveBuildRun();
  return Response.json({
    running: activeRun != null || runningPromise != null,
    runId: activeRun?.id ?? runningId,
  });
}
