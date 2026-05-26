import { query, buildInsertReturning, isDatabaseConfigured } from "@/lib/db";
import { effectiveIpoStatus, syncMaturedIpoStatuses } from "@/lib/ipo-status";
import { getIposList } from "@/lib/admin/queries";
import { scheduleAutoBuild } from "@/lib/buildTrigger";
import { requirePermission } from "@/lib/auth-guard";
import {
  isInvalidNumericError,
  isUniqueConstraintError,
  normalizeDateOnlyField,
  normalizeNumericFields,
} from "@/lib/admin/ipo-api-validation";

const IPO_FIELDS = [
  "symbol", "company_name", "market", "industry", "sector", "status",
  "listing_date", "ipo_price", "open_d1", "high_d1", "low_d1",
  "close_d1", "close_d2", "close_d3", "close_d4", "close_d5",
  "close_1w", "close_1m", "close_3m", "close_6m",
  "fa_persons", "fa_companies", "lead_uw", "co_uws", "source",
] as const;

const FIN_FIELDS = [
  "gross_proceeds", "total_expense", "offered_shares",
  "offered_ratio_pct", "existing_shares_pct", "executive_total_pct",
  "total_assets", "total_liabilities", "total_equity",
  "revenue_latest", "revenue_prev", "net_income_latest", "net_income_prev",
] as const;

const IPO_NUMERIC_FIELDS = [
  "ipo_price", "open_d1", "high_d1", "low_d1",
  "close_d1", "close_d2", "close_d3", "close_d4", "close_d5",
  "close_1w", "close_1m", "close_3m", "close_6m",
] as const;

function pick<T extends Record<string, unknown>>(obj: T, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured. Set DATABASE_URL in .env.local first." },
      { status: 503 },
    );
  }

  try {
    await requirePermission(request, "ipos:read");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseNumber(searchParams.get("limit")) ?? 100;
    const offset = parseNumber(searchParams.get("offset")) ?? 0;
    const minCompleteness = parseNumber(searchParams.get("min"));

    const data = await getIposList({
      search: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined,
      minCompleteness,
      industry: searchParams.get("industry") || undefined,
      sector: searchParams.get("sector") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      limit: Math.min(Math.max(limit, 1), 500),
      offset: Math.max(offset, 0),
    });

    return Response.json({
      source: "postgresql",
      ...data,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured. Set DATABASE_URL in .env.local first." },
      { status: 503 },
    );
  }

  try {
    await requirePermission(request, "ipos:write");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json(
      { error: "Content-Type must be application/json" },
      { status: 415 },
    );
  }

  try {
    const body = await request.json();
    if (!body.symbol || typeof body.symbol !== "string") {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    const ipoData = pick(body, IPO_FIELDS as unknown as string[]);
    const errors = normalizeNumericFields(ipoData, IPO_NUMERIC_FIELDS);
    const listingDateError = normalizeDateOnlyField(ipoData, "listing_date");
    if (listingDateError) errors.push(listingDateError);

    let finData: Record<string, unknown> | null = null;
    if (body.financials != null) {
      if (typeof body.financials !== "object" || Array.isArray(body.financials)) {
        errors.push("financials must be an object");
      } else {
        finData = pick(body.financials, FIN_FIELDS as unknown as string[]);
        errors.push(...normalizeNumericFields(finData, FIN_FIELDS as unknown as string[]));
      }
    }

    if (errors.length > 0) {
      return Response.json(
        { error: errors[0], details: errors },
        { status: 400 },
      );
    }

    ipoData.source = ipoData.source || "manual";
    ipoData.status = effectiveIpoStatus(
      ipoData.status as string | null | undefined,
      ipoData.listing_date as string | Date | null | undefined,
    );

    const { text, values } = buildInsertReturning("ipos", ipoData, "id");
    const rows = await query<{ id: number }>(text, values);
    const ipo = rows[0];

    if (!ipo) {
      return Response.json({ error: "Failed to create IPO" }, { status: 400 });
    }

    if (finData) {
      const hasAny = Object.values(finData).some((v) => v != null);
      if (hasAny) {
        const finPayload = { ...finData, ipo_id: ipo.id };
        try {
          const { text: finText, values: finValues } = buildInsertReturning("ipo_financials", finPayload, "ipo_id");
          await query(finText, finValues);
        } catch (err) {
          console.error("Warning: IPO created but financials insert failed:", (err as Error).message);
        }
      }
    }

    await syncMaturedIpoStatuses();

    scheduleAutoBuild(`create:${body.symbol}`);
    return Response.json({ id: ipo.id, symbol: body.symbol }, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return Response.json({ error: "symbol already exists" }, { status: 409 });
    }
    if (isInvalidNumericError(err)) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
