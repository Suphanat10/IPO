import { query } from "@/lib/db";
import { toDateOnly } from "@/lib/date-format";
import { applyEffectiveIpoStatus, syncMaturedIpoStatuses } from "@/lib/ipo-status";
import type {
  BuildLog,
  BuildRun,
  CompletenessRow,
  DashboardStats,
  IpoRow,
  IpoFinancialsRow,
  MissingFieldsRow,
  RecentUpdateRow,
  SyncJobRow,
  UpcomingRow,
  ValidationResult,
} from "./db-types";

function serializeDbValue(key: string, value: unknown) {
  if (key === "listing_date") return value == null ? value : toDateOnly(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

function serializeDbRow<T extends object>(row: T): T {
  const serialized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, serializeDbValue(key, value)]),
  ) as T;
  return applyEffectiveIpoStatus(serialized as T & Record<string, unknown>) as T;
}

function serializeDbRows<T extends object>(rows: T[]): T[] {
  return rows.map(serializeDbRow);
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  await syncMaturedIpoStatuses();
  const rows = await query<DashboardStats>("SELECT * FROM v_dashboard_stats LIMIT 1");
  return rows[0] ? serializeDbRow(rows[0]) : null;
}

export async function getRecentBuilds(limit = 5): Promise<BuildRun[]> {
  const rows = await query<BuildRun>(
    "SELECT * FROM build_runs ORDER BY started_at DESC LIMIT $1",
    [limit],
  );
  return serializeDbRows(rows);
}

export async function getUpcomingIpos(): Promise<UpcomingRow[]> {
  await syncMaturedIpoStatuses();
  const rows = await query<UpcomingRow>(
    `SELECT v.*, i.company_name_th,
            (i.fa_companies IS NOT NULL AND array_length(i.fa_companies,1) > 0) AS has_fa,
            (i.lead_uw      IS NOT NULL AND array_length(i.lead_uw,1)      > 0) AS has_lead_uw
       FROM v_upcoming_ipos v
       JOIN ipos i ON i.id = v.id
      ORDER BY v.listing_date ASC NULLS LAST`,
  );
  return serializeDbRows(rows);
}

