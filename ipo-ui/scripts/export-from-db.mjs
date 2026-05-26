#!/usr/bin/env node
// Exports PostgreSQL → CSVs in src/app/data/ (input for build-data.mjs).
// Uses pg package — connects directly to PostgreSQL.
//
// Required env (from ipo-ui/.env.local):
//   DATABASE_URL  or  POSTGRES_HOST + POSTGRES_DB + POSTGRES_USER + POSTGRES_PASSWORD

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

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

function fmtDate(s) {
  if (!s) return "";
  return String(s).slice(0, 10);
}

async function main() {
  if (!process.env.DATABASE_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB)) {
    console.error("✗ DATABASE_URL or POSTGRES_HOST/POSTGRES_DB not set");
    console.error("  Configure in ipo-ui/.env.local");
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

  console.log("→ Connecting to PostgreSQL…");

  // ─── base.csv (listed IPOs only) ──────────────────────────────────
  console.log("→ Fetching listed IPOs…");
  const { rows: ipos } = await pool.query(
    `SELECT symbol, fa_persons, fa_companies, lead_uw, co_uws,
            ipo_price, listing_date,
            open_d1, high_d1, low_d1,
            close_d1, close_d2, close_d3, close_d4, close_d5,
            close_1w, close_1m, close_3m, close_6m
     FROM ipos WHERE status = 'listed' ORDER BY symbol`
  );

  const baseRows = ipos.map((r) => ({
    symbol: r.symbol,
    fa_persons: (r.fa_persons || []).join(", "),
    fa_companies: (r.fa_companies || []).join(", "),
    lead_underwriters_norm: arrToPyList(r.lead_uw),
    co_underwriters_norm: arrToPyList(r.co_uws),
    ipo_price: r.ipo_price ?? "",
    first_trade_date: fmtDate(r.listing_date),
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

  // ─── financials.csv ────────────────────────────────────────────────
  console.log("→ Fetching financials…");
  const { rows: finData } = await pool.query(
    `SELECT i.symbol, f.gross_proceeds, f.total_expense, f.offered_shares,
            f.offered_ratio_pct, f.existing_shares_pct, f.executive_total_pct,
            f.total_assets, f.total_liabilities, f.total_equity,
            f.revenue_latest, f.revenue_prev, f.net_income_latest, f.net_income_prev
     FROM ipos i
     INNER JOIN ipo_financials f ON f.ipo_id = i.id
     WHERE i.status = 'listed'
     ORDER BY i.symbol`
  );

  const finCsvRows = finData.map((r) => ({
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
  }));

  writeFileSync(
    resolve(DATA_DIR, "financials.csv"),
    toCSV(finCsvRows, [
      "symbol","gross_proceeds","total_expense",
      "offered_shares","offered_ratio_pct","existing_shares_pct","executive_total_pct",
      "total_assets","total_liabilities","total_equity",
      "revenue_latest","revenue_prev","net_income_latest","net_income_prev",
    ]),
    "utf8",
  );
  console.log(`✓ financials.csv (${finCsvRows.length} rows)`);

  // ─── df_sector.csv ────────────────────────────────────────────────
  console.log("→ Fetching sectors…");
  const { rows: sectors } = await pool.query(
    "SELECT symbol, market, industry, sector FROM sectors ORDER BY symbol"
  );

  writeFileSync(
    resolve(DATA_DIR, "df_sector.csv"),
    toCSV(
      sectors.map((r) => ({
        symbol: r.symbol,
        Market: r.market ?? "",
        "Industry Group (กลุ่มอุตสาหกรรม)": r.industry ?? "",
        "Sector (หมวดธุรกิจ)": r.sector ?? "",
      })),
      ["symbol", "Market", "Industry Group (กลุ่มอุตสาหกรรม)", "Sector (หมวดธุรกิจ)"],
    ),
    "utf8",
  );
  console.log(`✓ df_sector.csv (${sectors.length} rows)`);

  // ─── fa_company_norm.csv ─────────────────────────────────────────
  console.log("→ Fetching fa_normalizations…");
  const { rows: faNorm } = await pool.query(
    "SELECT raw_name, normalized_name FROM fa_normalizations ORDER BY raw_name"
  );

  writeFileSync(
    resolve(DATA_DIR, "fa_company_norm.csv"),
    toCSV(
      faNorm.map((r) => ({
        fa_companies: r.raw_name,
        fa_company_norm: r.normalized_name,
      })),
      ["fa_companies", "fa_company_norm"],
    ),
    "utf8",
  );
  console.log(`✓ fa_company_norm.csv (${faNorm.length} rows)`);

  await pool.end();
  console.log("\n✓ Export complete — CSVs written to src/app/data/");
}

main().catch((e) => {
  console.error("\n✗ Export failed:", e.message);
  process.exit(1);
});
