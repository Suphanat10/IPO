/**
 * In-process build pipeline: DB → ipo.json
 *
 * Replaces the child-process chain:
 *   build-from-db.mjs → export-from-db.mjs → build-data.mjs
 *
 * Runs entirely in-process so it works on Vercel serverless
 * (no spawning child processes, no dotenv/pg imports needed).
 */

import { query } from "@/lib/db";
import { SLICE_KEYS, extractSlice } from "@/lib/artifact";
import { writeFileSync, existsSync, statSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

// ═══════════════════════════════════════════════════════════════════
// Section 1: Utility Functions
// ═══════════════════════════════════════════════════════════════════

function toNum(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === "nan" || s === "NaN") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mean(xs: (number | null)[]): number | null {
  const valid = xs.filter((x): x is number => x != null);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function maxOf(xs: (number | null)[]): number {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : 0;
}

function minOf(xs: (number | null)[]): number {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : 0;
}

function round(n: number | null, d = 2): number {
  if (n == null || !Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function avg(xs: (number | null)[]): number {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}

function percentile(arr: (number | null)[], p: number): number | null {
  const sorted = arr
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

function quantile(values: (number | null)[], q: number): number | null {
  const sorted = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined)
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function qcutBins(values: number[]) {
  const q1 = quantile(values, 1 / 3);
  const q2 = quantile(values, 2 / 3);
  return { q1, q2 };
}

// ═══════════════════════════════════════════════════════════════════
// Section 2: Python list format helpers
// ═══════════════════════════════════════════════════════════════════

/** Convert array to Python list string: ['A', 'B'] */
function arrToPyList(arr: string[] | null | undefined): string {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "";
  return (
    "[" +
    arr.map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(", ") +
    "]"
  );
}

/** Parse Python list string back to array */
function parsePyList(s: unknown): string[] {
  if (Array.isArray(s)) return s.filter((v) => typeof v === "string" && v);
  if (!s) return [];
  const trimmed = String(s).trim();
  if (!trimmed || trimmed === "nan" || trimmed === "[]") return [];
  const inner = trimmed.replace(/^\[|\]$/g, "");
  if (!inner.trim()) return [];
  const items: string[] = [];
  let buf = "";
  let inStr = false;
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (!inStr && (c === "'" || c === '"')) {
      inStr = true;
      quote = c;
      continue;
    }
    if (inStr && c === quote) {
      inStr = false;
      items.push(buf);
      buf = "";
      continue;
    }
    if (inStr) buf += c;
  }
  return items.map((s) => s.trim()).filter(Boolean);
}

function parseLeadCoList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw))
    return raw.filter((v) => typeof v === "string" && v && !JUNK_TOKEN.has(v.trim()));
  const s = String(raw).trim();
  if (s.startsWith("["))
    return parsePyList(s).filter((v) => !JUNK_TOKEN.has(v.trim()));
  return splitMulti(s)
    .map((v) => v.trim())
    .filter((v) => v && !JUNK_TOKEN.has(v));
}

// ═══════════════════════════════════════════════════════════════════
// Section 3: Name Cleaning (Thai honorifics, company prefixes)
// ═══════════════════════════════════════════════════════════════════

const PERSON_PREFIXES = [
  "นางสาว", "นาย", "นาง",
  "น.ส.", "น.ส", "นส.", "นส",
  "ดร.", "ผศ.ดร.", "รศ.ดร.", "ศ.ดร.",
  "ผศ.", "รศ.", "ศ.", "พญ.", "นพ.", "พลเอก", "พล.อ.",
];
const JUNK_TOKEN = new Set(["", "nan", "NaN", "N.A.", "N/A", "NA", "-", "–"]);
const JUNK = new Set(["", "nan", "NaN", "N.A.", "N/A", "-", "–"]);

function cleanPersonToken(s: string): string {
  s = s.trim();
  if (JUNK_TOKEN.has(s)) return "";
  for (const p of PERSON_PREFIXES) {
    const re = new RegExp(`^${p.replace(/\./g, "\\.")}\\s*`);
    if (re.test(s)) {
      s = s.replace(re, "").trim();
      break;
    }
  }
  return s;
}

function splitMulti(raw: string): string[] {
  if (!raw) return [];
  return String(raw)
    .replace(/\//g, ",")
    .split(",");
}

function cleanPersonName(raw: string): string {
  if (!raw) return "";
  return splitMulti(raw).map(cleanPersonToken).filter(Boolean).join(", ");
}

function cleanPersonTokens(raw: string): string[] {
  return splitMulti(raw).map(cleanPersonToken).filter(Boolean);
}

const COMPANY_PREFIXES = [
  "บริษัทหลักทรัพย์",
  "บริษัท หลักทรัพย์",
  "บริษัท",
  "บมจ.",
  "บจก.",
  "บล.",
  "หลักทรัพย์",
];
const COMPANY_SUFFIXES = [
  "จำกัด (มหาชน)",
  "จำกัด(มหาชน)",
  "(มหาชน)",
  "บล.บมจ.",
  "บล. บมจ.",
  "จำกัด",
  "บมจ.",
  "บจก.",
  "บล.",
  "หลักทรัพย์",
];

function cleanCompanyToken(s: string): string {
  s = s.trim();
  if (JUNK_TOKEN.has(s)) return "";
  for (const p of COMPANY_PREFIXES) {
    const re = new RegExp(`^${p.replace(/\./g, "\\.")}\\s*`);
    if (re.test(s)) {
      s = s.replace(re, "").trim();
      break;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const sfx of COMPANY_SUFFIXES) {
      const re = new RegExp(
        `\\s*${sfx.replace(/\./g, "\\.").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}\\s*$`,
      );
      if (re.test(s)) {
        s = s.replace(re, "").trim();
        changed = true;
        break;
      }
    }
  }
  return s.replace(/\s+/g, " ");
}

// ═══════════════════════════════════════════════════════════════════
// Section 4: Per-row enrichment
// ═══════════════════════════════════════════════════════════════════

interface BaseRow {
  symbol: string;
  fa_persons: string;
  fa_companies: string;
  lead_underwriters_norm: string;
  co_underwriters_norm: string;
  ipo_price: string | number;
  first_trade_date: string;
  open_d1: string | number;
  high_d1: string | number;
  low_d1: string | number;
  close_d1: string | number;
  close_d2: string | number;
  close_d3: string | number;
  close_d4: string | number;
  close_d5: string | number;
  close_1W: string | number;
  close_1M: string | number;
  close_3M: string | number;
  close_6M: string | number;
  // Enriched fields (added by enrichBaseRow)
  return_open_d1?: number | null;
  return_high_d1?: number | null;
  return_low_d1?: number | null;
  return_close_d1?: number | null;
  return_d2?: number | null;
  return_d3?: number | null;
  return_d4?: number | null;
  return_d5?: number | null;
  return_1W?: number | null;
  return_1M?: number | null;
  return_3M?: number | null;
  return_6M?: number | null;
  open_above_ipo_d1?: number | null;
  high_above_ipo_d1?: number | null;
  low_above_ipo_d1?: number | null;
  close_above_ipo_d1?: number | null;
  d5_above_ipo?: number | null;
  intraday_range_d1?: number | null;
  intraday_drawdown_d1?: number | null;
  max_return_week?: number | null;
  min_return_week?: number | null;
  year?: number | null;
  [key: string]: unknown;
}

function enrichBaseRow(r: BaseRow): BaseRow {
  const ipo = toNum(r.ipo_price);
  const ret = (price: unknown) => {
    const p = toNum(price);
    if (p == null || ipo == null || ipo <= 0) return null;
    return ((p - ipo) / ipo) * 100;
  };
  const above = (price: unknown) => {
    const p = toNum(price);
    return p != null && ipo != null && p > ipo ? 1 : 0;
  };
  const open = toNum(r.open_d1);
  const high = toNum(r.high_d1);
  const low = toNum(r.low_d1);

  r.return_open_d1 = ret(r.open_d1);
  r.return_high_d1 = ret(r.high_d1);
  r.return_low_d1 = ret(r.low_d1);
  r.return_close_d1 = ret(r.close_d1);
  r.return_d2 = ret(r.close_d2);
  r.return_d3 = ret(r.close_d3);
  r.return_d4 = ret(r.close_d4);
  r.return_d5 = ret(r.close_d5);
  r.return_1W = ret(r.close_1W);
  r.return_1M = ret(r.close_1M);
  r.return_3M = ret(r.close_3M);
  r.return_6M = ret(r.close_6M);

  r.open_above_ipo_d1 = above(r.open_d1);
  r.high_above_ipo_d1 = above(r.high_d1);
  r.low_above_ipo_d1 = above(r.low_d1);
  r.close_above_ipo_d1 = above(r.close_d1);
  r.d5_above_ipo = above(r.close_d5);

  r.intraday_range_d1 =
    high != null && low != null && ipo != null && ipo > 0
      ? ((high - low) / ipo) * 100
      : null;

  r.intraday_drawdown_d1 =
    open != null && low != null && open > 0
      ? Math.max(0, ((open - low) / open) * 100)
      : null;

  const weekReturns = [
    r.return_close_d1,
    r.return_d2,
    r.return_d3,
    r.return_d4,
    r.return_d5,
  ];
  const validWeek = weekReturns.filter((v): v is number => v != null);
  r.max_return_week = validWeek.length ? Math.max(...validWeek) : null;
  r.min_return_week = validWeek.length ? Math.min(...validWeek) : null;

  const ftd = (r.first_trade_date || "").trim();
  if (ftd) {
    const m = ftd.match(/(\d{4})/);
    r.year = m ? Number(m[1]) : null;
  } else {
    r.year = null;
  }
  return r;
}

// ═══════════════════════════════════════════════════════════════════
// Section 5: DB Export
// ═══════════════════════════════════════════════════════════════════

function fmtDate(s: unknown): string {
  if (!s) return "";
  return String(s).slice(0, 10);
}

interface ExportedData {
  base: BaseRow[];
  financials: Record<string, unknown>[];
  sectors: Record<string, string>[];
  faNorm: Record<string, string>[];
}

async function exportFromDb(): Promise<ExportedData> {
  // ─── base (listed IPOs only) ────────────────────────────
  const ipos = await query<{
    symbol: string;
    fa_persons: string[] | null;
    fa_companies: string[] | null;
    lead_uw: string[] | null;
    co_uws: string[] | null;
    ipo_price: number | null;
    listing_date: string | null;
    open_d1: number | null;
    high_d1: number | null;
    low_d1: number | null;
    close_d1: number | null;
    close_d2: number | null;
    close_d3: number | null;
    close_d4: number | null;
    close_d5: number | null;
    close_1w: number | null;
    close_1m: number | null;
    close_3m: number | null;
    close_6m: number | null;
  }>(
    `SELECT symbol, fa_persons, fa_companies, lead_uw, co_uws,
            ipo_price, listing_date,
            open_d1, high_d1, low_d1,
            close_d1, close_d2, close_d3, close_d4, close_d5,
            close_1w, close_1m, close_3m, close_6m
     FROM ipos WHERE status = 'listed' ORDER BY symbol`,
  );

  const base: BaseRow[] = ipos.map((r) => ({
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

  // ─── financials ─────────────────────────────────────────
  const financials = await query<Record<string, unknown>>(
    `SELECT i.symbol, f.gross_proceeds, f.total_expense, f.offered_shares,
            f.offered_ratio_pct, f.existing_shares_pct, f.executive_total_pct,
            f.total_assets, f.total_liabilities, f.total_equity,
            f.revenue_latest, f.revenue_prev, f.net_income_latest, f.net_income_prev
     FROM ipos i
     INNER JOIN ipo_financials f ON f.ipo_id = i.id
     WHERE i.status = 'listed'
     ORDER BY i.symbol`,
  );

  // ─── sectors ────────────────────────────────────────────
  const sectorsRaw = await query<{
    symbol: string;
    market: string;
    industry: string;
    sector: string;
  }>("SELECT symbol, market, industry, sector FROM sectors ORDER BY symbol");

  const sectors = sectorsRaw.map((r) => ({
    symbol: r.symbol,
    Market: r.market ?? "",
    "Industry Group (กลุ่มอุตสาหกรรม)":
      r.industry ?? "",
    "Sector (หมวดธุรกิจ)": r.sector ?? "",
  }));

  // ─── fa normalizations ──────────────────────────────────
  const faNormRaw = await query<{
    raw_name: string;
    normalized_name: string;
  }>(
    "SELECT raw_name, normalized_name FROM fa_normalizations ORDER BY raw_name",
  );

  const faNorm = faNormRaw.map((r) => ({
    fa_companies: r.raw_name,
    fa_company_norm: r.normalized_name,
  }));

  return { base, financials, sectors, faNorm };
}

// ═══════════════════════════════════════════════════════════════════
// Section 6: Build ipo.json from exported data
// ═══════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildIpoData(data: ExportedData): any {
  const { financials: financialsRaw, sectors: dfSector, faNorm: faCompanyNormRaw } = data;
  const base = data.base.map(enrichBaseRow);

  // FA company lookup: raw → normalized
  const FA_COMPANY_LOOKUP = new Map<string, string>();
  for (const r of faCompanyNormRaw) {
    const raw = (r.fa_companies || "").trim().toLowerCase().replace(/\s+/g, "");
    const norm = (r.fa_company_norm || "").trim();
    if (raw && norm) FA_COMPANY_LOOKUP.set(raw, norm);
  }

  function normalizeFACompany(name: string): string {
    if (!name) return "";
    const trimmed = name.trim();
    const key = trimmed.toLowerCase().replace(/\s+/g, "");
    // Fall back to the original name when there is no normalization mapping.
    // Returning "" here used to silently drop every FA company that wasn't in
    // the fa_normalizations table — which, when that table is sparse/empty,
    // wiped fa_companies out of the entire dataset (FA company + FA person+company
    // analytics never had data to match against).
    return FA_COMPANY_LOOKUP.get(key) || trimmed;
  }

  // Sector lookup
  const sectorBySymbol: Record<
    string,
    { market: string; industry: string; sector: string }
  > = {};
  for (const r of dfSector) {
    const sym = (r.symbol || "").trim();
    if (!sym) continue;
    sectorBySymbol[sym] = {
      market: (r["Market"] || "").trim(),
      industry: (
        r[
          "Industry Group (กลุ่มอุตสาหกรรม)"
        ] || ""
      ).trim(),
      sector: (
        r[
          "Sector (หมวดธุรกิจ)"
        ] || ""
      ).trim(),
    };
  }

  // Build df_final_ipo from financials
  const baseBySymbol: Record<string, BaseRow> = {};
  for (const r of base) {
    if (r.symbol) baseBySymbol[r.symbol] = r;
  }

  const dfFinal = financialsRaw
    .map((fin) => {
      const sym = (String(fin.symbol || "")).trim();
      const b = baseBySymbol[sym] || ({} as BaseRow);
      const sec = sectorBySymbol[sym] || { market: "", industry: "", sector: "" };

      const ipo_price = toNum(b.ipo_price) ?? toNum(fin.ipo_price);
      const gross = toNum(fin.gross_proceeds);
      const expense = toNum(fin.total_expense);
      const offered_shares = toNum(fin.offered_shares);
      const offered_ratio_pct = toNum(fin.offered_ratio_pct);
      const existing_pct_raw = toNum(fin.existing_shares_pct);
      const exec_pct = toNum(fin.executive_total_pct);
      const total_assets = toNum(fin.total_assets);
      const total_liabilities = toNum(fin.total_liabilities);
      const total_equity = toNum(fin.total_equity);
      const ni_latest = toNum(fin.net_income_latest);

      const offered_ratio =
        offered_ratio_pct != null ? offered_ratio_pct / 100 : null;
      const existing_pct =
        existing_pct_raw != null ? existing_pct_raw / 100 : null;
      const cost_ratio_final =
        gross != null && gross > 0 && expense != null ? expense / gross : null;
      const total_shares =
        offered_ratio != null && offered_ratio > 0 && offered_shares != null
          ? offered_shares / offered_ratio
          : null;
      const market_cap =
        total_shares != null && ipo_price != null
          ? total_shares * ipo_price
          : null;
      const ROE =
        ni_latest != null && total_equity != null && total_equity !== 0
          ? ni_latest / total_equity
          : null;
      const DE =
        total_liabilities != null && total_equity != null && total_equity !== 0
          ? total_liabilities / total_equity
          : null;
      let PE =
        market_cap != null && ni_latest != null && ni_latest > 0
          ? market_cap / ni_latest
          : null;
      let PBV =
        market_cap != null && total_equity != null && total_equity > 0
          ? market_cap / total_equity
          : null;
      if (PE != null && PE < 0) PE = null;
      if (PBV != null && PBV < 0) PBV = null;
      const earnings_yield =
        ni_latest != null && market_cap != null && market_cap > 0
          ? ni_latest / market_cap
          : null;

      const ret_d1 = toNum(b.return_close_d1);
      let return_tier = "unknown";
      if (ret_d1 != null) {
        if (ret_d1 >= 20) return_tier = "gain_strong";
        else if (ret_d1 >= 0) return_tier = "gain";
        else if (ret_d1 > -20) return_tier = "loss";
        else return_tier = "loss_strong";
      }

      const safe = (v: number | null) =>
        v != null && Number.isFinite(v) ? v : null;

      return {
        symbol: sym,
        ipo_price: safe(ipo_price),
        close_d1: toNum(b.close_d1),
        return_close_d1: safe(ret_d1),
        return_1W: toNum(b.return_1W),
        return_1M: toNum(b.return_1M),
        offered_ratio: safe(offered_ratio),
        existing_pct: safe(existing_pct),
        executive_total_pct: safe(exec_pct),
        cost_ratio_final: safe(cost_ratio_final),
        market_cap: safe(market_cap),
        net_income: safe(ni_latest),
        ROE: safe(ROE),
        DE: safe(DE),
        PE: safe(PE),
        PBV: safe(PBV),
        earnings_yield: safe(earnings_yield),
        return_tier,
        Market: sec.market || "",
        "Industry Group (กลุ่มอุตสาหกรรม)":
          sec.industry || "",
        "Sector (หมวดธุรกิจ)":
          sec.sector || "",
      };
    })
    .filter((r) => r.symbol);

  // ─── Derived summaries ─────────────────────────────────
  function summarizeRows(rows: BaseRow[]) {
    const probMean = (key: string) => {
      const v = rows.map((r) => toNum(r[key])).filter((x): x is number => x != null);
      return v.length
        ? round((v.reduce((s, x) => s + x, 0) / v.length) * 100, 2)
        : 0;
    };
    const avgKey = (key: string) => {
      const v = rows.map((r) => toNum(r[key])).filter((x): x is number => x != null);
      return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length, 2) : 0;
    };
    const maxKey = (key: string) => {
      const v = rows.map((r) => toNum(r[key])).filter((x): x is number => x != null);
      return v.length ? round(Math.max(...v), 2) : 0;
    };
    const minKey = (key: string) => {
      const v = rows.map((r) => toNum(r[key])).filter((x): x is number => x != null);
      return v.length ? round(Math.min(...v), 2) : 0;
    };
    const symbols = new Set(rows.map((r) => r.symbol));
    return {
      ipo_count: symbols.size,
      prob_open_above_ipo: probMean("open_above_ipo_d1"),
      prob_high_above_ipo: probMean("high_above_ipo_d1"),
      prob_low_above_ipo: probMean("low_above_ipo_d1"),
      prob_close_above_ipo: probMean("close_above_ipo_d1"),
      avg_return_open_d1: avgKey("return_open_d1"),
      avg_return_high_d1: avgKey("return_high_d1"),
      avg_return_low_d1: avgKey("return_low_d1"),
      avg_return_close_d1: avgKey("return_close_d1"),
      best_return_d1: maxKey("return_close_d1"),
      worst_return_d1: minKey("return_close_d1"),
      avg_intraday_range_d1: avgKey("intraday_range_d1"),
      avg_return_1W: avgKey("return_1W"),
      avg_return_1M: avgKey("return_1M"),
      avg_return_3M: avgKey("return_3M"),
      avg_return_6M: avgKey("return_6M"),
      max_return_week: maxKey("max_return_week"),
      min_return_week: minKey("min_return_week"),
      prob_close_d5_above_ipo: probMean("d5_above_ipo"),
    };
  }

  function buildSummaryByName(grouped: Map<string, BaseRow[]>) {
    return Array.from(grouped.entries())
      .map(([name, rows]) => ({ name, ...summarizeRows(rows) }))
      .filter((r) => r.name)
      .sort((a, b) => b.ipo_count - a.ipo_count);
  }

  // FA Person summary
  const faPersonsGrouped = new Map<string, BaseRow[]>();
  for (const r of base) {
    for (const tok of cleanPersonTokens(r.fa_persons)) {
      if (!faPersonsGrouped.has(tok)) faPersonsGrouped.set(tok, []);
      faPersonsGrouped.get(tok)!.push(r);
    }
  }
  const faPersonsSummary = buildSummaryByName(faPersonsGrouped);

  // FA Company summary
  const faCompaniesGrouped = new Map<string, BaseRow[]>();
  for (const r of base) {
    for (const raw of splitMulti(r.fa_companies)) {
      const trimmed = raw.trim();
      if (!trimmed || JUNK_TOKEN.has(trimmed)) continue;
      const norm = normalizeFACompany(trimmed);
      if (!norm) continue;
      if (!faCompaniesGrouped.has(norm)) faCompaniesGrouped.set(norm, []);
      faCompaniesGrouped.get(norm)!.push(r);
    }
  }
  const faCompaniesSummary = buildSummaryByName(faCompaniesGrouped);

  // Lead Underwriter summary
  const leadGrouped = new Map<string, BaseRow[]>();
  for (const r of base) {
    for (const tok of parseLeadCoList(r.lead_underwriters_norm)) {
      if (!leadGrouped.has(tok)) leadGrouped.set(tok, []);
      leadGrouped.get(tok)!.push(r);
    }
  }
  const leadUnderwritersSummary = buildSummaryByName(leadGrouped);

  // Lead-Co summary
  const leadCoGrouped = new Map<
    string,
    { lead: string; co: string; rows: BaseRow[] }
  >();
  for (const r of base) {
    const leads = parseLeadCoList(r.lead_underwriters_norm);
    const cos = parseLeadCoList(r.co_underwriters_norm);
    if (!leads.length || !cos.length) continue;
    for (const lead of leads) {
      for (const co of cos) {
        const key = `${lead}\x00${co}`;
        if (!leadCoGrouped.has(key))
          leadCoGrouped.set(key, { lead, co, rows: [] });
        leadCoGrouped.get(key)!.rows.push(r);
      }
    }
  }
  const leadCoSummary = Array.from(leadCoGrouped.values())
    .map(({ lead, co, rows }) => ({ name: lead, co, ...summarizeRows(rows) }))
    .filter((r) => r.name && r.co)
    .sort((a, b) => b.ipo_count - a.ipo_count);

  // ─── Companies + rawIpo ─────────────────────────────────
  const companies = base
    .map((r) => ({
      symbol: r.symbol,
      first_trade_date: r.first_trade_date,
      ipo_price: toNum(r.ipo_price),
      fa_persons: cleanPersonName((r.fa_persons || "").trim()),
      fa_companies: splitMulti(r.fa_companies)
        .map((t) => normalizeFACompany(t.trim()))
        .filter(Boolean)
        .join(", "),
      leads: parsePyList(r.lead_underwriters_norm),
      cos: parsePyList(r.co_underwriters_norm),
      return_close_d1: toNum(r.return_close_d1),
      return_1M: toNum(r.return_1M),
      return_6M: toNum(r.return_6M),
      year: toNum(r.year),
    }))
    .filter((c) => c.symbol)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const ipoDetails = base
    .map((r) => ({
      symbol: r.symbol,
      fa_persons: cleanPersonName((r.fa_persons || "").trim()),
      fa_companies: splitMulti(r.fa_companies)
        .map((t) => normalizeFACompany(t.trim()))
        .filter(Boolean)
        .join(", "),
      ipo_price: toNum(r.ipo_price),
      open_d1: toNum(r.open_d1),
      high_d1: toNum(r.high_d1),
      low_d1: toNum(r.low_d1),
      close_d1: toNum(r.close_d1),
      return_open_d1: toNum(r.return_open_d1),
      return_high_d1: toNum(r.return_high_d1),
      return_low_d1: toNum(r.return_low_d1),
      return_close_d1: toNum(r.return_close_d1),
      intraday_range_d1: toNum(r.intraday_range_d1),
      close_1W: toNum(r.close_1W),
      close_1M: toNum(r.close_1M),
      close_3M: toNum(r.close_3M),
      close_6M: toNum(r.close_6M),
      return_1W: toNum(r.return_1W),
      return_1M: toNum(r.return_1M),
      return_3M: toNum(r.return_3M),
      return_6M: toNum(r.return_6M),
    }))
    .filter((c) => c.symbol)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  function slimIpo(r: BaseRow) {
    return {
      sym: r.symbol,
      rD1: toNum(r.return_close_d1),
      rD2: toNum(r.return_d2),
      rD3: toNum(r.return_d3),
      rD4: toNum(r.return_d4),
      rD5: toNum(r.return_d5),
      r1W: toNum(r.return_1W),
      r1M: toNum(r.return_1M),
      r3M: toNum(r.return_3M),
      r6M: toNum(r.return_6M),
      range: toNum(r.intraday_range_d1),
      dd: toNum(r.intraday_drawdown_d1),
      upD1: toNum(r.close_above_ipo_d1),
      upD5: toNum(r.d5_above_ipo),
      openUp: toNum(r.open_above_ipo_d1),
      highUp: toNum(r.high_above_ipo_d1),
      fa_persons: cleanPersonName((r.fa_persons || "").trim()),
      fa_companies: splitMulti(r.fa_companies)
        .map((t) => normalizeFACompany(t.trim()))
        .filter(Boolean)
        .join(", "),
      leads: parsePyList(r.lead_underwriters_norm),
      cos: parsePyList(r.co_underwriters_norm),
    };
  }
  const rawIpo = base.map(slimIpo).filter((r) => r.sym);

  // ─── Autocomplete options ───────────────────────────────
  const JUNK_NAME = (s: string) =>
    !s || JUNK.has(s) || s === "N.A." || s === "-";

  const faPersonOptions = (() => {
    const set = new Set<string>();
    for (const r of base) {
      const raw = (r.fa_persons || "").trim();
      if (!raw) continue;
      for (const part of raw.split(",")) {
        const v = cleanPersonToken(part);
        if (!JUNK_NAME(v)) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  })();

  const faCompanyOptions = (() => {
    const set = new Set<string>();
    for (const r of base) {
      const raw = (r.fa_companies || "").trim();
      if (!raw) continue;
      for (const part of splitMulti(raw)) {
        const trimmed = part.trim();
        if (!trimmed || JUNK_TOKEN.has(trimmed)) continue;
        const v = normalizeFACompany(trimmed);
        if (!JUNK_NAME(v)) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  })();

  const leadUnderwriterOptions = (() => {
    const set = new Set<string>();
    for (const r of base) {
      for (const v of parsePyList(r.lead_underwriters_norm)) {
        if (!JUNK_NAME(v)) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  })();

  const coUnderwriterOptions = (() => {
    const set = new Set<string>();
    for (const r of base) {
      for (const v of parsePyList(r.co_underwriters_norm)) {
        if (!JUNK_NAME(v)) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  })();

  // Lead-Co index
  const leadCoIndex: [string, string, string][] = [];
  for (const r of base) {
    const sym = (r.symbol || "").trim();
    if (!sym) continue;
    const leads = parseLeadCoList(r.lead_underwriters_norm);
    const cos = parseLeadCoList(r.co_underwriters_norm);
    for (const lead of leads) {
      for (const co of cos) {
        leadCoIndex.push([sym, lead, co]);
      }
    }
  }

  // ─── Global baseline ───────────────────────────────────
  function aggregateBase(rows: BaseRow[]) {
    return {
      ipo_count: rows.length,
      prob_close_above_ipo: round(
        avg(rows.map((r) => toNum(r.close_above_ipo_d1))) * 100,
        2,
      ),
      prob_open_above_ipo: round(
        avg(rows.map((r) => toNum(r.open_above_ipo_d1))) * 100,
        2,
      ),
      prob_high_above_ipo: round(
        avg(rows.map((r) => toNum(r.high_above_ipo_d1))) * 100,
        2,
      ),
      prob_low_above_ipo: round(
        avg(rows.map((r) => toNum(r.low_above_ipo_d1))) * 100,
        2,
      ),
      avg_return_close_d1: round(
        mean(rows.map((r) => toNum(r.return_close_d1))),
        2,
      ),
      avg_return_open_d1: round(
        mean(rows.map((r) => toNum(r.return_open_d1))),
        2,
      ),
      avg_return_high_d1: round(
        mean(rows.map((r) => toNum(r.return_high_d1))),
        2,
      ),
      avg_return_low_d1: round(
        mean(rows.map((r) => toNum(r.return_low_d1))),
        2,
      ),
      best_return_d1: round(maxOf(rows.map((r) => toNum(r.return_close_d1))), 2),
      worst_return_d1: round(
        minOf(rows.map((r) => toNum(r.return_close_d1))),
        2,
      ),
      avg_intraday_range_d1: round(
        mean(rows.map((r) => toNum(r.intraday_range_d1))),
        2,
      ),
      avg_return_1W: round(mean(rows.map((r) => toNum(r.return_1W))), 2),
      avg_return_1M: round(mean(rows.map((r) => toNum(r.return_1M))), 2),
      avg_return_3M: round(mean(rows.map((r) => toNum(r.return_3M))), 2),
      avg_return_6M: round(mean(rows.map((r) => toNum(r.return_6M))), 2),
      max_return_week: round(
        maxOf(rows.map((r) => toNum(r.max_return_week))),
        2,
      ),
      min_return_week: round(
        minOf(rows.map((r) => toNum(r.min_return_week))),
        2,
      ),
      prob_close_d5_above_ipo: round(
        avg(rows.map((r) => toNum(r.d5_above_ipo))) * 100,
        2,
      ),
    };
  }
  const globalBase = aggregateBase(base);

  // ─── Per-IPO fundamentals ──────────────────────────────
  function buildFundamental(r: Record<string, unknown>) {
    const f = (k: string) => {
      const v = toNum(r[k]);
      return v == null ? null : v;
    };
    return {
      sym: (String(r.symbol || "")).trim(),
      offeredRatio: f("offered_ratio") != null ? f("offered_ratio")! * 100 : null,
      existingPct: f("existing_pct") != null ? f("existing_pct")! * 100 : null,
      executivePct: f("executive_total_pct"),
      roe: f("ROE") != null ? f("ROE")! * 100 : null,
      earningsYield: f("earnings_yield") != null ? f("earnings_yield")! * 100 : null,
      de: f("DE"),
      costRatio: f("cost_ratio_final") != null ? f("cost_ratio_final")! * 100 : null,
      pe: f("PE"),
      pbv: f("PBV"),
      marketCap: f("market_cap"),
      netIncome: f("net_income"),
      industry: (
        String(
          r[
            "Industry Group (กลุ่มอุตสาหกรรม)"
          ] || "",
        )
      ).trim(),
      market: (String(r["Market"] || "")).trim(),
    };
  }
  const fundamentals = dfFinal.map(buildFundamental).filter((f) => f.sym);
  const fundamentalsBySymbol = Object.fromEntries(
    fundamentals.map((f) => [f.sym, f]),
  );

  // ─── Factor tier analysis ─────────────────────────────
  const RETURN_TIERS = ["gain_strong", "gain", "loss", "loss_strong"];

  interface DfRow {
    sym: string;
    return_close_d1: number | null;
    return_tier: string;
    offered_ratio: number | null;
    existing_pct: number | null;
    executive_total_pct: number | null;
    ROE: number | null;
    earnings_yield: number | null;
    DE: number | null;
    cost_ratio_final: number | null;
    sector: string;
    industry: string;
    float_tier: string;
    existing_tier: string;
    exec_tier: string;
    cost_tier: string;
    roe_tier: string;
    ey_tier: string;
    de_tier: string;
  }

  const dfRows: DfRow[] = dfFinal
    .map((r) => ({
      sym: (r.symbol || "").trim(),
      return_close_d1: toNum(r.return_close_d1),
      return_tier: (r.return_tier || "").trim(),
      offered_ratio: toNum(r.offered_ratio),
      existing_pct: toNum(r.existing_pct),
      executive_total_pct: toNum(r.executive_total_pct),
      ROE: toNum(r.ROE),
      earnings_yield: toNum(r.earnings_yield),
      DE: toNum(r.DE),
      cost_ratio_final: toNum(r.cost_ratio_final),
      sector: (
        String(
          r[
            "Sector (หมวดธุรกิจ)"
          ] || "",
        )
      ).trim(),
      industry: (
        String(
          r[
            "Industry Group (กลุ่มอุตสาหกรรม)"
          ] || "",
        )
      ).trim(),
      float_tier: "",
      existing_tier: "",
      exec_tier: "",
      cost_tier: "",
      roe_tier: "",
      ey_tier: "",
      de_tier: "",
    }))
    .filter((r) => r.sym);

  // Existing q33/q67
  const existingNonZero = dfRows.filter(
    (r) => r.existing_pct != null && r.existing_pct > 0,
  );
  const existingBins =
    existingNonZero.length >= 3
      ? {
          q1: quantile(
            existingNonZero.map((r) => r.existing_pct),
            0.3333,
          ),
          q2: quantile(
            existingNonZero.map((r) => r.existing_pct),
            0.6667,
          ),
        }
      : { q1: 0.1, q2: 0.2 };

  const tierThresholds = {
    float: { low: 0.25, medium: 0.3 },
    existing: { q1: existingBins.q1, q2: existingBins.q2 },
    exec: { low: 30, mid: 50 },
    roe: qcutBins(
      dfRows.map((r) => r.ROE).filter((v): v is number => v != null),
    ),
    ey: qcutBins(
      dfRows
        .map((r) => r.earnings_yield)
        .filter((v): v is number => v != null),
    ),
    de: qcutBins(
      dfRows.map((r) => r.DE).filter((v): v is number => v != null),
    ),
    cost: qcutBins(
      dfRows
        .map((r) => r.cost_ratio_final)
        .filter((v): v is number => v != null),
    ),
  };

  function qcutTier(
    val: number | null,
    bins: { q1: number | null; q2: number | null },
    labels: string[],
  ): string {
    if (val == null || bins.q1 == null || bins.q2 == null) return "";
    if (val < bins.q1) return labels[0];
    if (val < bins.q2) return labels[1];
    return labels[2];
  }

  function classifyInclusive(
    val: number | null,
    bins: { q1: number | null; q2: number | null },
    labels: string[],
  ): string {
    if (val == null || bins.q1 == null || bins.q2 == null) return "";
    if (val <= bins.q1) return labels[0];
    if (val <= bins.q2) return labels[1];
    return labels[2];
  }

  for (const r of dfRows) {
    if (r.offered_ratio == null) {
      r.float_tier = "high";
    } else {
      r.float_tier =
        r.offered_ratio <= tierThresholds.float.low
          ? "low"
          : r.offered_ratio <= tierThresholds.float.medium
            ? "medium"
            : "high";
    }

    if (r.existing_pct == null) {
      r.existing_tier = "high";
    } else if (r.existing_pct <= 0) {
      r.existing_tier = "none";
    } else {
      r.existing_tier = classifyInclusive(
        r.existing_pct,
        tierThresholds.existing,
        ["low", "medium", "high"],
      );
    }

    if (r.executive_total_pct == null) {
      r.exec_tier = "high";
    } else {
      r.exec_tier =
        r.executive_total_pct < tierThresholds.exec.low
          ? "low"
          : r.executive_total_pct < tierThresholds.exec.mid
            ? "mid"
            : "high";
    }

    if (r.ROE != null)
      r.roe_tier = qcutTier(r.ROE, tierThresholds.roe, [
        "ต่ำ",
        "กลาง",
        "สูง",
      ]);
    if (r.earnings_yield != null)
      r.ey_tier = qcutTier(r.earnings_yield, tierThresholds.ey, [
        "ต่ำ",
        "กลาง",
        "สูง",
      ]);
    if (r.DE != null)
      r.de_tier = qcutTier(r.DE, tierThresholds.de, [
        "ต่ำ",
        "กลาง",
        "สูง",
      ]);
    if (r.cost_ratio_final != null)
      r.cost_tier = qcutTier(r.cost_ratio_final, tierThresholds.cost, [
        "ต่ำ",
        "กลาง",
        "สูง",
      ]);
  }

  function tierStats(rows: DfRow[]) {
    const n = rows.length;
    if (n === 0) {
      return {
        n: 0,
        meanReturn: null,
        probGainStrong: 0,
        probGain: 0,
        probLoss: 0,
        probLossStrong: 0,
      };
    }
    const counts: Record<string, number> = {
      gain_strong: 0,
      gain: 0,
      loss: 0,
      loss_strong: 0,
    };
    const returns: number[] = [];
    for (const r of rows) {
      if (counts[r.return_tier] != null) counts[r.return_tier]++;
      if (r.return_close_d1 != null) returns.push(r.return_close_d1);
    }
    const valid = Object.values(counts).reduce((s, c) => s + c, 0);
    const norm = (c: number) => (valid ? (c / valid) * 100 : 0);
    return {
      n,
      meanReturn: returns.length ? round(mean(returns), 2) : null,
      probGainStrong: norm(counts.gain_strong),
      probGain: norm(counts.gain),
      probLoss: norm(counts.loss),
      probLossStrong: norm(counts.loss_strong),
    };
  }

  function groupStats(rows: DfRow[], attr: keyof DfRow) {
    const buckets: Record<string, DfRow[]> = {};
    for (const r of rows) {
      const key = String(r[attr]);
      if (!key) continue;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(r);
    }
    const out: Record<string, ReturnType<typeof tierStats>> = {};
    for (const [k, group] of Object.entries(buckets)) out[k] = tierStats(group);
    return out;
  }

  const globalFundamentalStats = {
    float: groupStats(
      dfRows.filter((r) => r.float_tier),
      "float_tier",
    ),
    existing: groupStats(
      dfRows.filter((r) => r.existing_tier),
      "existing_tier",
    ),
    exec: groupStats(
      dfRows.filter((r) => r.exec_tier),
      "exec_tier",
    ),
    roe: groupStats(
      dfRows.filter((r) => r.roe_tier),
      "roe_tier",
    ),
    ey: groupStats(
      dfRows.filter((r) => r.ey_tier),
      "ey_tier",
    ),
    de: groupStats(
      dfRows.filter((r) => r.de_tier),
      "de_tier",
    ),
    cost: groupStats(
      dfRows.filter((r) => r.cost_tier),
      "cost_tier",
    ),
  };

  // ─── Peer-group stats (Earnings Yield) ─────────────────
  function peerStats(rows: DfRow[]) {
    const ey = rows
      .map((r) => r.earnings_yield)
      .filter((v): v is number => v != null);
    if (ey.length === 0) return null;
    const meanEY = mean(ey);
    const median = quantile(ey, 0.5);
    const above = rows.filter(
      (r) => r.earnings_yield != null && median != null && r.earnings_yield > median,
    );
    const below = rows.filter(
      (r) => r.earnings_yield != null && median != null && r.earnings_yield <= median,
    );
    return {
      n: rows.length,
      meanEY: round(meanEY, 6),
      medianEY: median,
      full: tierStats(rows),
      above: tierStats(above),
      below: tierStats(below),
    };
  }

  const peerBySector: Record<string, ReturnType<typeof peerStats>> = {};
  const peerByIndustry: Record<string, ReturnType<typeof peerStats>> = {};
  const sectorParent: Record<string, string> = {};
  {
    const bySector: Record<string, DfRow[]> = {};
    const byIndustry: Record<string, DfRow[]> = {};
    for (const r of dfRows) {
      if (r.sector && r.sector !== "-") {
        (bySector[r.sector] ??= []).push(r);
        if (r.industry) sectorParent[r.sector] = r.industry;
      }
      if (r.industry) (byIndustry[r.industry] ??= []).push(r);
    }
    for (const [k, v] of Object.entries(bySector)) {
      const s = peerStats(v);
      if (s) peerBySector[k] = s;
    }
    for (const [k, v] of Object.entries(byIndustry)) {
      const s = peerStats(v);
      if (s) peerByIndustry[k] = s;
    }
  }

  const sectorMapping: Record<string, { name: string; type: string }> = {
    "อาหาร": { name: "อาหารและเครื่องดื่ม", type: "sector" },
    food: { name: "อาหารและเครื่องดื่ม", type: "sector" },
    "เกษตร": { name: "ธุรกิจการเกษตร", type: "sector" },
    "แพทย์": { name: "การแพทย์", type: "sector" },
    "พาณิช": { name: "พาณิชย์", type: "sector" },
    "ขนส่ง": { name: "ขนส่งและโลจิสติกส์", type: "sector" },
    "โลจิส": { name: "ขนส่งและโลจิสติกส์", type: "sector" },
    "สื่อ": { name: "สื่อและสิ่งพิมพ์", type: "sector" },
    "ก่อสร้าง": { name: "วัสดุก่อสร้าง", type: "sector" },
    "อสังหา": { name: "พัฒนาอสังหาริมทรัพย์", type: "sector" },
    "บรรจุ": { name: "บรรจุภัณฑ์", type: "sector" },
    "ยานยนต์": { name: "ยานยนต์", type: "sector" },
    "ธนาคาร": { name: "ธนาคาร", type: "sector" },
    "หลักทรัพย์": { name: "เงินทุนและหลักทรัพย์", type: "sector" },
    "พลังงาน": { name: "พลังงานและสาธารณูปโภค", type: "sector" },
    "เทค": { name: "เทคโนโลยี", type: "industry" },
    tech: { name: "เทคโนโลยี", type: "industry" },
    "บริการ": { name: "บริการ", type: "industry" },
    service: { name: "บริการ", type: "industry" },
  };

  // ─── Output ─────────────────────────────────────────────
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      base: base.length,
      financials: financialsRaw.length,
      dfFinal: dfFinal.length,
      faPersons: faPersonsSummary.length,
      faCompanies: faCompaniesSummary.length,
      leadUnderwriters: leadUnderwritersSummary.length,
      leadCoPairs: leadCoSummary.length,
      companies: companies.length,
      rawIpo: rawIpo.length,
      leadCoIndex: leadCoIndex.length,
      fundamentals: fundamentals.length,
    },
    faPersons: faPersonsSummary,
    faCompanies: faCompaniesSummary,
    leadUnderwriters: leadUnderwritersSummary,
    leadCo: leadCoSummary,
    companies,
    ipoDetails,
    rawIpo,
    leadCoIndex,
    fundamentalsBySymbol,
    globalFundamentalStats,
    faPersonOptions,
    faCompanyOptions,
    leadUnderwriterOptions,
    coUnderwriterOptions,
    tierThresholds,
    peerBySector,
    peerByIndustry,
    sectorParent,
    sectorMapping,
    knownSectors: Object.keys(peerBySector).sort((a, b) =>
      a.localeCompare(b, "th"),
    ),
    knownIndustries: Object.keys(peerByIndustry).sort((a, b) =>
      a.localeCompare(b, "th"),
    ),
    globalBase: {
      name: "Global Baseline",
      ...globalBase,
      drawdown_mean: round(
        mean(base.map((r) => toNum(r.intraday_drawdown_d1))),
        2,
      ),
      drawdown_median: round(
        percentile(base.map((r) => toNum(r.intraday_drawdown_d1)), 50),
        2,
      ),
      drawdown_p75: round(
        percentile(base.map((r) => toNum(r.intraday_drawdown_d1)), 75),
        2,
      ),
      drawdown_p90: round(
        percentile(base.map((r) => toNum(r.intraday_drawdown_d1)), 90),
        2,
      ),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Section 7: Logging helpers for build_runs / build_logs
// ═══════════════════════════════════════════════════════════════════

async function buildLog(
  runId: number | null,
  level: string,
  message: string,
): Promise<void> {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}`;
  if (level === "error") console.error(line);
  else console.log(line);

  if (runId) {
    try {
      await query(
        "INSERT INTO build_logs (run_id, level, message) VALUES ($1, $2, $3)",
        [runId, level, message],
      );
    } catch {
      // ignore logging failures
    }
  }
}

async function updateBuildRun(
  runId: number | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!runId) return;
  const entries = Object.entries(patch);
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 2}`);
  const values = [runId, ...entries.map(([, v]) => v)];
  try {
    await query(
      `UPDATE build_runs SET ${setClauses.join(", ")} WHERE id = $1`,
      values,
    );
  } catch {
    // ignore update failures
  }
}

/**
 * Write one JSON artifact to its primary path, falling back to /tmp when the
 * filesystem is read-only (e.g. Vercel). Returns the path actually written.
 */
function writeArtifactFile(
  primaryPath: string,
  tmpPath: string,
  json: string,
): string {
  try {
    const dir = dirname(primaryPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(primaryPath, json, "utf-8");
    return primaryPath;
  } catch {
    writeFileSync(tmpPath, json, "utf-8");
    return tmpPath;
  }
}

/**
 * Carve the full build result into the per-slice payloads served by
 * /api/ipo-data/*. The small `summary` slice is everything the first paint
 * needs; the heavy arrays (leadco/companies/rawipo/details) are loaded lazily
 * only by the views that use them. The key→slice mapping lives in artifact.ts
 * (SLICE_KEYS) so the writer here and the reader's fallback can't drift apart.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sliceBuildResult(result: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(SLICE_KEYS)) {
    out[name] = extractSlice(result, name);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// Section 8: Main Entry Point
// ═══════════════════════════════════════════════════════════════════

export interface BuildResult {
  artifactSize: number | null;
  artifactSha: string | null;
  duration: number;
}

/**
 * Run the full build pipeline in-process.
 * 1. Export DB → in-memory data
 * 2. Transform data → ipo.json structure
 * 3. Write ipo.json to disk
 * 4. Update build_runs table
 */
export async function runBuild(runId?: number): Promise<BuildResult> {
  const startTime = Date.now();
  const rid = runId ?? null;

  await buildLog(rid, "info", "Build pipeline started (in-process)");

  try {
    // Step 1: Export from DB
    await buildLog(rid, "info", "Step 1/3: Querying database...");
    const data = await exportFromDb();
    await buildLog(
      rid,
      "info",
      `Exported: base=${data.base.length} financials=${data.financials.length} sectors=${data.sectors.length} faNorm=${data.faNorm.length}`,
    );

    // Step 2: Build ipo.json
    await buildLog(rid, "info", "Step 2/3: Building ipo.json...");
    const result = buildIpoData(data);
    const json = JSON.stringify(result);
    await buildLog(
      rid,
      "info",
      `Built: ${result.counts.base} IPOs, ${result.counts.fundamentals} fundamentals`,
    );

    // Step 3: Write ipo.json
    await buildLog(rid, "info", "Step 3/3: Writing ipo.json...");
    const primaryPath = resolve(process.cwd(), "src", "app", "data", "ipo.json");
    const tmpPath = "/tmp/ipo.json";
    let writtenPath: string;

    try {
      // Ensure directory exists
      const dir = dirname(primaryPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(primaryPath, json, "utf-8");
      writtenPath = primaryPath;
    } catch (fsErr) {
      // Vercel read-only filesystem → fall back to /tmp
      await buildLog(
        rid,
        "warn",
        `Cannot write to ${primaryPath}: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}. Falling back to ${tmpPath}`,
      );
      writeFileSync(tmpPath, json, "utf-8");
      writtenPath = tmpPath;
    }

    // Also emit per-slice artifacts so the client can lazy-load only what each
    // view needs instead of the full ipo.json (served by /api/ipo-data/*).
    const sliceDir = resolve(process.cwd(), "src", "app", "data", "ipo");
    const slices = sliceBuildResult(result);
    for (const [name, slice] of Object.entries(slices)) {
      writeArtifactFile(
        resolve(sliceDir, `${name}.json`),
        `/tmp/ipo-${name}.json`,
        JSON.stringify(slice),
      );
    }
    await buildLog(
      rid,
      "info",
      `Wrote ${Object.keys(slices).length} data slices to ${sliceDir}`,
    );

    // Compute artifact metadata
    let artifactSize: number | null = null;
    let artifactSha: string | null = null;
    if (existsSync(writtenPath)) {
      artifactSize = statSync(writtenPath).size;
      artifactSha = createHash("sha256")
        .update(readFileSync(writtenPath))
        .digest("hex")
        .slice(0, 12);
    }

    const duration = Date.now() - startTime;
    await buildLog(
      rid,
      "info",
      `Build succeeded in ${duration}ms — ${artifactSize} bytes, sha=${artifactSha}, path=${writtenPath}`,
    );
    await updateBuildRun(rid, {
      status: "success",
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      artifact_size: artifactSize,
      artifact_sha: artifactSha,
    });

    return { artifactSize, artifactSha, duration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await buildLog(rid, "error", `Build failed: ${msg}`);
    await updateBuildRun(rid, {
      status: "failed",
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error_message: msg,
    });
    throw err;
  }
}
