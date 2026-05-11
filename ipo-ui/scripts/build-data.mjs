#!/usr/bin/env node
// Parses src/app/data/*.csv into aggregated JSON used by the UI.
// Run: node scripts/build-data.mjs
//
// Inputs (all in src/app/data/):
//   base.csv                       — per-IPO base (548 rows): returns d1-d5/1W/1M/3M/6M, FA/lead, ipo_price
//   df_final_ipo.csv               — per-IPO fundamentals (548 rows): ROE, DE, PE, offered_ratio, etc.
//   fa_persons_summary.csv         — pre-aggregated per FA Person (131 rows)
//   fa_companies_summary.csv       — pre-aggregated per FA Company (56 rows)
//   lead_underwriters_summary.csv  — pre-aggregated per Lead (46 rows)
//   lead_co_summary.csv            — pre-aggregated per (Lead, Co) pair (933 rows)
//   lead_co.csv                    — per-IPO (Lead, Co) explosion (3631 rows)
//   fa_detail.csv                  — per-IPO×FA explosion (kept for legacy callers)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "src", "app", "data");

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
        else { inQuotes = false; }
      } else { field += ch; }
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
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => {
      const o = {};
      header.forEach((h, i) => { o[h] = r[i]; });
      return o;
    });
}

function parsePyList(s) {
  if (!s) return [];
  const trimmed = s.trim();
  if (!trimmed || trimmed === "nan" || trimmed === "[]") return [];
  const inner = trimmed.replace(/^\[|\]$/g, "");
  if (!inner.trim()) return [];
  const items = [];
  let buf = "";
  let inStr = false;
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (!inStr && (c === "'" || c === '"')) { inStr = true; quote = c; continue; }
    if (inStr && c === quote) { inStr = false; items.push(buf); buf = ""; continue; }
    if (inStr) buf += c;
  }
  return items.map((s) => s.trim()).filter(Boolean);
}

function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === "nan" || s === "NaN") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mean(xs) {
  const valid = xs.filter((x) => x != null);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}
