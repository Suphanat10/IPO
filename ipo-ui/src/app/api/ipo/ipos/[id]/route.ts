import { query, buildInsert, buildUpdate, isDatabaseConfigured } from "@/lib/db";
import { toDateOnly } from "@/lib/date-format";
import { applyEffectiveIpoStatus, effectiveIpoStatus, syncMaturedIpoStatuses } from "@/lib/ipo-status";
import { scheduleAutoBuild } from "@/lib/buildTrigger";
import {
  normalizeDateOnlyField,
  normalizeNumericFields,
  parsePositiveIdParam,
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

function serializeApiRow(row: Record<string, unknown>) {
  const serialized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (key === "listing_date") return [key, value == null ? null : toDateOnly(value)];
      if (value instanceof Date) return [key, value.toISOString()];
      return [key, value];
    }),
  );
  return applyEffectiveIpoStatus(serialized);
}

const OLD_COL_LIMITS: Record<string, number> = {
  offered_ratio_pct:   9999.9999,
  existing_shares_pct: 9999.9999,
  executive_total_pct: 9999.9999,
  gross_proceeds:      999_999_999_999_999_999,
  total_expense:       999_999_999_999_999_999,
  total_assets:        999_999_999_999_999_999,
  total_liabilities:   999_999_999_999_999_999,
  total_equity:        999_999_999_999_999_999,
  revenue_latest:      999_999_999_999_999_999,
  revenue_prev:        999_999_999_999_999_999,
  net_income_latest:   999_999_999_999_999_999,
  net_income_prev:     999_999_999_999_999_999,
};

function identifyOverflowFields(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    const limit = OLD_COL_LIMITS[k];
    if (limit == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (Math.abs(v) > limit) out.push(`${k}=${v}`);
  }
  return out;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const numId = parsePositiveIdParam(id);
  if (numId == null) {
    return Response.json({ error: "Invalid IPO id" }, { status: 400 });
  }

  await syncMaturedIpoStatuses();

  const [ipoRows, finRows] = await Promise.all([
    query("SELECT * FROM ipos WHERE id = $1 LIMIT 1", [numId]),
    query("SELECT * FROM ipo_financials WHERE ipo_id = $1 LIMIT 1", [numId]),
  ]);

  if (ipoRows.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    ipo: serializeApiRow(ipoRows[0] as Record<string, unknown>),
    financials: finRows[0] ? serializeApiRow(finRows[0] as Record<string, unknown>) : null,
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured. Set DATABASE_URL in .env.local first." },
      { status: 503 },
    );
  }

  try {
    const { id } = await ctx.params;
    const numId = parsePositiveIdParam(id);
    if (numId == null) {
      return Response.json({ error: "Invalid IPO id" }, { status: 400 });
    }

    const existingIpo = await query<{ id: number }>(
      "SELECT id FROM ipos WHERE id = $1 LIMIT 1",
      [numId],
    );
    if (existingIpo.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();

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

    if ("status" in ipoData || "listing_date" in ipoData) {
      ipoData.status = effectiveIpoStatus(
        ipoData.status as string | null | undefined,
        ipoData.listing_date as string | Date | null | undefined,
      );
    }

    if (Object.keys(ipoData).length > 0) {
      const { text, values } = buildUpdate("ipos", ipoData, "id = $1", [numId]);
      const updatedRows = await query<{ id: number }>(`${text} RETURNING id`, values);
      if (updatedRows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }

    if (finData) {
      const hasAny = Object.values(finData).some((v) => v != null);
      if (hasAny) {
        try {
          const existing = await query(
            "SELECT ipo_id FROM ipo_financials WHERE ipo_id = $1 LIMIT 1",
            [numId],
          );
          if (existing.length > 0) {
            const { text, values } = buildUpdate("ipo_financials", finData, "ipo_id = $1", [numId]);
            await query(text, values);
          } else {
            const finPayload = { ...finData, ipo_id: numId };
            const { text, values } = buildInsert("ipo_financials", finPayload);
            await query(text, values);
          }
        } catch (err) {
          const msg = (err as Error).message ?? "";
          const isOverflow = /numeric field overflow/i.test(msg) || /22003/.test(msg);
          if (isOverflow) {
            const candidates = identifyOverflowFields(finData);
            const fieldList = candidates.length ? candidates.join(", ") : "one of the financial fields";
            return Response.json(
              {
                error:
                  `Numeric overflow บน field: ${fieldList}. ` +
                  `ค่าใหญ่เกินขนาดของคอลัมน์ — รัน migration 0006_widen_numeric.sql บน PostgreSQL เพื่อขยายคอลัมน์`,
              },
              { status: 400 },
            );
          }
          return Response.json(
            { error: `IPO updated, but financials update failed: ${msg}` },
            { status: 400 },
          );
        }
      }
    }

    await syncMaturedIpoStatuses();

    scheduleAutoBuild(`update:${numId}`);
    return Response.json({ id: numId, updated: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const numId = parsePositiveIdParam(id);
  if (numId == null) {
    return Response.json({ error: "Invalid IPO id" }, { status: 400 });
  }

  try {
    const rows = await query<{ id: number }>(
      "UPDATE ipos SET status = 'cancelled' WHERE id = $1 RETURNING id",
      [numId],
    );
    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    scheduleAutoBuild(`delete:${id}`);
    return Response.json({ id: numId, deleted: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
