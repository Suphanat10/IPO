#!/usr/bin/env node
// Build ipo.json directly from Postgres (no manual CSV step).
// Pipeline: Postgres → temporary CSVs → build-data.mjs → ipo.json
//
// This is the primary build entry point.
// Used by:
//   - Manual "Build" button in /admin/builds
//   - Auto-triggered after every IPO create/update/delete
//   - GitHub Actions (CI)
//
// Optional env:
//   BUILD_RUN_ID — if set, writes status/logs to build_runs table

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

const RUN_ID = process.env.BUILD_RUN_ID ? Number(process.env.BUILD_RUN_ID) : null;

// ────────────────────────────────────────────────────────────────────
// PostgreSQL logging (optional)
// ────────────────────────────────────────────────────────────────────
let pool = null;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
    return null;
  }
  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: 3,
        ssl: process.env.DATABASE_URL.includes("supabase.com")
          ? { rejectUnauthorized: false }
          : undefined,
      }
    : {
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        max: 3,
      };
  pool = new pg.Pool(poolConfig);
  return pool;
}

async function log(level, message) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}`;
  if (level === "error") console.error(line);
  else console.log(line);

  if (RUN_ID) {
    const p = getPool();
    if (p) {
      await p.query(
        "INSERT INTO build_logs (run_id, level, message) VALUES ($1, $2, $3)",
        [RUN_ID, level, message],
      );
    }
  }
}

async function updateRun(patch) {
  if (!RUN_ID) return;
  const p = getPool();
  if (!p) return;
  const entries = Object.entries(patch);
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 2}`);
  const values = [RUN_ID, ...entries.map(([, v]) => v)];
  await p.query(
    `UPDATE build_runs SET ${setClauses.join(", ")} WHERE id = $1`,
    values,
  );
}

// ────────────────────────────────────────────────────────────────────
// Run child process and capture output
// ────────────────────────────────────────────────────────────────────
function runScript(scriptPath, label) {
  return new Promise((res, rej) => {
    const child = spawn("node", [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (b) => {
      const lines = b.toString().split("\n").filter(Boolean);
      for (const ln of lines) log("info", `[${label}] ${ln}`);
    });
    child.stderr.on("data", (b) => {
      const lines = b.toString().split("\n").filter(Boolean);
      for (const ln of lines) log("warn", `[${label}] ${ln}`);
    });

    child.on("error", (err) => rej(err));
    child.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`${label} exited with code ${code}`));
    });
  });
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  await log("info", "Build pipeline started (Postgres → ipo.json)");

  try {
    // Step 1: Export DB → CSVs
    await log("info", "Step 1/2: Exporting Postgres → CSVs");
    await runScript(resolve(__dirname, "export-from-db.mjs"), "export");

    // Step 2: Build CSVs → ipo.json
    await log("info", "Step 2/2: Building CSVs → ipo.json");
    await runScript(resolve(__dirname, "build-data.mjs"), "build");

    // Compute artifact metadata
    const artifactPath = resolve(ROOT, "src", "app", "data", "ipo.json");
    let artifactSize = null;
    let artifactSha = null;
    if (existsSync(artifactPath)) {
      artifactSize = statSync(artifactPath).size;
      artifactSha = createHash("sha256")
        .update(readFileSync(artifactPath))
        .digest("hex")
        .slice(0, 12);
    }

    const duration = Date.now() - startTime;
    await log("info", `Build succeeded in ${duration}ms — ${artifactSize} bytes, sha=${artifactSha}`);
    await updateRun({
      status: "success",
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      artifact_size: artifactSize,
      artifact_sha: artifactSha,
    });

    if (pool) await pool.end();
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log("error", `Build failed: ${msg}`);
    await updateRun({
      status: "failed",
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error_message: msg,
    });
    if (pool) await pool.end();
    process.exit(1);
  }
}

main();
