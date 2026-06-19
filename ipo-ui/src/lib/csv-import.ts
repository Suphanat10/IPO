// Shared CSV parsing + type detection + normalization for admin import flow.
// Mirrors the algorithm in scripts/import-csv-to-db.mjs.

export type SupportedCsvType = "base" | "financials" | "sector" | "fa_norm";

// "combined" = a single CSV that holds several sections (base + financials +
// sector) at once. It is not directly committable — the client splits it into
// its constituent SupportedCsvType parts for preview/commit.
export type CsvType = SupportedCsvType | "combined" | "unknown";

export const IMPORT_CSV_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const IMPORT_CSV_MAX_ROWS = 5_000;
export const IMPORT_PREVIEW_MAX_BODY_BYTES = 6 * 1024 * 1024;

export interface DetectedSchema {
  type: CsvType;
  matched: string[]; // header names that were recognized
  unknown: string[]; // header names that are not used
  missing: string[]; // expected headers that are absent
  headers: string[];
}

// Required headers for each type. We accept if symbol + at least one type-specific column appears.
const SCHEMAS: Record<SupportedCsvType, { required: string[]; specific: string[] }> = {
  base: {
    required: ["symbol"],
    specific: [
      "company_name", "first_trade_date", "ipo_price", "open_d1", "high_d1", "low_d1", "close_d1",
      "fa_persons", "fa_companies", "lead_underwriters_norm", "co_underwriters_norm",
    ],
  },
  financials: {
    required: ["symbol"],
    specific: [
      "gross_proceeds", "total_expense", "offered_shares", "offered_ratio_pct",
      "existing_shares_pct", "executive_total_pct", "total_assets", "total_liabilities",
      "total_equity", "revenue_latest", "revenue_prev", "net_income_latest", "net_income_prev",
    ],
  },
  sector: {
    required: ["symbol"],
    specific: ["Market", "Industry Group (กลุ่มอุตสาหกรรม)", "Sector (หมวดธุรกิจ)"],
  },
  fa_norm: {
    required: [],
    specific: ["fa_companies", "fa_company_norm"],
  },
};

