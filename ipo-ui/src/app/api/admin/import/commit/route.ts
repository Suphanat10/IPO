import { NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import { syncMaturedIpoStatuses } from "@/lib/ipo-status";
import { requirePermission } from "@/lib/auth-guard";
import { logImportEvent } from "@/lib/audit";
import type { CsvType } from "@/lib/csv-import";

export const dynamic = "force-dynamic";

type SupportedCsvType = Exclude<CsvType, "unknown">;

interface ApprovedRow {
  symbol: string;
  action: "new" | "update" | "skip" | "error";
  normalized: Record<string, unknown>;
}

interface CommitItem {
  fileName?: string;
  type: CsvType;
  rows: ApprovedRow[];
}

interface CommitRun {
  fileName: string;
  type: SupportedCsvType;
  inserted: number;
  updated: number;
  skipped: number;
  sync_id: number;
}

const TYPE_ORDER: Record<CsvType, number> = {
  base: 0,
  financials: 1,
  sector: 2,
  fa_norm: 3,
  unknown: 4,
};

function isSupportedType(type: CsvType): type is SupportedCsvType {
  return type === "base" || type === "financials" || type === "sector" || type === "fa_norm";
}

function selectedRows(rows: ApprovedRow[] | undefined): ApprovedRow[] {
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => r.action === "new" || r.action === "update",
  );
}

function countActions(rows: ApprovedRow[]) {
  return {
    newRows: rows.filter((r) => r.action === "new").length,
    updateRows: rows.filter((r) => r.action === "update").length,
  };
}