export async function getIposList(opts: {
  search?: string;
  status?: string;
  minCompleteness?: number;
  industry?: string;
  sector?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: CompletenessRow[]; total: number; industries?: string[]; sectors?: string[] }> {
  await syncMaturedIpoStatuses();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`status = $${++paramIdx}`);
  }
  if (opts.search) {
    const pattern = `%${opts.search}%`;
    params.push(pattern);
    paramIdx++;
    conditions.push(`(symbol ILIKE $${paramIdx} OR company_name ILIKE $${paramIdx})`);
  }
  if (opts.minCompleteness != null) {
    params.push(opts.minCompleteness);
    conditions.push(`completeness_pct >= $${++paramIdx}`);
  }
  if (opts.industry) {
    params.push(opts.industry);
    conditions.push(`industry = $${++paramIdx}`);
  }
  if (opts.sector) {
    params.push(opts.sector);
    conditions.push(`sector = $${++paramIdx}`);
  }
  if (opts.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`listing_date >= $${++paramIdx}`);
  }
  if (opts.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`listing_date <= $${++paramIdx}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit);
  const limitIdx = ++paramIdx;
  params.push(offset);
  const offsetIdx = ++paramIdx;

  const [rawRows, countResult] = await Promise.all([
    query<CompletenessRow>(
      `SELECT * FROM v_ipo_completeness ${where} ORDER BY listing_date DESC NULLS LAST LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    ),
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM v_ipo_completeness ${where}`,
      params.slice(0, paramIdx - 2),
    ),
  ]);

  const total = parseInt(countResult[0]?.count ?? "0", 10);
  const rows = serializeDbRows(rawRows);

  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    const metaRows = await query<Pick<IpoRow, "id" | "market" | "industry" | "sector">>(
      "SELECT id, market, industry, sector FROM ipos WHERE id = ANY($1)",
      [ids],
    );
    const metaById = new Map(metaRows.map((row) => [row.id, row]));
    for (const row of rows) {
      const meta = metaById.get(row.id);
      row.market = meta?.market ?? row.market ?? null;
      row.industry = meta?.industry ?? row.industry ?? null;
      row.sector = meta?.sector ?? row.sector ?? null;
    }
  }

  const allIpos = await query<{ industry: string | null; sector: string | null }>(
    "SELECT industry, sector FROM ipos",
  );
  const industries = [...new Set(
    allIpos.map((r) => r.industry).filter(Boolean) as string[],
  )].sort();
  const sectors = [...new Set(
    allIpos.map((r) => r.sector).filter(Boolean) as string[],
  )].sort();

  return { rows, total, industries, sectors };
}

export async function getIpo(id: number): Promise<{
  ipo: IpoRow | null;
  financials: IpoFinancialsRow | null;
}> {
  await syncMaturedIpoStatuses();
  const [ipoRows, finRows] = await Promise.all([
    query<IpoRow>("SELECT * FROM ipos WHERE id = $1 LIMIT 1", [id]),
    query<IpoFinancialsRow>("SELECT * FROM ipo_financials WHERE ipo_id = $1 LIMIT 1", [id]),
  ]);
  return {
    ipo: ipoRows[0] ? serializeDbRow(ipoRows[0]) : null,
    financials: finRows[0] ? serializeDbRow(finRows[0]) : null,
  };
}

export async function getValidations(opts: {
  resolved?: boolean;
  severity?: string;
} = {}): Promise<(ValidationResult & { symbol: string | null })[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (opts.resolved != null) {
    params.push(opts.resolved);
    conditions.push(`vr.resolved = $${++paramIdx}`);
  }
  if (opts.severity) {
    params.push(opts.severity);
    conditions.push(`vr.severity = $${++paramIdx}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query<ValidationResult & { symbol: string | null }>(
    `SELECT vr.*, i.symbol FROM validation_results vr LEFT JOIN ipos i ON i.id = vr.ipo_id ${where} ORDER BY vr.severity ASC, vr.detected_at DESC`,
    params,
  );
  return serializeDbRows(rows);
}

export async function getMissingFields(opts: {
  status?: string;
  limit?: number;
} = {}): Promise<MissingFieldsRow[]> {
  await syncMaturedIpoStatuses();
  const conditions: string[] = ["completeness_pct < 100"];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`status = $${++paramIdx}`);
  }

  const lim = opts.limit ?? 1000;
  params.push(lim);
  const limIdx = ++paramIdx;

  const where = `WHERE ${conditions.join(" AND ")}`;

  const rows = await query<MissingFieldsRow>(
    `SELECT * FROM v_ipo_missing_fields ${where} ORDER BY completeness_pct ASC LIMIT $${limIdx}`,
    params,
  );
  return serializeDbRows(rows);
}

export async function getRecentUpdates(limit = 50): Promise<RecentUpdateRow[]> {
  await syncMaturedIpoStatuses();
  const rows = await query<RecentUpdateRow>(
    "SELECT * FROM v_recent_updates LIMIT $1",
    [limit],
  );
  return serializeDbRows(rows);
}

export async function getBuildRun(id: number): Promise<{
  run: BuildRun | null;
  logs: BuildLog[];
}> {
  const [runRows, logs] = await Promise.all([
    query<BuildRun>("SELECT * FROM build_runs WHERE id = $1 LIMIT 1", [id]),
    query<BuildLog>("SELECT * FROM build_logs WHERE run_id = $1 ORDER BY ts ASC", [id]),
  ]);
  return {
    run: runRows[0] ? serializeDbRow(runRows[0]) : null,
    logs: serializeDbRows(logs),
  };
}

export async function getSyncJobs(limit = 50): Promise<SyncJobRow[]> {
  const rows = await query<SyncJobRow>(
    "SELECT * FROM sync_jobs ORDER BY ran_at DESC LIMIT $1",
    [limit],
  );
  return serializeDbRows(rows);
}
