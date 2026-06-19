#!/usr/bin/env node
// Imports CSVs from src/app/data/ → PostgreSQL (direct connection).
// One-shot migration: run after schema is applied.
//
// Required env (from ipo-ui/.env.local):
//   DATABASE_URL, or POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
//
// Usage:
//   cd ipo-ui
//   node scripts/import-csv-to-db.mjs              # full import
//   node scripts/import-csv-to-db.mjs --dry-run    # parse only, no writes

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "src", "app", "data");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

const DRY_RUN = process.argv.includes("--dry-run");

// =========================================================
// CSV parsing
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

// Strip stray quote/backslash artifacts and reject punctuation-only tokens so
// junk like "\", "'", "-" or a name with a trailing "\" never reaches the DB.
function cleanEntityName(s) {
  return String(s ?? "")
    .replace(/[\\'"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,/\-–]+|[\s.,/\-–]+$/g, "")
    .trim();
}

function parsePyList(s) {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed === "nan" || trimmed === "[]") return null;
  if (!trimmed.startsWith("[")) {
    const one = cleanEntityName(trimmed);
    return one ? [one] : null;
  }
  const inner = trimmed.replace(/^\[|\]$/g, "");
  if (!inner.trim()) return null;
  const items = [];
  let buf = "", inStr = false, quote = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    // Treat a backslash-escaped quote ("\'") as a literal quote inside the name
    // rather than a string terminator, so escaped names round-trip cleanly.
    if (inStr && c === "\\" && inner[i + 1] === quote) { buf += quote; i++; continue; }
    if (!inStr && (c === "'" || c === '"')) { inStr = true; quote = c; continue; }
    if (inStr && c === quote) { inStr = false; items.push(buf); buf = ""; continue; }
    if (inStr) buf += c;
  }
  const cleaned = items.map(cleanEntityName).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

function splitFlat(s) {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed === "nan") return null;
  const parts = trimmed.split(/[\/,]/).map(cleanEntityName).filter(Boolean);
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

  const sectorBySymbol = new Map();
  for (const r of sectorRows) {
    sectorBySymbol.set(r.symbol, {
      market: r.Market || null,
      industry: r["Industry Group (กลุ่มอุตสาหกรรม)"] || null,
      sector: r["Sector (หมวดธุรกิจ)"] || null,
    });
  }
  const finBySymbol = new Map(finRows.map((r) => [r.symbol, r]));

  if (DRY_RUN) {
    console.log("\n=== DRY RUN — sample row ===");
    const sample = baseRows[1];
    console.log({
      symbol: sample.symbol,
      ...sectorBySymbol.get(sample.symbol),
      listing_date: dateOrNull(sample.first_trade_date),
      ipo_price: num(sample.ipo_price),
      fa_persons: splitFlat(sample.fa_persons),
      fa_companies: splitFlat(sample.fa_companies),
      lead_uw: parsePyList(sample.lead_underwriters_norm),
      co_uws: parsePyList(sample.co_underwriters_norm),
    });
    console.log("\n(dry run — no writes)");
    return;
  }

  if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
    console.error("✗ DATABASE_URL or POSTGRES_HOST/POSTGRES_DB not set");
    console.error("  Configure in ipo-ui/.env.local");
    process.exit(1);
  }

  const pool = process.env.DATABASE_URL
    ? new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("supabase.com")
          ? { rejectUnauthorized: false }
          : undefined,
        max: 5,
      })
    : new pg.Pool({
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        max: 5,
      });

  console.log("\n✓ Connected to PostgreSQL");

  // ─── 1. sectors ────────────────────────────────────────────
  console.log("→ Upserting sectors…");
  const sectorPayload = sectorRows.filter((r) => r.symbol);
  for (const r of sectorPayload) {
    await pool.query(
      `INSERT INTO sectors (symbol, market, industry, sector)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (symbol) DO UPDATE SET market = $2, industry = $3, sector = $4`,
      [r.symbol, r.Market || null, r["Industry Group (กลุ่มอุตสาหกรรม)"] || null, r["Sector (หมวดธุรกิจ)"] || null],
    );
  }
  console.log(`  ${sectorPayload.length} sectors`);

  // ─── 2. fa_normalizations ──────────────────────────────────
  console.log("→ Upserting fa_normalizations…");
  const faNormPayload = faNormRows.filter((r) => r.fa_companies && r.fa_company_norm);
  for (const r of faNormPayload) {
    await pool.query(
      `INSERT INTO fa_normalizations (raw_name, normalized_name)
       VALUES ($1, $2)
       ON CONFLICT (raw_name) DO UPDATE SET normalized_name = $2`,
      [r.fa_companies, r.fa_company_norm],
    );
  }
  console.log(`  ${faNormPayload.length} fa_normalizations`);

  // ─── 3. ipos + financials ────────────────────────────────
  console.log("→ Upserting ipos + financials…");
  const today = new Date().toISOString().slice(0, 10);

  const ipoPayload = baseRows
    .filter((r) => r.symbol)
    .map((r) => {
      const sec = sectorBySymbol.get(r.symbol) || {};
      const listing = dateOrNull(r.first_trade_date);
      const status = !listing ? "upcoming" : listing > today ? "upcoming" : "listed";
      return {
        symbol: r.symbol,
        market: sec.market,
        industry: sec.industry,
        sector: sec.sector,
        status,
        listing_date: listing,
        ipo_price: num(r.ipo_price),
        open_d1: num(r.open_d1),
        high_d1: num(r.high_d1),
        low_d1: num(r.low_d1),
        close_d1: num(r.close_d1),
        close_d2: num(r.close_d2),
        close_d3: num(r.close_d3),
        close_d4: num(r.close_d4),
        close_d5: num(r.close_d5),
        close_1w: num(r.close_1W),
        close_1m: num(r.close_1M),
        close_3m: num(r.close_3M),
        close_6m: num(r.close_6M),
        fa_persons: splitFlat(r.fa_persons),
        fa_companies: splitFlat(r.fa_companies),
        lead_uw: parsePyList(r.lead_underwriters_norm),
        co_uws: parsePyList(r.co_underwriters_norm),
        source: "csv_import",
      };
    });

  let ipoOk = 0;
  for (const r of ipoPayload) {
    await pool.query(
      `INSERT INTO ipos (symbol, market, industry, sector, status, listing_date, ipo_price,
        open_d1, high_d1, low_d1, close_d1, close_d2, close_d3, close_d4, close_d5,
        close_1w, close_1m, close_3m, close_6m, fa_persons, fa_companies, lead_uw, co_uws, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (symbol) DO UPDATE SET
        market=$2, industry=$3, sector=$4, status=$5, listing_date=$6, ipo_price=$7,
        open_d1=$8, high_d1=$9, low_d1=$10, close_d1=$11, close_d2=$12, close_d3=$13, close_d4=$14, close_d5=$15,
        close_1w=$16, close_1m=$17, close_3m=$18, close_6m=$19, fa_persons=$20, fa_companies=$21, lead_uw=$22, co_uws=$23, source=$24`,
      [r.symbol, r.market, r.industry, r.sector, r.status, r.listing_date, r.ipo_price,
       r.open_d1, r.high_d1, r.low_d1, r.close_d1, r.close_d2, r.close_d3, r.close_d4, r.close_d5,
       r.close_1w, r.close_1m, r.close_3m, r.close_6m, r.fa_persons, r.fa_companies, r.lead_uw, r.co_uws, r.source],
    );
    ipoOk++;
    if (ipoOk % 100 === 0) process.stdout.write(`\r  ${ipoOk}/${ipoPayload.length} ipos`);
  }
  console.log(`\r  ${ipoOk}/${ipoPayload.length} ipos`);

  // Fetch IDs to upsert financials
  const { rows: idRows } = await pool.query("SELECT id, symbol FROM ipos");
  const idMap = new Map(idRows.map((r) => [r.symbol, r.id]));

  const finPayloadList = baseRows
    .filter((r) => r.symbol && finBySymbol.has(r.symbol) && idMap.has(r.symbol))
    .map((r) => {
      const f = finBySymbol.get(r.symbol);
      return {
        ipo_id: idMap.get(r.symbol),
        gross_proceeds: num(f.gross_proceeds),
        total_expense: num(f.total_expense),
        offered_shares: num(f.offered_shares),
        offered_ratio_pct: num(f.offered_ratio_pct),
        existing_shares_pct: num(f.existing_shares_pct),
        executive_total_pct: num(f.executive_total_pct),
        total_assets: num(f.total_assets),
        total_liabilities: num(f.total_liabilities),
        total_equity: num(f.total_equity),
        revenue_latest: num(f.revenue_latest),
        revenue_prev: num(f.revenue_prev),
        net_income_latest: num(f.net_income_latest),
        net_income_prev: num(f.net_income_prev),
      };
    });

  let finOk = 0;
  for (const f of finPayloadList) {
    await pool.query(
      `INSERT INTO ipo_financials (ipo_id, gross_proceeds, total_expense, offered_shares,
        offered_ratio_pct, existing_shares_pct, executive_total_pct,
        total_assets, total_liabilities, total_equity,
        revenue_latest, revenue_prev, net_income_latest, net_income_prev)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (ipo_id) DO UPDATE SET
        gross_proceeds=$2, total_expense=$3, offered_shares=$4,
        offered_ratio_pct=$5, existing_shares_pct=$6, executive_total_pct=$7,
        total_assets=$8, total_liabilities=$9, total_equity=$10,
        revenue_latest=$11, revenue_prev=$12, net_income_latest=$13, net_income_prev=$14`,
      [f.ipo_id, f.gross_proceeds, f.total_expense, f.offered_shares,
       f.offered_ratio_pct, f.existing_shares_pct, f.executive_total_pct,
       f.total_assets, f.total_liabilities, f.total_equity,
       f.revenue_latest, f.revenue_prev, f.net_income_latest, f.net_income_prev],
    );
    finOk++;
    if (finOk % 100 === 0) process.stdout.write(`\r  ${finOk}/${finPayloadList.length} financials`);
  }
  console.log(`\r  ${finOk}/${finPayloadList.length} financials`);

  // ─── 4. validations ────────────────────────────────────────
  console.log("→ Running validations…");
  try {
    const { rows: v } = await pool.query("SELECT * FROM run_validations()");
    for (const row of v || []) {
      console.log(`  ${String(row.rule_key).padEnd(28)} ${row.count}`);
    }
  } catch (err) {
    console.warn(`! validation skipped: ${err.message}`);
  }

  await pool.end();
  console.log("\n✓ Import complete");
}

main().catch((e) => {
  console.error("\n✗ Import failed:", e.message);
  process.exit(1);
});