async function createSyncJob(source: string): Promise<number | NextResponse> {
  try {
    const data = await query<{ id: number }>(
      "INSERT INTO sync_jobs (source, status) VALUES ($1, 'running') RETURNING id",
      [source],
    );
    return data[0].id;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function finalizeSyncJob(
  syncId: number,
  status: "success" | "failed",
  counts: { inserted?: number; updated?: number; skipped?: number; error?: string },
) {
  if (status === "success") {
    await query(
      "UPDATE sync_jobs SET status = $1, rows_inserted = $2, rows_updated = $3, rows_skipped = $4 WHERE id = $5",
      [status, counts.inserted ?? 0, counts.updated ?? 0, counts.skipped ?? 0, syncId],
    );
  } else {
    await query(
      "UPDATE sync_jobs SET status = $1, error_message = $2 WHERE id = $3",
      [status, counts.error ?? "Commit failed", syncId],
    );
  }
}

async function ensureValidationRules() {
  await query(
    `INSERT INTO validation_rules (key, description, severity, scope) VALUES
      ('missing_listing_date', 'Listed IPO has no listing_date', 'error', 'ipo'),
      ('upcoming_missing_listing_date', 'Upcoming IPO has no listing_date for countdown/reporting', 'warning', 'ipo'),
      ('missing_market', 'IPO is missing market', 'warning', 'ipo'),
      ('missing_ipo_price', 'Listed IPO has no ipo_price', 'error', 'ipo'),
      ('upcoming_missing_ipo_price', 'Upcoming IPO has no ipo_price yet', 'warning', 'ipo'),
      ('missing_close_d1', 'Listed IPO has no close_d1', 'warning', 'ipo'),
      ('missing_fa', 'IPO has no FA company assigned', 'warning', 'ipo'),
      ('missing_lead_uw', 'IPO has no lead underwriter', 'warning', 'ipo'),
      ('missing_offered_ratio', 'IPO is missing offered_ratio_pct', 'warning', 'financials'),
      ('missing_existing_pct', 'IPO is missing existing_shares_pct', 'warning', 'financials'),
      ('missing_exec_pct', 'IPO is missing executive_total_pct', 'info', 'financials'),
      ('high_exec_ownership', 'Executive ownership is above 50%', 'info', 'financials'),
      ('missing_equity', 'IPO is missing total_equity', 'warning', 'financials'),
      ('missing_net_income', 'IPO is missing net_income_latest', 'warning', 'financials'),
      ('price_inconsistency', 'D1 price range is internally inconsistent', 'error', 'ipo'),
      ('upcoming_past_date', 'Upcoming IPO has a listing_date in the past', 'warning', 'ipo'),
      ('duplicate_symbol', 'Duplicate IPO symbols detected', 'error', 'ipo'),
      ('underwriter_relation_gap', 'Lead underwriter array is not synced to relation table', 'warning', 'ipo'),
      ('fa_relation_gap', 'FA company array is not synced to relation table', 'warning', 'ipo'),
      ('unmapped_fa', 'FA company is not mapped in fa_normalizations', 'warning', 'ipo')
     ON CONFLICT (key) DO UPDATE SET
      description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      scope = EXCLUDED.scope,
      active = true`,
  );
}

async function runPostCommitMaintenance(types: Set<SupportedCsvType>) {
  const started = performance.now();

  if (types.has("base")) {
    await syncMaturedIpoStatuses();
  }

  if (types.has("base") || types.has("fa_norm")) {
    try {
      await query("SELECT sync_underwriters_from_ipos()");
    } catch {
      // Migration 0005 may not be applied yet
    }
  }

  if (types.has("base") || types.has("financials") || types.has("sector")) {
    await ensureValidationRules();
    await query("SELECT run_validations()");
  }

  return Math.round(performance.now() - started);
}

function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

const COMMIT_CHUNK_SIZE = 500;

async function runJsonChunks(
  rows: Record<string, unknown>[],
  runQuery: (text: string, params?: unknown[]) => Promise<unknown>,
  sql: string,
) {
  for (let start = 0; start < rows.length; start += COMMIT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + COMMIT_CHUNK_SIZE);
    await runQuery(sql, [JSON.stringify(chunk)]);
  }
}

function jsonTextArrayExpression(key: string) {
  return `CASE
      WHEN payload ? '${key}' AND jsonb_typeof(payload->'${key}') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(payload->'${key}'))::text[]
      ELSE NULL
    END`;
}

const baseBulkUpsertSql = `
WITH raw_input AS (
  SELECT payload
  FROM jsonb_array_elements($1::jsonb) AS input(payload)
),
rows AS (
  SELECT
    payload,
    payload->>'symbol' AS symbol,
    CASE WHEN payload ? 'company_name' THEN payload->>'company_name' ELSE NULL END AS company_name,
    CASE WHEN payload ? 'status' THEN payload->>'status' ELSE 'listed' END AS status,
    CASE WHEN payload ? 'listing_date' THEN NULLIF(payload->>'listing_date', '')::date ELSE NULL END AS listing_date,
    CASE WHEN payload ? 'ipo_price' THEN (payload->>'ipo_price')::numeric ELSE NULL END AS ipo_price,
    CASE WHEN payload ? 'open_d1' THEN (payload->>'open_d1')::numeric ELSE NULL END AS open_d1,
    CASE WHEN payload ? 'high_d1' THEN (payload->>'high_d1')::numeric ELSE NULL END AS high_d1,
    CASE WHEN payload ? 'low_d1' THEN (payload->>'low_d1')::numeric ELSE NULL END AS low_d1,
    CASE WHEN payload ? 'close_d1' THEN (payload->>'close_d1')::numeric ELSE NULL END AS close_d1,
    CASE WHEN payload ? 'close_d2' THEN (payload->>'close_d2')::numeric ELSE NULL END AS close_d2,
    CASE WHEN payload ? 'close_d3' THEN (payload->>'close_d3')::numeric ELSE NULL END AS close_d3,
    CASE WHEN payload ? 'close_d4' THEN (payload->>'close_d4')::numeric ELSE NULL END AS close_d4,
    CASE WHEN payload ? 'close_d5' THEN (payload->>'close_d5')::numeric ELSE NULL END AS close_d5,
    CASE WHEN payload ? 'close_1w' THEN (payload->>'close_1w')::numeric ELSE NULL END AS close_1w,
    CASE WHEN payload ? 'close_1m' THEN (payload->>'close_1m')::numeric ELSE NULL END AS close_1m,
    CASE WHEN payload ? 'close_3m' THEN (payload->>'close_3m')::numeric ELSE NULL END AS close_3m,
    CASE WHEN payload ? 'close_6m' THEN (payload->>'close_6m')::numeric ELSE NULL END AS close_6m,
    ${jsonTextArrayExpression("fa_persons")} AS fa_persons,
    ${jsonTextArrayExpression("fa_companies")} AS fa_companies,
    ${jsonTextArrayExpression("lead_uw")} AS lead_uw,
    ${jsonTextArrayExpression("co_uws")} AS co_uws
  FROM raw_input
  WHERE payload ? 'symbol' AND NULLIF(payload->>'symbol', '') IS NOT NULL
)
INSERT INTO ipos (
  symbol, company_name, status, listing_date, ipo_price,
  open_d1, high_d1, low_d1,
  close_d1, close_d2, close_d3, close_d4, close_d5,
  close_1w, close_1m, close_3m, close_6m,
  fa_persons, fa_companies, lead_uw, co_uws,
  source
)
SELECT
  symbol, company_name, status, listing_date, ipo_price,
  open_d1, high_d1, low_d1,
  close_d1, close_d2, close_d3, close_d4, close_d5,
  close_1w, close_1m, close_3m, close_6m,
  fa_persons, fa_companies, lead_uw, co_uws,
  'csv_admin'
FROM rows
ON CONFLICT (symbol) DO UPDATE SET
  company_name = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'company_name') THEN EXCLUDED.company_name ELSE ipos.company_name END,
  status = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'status') THEN EXCLUDED.status ELSE ipos.status END,
  listing_date = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'listing_date') THEN EXCLUDED.listing_date ELSE ipos.listing_date END,
  ipo_price = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'ipo_price') THEN EXCLUDED.ipo_price ELSE ipos.ipo_price END,
  open_d1 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'open_d1') THEN EXCLUDED.open_d1 ELSE ipos.open_d1 END,
  high_d1 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'high_d1') THEN EXCLUDED.high_d1 ELSE ipos.high_d1 END,
  low_d1 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'low_d1') THEN EXCLUDED.low_d1 ELSE ipos.low_d1 END,
  close_d1 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_d1') THEN EXCLUDED.close_d1 ELSE ipos.close_d1 END,
  close_d2 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_d2') THEN EXCLUDED.close_d2 ELSE ipos.close_d2 END,
  close_d3 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_d3') THEN EXCLUDED.close_d3 ELSE ipos.close_d3 END,
  close_d4 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_d4') THEN EXCLUDED.close_d4 ELSE ipos.close_d4 END,
  close_d5 = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_d5') THEN EXCLUDED.close_d5 ELSE ipos.close_d5 END,
  close_1w = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_1w') THEN EXCLUDED.close_1w ELSE ipos.close_1w END,
  close_1m = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_1m') THEN EXCLUDED.close_1m ELSE ipos.close_1m END,
  close_3m = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_3m') THEN EXCLUDED.close_3m ELSE ipos.close_3m END,
  close_6m = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'close_6m') THEN EXCLUDED.close_6m ELSE ipos.close_6m END,
  fa_persons = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'fa_persons') THEN EXCLUDED.fa_persons ELSE ipos.fa_persons END,
  fa_companies = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'fa_companies') THEN EXCLUDED.fa_companies ELSE ipos.fa_companies END,
  lead_uw = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'lead_uw') THEN EXCLUDED.lead_uw ELSE ipos.lead_uw END,
  co_uws = CASE WHEN EXISTS (SELECT 1 FROM rows src WHERE src.symbol = EXCLUDED.symbol AND src.payload ? 'co_uws') THEN EXCLUDED.co_uws ELSE ipos.co_uws END,
  source = EXCLUDED.source`;

const financialsBulkUpsertSql = `
WITH rows AS (
  SELECT
    (payload->>'ipo_id')::bigint AS ipo_id,
    (payload->>'gross_proceeds')::numeric AS gross_proceeds,
    (payload->>'total_expense')::numeric AS total_expense,
    (payload->>'offered_shares')::bigint AS offered_shares,
    (payload->>'offered_ratio_pct')::numeric AS offered_ratio_pct,
    (payload->>'existing_shares_pct')::numeric AS existing_shares_pct,
    (payload->>'executive_total_pct')::numeric AS executive_total_pct,
    (payload->>'total_assets')::numeric AS total_assets,
    (payload->>'total_liabilities')::numeric AS total_liabilities,
    (payload->>'total_equity')::numeric AS total_equity,
    (payload->>'revenue_latest')::numeric AS revenue_latest,
    (payload->>'revenue_prev')::numeric AS revenue_prev,
    (payload->>'net_income_latest')::numeric AS net_income_latest,
    (payload->>'net_income_prev')::numeric AS net_income_prev
  FROM jsonb_array_elements($1::jsonb) AS input(payload)
)
INSERT INTO ipo_financials (
  ipo_id, gross_proceeds, total_expense, offered_shares, offered_ratio_pct,
  existing_shares_pct, executive_total_pct, total_assets, total_liabilities,
  total_equity, revenue_latest, revenue_prev, net_income_latest, net_income_prev
)
SELECT
  ipo_id, gross_proceeds, total_expense, offered_shares, offered_ratio_pct,
  existing_shares_pct, executive_total_pct, total_assets, total_liabilities,
  total_equity, revenue_latest, revenue_prev, net_income_latest, net_income_prev
FROM rows
ON CONFLICT (ipo_id) DO UPDATE SET
  gross_proceeds = EXCLUDED.gross_proceeds,
  total_expense = EXCLUDED.total_expense,
  offered_shares = EXCLUDED.offered_shares,
  offered_ratio_pct = EXCLUDED.offered_ratio_pct,
  existing_shares_pct = EXCLUDED.existing_shares_pct,
  executive_total_pct = EXCLUDED.executive_total_pct,
  total_assets = EXCLUDED.total_assets,
  total_liabilities = EXCLUDED.total_liabilities,
  total_equity = EXCLUDED.total_equity,
  revenue_latest = EXCLUDED.revenue_latest,
  revenue_prev = EXCLUDED.revenue_prev,
  net_income_latest = EXCLUDED.net_income_latest,
  net_income_prev = EXCLUDED.net_income_prev`;

const sectorBulkUpsertSql = `
WITH rows AS (
  SELECT
    payload->>'symbol' AS symbol,
    payload->>'market' AS market,
    payload->>'industry' AS industry,
    payload->>'sector' AS sector
  FROM jsonb_array_elements($1::jsonb) AS input(payload)
),
upserted AS (
  INSERT INTO sectors (symbol, market, industry, sector)
  SELECT symbol, market, industry, sector FROM rows
  ON CONFLICT (symbol) DO UPDATE SET
    market = EXCLUDED.market,
    industry = EXCLUDED.industry,
    sector = EXCLUDED.sector
  RETURNING symbol
)
UPDATE ipos
SET market = rows.market,
    industry = rows.industry,
    sector = rows.sector
FROM rows
WHERE ipos.symbol = rows.symbol`;

const faNormBulkUpsertSql = `
WITH rows AS (
  SELECT
    payload->>'raw_name' AS raw_name,
    payload->>'normalized_name' AS normalized_name
  FROM jsonb_array_elements($1::jsonb) AS input(payload)
),
upserted AS (
  INSERT INTO fa_normalizations (raw_name, normalized_name)
  SELECT raw_name, normalized_name FROM rows
  ON CONFLICT (raw_name) DO UPDATE SET normalized_name = EXCLUDED.normalized_name
  RETURNING raw_name
)
UPDATE fa_companies
SET normalized_name = rows.normalized_name
FROM rows
WHERE fa_companies.name = rows.raw_name`;

async function commitType(
  type: SupportedCsvType,
  approved: ApprovedRow[],
  client: PoolClient,
) {
  const q = <T extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) =>
    client.query(text, params).then((r) => r.rows as T[]);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (type === "base") {
    const payloadRows = approved.map((r) =>
      stripUndefined({
        symbol: r.normalized.symbol,
        ...(r.normalized.company_name !== undefined ? { company_name: r.normalized.company_name } : {}),
        status: r.normalized.status,
        listing_date: r.normalized.listing_date,
        ipo_price: r.normalized.ipo_price,
        open_d1: r.normalized.open_d1,
        high_d1: r.normalized.high_d1,
        low_d1: r.normalized.low_d1,
        close_d1: r.normalized.close_d1,
        close_d2: r.normalized.close_d2,
        close_d3: r.normalized.close_d3,
        close_d4: r.normalized.close_d4,
        close_d5: r.normalized.close_d5,
        close_1w: r.normalized.close_1w,
        close_1m: r.normalized.close_1m,
        close_3m: r.normalized.close_3m,
        close_6m: r.normalized.close_6m,
        fa_persons: r.normalized.fa_persons,
        fa_companies: r.normalized.fa_companies,
        lead_uw: r.normalized.lead_uw,
        co_uws: r.normalized.co_uws,
        source: "csv_admin",
      }),
    );
    await runJsonChunks(payloadRows, q, baseBulkUpsertSql);

    const counts = countActions(approved);
    inserted = counts.newRows;
    updated = counts.updateRows;
  } else if (type === "financials") {
    const symbols = approved.map((r) => r.normalized.symbol as string);
    const ipos = await q<{ id: number; symbol: string }>(
      "SELECT id, symbol FROM ipos WHERE symbol = ANY($1)",
      [symbols],
    );

    const idMap = new Map<string, number>(
      ipos.map((r) => [r.symbol.toUpperCase(), r.id]),
    );

    const payloadRows: Record<string, unknown>[] = [];
    for (const r of approved) {
      const id = idMap.get((r.normalized.symbol as string).toUpperCase());
      if (!id) {
        skipped++;
        continue;
      }
      const n = r.normalized;
      payloadRows.push({
        ipo_id: id,
        gross_proceeds: n.gross_proceeds,
        total_expense: n.total_expense,
        offered_shares: n.offered_shares,
        offered_ratio_pct: n.offered_ratio_pct,
        existing_shares_pct: n.existing_shares_pct,
        executive_total_pct: n.executive_total_pct,
        total_assets: n.total_assets,
        total_liabilities: n.total_liabilities,
        total_equity: n.total_equity,
        revenue_latest: n.revenue_latest,
        revenue_prev: n.revenue_prev,
        net_income_latest: n.net_income_latest,
        net_income_prev: n.net_income_prev,
      });
    }
    await runJsonChunks(payloadRows, q, financialsBulkUpsertSql);

    inserted = approved.filter((r) => r.action === "new" && idMap.has((r.normalized.symbol as string).toUpperCase())).length;
    updated = approved.filter((r) => r.action === "update" && idMap.has((r.normalized.symbol as string).toUpperCase())).length;
  } else if (type === "sector") {
    const payloadRows = approved.map((r) => ({
      symbol: String(r.normalized.symbol ?? ""),
      market: r.normalized.market as string | null,
      industry: r.normalized.industry as string | null,
      sector: r.normalized.sector as string | null,
    }));
    await runJsonChunks(payloadRows, q, sectorBulkUpsertSql);

    const counts = countActions(approved);
    inserted = counts.newRows;
    updated = counts.updateRows;
  } else if (type === "fa_norm") {
    const payloadRows = approved.map((r) => ({
      raw_name: String(r.normalized.raw_name ?? ""),
      normalized_name: String(r.normalized.normalized_name ?? ""),
    }));
    await runJsonChunks(payloadRows, q, faNormBulkUpsertSql);

    const counts = countActions(approved);
    inserted = counts.newRows;
    updated = counts.updateRows;
  }

  return { inserted, updated, skipped };
}

