#!/usr/bin/env node
// Exports Postgres → CSVs in src/app/data/ (input for build-data.mjs).
// Run before build-data.mjs in the build pipeline.
//
// Usage:
//   cd ipo-ui
//   node scripts/export-from-db.mjs

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "src", "app", "data");

dotenv.config({ path: resolve(ROOT, ".env.local") });
dotenv.config({ path: resolve(ROOT, ".env") });

function toCSV(rows, headers) {
  const escape = (v) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const out = [headers.join(",")];
  for (const r of rows) out.push(headers.map((h) => escape(r[h])).join(","));
  return out.join("\n") + "\n";
}

function arrToPyList(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "";
  return "[" + arr.map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(", ") + "]";
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("✓ Connected to Postgres");

  try {
    // 1. base.csv (only listed IPOs go into analytics)
    const ipos = await client.query(`
      SELECT symbol, fa_persons, fa_companies, lead_uw, co_uws,
             ipo_price, listing_date AS first_trade_date,
             open_d1, high_d1, low_d1,
             close_d1, close_d2, close_d3, close_d4, close_d5,
             close_1w, close_1m, close_3m, close_6m
      FROM ipos
      WHERE status = 'listed'
      ORDER BY symbol
    `);

    const baseRows = ipos.rows.map((r) => ({
      symbol: r.symbol,
      fa_persons: (r.fa_persons || []).join(", "),
      fa_companies: (r.fa_companies || []).join(", "),
      lead_underwriters_norm: arrToPyList(r.lead_uw),
      co_underwriters_norm: arrToPyList(r.co_uws),
      ipo_price: r.ipo_price ?? "",
      first_trade_date: r.first_trade_date ? r.first_trade_date.toISOString().slice(0, 10) : "",
      open_d1: r.open_d1 ?? "",
      high_d1: r.high_d1 ?? "",
      low_d1: r.low_d1 ?? "",
      close_d1: r.close_d1 ?? "",
      close_d2: r.close_d2 ?? "",
      close_d3: r.close_d3 ?? "",
      close_d4: r.close_d4 ?? "",
      close_d5: r.close_d5 ?? "",
      close_1W: r.close_1w ?? "",
      close_1M: r.close_1m ?? "",
      close_3M: r.close_3m ?? "",
      close_6M: r.close_6m ?? "",
    }));

    writeFileSync(
      resolve(DATA_DIR, "base.csv"),
      toCSV(baseRows, [
        "symbol","fa_persons","fa_companies","lead_underwriters_norm","co_underwriters_norm",
        "ipo_price","first_trade_date",
        "open_d1","high_d1","low_d1",
        "close_d1","close_d2","close_d3","close_d4","close_d5",
        "close_1W","close_1M","close_3M","close_6M",
      ]),
      "utf8",
    );
    console.log(`✓ base.csv (${baseRows.length} rows)`);

    // 2. financials.csv
    const fin = await client.query(`
      SELECT i.symbol,
             f.gross_proceeds, f.total_expense,
             f.offered_shares, f.offered_ratio_pct,
             f.existing_shares_pct, f.executive_total_pct,
             f.total_assets, f.total_liabilities, f.total_equity,
             f.revenue_latest, f.revenue_prev,
             f.net_income_latest, f.net_income_prev
      FROM ipos i
      JOIN ipo_financials f ON f.ipo_id = i.id
      WHERE i.status = 'listed'
      ORDER BY i.symbol
    `);
    writeFileSync(
      resolve(DATA_DIR, "financials.csv"),
      toCSV(fin.rows.map((r) => ({
        symbol: r.symbol,
        gross_proceeds: r.gross_proceeds ?? "",
        total_expense: r.total_expense ?? "",
        offered_shares: r.offered_shares ?? "",
        offered_ratio_pct: r.offered_ratio_pct ?? "",
        existing_shares_pct: r.existing_shares_pct ?? "",
        executive_total_pct: r.executive_total_pct ?? "",
        total_assets: r.total_assets ?? "",
        total_liabilities: r.total_liabilities ?? "",
        total_equity: r.total_equity ?? "",
        revenue_latest: r.revenue_latest ?? "",
        revenue_prev: r.revenue_prev ?? "",
        net_income_latest: r.net_income_latest ?? "",
        net_income_prev: r.net_income_prev ?? "",
      })), [
        "symbol","gross_proceeds","total_expense",
        "offered_shares","offered_ratio_pct","existing_shares_pct","executive_total_pct",
        "total_assets","total_liabilities","total_equity",
        "revenue_latest","revenue_prev","net_income_latest","net_income_prev",
      ]),
      "utf8",
    );
    console.log(`✓ financials.csv (${fin.rows.length} rows)`);

    // 3. df_sector.csv
    const sec = await client.query(`
      SELECT symbol, market, industry, sector
      FROM sectors ORDER BY symbol
    `);
    writeFileSync(
      resolve(DATA_DIR, "df_sector.csv"),
      toCSV(sec.rows.map((r) => ({
        symbol: r.symbol,
        Market: r.market ?? "",
        "Industry Group (กลุ่มอุตสาหกรรม)": r.industry ?? "",
        "Sector (หมวดธุรกิจ)": r.sector ?? "",
      })), ["symbol","Market","Industry Group (กลุ่มอุตสาหกรรม)","Sector (หมวดธุรกิจ)"]),
      "utf8",
    );
    console.log(`✓ df_sector.csv (${sec.rows.length} rows)`);

    // 4. fa_company_norm.csv
    const fan = await client.query(`
      SELECT raw_name, normalized_name FROM fa_normalizations ORDER BY raw_name
    `);
    writeFileSync(
      resolve(DATA_DIR, "fa_company_norm.csv"),
      toCSV(fan.rows.map((r) => ({
        fa_companies: r.raw_name,
        fa_company_norm: r.normalized_name,
      })), ["fa_companies","fa_company_norm"]),
      "utf8",
    );
    console.log(`✓ fa_company_norm.csv (${fan.rows.length} rows)`);

    console.log("\n✓ Export complete");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