export function parseCSV(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
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
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// Minimum number of type-specific columns that must be present for a type to be
// considered "present" in a combined/multi-section CSV. Keeps a plain base.csv
// (which contains fa_companies) from being mistaken for an fa_norm file, etc.
function specificThreshold(specific: string[]): number {
  return Math.min(2, specific.length);
}

// Returns every supported type whose columns are present in the header set.
// A single-section CSV yields one type; a combined export (base + financials +
// sector in one file) yields several, in import order (base → financials → sector).
export function detectCsvTypes(headers: string[]): SupportedCsvType[] {
  const set = new Set(headers);
  const types: SupportedCsvType[] = [];
  for (const [type, def] of Object.entries(SCHEMAS) as [SupportedCsvType, typeof SCHEMAS["base"]][]) {
    if (def.required.some((r) => !set.has(r))) continue;
    const score = def.specific.filter((c) => set.has(c)).length;
    if (score >= specificThreshold(def.specific)) types.push(type);
  }
  return types;
}

// Builds a DetectedSchema scoped to one specific type (used when splitting a
// combined CSV into per-type import items).
export function schemaForType(headers: string[], type: SupportedCsvType): DetectedSchema {
  const set = new Set(headers);
  const def = SCHEMAS[type];
  const matchedCols = new Set<string>();
  [...def.required, ...def.specific].forEach((c) => set.has(c) && matchedCols.add(c));
  return {
    type,
    matched: [...matchedCols],
    unknown: headers.filter((h) => !matchedCols.has(h)),
    missing: def.specific.filter((c) => !set.has(c)),
    headers,
  };
}

// Builds a DetectedSchema for a combined CSV — marks every column recognized by
// any of the given sub-types as "matched".
export function schemaForCombined(headers: string[], types: SupportedCsvType[]): DetectedSchema {
  const set = new Set(headers);
  const matchedCols = new Set<string>();
  for (const type of types) {
    const def = SCHEMAS[type];
    [...def.required, ...def.specific].forEach((c) => set.has(c) && matchedCols.add(c));
  }
  return {
    type: "combined",
    matched: [...matchedCols],
    unknown: headers.filter((h) => !matchedCols.has(h)),
    missing: [],
    headers,
  };
}

export function detectSchema(headers: string[]): DetectedSchema {
  const set = new Set(headers);
  let best: { type: CsvType; score: number } = { type: "unknown", score: 0 };
  for (const [type, def] of Object.entries(SCHEMAS) as [SupportedCsvType, typeof SCHEMAS["base"]][]) {
    if (def.required.some((r) => !set.has(r))) continue;
    const score = def.specific.filter((c) => set.has(c)).length;
    if (score > best.score) best = { type, score };
  }
  const matchedCols = new Set<string>();
  if (best.type !== "unknown" && best.type !== "combined") {
    const def = SCHEMAS[best.type];
    [...def.required, ...def.specific].forEach((c) => set.has(c) && matchedCols.add(c));
  }
  return {
    type: best.type,
    matched: [...matchedCols],
    unknown: headers.filter((h) => !matchedCols.has(h)),
    missing:
      best.type === "unknown" || best.type === "combined" ? [] :
      SCHEMAS[best.type].specific.filter((c) => !set.has(c)),
    headers,
  };
}

// =========================================================
// Field normalizers — match scripts/import-csv-to-db.mjs
// =========================================================
export function num(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "nan" || s === "NaN") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function dateOrNull(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === "nan") return null;
  return s.replace(/\//g, "-");
}

export function parsePyList(s: unknown): string[] | null {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (!trimmed || trimmed === "nan" || trimmed === "[]") return null;
  if (!trimmed.startsWith("[")) {
    const parts = trimmed.split(/[\/,]/).map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts : null;
  }
  const inner = trimmed.replace(/^\[|\]$/g, "");
  if (!inner.trim()) return null;
  const items: string[] = [];
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

// =========================================================
// Row → DB shape normalizers
// =========================================================
export interface BaseImportRow {
  symbol: string;
  company_name?: string | null;
  listing_date?: string | null;
  status?: "upcoming" | "listed";
  ipo_price?: number | null;
  open_d1?: number | null; high_d1?: number | null; low_d1?: number | null;
  close_d1?: number | null; close_d2?: number | null; close_d3?: number | null;
  close_d4?: number | null; close_d5?: number | null;
  close_1w?: number | null; close_1m?: number | null; close_3m?: number | null; close_6m?: number | null;
  fa_persons?: string[] | null;
  fa_companies?: string[] | null;
  lead_uw?: string[] | null;
  co_uws?: string[] | null;
}

export interface FinImportRow {
  symbol: string;
  gross_proceeds: number | null; total_expense: number | null;
  offered_shares: number | null; offered_ratio_pct: number | null;
  existing_shares_pct: number | null; executive_total_pct: number | null;
  total_assets: number | null; total_liabilities: number | null; total_equity: number | null;
  revenue_latest: number | null; revenue_prev: number | null;
  net_income_latest: number | null; net_income_prev: number | null;
}

export interface SectorImportRow {
  symbol: string;
  market: string | null;
  industry: string | null;
  sector: string | null;
}

export function normalizeBaseRow(r: Record<string, string>): BaseImportRow | null {
  const symbol = (r.symbol ?? "").trim();
  if (!symbol) return null;
  const companyName = firstNonEmpty(
    r.company_name,
    r.company,
    r.Company,
    r.companyName,
    r.issuer_name,
    r.issuer,
  );
  const row: BaseImportRow = { symbol };
  if (companyName !== undefined) row.company_name = companyName;

  // Only set listing_date / derive status when the CSV actually carries a date.
  // A blank first_trade_date cell must NOT overwrite an existing listing_date or
  // flip a listed IPO to "upcoming" — that previously corrupted historical rows
  // (e.g. AAV, AOT) on import. Leaving both fields unset preserves the existing
  // row on update and falls back to the 'listed' default for new inserts.
  const listingRaw = pickFirstPresent(r, "first_trade_date", "listing_date");
  if (listingRaw !== undefined) {
    const listing = dateOrNull(listingRaw);
    if (listing) {
      const today = new Date().toISOString().slice(0, 10);
      row.listing_date = listing;
      row.status = listing > today ? "upcoming" : "listed";
    }
  }

  setNum(row, "ipo_price", r, "ipo_price");
  setNum(row, "open_d1", r, "open_d1");
  setNum(row, "high_d1", r, "high_d1");
  setNum(row, "low_d1", r, "low_d1");
  setNum(row, "close_d1", r, "close_d1");
  setNum(row, "close_d2", r, "close_d2");
  setNum(row, "close_d3", r, "close_d3");
  setNum(row, "close_d4", r, "close_d4");
  setNum(row, "close_d5", r, "close_d5");
  setNum(row, "close_1w", r, "close_1w", "close_1W");
  setNum(row, "close_1m", r, "close_1m", "close_1M");
  setNum(row, "close_3m", r, "close_3m", "close_3M");
  setNum(row, "close_6m", r, "close_6m", "close_6M");

  if (hasAnyKey(r, "fa_persons")) row.fa_persons = parsePyList(r.fa_persons);
  if (hasAnyKey(r, "fa_companies")) row.fa_companies = parsePyList(r.fa_companies);
  if (hasAnyKey(r, "lead_underwriters_norm")) row.lead_uw = parsePyList(r.lead_underwriters_norm);
  if (hasAnyKey(r, "co_underwriters_norm")) row.co_uws = parsePyList(r.co_underwriters_norm);

  return row;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = value?.trim();
    if (text && text !== "nan" && text !== "NaN" && text !== "-") return text;
  }
  return undefined;
}

function hasAnyKey(row: Record<string, string>, ...keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function pickFirstPresent(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function setNum<K extends keyof BaseImportRow>(
  target: BaseImportRow,
  key: K,
  row: Record<string, string>,
  ...headers: string[]
) {
  const raw = pickFirstPresent(row, ...headers);
  if (raw !== undefined) target[key] = num(raw) as BaseImportRow[K];
}

export function normalizeFinRow(r: Record<string, string>): FinImportRow | null {
  const symbol = (r.symbol ?? "").trim();
  if (!symbol) return null;
  return {
    symbol,
    gross_proceeds: num(r.gross_proceeds),
    total_expense: num(r.total_expense),
    offered_shares: num(r.offered_shares),
    offered_ratio_pct: num(r.offered_ratio_pct),
    existing_shares_pct: num(r.existing_shares_pct),
    executive_total_pct: num(r.executive_total_pct),
    total_assets: num(r.total_assets),
    total_liabilities: num(r.total_liabilities),
    total_equity: num(r.total_equity),
    revenue_latest: num(r.revenue_latest),
    revenue_prev: num(r.revenue_prev),
    net_income_latest: num(r.net_income_latest),
    net_income_prev: num(r.net_income_prev),
  };
}

export function normalizeSectorRow(r: Record<string, string>): SectorImportRow | null {
  const symbol = (r.symbol ?? "").trim();
  if (!symbol) return null;
  return {
    symbol,
    market: (r.Market ?? "").trim() || null,
    industry: (r["Industry Group (กลุ่มอุตสาหกรรม)"] ?? "").trim() || null,
    sector: (r["Sector (หมวดธุรกิจ)"] ?? "").trim() || null,
  };
}

export interface FaNormImportRow {
  raw_name: string;
  normalized_name: string;
}

export function normalizeFaNormRow(r: Record<string, string>): FaNormImportRow | null {
  const raw = (r.fa_companies ?? "").trim();
  const norm = (r.fa_company_norm ?? "").trim();
  if (!raw || !norm) return null;
  return { raw_name: raw, normalized_name: norm };
}

// Fields we treat as "required for completeness" per type
export const COMPLETENESS_FIELDS: Record<SupportedCsvType, string[]> = {
  base: ["listing_date", "ipo_price", "close_d1", "fa_companies", "lead_uw"],
  financials: [
    "gross_proceeds", "offered_ratio_pct", "existing_shares_pct",
    "executive_total_pct", "total_equity", "net_income_latest",
  ],
  sector: ["market", "industry", "sector"],
  fa_norm: ["raw_name", "normalized_name"],
};