async function handleBatch(rawItems: CommitItem[]) {
  const items: Array<{ fileName: string; type: SupportedCsvType; rows: ApprovedRow[] }> = [];
  for (const item of rawItems) {
    if (!isSupportedType(item.type)) {
      return NextResponse.json({ error: `Unsupported type "${item.type}"` }, { status: 400 });
    }
    const rows = selectedRows(item.rows);
    if (rows.length > 0) {
      items.push({
        fileName: item.fileName || item.type,
        type: item.type,
        rows,
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Nothing to commit" }, { status: 400 });
  }

  items.sort((a, b) => {
    const order = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    return order === 0 ? a.fileName.localeCompare(b.fileName) : order;
  });

  const syncId = await createSyncJob("csv_admin_batch");
  if (syncId instanceof NextResponse) return syncId;

  const runs: CommitRun[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let maintenanceMs = 0;
  const committedTypes = new Set<SupportedCsvType>(items.map((item) => item.type));
  const started = performance.now();

  try {
    await withTransaction(async (client) => {
      for (const item of items) {
        const counts = await commitType(item.type, item.rows, client);
        const run = {
          fileName: item.fileName,
          type: item.type,
          inserted: counts.inserted,
          updated: counts.updated,
          skipped: counts.skipped,
          sync_id: syncId,
        };
        runs.push(run);
        inserted += counts.inserted;
        updated += counts.updated;
        skipped += counts.skipped;
      }
    });

    maintenanceMs = await runPostCommitMaintenance(committedTypes);
    await finalizeSyncJob(syncId, "success", { inserted, updated, skipped });

    return NextResponse.json({
      ok: true,
      sync_id: syncId,
      inserted,
      updated,
      skipped,
      runs,
      duration_ms: Math.round(performance.now() - started),
      maintenance_ms: maintenanceMs,
    });
  } catch (err) {
    const msg = (err as { message?: string }).message ?? String(err);
    await finalizeSyncJob(syncId, "failed", { error: msg });
    return NextResponse.json({ error: msg, runs }, { status: 500 });
  }
}

async function handleSingle(body: { type?: CsvType; rows?: ApprovedRow[] }) {
  const { type } = body;
  if (!type || !isSupportedType(type)) {
    return NextResponse.json({ error: `Unsupported type "${type}"` }, { status: 400 });
  }

  const approved = selectedRows(body.rows);
  if (approved.length === 0) {
    return NextResponse.json({ error: "Nothing to commit" }, { status: 400 });
  }

  const syncId = await createSyncJob(`csv_admin_${type}`);
  if (syncId instanceof NextResponse) return syncId;

  let maintenanceMs = 0;
  const started = performance.now();

  try {
    const counts = await withTransaction((client) => commitType(type, approved, client));
    maintenanceMs = await runPostCommitMaintenance(new Set([type]));
    await finalizeSyncJob(syncId, "success", counts);
    return NextResponse.json({
      ok: true,
      sync_id: syncId,
      ...counts,
      duration_ms: Math.round(performance.now() - started),
      maintenance_ms: maintenanceMs,
    });
  } catch (err) {
    const msg = (err as { message?: string }).message ?? String(err);
    await finalizeSyncJob(syncId, "failed", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requirePermission(req, "ipos:write");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: { type?: CsvType; rows?: ApprovedRow[]; items?: CommitItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isBatch = Array.isArray(body.items);
  const csvType = isBatch
    ? (body.items ?? []).map((i) => i.type).join(",")
    : (body.type ?? "unknown");

  await logImportEvent({
    request: req,
    actorUserId: session.userId,
    actorEmail: session.email,
    action: "import_commit",
    csvType,
    diff: {
      batch: isBatch,
      types: isBatch ? (body.items ?? []).map((i) => i.type) : [body.type],
    },
  });

  if (isBatch) return handleBatch(body.items!);
  return handleSingle(body);
}
