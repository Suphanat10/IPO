#!/usr/bin/env node
// Full database backup → single timestamped JSON file under D:\IPO\backups\.
// Dumps every base table in the public schema (SELECT *). Used as a safety net
// before a destructive wipe so the data can be re-imported if needed.
//
// Env (from ipo-ui/.env.local): DATABASE_URL (or POSTGRES_* fallback)

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // ipo-ui
const REPO_ROOT = resolve(ROOT, ".."); // D:\IPO
const BACKUP_DIR = resolve(REPO_ROOT, "backups");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

async function main() {
  if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
    console.error("✗ DATABASE_URL or POSTGRES_HOST/POSTGRES_DB not set in ipo-ui/.env.local");
    process.exit(1);
  }

  const pool = new pg.Pool(
    process.env.DATABASE_URL
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
        },
  );

  console.log("→ Connecting…");
  const { rows: tableRows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const tables = tableRows.map((r) => r.tablename);

  const backup = {
    meta: {
      created_at: new Date().toISOString(),
      database: (() => {
        try {
          return new URL(process.env.DATABASE_URL).pathname.slice(1);
        } catch {
          return process.env.POSTGRES_DB ?? "unknown";
        }
      })(),
      table_count: tables.length,
      counts: {},
    },
    tables: {},
  };

  for (const t of tables) {
    const { rows } = await pool.query(`SELECT * FROM "${t}"`);
    backup.tables[t] = rows;
    backup.meta.counts[t] = rows.length;
    console.log(`  ✓ ${t.padEnd(24)} ${rows.length} rows`);
  }

  await pool.end();

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(BACKUP_DIR, `db-backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2), "utf8");

  const total = Object.values(backup.meta.counts).reduce((a, b) => a + b, 0);
  console.log(`\n✓ Backup complete: ${total} rows across ${tables.length} tables`);
  console.log(`  → ${file}`);
}

main().catch((e) => {
  console.error("\n✗ Backup failed:", e.message);
  process.exit(1);
});