function maxOf(xs) {
  const v = xs.filter((x) => x != null);
  return v.length ? Math.max(...v) : 0;
}
function minOf(xs) {
  const v = xs.filter((x) => x != null);
  return v.length ? Math.min(...v) : 0;
}
function round(n, d = 2) {
  if (n == null || !Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
function avg(xs) {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}
function percentile(arr, p) {
  const sorted = arr.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// Map a wide pre-aggregated summary row → SummaryRow shape used by the UI
function mapSummaryRow(r, nameKey) {
  return {
    name: String(r[nameKey] ?? "").trim(),
    ipo_count: toNum(r.ipo_count) ?? 0,
    prob_open_above_ipo: round(toNum(r.prob_open_above_ipo) ?? 0, 2),
    prob_high_above_ipo: round(toNum(r.prob_high_above_ipo) ?? 0, 2),
    prob_low_above_ipo: round(toNum(r.prob_low_above_ipo) ?? 0, 2),
    prob_close_above_ipo: round(toNum(r.prob_close_above_ipo) ?? 0, 2),
    avg_return_open_d1: round(toNum(r.avg_return_open_d1) ?? 0, 2),
    avg_return_high_d1: round(toNum(r.avg_return_high_d1) ?? 0, 2),
    avg_return_low_d1: round(toNum(r.avg_return_low_d1) ?? 0, 2),
    avg_return_close_d1: round(toNum(r.avg_return_close_d1) ?? 0, 2),
    best_return_d1: round(toNum(r.best_return_d1) ?? 0, 2),
    worst_return_d1: round(toNum(r.worst_return_d1) ?? 0, 2),
    avg_intraday_range_d1: round(toNum(r.avg_intraday_range_d1) ?? 0, 2),
    avg_return_1W: round(toNum(r.avg_return_1W) ?? 0, 2),
    avg_return_1M: round(toNum(r.avg_return_1M) ?? 0, 2),
    avg_return_3M: round(toNum(r.avg_return_3M) ?? 0, 2),
    avg_return_6M: round(toNum(r.avg_return_6M) ?? 0, 2),
    max_return_week: round(toNum(r.max_return_week) ?? 0, 2),
    min_return_week: round(toNum(r.min_return_week) ?? 0, 2),
    prob_close_d5_above_ipo: round(toNum(r.prob_close_d5_above_ipo) ?? 0, 2),
  };
}

// ---------- Per-row enrichment ----------
// Database - base.csv stores only raw prices. Compute the return/probability
// fields the rest of the pipeline expects (mirrors the Python `summarize_from_base`).
function enrichBaseRow(r) {
  const ipo = toNum(r.ipo_price);
  const ret = (price) => {
    const p = toNum(price);
    if (p == null || ipo == null || ipo <= 0) return null;
    return ((p - ipo) / ipo) * 100;
  };
  const above = (price) => {
    const p = toNum(price);
    if (p == null || ipo == null) return null;
    return p > ipo ? 1 : 0;
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

  // Intraday drawdown (D1) = max(0, (open - low) / open * 100)
  r.intraday_drawdown_d1 =
    open != null && low != null && open > 0
      ? Math.max(0, ((open - low) / open) * 100)
      : null;

  // max/min return over D1..D5
  const weekReturns = [r.return_close_d1, r.return_d2, r.return_d3, r.return_d4, r.return_d5];
  const validWeek = weekReturns.filter((v) => v != null);
  r.max_return_week = validWeek.length ? Math.max(...validWeek) : null;
  r.min_return_week = validWeek.length ? Math.min(...validWeek) : null;

  // year from first_trade_date (YYYY-MM-DD or DD/MM/YYYY)
  const ftd = (r.first_trade_date || "").trim();
  if (ftd) {
    const m = ftd.match(/(\d{4})/);
    r.year = m ? Number(m[1]) : null;
  } else {
    r.year = null;
  }
  return r;
}

// Strip Thai honorific prefix from a single person name token.
// Mirrors Python regex: ^(นาย|นางสาว|นาง|น.ส.|น.ส|นส.|นส)\s*
const PERSON_PREFIXES = [
  "นางสาว", "นาย", "นาง",
  "น.ส.", "น.ส", "นส.", "นส",
  "ดร.", "ผศ.ดร.", "รศ.ดร.", "ศ.ดร.",
  "ผศ.", "รศ.", "ศ.", "พญ.", "นพ.", "พลเอก", "พล.อ.",
];
const JUNK_TOKEN = new Set(["", "nan", "NaN", "N.A.", "N/A", "NA", "-", "–"]);
function cleanPersonToken(s) {
  s = s.trim();
  if (JUNK_TOKEN.has(s)) return "";
  for (const p of PERSON_PREFIXES) {
    const re = new RegExp(`^${p.replace(/\./g, "\\.")}\\s*`);
    if (re.test(s)) { s = s.replace(re, "").trim(); break; }
  }
  return s.replace(/\s+/g, " ");
}
// Mirrors Python: replace "/" → "," then split on ",".
function splitMulti(raw) {
  if (!raw) return [];
  return String(raw).replace(/\//g, ",").split(",");
}
// Returns cleaned, comma-joined string for storage.
function cleanPersonName(raw) {
  if (!raw) return "";
  return splitMulti(raw).map(cleanPersonToken).filter(Boolean).join(", ");
}
// Returns the array of cleaned individual tokens.
function cleanPersonTokens(raw) {
  return splitMulti(raw).map(cleanPersonToken).filter(Boolean);
}

// Strip company prefix/suffix and the บล./บมจ. abbreviations.
// e.g. "บริษัทหลักทรัพย์ ทรีนิตี้ จำกัด (มหาชน)" → "ทรีนิตี้"
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
function cleanCompanyToken(s) {
  s = s.trim();
  if (JUNK_TOKEN.has(s)) return "";
  for (const p of COMPANY_PREFIXES) {
    const re = new RegExp(`^${p.replace(/\./g, "\\.")}\\s*`);
    if (re.test(s)) { s = s.replace(re, "").trim(); break; }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const sfx of COMPANY_SUFFIXES) {
      const re = new RegExp(`\\s*${sfx.replace(/\./g, "\\.").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}\\s*$`);
      if (re.test(s)) { s = s.replace(re, "").trim(); changed = true; break; }
    }
  }
  return s.replace(/\s+/g, " ");
}
// Handles comma- or slash-separated multi-company fields.
function cleanCompanyName(raw) {
  if (!raw) return "";
  return splitMulti(raw).map(cleanCompanyToken).filter(Boolean).join(", ");
}
function cleanCompanyTokens(raw) {
  return splitMulti(raw).map(cleanCompanyToken).filter(Boolean);
}
// Lead/Co lists arrive as Python list strings ("['A','B']"). Use parsePyList,
// fall back to comma/slash split if not bracketed.
function parseLeadCoList(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (s.startsWith("[")) return parsePyList(s).filter((v) => !JUNK_TOKEN.has(v.trim()));
  return splitMulti(s).map((v) => v.trim()).filter((v) => v && !JUNK_TOKEN.has(v));
}

// ---------- Load 4 source CSVs ----------
const base = parseCSV(readFileSync(resolve(DATA_DIR, "base.csv"), "utf-8")).map(enrichBaseRow);
const financialsRaw = parseCSV(readFileSync(resolve(DATA_DIR, "financials.csv"), "utf-8"));
const dfSector = parseCSV(readFileSync(resolve(DATA_DIR, "df_sector.csv"), "utf-8"));
const faCompanyNormRaw = parseCSV(readFileSync(resolve(DATA_DIR, "fa_company_norm.csv"), "utf-8"));

console.log(`Loaded base=${base.length} financials=${financialsRaw.length} sector=${dfSector.length} faCompanyNorm=${faCompanyNormRaw.length}`);

// FA company lookup table: raw name → normalized short name
const FA_COMPANY_LOOKUP = (() => {
  const m = new Map();
  for (const r of faCompanyNormRaw) {
    const raw = (r.fa_companies || "").trim().toLowerCase().replace(/\s+/g, "");
    const norm = (r.fa_company_norm || "").trim();
    if (raw && norm) m.set(raw, norm);
  }
  return m;
})();
function normalizeFACompany(name) {
  if (!name) return "";
  const key = name.trim().toLowerCase().replace(/\s+/g, "");
  // Strict lookup only — mirrors Python: returns None when not found → row excluded.
  return FA_COMPANY_LOOKUP.get(key) || "";
}

// Sector lookup: symbol → { market, industry, sector }
const sectorBySymbol = {};
for (const r of dfSector) {
  const sym = (r.symbol || "").trim();
  if (!sym) continue;
  sectorBySymbol[sym] = {
    market: (r["Market"] || "").trim(),
    industry: (r["Industry Group (กลุ่มอุตสาหกรรม)"] || "").trim(),
    sector: (r["Sector (หมวดธุรกิจ)"] || "").trim(),
  };
}

// Build df_final_ipo from financials.csv (mirrors Python build_financial_features)
const baseBySymbol = {};
for (const r of base) { if (r.symbol) baseBySymbol[r.symbol] = r; }

const dfFinal = financialsRaw.map((fin) => {
  const sym = (fin.symbol || "").trim();
  const b = baseBySymbol[sym] || {};
  const sec = sectorBySymbol[sym] || {};

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
  const rev_latest = toNum(fin.revenue_latest);
  const rev_prev = toNum(fin.revenue_prev);
  const ni_latest = toNum(fin.net_income_latest);
  const ni_prev = toNum(fin.net_income_prev);

  const offered_ratio = offered_ratio_pct != null ? offered_ratio_pct / 100 : null;
  const existing_pct = existing_pct_raw != null ? existing_pct_raw / 100 : null;
  const cost_ratio_final = (gross != null && gross > 0 && expense != null) ? expense / gross : null;
  const total_shares = (offered_ratio != null && offered_ratio > 0 && offered_shares != null)
    ? offered_shares / offered_ratio : null;
  const market_cap = (total_shares != null && ipo_price != null) ? total_shares * ipo_price : null;
  const ROE = (ni_latest != null && total_equity != null && total_equity !== 0) ? ni_latest / total_equity : null;
  const DE = (total_liabilities != null && total_equity != null && total_equity !== 0) ? total_liabilities / total_equity : null;
  let PE = (market_cap != null && ni_latest != null && ni_latest > 0) ? market_cap / ni_latest : null;
  let PBV = (market_cap != null && total_equity != null && total_equity > 0) ? market_cap / total_equity : null;
  if (PE != null && PE < 0) PE = null;
  if (PBV != null && PBV < 0) PBV = null;
  const earnings_yield = (ni_latest != null && market_cap != null && market_cap > 0) ? ni_latest / market_cap : null;

  const ret_d1 = toNum(b.return_close_d1);
  let return_tier = "unknown";
  if (ret_d1 != null) {
    // Python label_map shows ">=50%" but actual classification appears to use >=20%
    // (verified against notebook output: ROE.สูง gain_strong = 56% matches >=20 threshold).
    if (ret_d1 >= 20) return_tier = "gain_strong";
    else if (ret_d1 >= 0) return_tier = "gain";
    else if (ret_d1 > -20) return_tier = "loss";
    else return_tier = "loss_strong";
  }

  // Replace infinities with null
  const safe = (v) => (v != null && Number.isFinite(v)) ? v : null;

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
    "Market": sec.market || "",
    "Industry Group (กลุ่มอุตสาหกรรม)": sec.industry || "",
    "Sector (หมวดธุรกิจ)": sec.sector || "",
  };
}).filter((r) => r.symbol);

console.log(`Built df_final_ipo: ${dfFinal.length} rows`);

const JUNK = new Set(["", "nan", "NaN", "N.A.", "N/A", "-", "–"]);

// ---------- Derived summaries (mirrors Python `summarize_*`) ----------
// Group base rows by name, aggregate identical metric set as mapSummaryRow.
function summarizeRows(rows) {
  const probMean = (key) => {
    const v = rows.map((r) => toNum(r[key])).filter((x) => x != null);
    return v.length ? round((v.reduce((s, x) => s + x, 0) / v.length) * 100, 2) : 0;
  };
  const avg = (key) => {
    const v = rows.map((r) => toNum(r[key])).filter((x) => x != null);
    return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length, 2) : 0;
  };
  const max = (key) => {
    const v = rows.map((r) => toNum(r[key])).filter((x) => x != null);
    return v.length ? round(Math.max(...v), 2) : 0;
  };
  const min = (key) => {
    const v = rows.map((r) => toNum(r[key])).filter((x) => x != null);
    return v.length ? round(Math.min(...v), 2) : 0;
  };
  const symbols = new Set(rows.map((r) => r.symbol));
  return {
    ipo_count: symbols.size,
    prob_open_above_ipo: probMean("open_above_ipo_d1"),
    prob_high_above_ipo: probMean("high_above_ipo_d1"),
    prob_low_above_ipo: probMean("low_above_ipo_d1"),
    prob_close_above_ipo: probMean("close_above_ipo_d1"),
    avg_return_open_d1: avg("return_open_d1"),
    avg_return_high_d1: avg("return_high_d1"),
    avg_return_low_d1: avg("return_low_d1"),
    avg_return_close_d1: avg("return_close_d1"),
    best_return_d1: max("return_close_d1"),
    worst_return_d1: min("return_close_d1"),
    avg_intraday_range_d1: avg("intraday_range_d1"),
    avg_return_1W: avg("return_1W"),
    avg_return_1M: avg("return_1M"),
    avg_return_3M: avg("return_3M"),
    avg_return_6M: avg("return_6M"),
    max_return_week: max("max_return_week"),
    min_return_week: min("min_return_week"),
    prob_close_d5_above_ipo: probMean("d5_above_ipo"),
  };
}
function buildSummaryByName(grouped) {
  return Array.from(grouped.entries())
    .map(([name, rows]) => ({ name, ...summarizeRows(rows) }))
    .filter((r) => r.name)
    .sort((a, b) => b.ipo_count - a.ipo_count);
}

// FA Person — explode base.fa_persons (split "/" "," → strip prefixes), groupby name.
const faPersonsGrouped = (() => {
  const m = new Map();
  for (const r of base) {
    for (const tok of cleanPersonTokens(r.fa_persons)) {
      if (!m.has(tok)) m.set(tok, []);
      m.get(tok).push(r);
    }
  }
  return m;
})();
const faPersonsSummary = buildSummaryByName(faPersonsGrouped);

// FA Company — explode, normalize via fa_company_norm lookup, groupby name.
const faCompaniesGrouped = (() => {
  const m = new Map();
  for (const r of base) {
    for (const raw of splitMulti(r.fa_companies)) {
      const trimmed = raw.trim();
      if (!trimmed || JUNK_TOKEN.has(trimmed)) continue;
      const norm = normalizeFACompany(trimmed);
      if (!norm) continue;
      if (!m.has(norm)) m.set(norm, []);
      m.get(norm).push(r);
    }
  }
  return m;
})();
const faCompaniesSummary = buildSummaryByName(faCompaniesGrouped);

// Lead Underwriter — explode base.lead_underwriters_norm, groupby lead.
const leadGrouped = (() => {
  const m = new Map();
  for (const r of base) {
    for (const tok of parseLeadCoList(r.lead_underwriters_norm)) {
      if (!m.has(tok)) m.set(tok, []);
      m.get(tok).push(r);
    }
  }
  return m;
})();
const leadUnderwritersSummary = buildSummaryByName(leadGrouped);

// Lead-Co — itertools.product(lead_list, co_list) per IPO, groupby (lead, co).
const leadCoGrouped = (() => {
  const m = new Map();
  for (const r of base) {
    const leads = parseLeadCoList(r.lead_underwriters_norm);
    const cos = parseLeadCoList(r.co_underwriters_norm);
    if (!leads.length || !cos.length) continue;
    for (const lead of leads) {
      for (const co of cos) {
        const key = `${lead}${co}`;
        if (!m.has(key)) m.set(key, { lead, co, rows: [] });
        m.get(key).rows.push(r);
      }
    }
  }
  return m;
})();
const leadCoSummary = Array.from(leadCoGrouped.values())
  .map(({ lead, co, rows }) => ({ name: lead, co, ...summarizeRows(rows) }))
  .filter((r) => r.name && r.co)
  .sort((a, b) => b.ipo_count - a.ipo_count);

// ---------- companies + rawIpo (slim per-IPO) from base.csv ----------
const companies = base
  .map((r) => ({
    symbol: r.symbol,
    first_trade_date: r.first_trade_date,
    ipo_price: toNum(r.ipo_price),
    fa_persons: cleanPersonName((r.fa_persons || "").trim()),
    fa_companies: splitMulti(r.fa_companies).map(t => normalizeFACompany(t.trim())).filter(Boolean).join(", "),
    leads: parsePyList(r.lead_underwriters_norm),
    cos: parsePyList(r.co_underwriters_norm),
    return_close_d1: toNum(r.return_close_d1),
    return_1M: toNum(r.return_1M),
    return_6M: toNum(r.return_6M),
    year: toNum(r.year),
  }))
  .filter((c) => c.symbol)
  .sort((a, b) => a.symbol.localeCompare(b.symbol));

// Full per-IPO detail (prices + returns at each horizon) for the FA Person / Company / Matched detail tables.
const ipoDetails = base
  .map((r) => ({
    symbol: r.symbol,
    fa_persons: cleanPersonName((r.fa_persons || "").trim()),
    fa_companies: splitMulti(r.fa_companies).map(t => normalizeFACompany(t.trim())).filter(Boolean).join(", "),
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


function slimIpo(r) {
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
    fa_companies: splitMulti(r.fa_companies).map(t => normalizeFACompany(t.trim())).filter(Boolean).join(", "),
    leads: parsePyList(r.lead_underwriters_norm),
    cos: parsePyList(r.co_underwriters_norm),
  };
}
const rawIpo = base.map(slimIpo).filter((r) => r.sym);

// ---------- Autocomplete options sourced from base.csv ----------
// Unique names extracted directly from the base file (per user spec).
const JUNK_NAME = (s) => !s || JUNK.has(s) || s === "N.A." || s === "-";

const faPersonOptions = (() => {
  const set = new Set();
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
  const set = new Set();
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
  const set = new Set();
  for (const r of base) {
    for (const v of parsePyList(r.lead_underwriters_norm)) {
      if (!JUNK_NAME(v)) set.add(v);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
})();

const coUnderwriterOptions = (() => {
  const set = new Set();
  for (const r of base) {
    for (const v of parsePyList(r.co_underwriters_norm)) {
      if (!JUNK_NAME(v)) set.add(v);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
})();

console.log(
  `Options from base.csv: faPerson=${faPersonOptions.length}, faCompany=${faCompanyOptions.length}, lead=${leadUnderwriterOptions.length}, co=${coUnderwriterOptions.length}`,
);

// Lead-Co index: [symbol, lead, co] — derived from base via lead×co product
const leadCoIndex = (() => {
  const rows = [];
  for (const r of base) {
    const sym = (r.symbol || "").trim();
    if (!sym) continue;
    const leads = parseLeadCoList(r.lead_underwriters_norm);
    const cos = parseLeadCoList(r.co_underwriters_norm);
    for (const lead of leads) {
      for (const co of cos) {
        rows.push([sym, lead, co]);
      }
    }
  }
  return rows;
})();

// ---------- Global baseline (from base.csv) ----------
function aggregateBase(rows) {
  return {
    ipo_count: rows.length,
    prob_close_above_ipo: round(avg(rows.map((r) => toNum(r.close_above_ipo_d1))) * 100, 2),
    prob_open_above_ipo: round(avg(rows.map((r) => toNum(r.open_above_ipo_d1))) * 100, 2),
    prob_high_above_ipo: round(avg(rows.map((r) => toNum(r.high_above_ipo_d1))) * 100, 2),
    prob_low_above_ipo: round(avg(rows.map((r) => toNum(r.low_above_ipo_d1))) * 100, 2),
    avg_return_close_d1: round(mean(rows.map((r) => toNum(r.return_close_d1))), 2),
    avg_return_open_d1: round(mean(rows.map((r) => toNum(r.return_open_d1))), 2),
    avg_return_high_d1: round(mean(rows.map((r) => toNum(r.return_high_d1))), 2),
    avg_return_low_d1: round(mean(rows.map((r) => toNum(r.return_low_d1))), 2),
    best_return_d1: round(maxOf(rows.map((r) => toNum(r.return_close_d1))), 2),
    worst_return_d1: round(minOf(rows.map((r) => toNum(r.return_close_d1))), 2),
    avg_intraday_range_d1: round(mean(rows.map((r) => toNum(r.intraday_range_d1))), 2),
    avg_return_1W: round(mean(rows.map((r) => toNum(r.return_1W))), 2),
    avg_return_1M: round(mean(rows.map((r) => toNum(r.return_1M))), 2),
    avg_return_3M: round(mean(rows.map((r) => toNum(r.return_3M))), 2),
    avg_return_6M: round(mean(rows.map((r) => toNum(r.return_6M))), 2),
    max_return_week: round(maxOf(rows.map((r) => toNum(r.max_return_week))), 2),
    min_return_week: round(minOf(rows.map((r) => toNum(r.min_return_week))), 2),
    prob_close_d5_above_ipo: round(avg(rows.map((r) => toNum(r.d5_above_ipo))) * 100, 2),
  };
}
const globalBase = aggregateBase(base);
console.log("Global baseline prob_close:", globalBase.prob_close_above_ipo, "avg_d1:", globalBase.avg_return_close_d1);

// ---------- Per-IPO fundamentals (derived from financials.csv) ----------
// Values are already fractions from build step above.
// Convert to UI-friendly units: pct fields ×100; DE stays as-is (multiple).
function buildFundamental(r) {
  const f = (k) => { const v = toNum(r[k]); return v == null ? null : v; };
  return {
    sym: (r.symbol || "").trim(),
    offeredRatio: f("offered_ratio") != null ? f("offered_ratio") * 100 : null,
    existingPct: f("existing_pct") != null ? f("existing_pct") * 100 : null,
    executivePct: f("executive_total_pct"),
    roe: f("ROE") != null ? f("ROE") * 100 : null,
    earningsYield: f("earnings_yield") != null ? f("earnings_yield") * 100 : null,
    de: f("DE"),
    costRatio: f("cost_ratio_final") != null ? f("cost_ratio_final") * 100 : null,
    pe: f("PE"),
    pbv: f("PBV"),
    marketCap: f("market_cap"),
    netIncome: f("net_income"),
    industry: (r["Industry Group (กลุ่มอุตสาหกรรม)"] || "").trim(),
    market: (r["Market"] || "").trim(),
  };
}
const fundamentals = dfFinal.map(buildFundamental).filter((f) => f.sym);
const fundamentalsBySymbol = Object.fromEntries(fundamentals.map((f) => [f.sym, f]));
console.log("Per-IPO fundamentals:", fundamentals.length);

// ---------- Per-factor bucket statistics — mirrors Python `analyze_ipo_v4` ----------
// Each tier emits 4-way return_tier distribution (gain_strong/gain/loss/loss_strong)
// + meanReturn over return_close_d1, exactly like prob_tables/mean_tables in Python.
//
// Tier thresholds are computed dynamically from the data (matches `pd.qcut` in Python)
// rather than hardcoded — so the analysis function on the client can place the user's
// value into the right bucket using the same boundaries.

const RETURN_TIERS = ["gain_strong", "gain", "loss", "loss_strong"];

// Build per-row enriched view with tiers computed dynamically (no pre-computed tier columns).
const dfRows = dfFinal.map((r) => {
  const sym = (r.symbol || "").trim();
  const offered_ratio = toNum(r.offered_ratio);
  const existing_pct = toNum(r.existing_pct);
  const exec_pct = toNum(r.executive_total_pct);
  const ROE = toNum(r.ROE);
  const ey = toNum(r.earnings_yield);
  const DE = toNum(r.DE);
  const cost = toNum(r.cost_ratio_final);
  const return_close_d1 = toNum(r.return_close_d1);
  const return_tier = (r.return_tier || "").trim();
  return {
    sym, return_close_d1, return_tier,
    offered_ratio, existing_pct, executive_total_pct: exec_pct,
    ROE, earnings_yield: ey, DE, cost_ratio_final: cost,
    sector: (r["Sector (หมวดธุรกิจ)"] || "").trim(),
    industry: (r["Industry Group (กลุ่มอุตสาหกรรม)"] || "").trim(),
    // Tier labels computed after thresholds are built (set below)
    float_tier: "", existing_tier: "", exec_tier: "",
    cost_tier: "", roe_tier: "", ey_tier: "", de_tier: "",
  };
}).filter((r) => r.sym);

function quantile(values, q) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

// Emit pd.qcut-style 33/67 quantile boundaries
function qcutBins(values) {
  const q1 = quantile(values, 1 / 3);
  const q2 = quantile(values, 2 / 3);
  return { q1, q2 };
}

// Stats for a list of rows: 4-way return_tier distribution + meanReturn
function tierStats(rows) {
  const n = rows.length;
  if (n === 0) {
    return { n: 0, meanReturn: null, probGainStrong: 0, probGain: 0, probLoss: 0, probLossStrong: 0 };
  }
  const counts = { gain_strong: 0, gain: 0, loss: 0, loss_strong: 0 };
  const returns = [];
  for (const r of rows) {
    if (counts[r.return_tier] != null) counts[r.return_tier]++;
    if (r.return_close_d1 != null) returns.push(r.return_close_d1);
  }
  const valid = Object.values(counts).reduce((s, c) => s + c, 0);
  // Keep full precision (no rounding) to match Python's value_counts(normalize=True)*100
  const norm = (c) => (valid ? (c / valid) * 100 : 0);
  return {
    n,
    meanReturn: returns.length ? round(mean(returns), 2) : null,
    probGainStrong: norm(counts.gain_strong),
    probGain: norm(counts.gain),
    probLoss: norm(counts.loss),
    probLossStrong: norm(counts.loss_strong),
  };
}

// Group rows by an attribute, emit per-tier stats
function groupStats(rows, attr) {
  const buckets = {};
  for (const r of rows) {
    const key = r[attr];
    if (!key) continue;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(r);
  }
  const out = {};
  for (const [k, group] of Object.entries(buckets)) out[k] = tierStats(group);
  return out;
}

// Existing q33/q67 — only over rows with existing_pct > 0 (per Python spec).
// Python uses literal 0.3333/0.6667 (truncated) in `existing_data.quantile(...)`,
// not `1/3`. The 0.000043 gap shifts rows EXACTLY at the boundary between tiers.
const existingNonZero = dfRows.filter((r) => r.existing_pct != null && r.existing_pct > 0);
const existingBins = existingNonZero.length >= 3
  ? { q1: quantile(existingNonZero.map((r) => r.existing_pct), 0.3333),
      q2: quantile(existingNonZero.map((r) => r.existing_pct), 0.6667) }
  : { q1: 0.10, q2: 0.20 };

// Tier-thresholds for the runtime classifier (so the UI can bucket the user's value)
const tierThresholds = {
  // float: ≤0.25 → low, ≤0.30 → medium, else high (offered_ratio fraction)
  float: { low: 0.25, medium: 0.30 },
  // existing: 0 → none, dynamic q33/q67 of >0 group
  existing: { q1: existingBins.q1, q2: existingBins.q2 },
  // exec: <30 → low, <50 → mid, else high (executive_total_pct already pct)
  exec: { low: 30, mid: 50 },
  // qcut 33/67 for ROE / EY / DE / cost_ratio_final (over non-null rows)
  roe: qcutBins(dfRows.map((r) => r.ROE).filter((v) => v != null)),
  ey: qcutBins(dfRows.map((r) => r.earnings_yield).filter((v) => v != null)),
  de: qcutBins(dfRows.map((r) => r.DE).filter((v) => v != null)),
  cost: qcutBins(dfRows.map((r) => r.cost_ratio_final).filter((v) => v != null)),
};

// Assign tier labels to each dfRow based on computed thresholds.
// Two semantics: Python's `pd.qcut` (strict <) for ROE/EY/DE/cost,
// vs the manual `classify_existing` (<=) for the existing factor.
function qcutTier(val, bins, labels) {
  if (val == null) return "";
  if (val < bins.q1) return labels[0];
  if (val < bins.q2) return labels[1];
  return labels[2];
}
function classifyInclusive(val, bins, labels) {
  if (val == null) return "";
  if (val <= bins.q1) return labels[0];
  if (val <= bins.q2) return labels[1];
  return labels[2];
}
for (const r of dfRows) {
  // float tier — Python's manual classify_float treats NaN as "high"
  // (because NaN <= anything is False), so we replicate that here.
  if (r.offered_ratio == null) {
    r.float_tier = "high";
  } else {
    r.float_tier = r.offered_ratio <= tierThresholds.float.low ? "low"
      : r.offered_ratio <= tierThresholds.float.medium ? "medium" : "high";
  }
  // existing tier — same NaN-as-"high" quirk as float (NaN == 0 is False).
  if (r.existing_pct == null) {
    r.existing_tier = "high";
  } else if (r.existing_pct <= 0) {
    r.existing_tier = "none";
  } else {
    // Python uses manual classify_existing with <= comparisons.
    r.existing_tier = classifyInclusive(r.existing_pct, tierThresholds.existing, ["low", "medium", "high"]);
  }
  // exec tier — same NaN-as-"high" quirk
  if (r.executive_total_pct == null) {
    r.exec_tier = "high";
  } else {
    r.exec_tier = r.executive_total_pct < tierThresholds.exec.low ? "low"
      : r.executive_total_pct < tierThresholds.exec.mid ? "mid" : "high";
  }
  // roe/ey/de/cost tiers via qcut bins (Thai labels to match fundamentalFactors.ts lookups)
  if (r.ROE != null) r.roe_tier = qcutTier(r.ROE, tierThresholds.roe, ["ต่ำ", "กลาง", "สูง"]);
  if (r.earnings_yield != null) r.ey_tier = qcutTier(r.earnings_yield, tierThresholds.ey, ["ต่ำ", "กลาง", "สูง"]);
  if (r.DE != null) r.de_tier = qcutTier(r.DE, tierThresholds.de, ["ต่ำ", "กลาง", "สูง"]);
  if (r.cost_ratio_final != null) r.cost_tier = qcutTier(r.cost_ratio_final, tierThresholds.cost, ["ต่ำ", "กลาง", "สูง"]);
}

const globalFundamentalStats = {
  float: groupStats(dfRows.filter((r) => r.float_tier), "float_tier"),
  existing: groupStats(dfRows.filter((r) => r.existing_tier), "existing_tier"),
  exec: groupStats(dfRows.filter((r) => r.exec_tier), "exec_tier"),
  roe: groupStats(dfRows.filter((r) => r.roe_tier), "roe_tier"),
  ey: groupStats(dfRows.filter((r) => r.ey_tier), "ey_tier"),
  de: groupStats(dfRows.filter((r) => r.de_tier), "de_tier"),
  cost: groupStats(dfRows.filter((r) => r.cost_tier), "cost_tier"),
};

// ---------- Peer-group statistics for Earnings Yield (per Sector / Industry) ----------
// For each peer group emit:
//   meanEY: mean earnings_yield of the group
//   parentIndustry: link from sector → industry (so we can fall back when n<3)
//   full / above / below: tierStats (for whole group / EY > median / EY ≤ median)
function peerStats(rows) {
  const ey = rows.map((r) => r.earnings_yield).filter((v) => v != null);
  if (ey.length === 0) return null;
  const meanEY = mean(ey);
  const median = quantile(ey, 0.5);
  const above = rows.filter((r) => r.earnings_yield != null && r.earnings_yield > median);
  const below = rows.filter((r) => r.earnings_yield != null && r.earnings_yield <= median);
  return {
    n: rows.length,
    meanEY: round(meanEY, 6),
    medianEY: median,
    full: tierStats(rows),
    above: tierStats(above),
    below: tierStats(below),
  };
}

const peerBySector = {};
const peerByIndustry = {};
const sectorParent = {}; // sector → industry name
{
  const bySector = {};
  const byIndustry = {};
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

// Sector keyword mapping (mirrors Python's mapping dict)
const sectorMapping = {
  "อาหาร": { name: "อาหารและเครื่องดื่ม", type: "sector" },
  "food": { name: "อาหารและเครื่องดื่ม", type: "sector" },
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
  "tech": { name: "เทคโนโลยี", type: "industry" },
  "บริการ": { name: "บริการ", type: "industry" },
  "service": { name: "บริการ", type: "industry" },
};

// ---------- Output ----------
const out = {
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
  knownSectors: Object.keys(peerBySector).sort((a, b) => a.localeCompare(b, "th")),
  knownIndustries: Object.keys(peerByIndustry).sort((a, b) => a.localeCompare(b, "th")),
  globalBase: {
    name: "Global Baseline",
    ...globalBase,
    drawdown_mean: round(mean(base.map((r) => toNum(r.intraday_drawdown_d1))), 2),
    drawdown_median: round(percentile(base.map((r) => toNum(r.intraday_drawdown_d1)), 50), 2),
    drawdown_p75: round(percentile(base.map((r) => toNum(r.intraday_drawdown_d1)), 75), 2),
    drawdown_p90: round(percentile(base.map((r) => toNum(r.intraday_drawdown_d1)), 90), 2),
  },
};

const outPath = resolve(DATA_DIR, "ipo.json");
writeFileSync(outPath, JSON.stringify(out));
console.log("Wrote", outPath);
console.log("Counts:", out.counts);
console.log("Bucket sizes (factor → tier → n):");
for (const [k, v] of Object.entries(globalFundamentalStats)) {
  const sizes = Object.entries(v).map(([b, s]) => `${b}=${s.n}`).join(", ");
  console.log(`  ${k}: ${sizes}`);
}
console.log(
  `Peer groups: ${Object.keys(peerBySector).length} sectors, ${Object.keys(peerByIndustry).length} industries`,
);
console.log("Tier thresholds:");
console.log(`  existing q33=${tierThresholds.existing.q1?.toFixed(4)}, q67=${tierThresholds.existing.q2?.toFixed(4)}`);
console.log(`  roe q33=${tierThresholds.roe.q1?.toFixed(4)}, q67=${tierThresholds.roe.q2?.toFixed(4)}`);
console.log(`  ey  q33=${tierThresholds.ey.q1?.toFixed(4)}, q67=${tierThresholds.ey.q2?.toFixed(4)}`);
console.log(`  de  q33=${tierThresholds.de.q1?.toFixed(4)}, q67=${tierThresholds.de.q2?.toFixed(4)}`);
console.log(`  cost q33=${tierThresholds.cost.q1?.toFixed(4)}, q67=${tierThresholds.cost.q2?.toFixed(4)}`);
