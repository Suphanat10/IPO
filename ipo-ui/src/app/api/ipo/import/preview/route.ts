import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toDateOnly } from "@/lib/date-format";
import {
  COMPLETENESS_FIELDS,
  normalizeBaseRow,
  normalizeFinRow,
  normalizeSectorRow,
  type CsvType,
} from "@/lib/csv-import";

export const dynamic = "force-dynamic";

interface PreviewRow {
  row_index: number;
  symbol: string;
  action: "new" | "update" | "skip" | "error";
  missing_fields: string[];
  errors: string[];
  normalized: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
  changed_fields: string[];
}

function detectMissing(
  normalized: Record<string, unknown>,
  type: Exclude<CsvType, "unknown">,
): string[] {
  return COMPLETENESS_FIELDS[type].filter((f) => {
    const v = normalized[f];
    if (v == null) return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}

function diffFields(
  normalized: Record<string, unknown>,
  current: Record<string, unknown> | null,
): string[] {
  if (!current) return Object.keys(normalized).filter((k) => k !== "symbol");
  const changes: string[] = [];
  for (const [k, v] of Object.entries(normalized)) {
    if (k === "symbol") continue;
    const cur = current[k];
    if (Array.isArray(v) && Array.isArray(cur)) {
      if (v.join("|") !== cur.join("|")) changes.push(k);
    } else if (Array.isArray(v) || Array.isArray(cur)) {
      changes.push(k);
    } else {
      const a = v == null ? null : String(v);
      const b = cur == null ? null : String(cur);
      const norm = (x: string | null) => x == null ? null : Number.isFinite(Number(x)) ? String(Number(x)) : x;
      if (norm(a) !== norm(b)) changes.push(k);
    }
  }
  return changes;
}

function serializePreviewRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (key === "listing_date") return [key, value == null ? null : toDateOnly(value)];
      if (value instanceof Date) return [key, value.toISOString()];
      return [key, value];
    }),
  );
}

