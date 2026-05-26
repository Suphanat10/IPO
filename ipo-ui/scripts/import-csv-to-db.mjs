#!/usr/bin/env node
// Imports CSVs from src/app/data/ → Postgres (Supabase).
// One-shot migration: run after schema is applied.
//
// Required env (loaded from ipo-ui/.env.local automatically):
//   DATABASE_URL=postgresql://postgres:[PW]@db.<project>.supabase.co:5432/postgres
//
// Usage:
//   cd ipo-ui
//   node scripts/import-csv-to-db.mjs              # full import
//   node scripts/import-csv-to-db.mjs --dry-run    # parse only, no writes

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "src", "app", "data");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

const DRY_RUN = process.argv.includes("--dry-run");

// =========================================================
// CSV parsing (same algorithm as build-data.mjs)
// =========================================================
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

function parsePyList(s) {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed === "nan" || trimmed === "[]") return null;
  if (!trimmed.startsWith("[")) return [trimmed]; // single string
  const inner = trimmed.replace(/^\[|\]$/g, "");
  if (!inner.trim()) return null;
  const items = [];
  let buf = "", inStr = false, quote = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (!inStr && (c === "'" || c === '"')) { inStr = true; quote = c; continue; }
    if (inStr && c === quote) { inStr = false; items.push(buf); buf = ""; continue; }
    if (inStr) buf += c;
  }
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

// fa_persons / fa_companies are flat strings in CSV, may contain "/" or "," separators
function splitFlat(s) {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed === "nan") return null;
  const parts = trimmed.split(/[\/,]/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

function num(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "nan" || s === "NaN") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === "nan") return null;
  // accept YYYY-MM-DD or YYYY/MM/DD
  return s.replace(/\//g, "-");
}

function readCSV(filename) {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`! ${filename} not found, skipping`);
    return [];
  }
  return parseCSV(readFileSync(path, "utf8"));
}

