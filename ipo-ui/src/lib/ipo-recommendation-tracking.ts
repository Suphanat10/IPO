import { query } from "@/lib/db";
import { toDateOnly } from "@/lib/date-format";
import { getBangkokDateString } from "@/lib/ipo-status";
import {
  buildUpcomingRecommendationSignal,
  type UpcomingRecommendationIpo,
} from "@/lib/upcoming-recommendation";
import { readSlice } from "@/lib/artifact";
import {
  setRawIpo,
  setLeadCoIndex,
  getRawIpo,
} from "@/app/lib/analyticsData";
import type { RawIpoRow, LeadCoIndexEntry } from "@/app/lib/mockData";

export type IpoRecommendationOutcomeRow = {
  id: number;
  ipo_id: number;
  symbol: string;
  company_name: string | null;
  market: string | null;
  industry: string | null;
  sector: string | null;
  snapshot_date: string;
  snapshot_at: string;
  predicted_listing_date: string | null;
  actual_listing_date: string | null;
  predicted_ipo_price: number | null;
  actual_ipo_price: number | null;
  decision: "BUY" | "NEUTRAL" | "AVOID";
  score: number;
  win_rate: number | null;
  avg_return_d1: number | null;
  target_pct: number | null;
  target_price: number | null;
  fa_person: string | null;
  fa_company: string | null;
  lead_uw: string | null;
  actual_status: "pending" | "cancelled" | "listed_missing_return" | "resolved";
  outcome_checked_at: string | null;
  actual_return_d1: number | null;
  actual_return_1w: number | null;
  actual_return_1m: number | null;
  actual_return_3m: number | null;
  actual_return_6m: number | null;
  outcome_result: "pending" | "cancelled" | "hit" | "neutral_hit" | "miss";
  prediction_correct: boolean | null;
};

export type RecommendationPerformanceSummary = {
  schemaReady: boolean;
  trackedCount: number;
  resolvedCount: number;
  pendingCount: number;
  hitRate: number | null;
  actionableHitRate: number | null;
  buyWinRate: number | null;
  buyAvgReturnD1: number | null;
  avgReturnD1: number | null;
  avgReturn1M: number | null;
  avgPredictedScore: number | null;
  avgPredictedWinRate: number | null;
};

export type RecommendationPerformance = {
  summary: RecommendationPerformanceSummary;
  rows: IpoRecommendationOutcomeRow[];
};

function isMissingTrackingTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "42P01" || /ipo_recommendation_snapshots|v_ipo_recommendation_outcomes/i.test(message);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function serializeOutcomeRow(row: Record<string, unknown>): IpoRecommendationOutcomeRow {
  const dateValue = (value: unknown) => {
    if (value == null) return null;
    return toDateOnly(value);
  };
  const dateTimeValue = (value: unknown) => {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  };

  return {
    id: Number(row.id),
    ipo_id: Number(row.ipo_id),
    symbol: String(row.symbol),
    company_name: row.company_name == null ? null : String(row.company_name),
    market: row.market == null ? null : String(row.market),
    industry: row.industry == null ? null : String(row.industry),
    sector: row.sector == null ? null : String(row.sector),
    snapshot_date: dateValue(row.snapshot_date) ?? "",
    snapshot_at: dateTimeValue(row.snapshot_at) ?? "",
    predicted_listing_date: dateValue(row.predicted_listing_date),
    actual_listing_date: dateValue(row.actual_listing_date),
    predicted_ipo_price: toNumber(row.predicted_ipo_price),
    actual_ipo_price: toNumber(row.actual_ipo_price),
    decision: row.decision as IpoRecommendationOutcomeRow["decision"],
    score: toNumber(row.score) ?? 0,
    win_rate: toNumber(row.win_rate),
    avg_return_d1: toNumber(row.avg_return_d1),
    target_pct: toNumber(row.target_pct),
    target_price: toNumber(row.target_price),
    fa_person: row.fa_person == null ? null : String(row.fa_person),
    fa_company: row.fa_company == null ? null : String(row.fa_company),
    lead_uw: row.lead_uw == null ? null : String(row.lead_uw),
    actual_status: row.actual_status as IpoRecommendationOutcomeRow["actual_status"],
    outcome_checked_at: dateTimeValue(row.outcome_checked_at),
    actual_return_d1: toNumber(row.actual_return_d1),
    actual_return_1w: toNumber(row.actual_return_1w),
    actual_return_1m: toNumber(row.actual_return_1m),
    actual_return_3m: toNumber(row.actual_return_3m),
    actual_return_6m: toNumber(row.actual_return_6m),
    outcome_result: row.outcome_result as IpoRecommendationOutcomeRow["outcome_result"],
    prediction_correct: row.prediction_correct == null ? null : Boolean(row.prediction_correct),
  };
}

