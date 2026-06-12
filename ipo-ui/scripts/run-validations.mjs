#!/usr/bin/env node
// Validation runner.
//
// Calls run_validations() in Postgres (seeded by migration 0003),
// prints a summary, and records the run in build_runs/build_logs so
// the Build Status page picks it up.
//
// Usage:
//   cd ipo-ui
//   node scripts/run-validations.mjs                 # run + write build log
//   node scripts/run-validations.mjs --no-build-log  # run, skip build_runs row
//   node scripts/run-validations.mjs --json          # machine-readable output
//   node scripts/run-validations.mjs --no-sync-relations

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

const NO_BUILD_LOG = process.argv.includes("--no-build-log");
const JSON_OUT = process.argv.includes("--json");
const TRIGGER_TYPE = process.argv.includes("--cron") ? "cron" : "manual";

if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
  console.error("DATABASE_URL or POSTGRES_HOST / POSTGRES_DB not set (check ipo-ui/.env.local)");
  process.exit(1);
}

const client = process.env.DATABASE_URL
  ? new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("supabase.com")
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : new pg.Client({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    });

async function recordStart() {
  if (NO_BUILD_LOG) return null;
  const res = await client.query(
    `INSERT INTO build_runs (trigger_type, status, started_at)
     VALUES ($1, 'running', now())
     RETURNING id`,
    [`validation:${TRIGGER_TYPE}`],
  );
  return res.rows[0].id;
}

async function log(runId, level, message) {
  if (!JSON_OUT) console.log(`[${level}] ${message}`);
  if (!runId) return;
  await client.query(
    `INSERT INTO build_logs (run_id, level, message) VALUES ($1, $2, $3)`,
    [runId, level, message],
  );
}

async function recordFinish(runId, status, errorMessage) {
  if (!runId) return;
  await client.query(
    `UPDATE build_runs
     SET status = $2,
         finished_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000,
         error_message = $3
     WHERE id = $1`,
    [runId, status, errorMessage ?? null],
  );
}

async function main() {
  await client.connect();
  const runId = await recordStart();
  const startedAt = Date.now();

  try {
    await log(runId, "info", "Running run_validations()...");
    const { rows } = await client.query(`SELECT * FROM run_validations()`);

    const totalErrors = await client.query(
      `SELECT COUNT(*)::int AS n FROM validation_results
       WHERE resolved = false AND severity = 'error'`,
    );
    const totalWarnings = await client.query(
      `SELECT COUNT(*)::int AS n FROM validation_results
       WHERE resolved = false AND severity = 'warning'`,
    );
    const totalInfo = await client.query(
      `SELECT COUNT(*)::int AS n FROM validation_results
       WHERE resolved = false AND severity = 'info'`,
    );

    const summary = {
      duration_ms: Date.now() - startedAt,
      rules: rows.map((r) => ({ rule: r.rule_key, count: Number(r.count) })),
      totals: {
        error: totalErrors.rows[0].n,
        warning: totalWarnings.rows[0].n,
        info: totalInfo.rows[0].n,
      },
    };

    for (const r of summary.rules) {
      await log(runId, "info", `${r.rule}: ${r.count}`);
    }
    await log(
      runId,
      "info",
      `totals — errors: ${summary.totals.error}, warnings: ${summary.totals.warning}, info: ${summary.totals.info}`,
    );

    await recordFinish(runId, "success", null);

    if (JSON_OUT) {
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else {
      console.log("\nValidation complete in", summary.duration_ms, "ms");
    }

    // exit non-zero if blocking errors exist (useful for CI)
    if (summary.totals.error > 0) process.exitCode = 2;
  } catch (err) {
    await log(runId, "error", String(err.message ?? err));
    await recordFinish(runId, "failed", String(err.message ?? err));
    console.error("Validation run failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
