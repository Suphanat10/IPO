#!/usr/bin/env node
// Clears stale SEC source files out of the review queue.
//
// A `needs_review` file whose every extracted financial value already equals the
// confirmed ipo_financials adds nothing to import. The read-time API filter
// (getSecSourceFiles) already hides these, but the rows still sit in the queue.
// This marks them resolved=true so they are gone for good — it never hard-deletes,
// so the staging/evidence history is preserved.
//
// Usage:
//   node scripts/clear-matched-source-files.mjs           # dry run (report only)
//   node scripts/clear-matched-source-files.mjs --apply   # mark matching rows resolved
//
// Required env (from ipo-ui/.env.local):
//   DATABASE_URL  or  POSTGRES_HOST + POSTGRES_DB + POSTGRES_USER + POSTGRES_PASSWORD

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

// Mirrors IPO_FINANCIAL_COLUMNS in src/lib/sec-source-files.ts.
const FIN_COLS = [
  "gross_proceeds",
  "total_expense",
  "offered_shares",
  "offered_ratio_pct",
  "existing_shares_pct",
  "executive_total_pct",
  "total_assets",
  "total_liabilities",
  "total_equity",
  "revenue_latest",
  "revenue_prev",
  "net_income_latest",
  "net_income_prev",
];

// Mirrors extractedMatchesDbFinancials() in src/lib/sec-source-files.ts.
function extractedMatchesDb(extracted, db) {
  if (!extracted || !db) return false;
  let compared = 0;
  for (const col of FIN_COLS) {
    const ev = extracted[col];
    if (typeof ev !== "number" || !Number.isFinite(ev)) continue;
    compared++;
    const dv = db[col] == null ? NaN : Number(db[col]);
    if (!Number.isFinite(dv)) return false;
    if (Math.abs(ev - dv) > Math.max(1e-6, Math.abs(ev) * 1e-6)) return false;
  }
  return compared > 0;
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
    console.error("✗ DATABASE_URL or POSTGRES_HOST/POSTGRES_DB not set (ipo-ui/.env.local)");
    process.exit(1);
  }

  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: 5,
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
        max: 5,
      };

  const pool = new pg.Pool(poolConfig);
  try {
    const { rows: queue } = await pool.query(
      `SELECT id, ipo_id, symbol, file_name, extracted_fields
         FROM sec_source_files
        WHERE status = 'needs_review' AND resolved = false`,
    );
    const { rows: finRows } = await pool.query(
      `SELECT ipo_id, ${FIN_COLS.join(", ")} FROM ipo_financials`,
    );
    const byIpo = new Map();
    for (const r of finRows) byIpo.set(Number(r.ipo_id), r);

    const matched = queue.filter((r) =>
      extractedMatchesDb(r.extracted_fields, byIpo.get(Number(r.ipo_id))),
    );

    console.log(`needs_review (unresolved) rows : ${queue.length}`);
    console.log(`already match ipo_financials   : ${matched.length}`);
    for (const r of matched) {
      console.log(`  - #${r.id} ${r.symbol ?? "?"} ipo_id=${r.ipo_id} ${r.file_name ?? ""}`);
    }

    if (matched.length === 0) {
      console.log("\nNothing to clear.");
      return;
    }

    if (!apply) {
      console.log(`\nDRY RUN — re-run with --apply to mark these ${matched.length} row(s) resolved.`);
      return;
    }

    const ids = matched.map((r) => r.id);
    const { rowCount } = await pool.query(
      `UPDATE sec_source_files
          SET resolved = true, resolved_by = 'match-cleanup', resolved_at = now()
        WHERE id = ANY($1)`,
      [ids],
    );
    console.log(`\n✓ Cleared ${rowCount} row(s) from the review queue (resolved = true).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