function avg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return (part / total) * 100;
}

function emptyPerformance(schemaReady: boolean): RecommendationPerformance {
  return {
    summary: {
      schemaReady,
      trackedCount: 0,
      resolvedCount: 0,
      pendingCount: 0,
      hitRate: null,
      actionableHitRate: null,
      buyWinRate: null,
      buyAvgReturnD1: null,
      avgReturnD1: null,
      avgReturn1M: null,
      avgPredictedScore: null,
      avgPredictedWinRate: null,
    },
    rows: [],
  };
}

function summarizeRows(rows: IpoRecommendationOutcomeRow[]): RecommendationPerformanceSummary {
  const resolved = rows.filter((row) => row.actual_status === "resolved" && row.actual_return_d1 != null);
  const actionable = resolved.filter((row) => row.decision === "BUY" || row.decision === "AVOID");
  const buys = resolved.filter((row) => row.decision === "BUY");

  return {
    schemaReady: true,
    trackedCount: rows.length,
    resolvedCount: resolved.length,
    pendingCount: rows.filter((row) => row.actual_status === "pending" || row.actual_status === "listed_missing_return").length,
    hitRate: pct(resolved.filter((row) => row.prediction_correct).length, resolved.length),
    actionableHitRate: pct(actionable.filter((row) => row.prediction_correct).length, actionable.length),
    buyWinRate: pct(buys.filter((row) => (row.actual_return_d1 ?? 0) > 0).length, buys.length),
    buyAvgReturnD1: avg(buys.map((row) => row.actual_return_d1)),
    avgReturnD1: avg(resolved.map((row) => row.actual_return_d1)),
    avgReturn1M: avg(resolved.map((row) => row.actual_return_1m)),
    avgPredictedScore: avg(rows.map((row) => row.score * 100)),
    avgPredictedWinRate: avg(rows.map((row) => row.win_rate)),
  };
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getCurrentUpcomingRecommendationIpos(): Promise<UpcomingRecommendationIpo[]> {
  const upcoming = await query<{
    id: number;
    symbol: string;
    company_name: string | null;
    market: string | null;
    industry: string | null;
    sector: string | null;
    listing_date: string | Date | null;
    ipo_price: number | null;
    days_until: number | null;
  }>("SELECT * FROM v_upcoming_ipos ORDER BY listing_date ASC");

  if (upcoming.length === 0) return [];

  const ids = upcoming.map((row) => row.id);
  const [metaRows, finRows] = await Promise.all([
    query<{
      id: number;
      fa_persons: string[] | null;
      fa_companies: string[] | null;
      lead_uw: string[] | null;
      co_uws: string[] | null;
      company_name_th: string | null;
    }>(
      "SELECT id, fa_persons, fa_companies, lead_uw, co_uws, company_name_th FROM ipos WHERE id = ANY($1)",
      [ids],
    ),
    query<{
      ipo_id: number;
      gross_proceeds: number | null;
      total_expense: number | null;
      offered_shares: number | null;
      offered_ratio_pct: number | null;
      existing_shares_pct: number | null;
      executive_total_pct: number | null;
      total_liabilities: number | null;
      total_equity: number | null;
      net_income_latest: number | null;
    }>(
      `SELECT ipo_id, gross_proceeds, total_expense, offered_shares,
              offered_ratio_pct, existing_shares_pct, executive_total_pct,
              total_liabilities, total_equity, net_income_latest
       FROM ipo_financials WHERE ipo_id = ANY($1)`,
      [ids],
    ),
  ]);

  const metaById = new Map(metaRows.map((row) => [row.id, row]));
  const finById = new Map(finRows.map((row) => [row.ipo_id, row]));

  return upcoming.map((row) => {
    const meta = metaById.get(row.id);
    const fin = finById.get(row.id);
    return {
      id: row.id,
      symbol: row.symbol,
      company_name: row.company_name,
      company_name_th: meta?.company_name_th ?? null,
      market: row.market,
      industry: row.industry,
      sector: row.sector,
      listing_date: row.listing_date == null ? null : toDateOnly(row.listing_date),
      ipo_price: num(row.ipo_price),
      days_until: row.days_until,
      fa_persons: meta?.fa_persons ?? [],
      fa_companies: meta?.fa_companies ?? [],
      lead_uw: meta?.lead_uw ?? [],
      co_uws: meta?.co_uws ?? [],
      financials: fin
        ? {
            gross_proceeds: num(fin.gross_proceeds),
            total_expense: num(fin.total_expense),
            offered_shares: num(fin.offered_shares),
            offered_ratio_pct: num(fin.offered_ratio_pct),
            existing_shares_pct: num(fin.existing_shares_pct),
            executive_total_pct: num(fin.executive_total_pct),
            total_liabilities: num(fin.total_liabilities),
            total_equity: num(fin.total_equity),
            net_income_latest: num(fin.net_income_latest),
          }
        : null,
    };
  });
}

export async function snapshotCurrentUpcomingRecommendations(
  source = "current_upcoming",
) {
  const ipos = await getCurrentUpcomingRecommendationIpos();
  return snapshotUpcomingRecommendations(ipos, source);
}

// The FA/underwriter track-record stats behind win_rate / avg_return_d1 /
// target_pct are computed by generateFAConclusion / generateLeadCoConclusion,
// which read the historical IPO dataset from the in-memory analytics getters
// (getRawIpo / getLeadCoIndex). On the client those are hydrated by
// ipoDataClient; server-side (e.g. the scraper) nothing hydrates them, so the
// dataset is empty and every conclusion has zero samples → null stats. Load the
// rawipo/leadco slices from the freshly-built artifact so server-side snapshots
// compute the same numbers the UI shows.
async function ensureAnalyticsHydrated() {
  if (getRawIpo().length > 0) return;
  try {
    const [rawSlice, leadSlice] = await Promise.all([
      readSlice<{ rawIpo: RawIpoRow[] }>("rawipo"),
      readSlice<{ leadCoIndex: LeadCoIndexEntry[] }>("leadco"),
    ]);
    setRawIpo(rawSlice.rawIpo ?? []);
    setLeadCoIndex(leadSlice.leadCoIndex ?? []);
  } catch (error) {
    console.warn(
      "[ipo-tracking] analytics hydration failed; win_rate/target stats will be null:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function snapshotUpcomingRecommendations(
  ipos: UpcomingRecommendationIpo[],
  source = "upcoming_recommendations",
) {
  if (ipos.length === 0) return { insertedOrUpdated: 0, skipped: 0, schemaReady: true };

  await ensureAnalyticsHydrated();

  const snapshotDate = getBangkokDateString();
  let written = 0;
  let skipped = 0;

  for (const ipo of ipos) {
    try {
      const signal = buildUpcomingRecommendationSignal(ipo);
      await query(
        `INSERT INTO ipo_recommendation_snapshots (
          ipo_id, symbol, snapshot_date, snapshot_at, source,
          listing_date, ipo_price, decision, score, win_rate, avg_return_d1,
          target_pct, target_price,
          fa_person, fa_company, lead_uw, fa_persons, fa_companies, lead_uws, co_uws,
          reasons, component_scores
        )
        VALUES (
          $1,$2,$3,now(),$4,
          $5,$6,$7,$8,$9,$10,
          $11,$12,
          $13,$14,$15,$16,$17,$18,$19,
          $20::jsonb,$21::jsonb
        )
        ON CONFLICT (ipo_id, snapshot_date) DO UPDATE SET
          symbol = EXCLUDED.symbol,
          snapshot_at = EXCLUDED.snapshot_at,
          source = EXCLUDED.source,
          listing_date = EXCLUDED.listing_date,
          ipo_price = EXCLUDED.ipo_price,
          decision = EXCLUDED.decision,
          score = EXCLUDED.score,
          win_rate = EXCLUDED.win_rate,
          avg_return_d1 = EXCLUDED.avg_return_d1,
          target_pct = EXCLUDED.target_pct,
          target_price = EXCLUDED.target_price,
          fa_person = EXCLUDED.fa_person,
          fa_company = EXCLUDED.fa_company,
          lead_uw = EXCLUDED.lead_uw,
          fa_persons = EXCLUDED.fa_persons,
          fa_companies = EXCLUDED.fa_companies,
          lead_uws = EXCLUDED.lead_uws,
          co_uws = EXCLUDED.co_uws,
          reasons = EXCLUDED.reasons,
          component_scores = EXCLUDED.component_scores`,
        [
          ipo.id,
          ipo.symbol,
          snapshotDate,
          source,
          ipo.listing_date,
          ipo.ipo_price,
          signal.decision,
          signal.score,
          signal.winRate,
          signal.avgReturn,
          signal.tpPct,
          signal.tpPrice,
          signal.faPerson,
          signal.faCompany,
          signal.leadUw,
          ipo.fa_persons ?? [],
          ipo.fa_companies ?? [],
          ipo.lead_uw ?? [],
          ipo.co_uws ?? [],
          JSON.stringify(signal.reasons),
          JSON.stringify(signal.components),
        ],
        { retry: true },
      );
      written++;
    } catch (error) {
      if (isMissingTrackingTable(error)) return { insertedOrUpdated: written, skipped, schemaReady: false };
      console.warn(`[ipo-tracking] snapshot skipped for ${ipo.symbol}:`, error instanceof Error ? error.message : String(error));
      skipped++;
    }
  }

  return { insertedOrUpdated: written, skipped, schemaReady: true };
}

export async function refreshRecommendationOutcomes() {
  try {
    const today = getBangkokDateString();
    await query(
      `WITH current_ipos AS (
        SELECT
          i.*,
          CASE
            WHEN i.status = 'cancelled' THEN 'cancelled'
            WHEN i.listing_date IS NOT NULL AND i.listing_date <= $1 THEN 'listed'
            WHEN i.status = 'listed' THEN 'listed'
            ELSE 'upcoming'
          END AS effective_status
        FROM ipos i
       )
       UPDATE ipo_recommendation_snapshots s
       SET
        actual_status = CASE
          WHEN i.effective_status = 'cancelled' THEN 'cancelled'
          WHEN i.effective_status = 'listed' AND i.close_d1 IS NOT NULL AND COALESCE(i.ipo_price, s.ipo_price) IS NOT NULL THEN 'resolved'
          WHEN i.effective_status = 'listed' THEN 'listed_missing_return'
          ELSE 'pending'
        END,
        outcome_checked_at = now(),
        actual_open_d1 = i.open_d1,
        actual_high_d1 = i.high_d1,
        actual_low_d1 = i.low_d1,
        actual_close_d1 = i.close_d1,
        actual_close_1w = i.close_1w,
        actual_close_1m = i.close_1m,
        actual_close_3m = i.close_3m,
        actual_close_6m = i.close_6m,
        actual_return_open_d1 = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.open_d1 IS NOT NULL
          THEN ROUND(((i.open_d1 - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_high_d1 = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.high_d1 IS NOT NULL
          THEN ROUND(((i.high_d1 - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_low_d1 = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.low_d1 IS NOT NULL
          THEN ROUND(((i.low_d1 - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_d1 = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.close_d1 IS NOT NULL
          THEN ROUND(((i.close_d1 - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_1w = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.close_1w IS NOT NULL
          THEN ROUND(((i.close_1w - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_1m = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.close_1m IS NOT NULL
          THEN ROUND(((i.close_1m - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_3m = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.close_3m IS NOT NULL
          THEN ROUND(((i.close_3m - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END,
        actual_return_6m = CASE WHEN COALESCE(i.ipo_price, s.ipo_price) > 0 AND i.close_6m IS NOT NULL
          THEN ROUND(((i.close_6m - COALESCE(i.ipo_price, s.ipo_price)) / COALESCE(i.ipo_price, s.ipo_price)) * 100, 4)
          ELSE NULL END
       FROM current_ipos i
       WHERE i.id = s.ipo_id`,
      [today],
      { retry: true },
    );
    return { schemaReady: true };
  } catch (error) {
    if (isMissingTrackingTable(error)) return { schemaReady: false };
    throw error;
  }
}

export async function getRecommendationPerformance(limit = 500): Promise<RecommendationPerformance> {
  try {
    const [summaryRows, displayRows] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT *
         FROM v_ipo_recommendation_outcomes
         ORDER BY score DESC NULLS LAST, snapshot_date DESC, symbol ASC`,
      ),
      query<Record<string, unknown>>(
      `SELECT *
       FROM v_ipo_recommendation_outcomes
       ORDER BY score DESC NULLS LAST, snapshot_date DESC, symbol ASC
       LIMIT $1`,
      [limit],
      ),
    ]);
    const summary = summarizeRows(summaryRows.map(serializeOutcomeRow));
    const rows = displayRows.map(serializeOutcomeRow);
    return { summary, rows };
  } catch (error) {
    if (isMissingTrackingTable(error)) return emptyPerformance(false);
    throw error;
  }
}