export async function POST(req: Request) {
  let body: {
    type: CsvType;
    rows: Record<string, string>[];
    pending_parent_symbols?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { type, rows } = body;

  const pendingParentSymbols = new Set(
    (body.pending_parent_symbols ?? [])
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean),
  );
  if (!type || !["base", "financials", "sector", "fa_norm"].includes(type)) {
    return NextResponse.json(
      { error: `Unsupported type "${type}". Supported: base, financials, sector, fa_norm` },
      { status: 400 },
    );
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  if (type === "fa_norm") {
    return handleFaNormPreview(rows);
  }

  const symbols = [
    ...new Set(rows.map((r) => (r.symbol ?? "").trim()).filter(Boolean)),
  ];

  const currentMap = new Map<string, Record<string, unknown>>();
  const parentSymbols = new Set<string>();
  if (symbols.length > 0) {
    if (type === "base") {
      const data = await query(
        `SELECT id, symbol, company_name, listing_date, status, ipo_price,
                open_d1, high_d1, low_d1,
                close_d1, close_d2, close_d3, close_d4, close_d5,
                close_1w, close_1m, close_3m, close_6m,
                fa_persons, fa_companies, lead_uw, co_uws
         FROM ipos WHERE symbol = ANY($1)`,
        [symbols],
      );
      data.forEach((row: Record<string, unknown>) => {
        const symbol = String(row.symbol ?? "").toUpperCase();
        if (symbol) currentMap.set(symbol, serializePreviewRow(row));
      });
    } else if (type === "financials") {
      const data = await query(
        `SELECT i.id, i.symbol, f.*
         FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
         WHERE i.symbol = ANY($1)`,
        [symbols],
      );
      data.forEach((row: Record<string, unknown>) => {
        const sym = String(row.symbol ?? "").toUpperCase();
        parentSymbols.add(sym);
        if (row.ipo_id) {
          currentMap.set(sym, { ...row, symbol: row.symbol });
        }
      });
    } else if (type === "sector") {
      const [secData, ipoData] = await Promise.all([
        query("SELECT symbol, market, industry, sector FROM sectors WHERE symbol = ANY($1)", [symbols]),
        query("SELECT symbol FROM ipos WHERE symbol = ANY($1)", [symbols]),
      ]);
      secData.forEach((row: Record<string, unknown>) => {
        const symbol = String(row.symbol ?? "").toUpperCase();
        if (symbol) currentMap.set(symbol, row);
      });
      ipoData.forEach((row: Record<string, unknown>) => {
        const symbol = String(row.symbol ?? "").toUpperCase();
        if (symbol) parentSymbols.add(symbol);
      });
    }
  }
  pendingParentSymbols.forEach((symbol) => parentSymbols.add(symbol));

  const result: PreviewRow[] = [];
  const seenSymbols = new Map<string, number>();

  rows.forEach((raw, i) => {
    const symbolRaw = (raw.symbol ?? "").trim();
    if (!symbolRaw) {
      result.push({
        row_index: i, symbol: "", action: "error",
        missing_fields: [], errors: ["symbol is empty"],
        normalized: null, current: null, changed_fields: [],
      });
      return;
    }
    const dupOf = seenSymbols.get(symbolRaw.toUpperCase());
    if (dupOf != null) {
      result.push({
        row_index: i, symbol: symbolRaw, action: "error",
        missing_fields: [], errors: [`duplicate of row ${dupOf + 2} in this CSV`],
        normalized: null, current: null, changed_fields: [],
      });
      return;
    }
    seenSymbols.set(symbolRaw.toUpperCase(), i);

    let normalized: Record<string, unknown> | null = null;
    if (type === "base") {
      const base = normalizeBaseRow(raw);
      normalized = base ? { ...base } : null;
    } else if (type === "financials") {
      const financials = normalizeFinRow(raw);
      normalized = financials ? { ...financials } : null;
    } else if (type === "sector") {
      const sector = normalizeSectorRow(raw);
      normalized = sector ? { ...sector } : null;
    }

    if (!normalized) {
      result.push({
        row_index: i, symbol: symbolRaw, action: "error",
        missing_fields: [], errors: ["could not normalize row"],
        normalized: null, current: null, changed_fields: [],
      });
      return;
    }

    const current = currentMap.get(symbolRaw.toUpperCase()) ?? null;
    const missing_fields = detectMissing(
      normalized,
      type as Exclude<CsvType, "unknown">,
    );

    if (type !== "base" && !parentSymbols.has(symbolRaw.toUpperCase())) {
      result.push({
        row_index: i, symbol: symbolRaw, action: "error",
        missing_fields,
        errors: ["ไม่มี IPO row ใน ipos — import base.csv ก่อนหรือเพิ่มด้วย Form"],
        normalized, current: null, changed_fields: [],
      });
      return;
    }

    const changed = diffFields(normalized, current);
    const action: PreviewRow["action"] = current
      ? changed.length > 0 ? "update" : "skip"
      : "new";

    result.push({
      row_index: i, symbol: symbolRaw, action,
      missing_fields, errors: [],
      normalized, current, changed_fields: changed,
    });
  });

  const summary = {
    total: result.length,
    new: result.filter((r) => r.action === "new").length,
    update: result.filter((r) => r.action === "update").length,
    skip: result.filter((r) => r.action === "skip").length,
    error: result.filter((r) => r.action === "error").length,
    incomplete: result.filter((r) => r.missing_fields.length > 0).length,
  };

  return NextResponse.json({ type, summary, rows: result });
}

async function handleFaNormPreview(rows: Record<string, string>[]) {
  const rawNames = [
    ...new Set(rows.map((r) => (r.fa_companies ?? "").trim()).filter(Boolean)),
  ];

  const currentMap = new Map<string, Record<string, unknown>>();
  if (rawNames.length > 0) {
    const BATCH = 20;
    for (let start = 0; start < rawNames.length; start += BATCH) {
      const chunk = rawNames.slice(start, start + BATCH);
      const data = await query(
        "SELECT raw_name, normalized_name FROM fa_normalizations WHERE raw_name = ANY($1)",
        [chunk],
      );
      data.forEach((row: Record<string, unknown>) => {
        const key = String(row.raw_name ?? "");
        if (key) currentMap.set(key, row);
      });
    }
  }

  const result: PreviewRow[] = [];
  const seen = new Map<string, number>();

  rows.forEach((raw, i) => {
    const rawName = (raw.fa_companies ?? "").trim();
    const normName = (raw.fa_company_norm ?? "").trim();

    if (!rawName) {
      result.push({
        row_index: i, symbol: "", action: "error",
        missing_fields: [], errors: ["fa_companies (raw_name) ว่าง"],
        normalized: null, current: null, changed_fields: [],
      });
      return;
    }
    if (!normName) {
      result.push({
        row_index: i, symbol: rawName, action: "error",
        missing_fields: ["normalized_name"], errors: ["fa_company_norm ว่าง"],
        normalized: { raw_name: rawName, normalized_name: null }, current: null, changed_fields: [],
      });
      return;
    }

    const dupOf = seen.get(rawName);
    if (dupOf != null) {
      result.push({
        row_index: i, symbol: rawName, action: "error",
        missing_fields: [], errors: [`duplicate ของแถว ${dupOf + 2}`],
        normalized: null, current: null, changed_fields: [],
      });
      return;
    }
    seen.set(rawName, i);

    const normalized = { raw_name: rawName, normalized_name: normName };
    const current = currentMap.get(rawName) ?? null;
    const changed = diffFields(normalized, current);
    const action: PreviewRow["action"] = current
      ? changed.length > 0 ? "update" : "skip"
      : "new";

    result.push({
      row_index: i, symbol: rawName, action,
      missing_fields: [], errors: [],
      normalized, current, changed_fields: changed,
    });
  });

  const summary = {
    total: result.length,
    new: result.filter((r) => r.action === "new").length,
    update: result.filter((r) => r.action === "update").length,
    skip: result.filter((r) => r.action === "skip").length,
    error: result.filter((r) => r.action === "error").length,
    incomplete: result.filter((r) => r.missing_fields.length > 0).length,
  };

  return NextResponse.json({ type: "fa_norm", summary, rows: result });
}