// =========================================================
// Main
// =========================================================
async function main() {
  const baseRows = readCSV("base.csv");
  const finRows = readCSV("financials.csv");
  const sectorRows = readCSV("df_sector.csv");
  const faNormRows = readCSV("fa_company_norm.csv");

  console.log(`→ base.csv:           ${baseRows.length} rows`);
  console.log(`→ financials.csv:     ${finRows.length} rows`);
  console.log(`→ df_sector.csv:      ${sectorRows.length} rows`);
  console.log(`→ fa_company_norm:    ${faNormRows.length} rows`);

  // Index sector by symbol
  const sectorBySymbol = new Map();
  for (const r of sectorRows) {
    sectorBySymbol.set(r.symbol, {
      market: r.Market || null,
      industry: r["Industry Group (กลุ่มอุตสาหกรรม)"] || null,
      sector: r["Sector (หมวดธุรกิจ)"] || null,
    });
  }

  // Index financials by symbol
  const finBySymbol = new Map(finRows.map((r) => [r.symbol, r]));

  if (DRY_RUN) {
    console.log("\n=== DRY RUN — sample row ===");
    const sample = baseRows[1];
    const sec = sectorBySymbol.get(sample.symbol) || {};
    console.log({
      symbol: sample.symbol,
      ...sec,
      listing_date: dateOrNull(sample.first_trade_date),
      ipo_price: num(sample.ipo_price),
      fa_persons: parsePyList(sample.fa_persons),
      fa_companies: parsePyList(sample.fa_companies),
      lead_uw: parsePyList(sample.lead_underwriters_norm),
      co_uws: parsePyList(sample.co_underwriters_norm),
      financials: finBySymbol.get(sample.symbol),
    });
    console.log("\n(dry run — no writes)");
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Create ipo-ui/.env.local from .env.example");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("\n✓ Connected to Postgres");

  try {
    await client.query("BEGIN");

    // 1. sectors
    console.log("→ Inserting sectors…");
    let sectorOk = 0;
    for (const r of sectorRows) {
      if (!r.symbol) continue;
      await client.query(
        `INSERT INTO sectors (symbol, market, industry, sector)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (symbol) DO UPDATE
         SET market=EXCLUDED.market, industry=EXCLUDED.industry, sector=EXCLUDED.sector`,
        [
          r.symbol,
          r.Market || null,
          r["Industry Group (กลุ่มอุตสาหกรรม)"] || null,
          r["Sector (หมวดธุรกิจ)"] || null,
        ],
      );
      sectorOk++;
    }
    console.log(`  ${sectorOk} sectors`);

    // 2. fa_normalizations
    console.log("→ Inserting fa_normalizations…");
    let faNormOk = 0;
    for (const r of faNormRows) {
      if (!r.fa_companies || !r.fa_company_norm) continue;
      await client.query(
        `INSERT INTO fa_normalizations (raw_name, normalized_name)
         VALUES ($1,$2)
         ON CONFLICT (raw_name) DO UPDATE
         SET normalized_name=EXCLUDED.normalized_name`,
        [r.fa_companies, r.fa_company_norm],
      );
      faNormOk++;
    }
    console.log(`  ${faNormOk} fa_normalizations`);

    // 3. ipos + ipo_financials
    console.log("→ Inserting ipos + financials…");
    let ipoOk = 0;
    let finOk = 0;
    for (const r of baseRows) {
      if (!r.symbol) continue;
      const sec = sectorBySymbol.get(r.symbol) || {};
      const listing = dateOrNull(r.first_trade_date);
      const today = new Date().toISOString().slice(0, 10);
      const status = !listing ? "upcoming"
                  : listing > today ? "upcoming" : "listed";

      const res = await client.query(
        `INSERT INTO ipos (
            symbol, market, industry, sector, status, listing_date,
            ipo_price, open_d1, high_d1, low_d1,
            close_d1, close_d2, close_d3, close_d4, close_d5,
            close_1w, close_1m, close_3m, close_6m,
            fa_persons, fa_companies, lead_uw, co_uws,
            source
         ) VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,
            $11,$12,$13,$14,$15,
            $16,$17,$18,$19,
            $20,$21,$22,$23,
            'csv_import'
         )
         ON CONFLICT (symbol) DO UPDATE SET
            market=EXCLUDED.market, industry=EXCLUDED.industry, sector=EXCLUDED.sector,
            status=EXCLUDED.status, listing_date=EXCLUDED.listing_date,
            ipo_price=EXCLUDED.ipo_price,
            open_d1=EXCLUDED.open_d1, high_d1=EXCLUDED.high_d1, low_d1=EXCLUDED.low_d1,
            close_d1=EXCLUDED.close_d1, close_d2=EXCLUDED.close_d2, close_d3=EXCLUDED.close_d3,
            close_d4=EXCLUDED.close_d4, close_d5=EXCLUDED.close_d5,
            close_1w=EXCLUDED.close_1w, close_1m=EXCLUDED.close_1m,
            close_3m=EXCLUDED.close_3m, close_6m=EXCLUDED.close_6m,
            fa_persons=EXCLUDED.fa_persons, fa_companies=EXCLUDED.fa_companies,
            lead_uw=EXCLUDED.lead_uw, co_uws=EXCLUDED.co_uws,
            updated_at=now()
         RETURNING id`,
        [
          r.symbol,
          sec.market, sec.industry, sec.sector,
          status, listing,
          num(r.ipo_price), num(r.open_d1), num(r.high_d1), num(r.low_d1),
          num(r.close_d1), num(r.close_d2), num(r.close_d3), num(r.close_d4), num(r.close_d5),
          num(r.close_1W), num(r.close_1M), num(r.close_3M), num(r.close_6M),
          splitFlat(r.fa_persons),
          splitFlat(r.fa_companies),
          parsePyList(r.lead_underwriters_norm),
          parsePyList(r.co_underwriters_norm),
        ],
      );
      ipoOk++;
      const ipoId = res.rows[0].id;

      const f = finBySymbol.get(r.symbol);
      if (f) {
        await client.query(
          `INSERT INTO ipo_financials (
              ipo_id, gross_proceeds, total_expense,
              offered_shares, offered_ratio_pct, existing_shares_pct, executive_total_pct,
              total_assets, total_liabilities, total_equity,
              revenue_latest, revenue_prev, net_income_latest, net_income_prev
           ) VALUES (
              $1,$2,$3,
              $4,$5,$6,$7,
              $8,$9,$10,
              $11,$12,$13,$14
           )
           ON CONFLICT (ipo_id) DO UPDATE SET
              gross_proceeds=EXCLUDED.gross_proceeds, total_expense=EXCLUDED.total_expense,
              offered_shares=EXCLUDED.offered_shares, offered_ratio_pct=EXCLUDED.offered_ratio_pct,
              existing_shares_pct=EXCLUDED.existing_shares_pct,
              executive_total_pct=EXCLUDED.executive_total_pct,
              total_assets=EXCLUDED.total_assets, total_liabilities=EXCLUDED.total_liabilities,
              total_equity=EXCLUDED.total_equity,
              revenue_latest=EXCLUDED.revenue_latest, revenue_prev=EXCLUDED.revenue_prev,
              net_income_latest=EXCLUDED.net_income_latest, net_income_prev=EXCLUDED.net_income_prev,
              updated_at=now()`,
          [
            ipoId,
            num(f.gross_proceeds), num(f.total_expense),
            num(f.offered_shares), num(f.offered_ratio_pct),
            num(f.existing_shares_pct), num(f.executive_total_pct),
            num(f.total_assets), num(f.total_liabilities), num(f.total_equity),
            num(f.revenue_latest), num(f.revenue_prev),
            num(f.net_income_latest), num(f.net_income_prev),
          ],
        );
        finOk++;
      }
    }
    console.log(`  ${ipoOk} ipos, ${finOk} financials`);

    await client.query("COMMIT");

    // 4. run validations
    console.log("→ Running validations…");
    const v = await client.query("SELECT * FROM run_validations()");
    for (const row of v.rows) {
      console.log(`  ${row.rule_key.padEnd(28)} ${row.count}`);
    }

    console.log("\n✓ Import complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("✗ Import failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
