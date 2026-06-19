#!/usr/bin/env node
// One-off: restore the "listed" IPO rows (and their ipo_financials) that were
// deleted from the DB, re-importing them from a backup JSON under D:\IPO\backups\.
// Only inserts rows that do not already exist (ON CONFLICT DO NOTHING), so the
// live "upcoming" rows are never touched. Idempotent.
//
// Usage: node scripts/restore-listed.mjs [path-to-backup.json]
// Env (ipo-ui/.env.local): DATABASE_URL

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(ROOT, "..");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

const DEFAULT_BACKUP = resolve(
  REPO_ROOT,
  "backups",
  "db-backup-2026-06-17T03-56-17-243Z.json",
);
const backupPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_BACKUP;

// jsonb columns need explicit JSON.stringify + ::jsonb cast (node-pg would
// otherwise turn a JS array into a Postgres array literal).
const JSONB_COLS = new Set(["verified_sections"]);

function buildInsert(table, rows, conflictCols) {
  const cols = Object.keys(rows[0]);
  const colSql = cols.map((c) => `"${c}"`).join(", ");
  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = cols.map((c) => {
      const idx = values.length + 1;
      if (JSONB_COLS.has(c)) {
        values.push(row[c] == null ? null : JSON.stringify(row[c]));
        return `$${idx}::jsonb`;
      }
      values.push(row[c]);
      return `$${idx}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const sql =
    `INSERT INTO "${table}" (${colSql}) VALUES ${tuples.join(", ")} ` +
    `ON CONFLICT (${conflictCols}) DO NOTHING`;
  return { sql, values };
}

async function insertInChunks(client, table, rows, conflictCols, chunk = 100) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { sql, values } = buildInsert(table, slice, conflictCols);
    const res = await client.query(sql, values);
    inserted += res.rowCount;
  }
  return inserted;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL not set in ipo-ui/.env.local");
    process.exit(1);
  }

  console.log(`→ Backup: ${backupPath}`);
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  const allIpos = backup.tables.ipos ?? [];
  const allFin = backup.tables.ipo_financials ?? [];

  const listed = allIpos.filter((r) => r.status === "listed");
  const listedIds = new Set(listed.map((r) => r.id));
  const fin = allFin.filter((r) => listedIds.has(r.ipo_id));

  console.log(`→ Listed IPOs in backup: ${listed.length}`);
  console.log(`→ Matching ipo_financials: ${fin.length}`);

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: process.env.DATABASE_URL.includes("supabase.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const iposInserted = await insertInChunks(client, "ipos", listed, "id");
    const finInserted = await insertInChunks(
      client,
      "ipo_financials",
      fin,
      "ipo_id",
    );
    await client.query("COMMIT");
    console.log(`✓ ipos inserted (new): ${iposInserted}`);
    console.log(`✓ ipo_financials inserted (new): ${finInserted}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  console.log("✓ Restore complete.");
}

main().catch((e) => {
  console.error("\n✗ Restore failed:", e.message);
  process.exit(1);
});
