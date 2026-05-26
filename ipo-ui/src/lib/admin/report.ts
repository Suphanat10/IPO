import "server-only";

import { query } from "@/lib/db";

export type YearlyListingReport = {
  year: number | null;
  total: number;
  listed: number;
  upcoming: number;
  cancelled: number;
  avgCompleteness: number;
  grossProceeds: number;
  avgIpoPrice: number;
};

export type DimensionReport = {
  label: string;
  total: number;
  listed: number;
  upcoming: number;
  avgCompleteness: number;
};

export type CompletenessBucketReport = {
  label: string;
  total: number;
  avgCompleteness: number;
};

export type FinancialReport = {
  rowsWithFinancials: number;
  totalGrossProceeds: number;
  totalOfferedShares: number;
  avgIpoPrice: number;
  avgOfferedRatio: number;
  avgDay1ReturnPct: number | null;
  day1ReturnCount: number;
};

export type DashboardReport = {
  yearlyListings: YearlyListingReport[];
  marketMix: DimensionReport[];
  sectorLeaders: DimensionReport[];
  statusMix: DimensionReport[];
  completenessBuckets: CompletenessBucketReport[];
  financial: FinancialReport;
};

type YearlyListingDbRow = {
  year: number | null;
  total: number | string;
  listed: number | string;
  upcoming: number | string;
  cancelled: number | string;
  avg_completeness: number | string | null;
  gross_proceeds: number | string | null;
  avg_ipo_price: number | string | null;
};

type DimensionDbRow = {
  label: string | null;
  total: number | string;
  listed: number | string;
  upcoming: number | string;
  avg_completeness: number | string | null;
};

type CompletenessBucketDbRow = {
  label: string;
  total: number | string;
  avg_completeness: number | string | null;
  sort_order: number;
};

type FinancialDbRow = {
  rows_with_financials: number | string;
  total_gross_proceeds: number | string | null;
  total_offered_shares: number | string | null;
  avg_ipo_price: number | string | null;
  avg_offered_ratio: number | string | null;
  avg_day1_return_pct: number | string | null;
  day1_return_count: number | string;
};

function toNumber(value: number | string | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapYear(row: YearlyListingDbRow): YearlyListingReport {
  return {
    year: row.year,
    total: toNumber(row.total),
    listed: toNumber(row.listed),
    upcoming: toNumber(row.upcoming),
    cancelled: toNumber(row.cancelled),
    avgCompleteness: toNumber(row.avg_completeness),
    grossProceeds: toNumber(row.gross_proceeds),
    avgIpoPrice: toNumber(row.avg_ipo_price),
  };
}

function mapDimension(row: DimensionDbRow): DimensionReport {
  return {
    label: row.label?.trim() || "ไม่ระบุ / Unspecified",
    total: toNumber(row.total),
    listed: toNumber(row.listed),
    upcoming: toNumber(row.upcoming),
    avgCompleteness: toNumber(row.avg_completeness),
  };
}

function mapBucket(row: CompletenessBucketDbRow): CompletenessBucketReport {
  return {
    label: row.label,
    total: toNumber(row.total),
    avgCompleteness: toNumber(row.avg_completeness),
  };
}

function mapFinancial(row: FinancialDbRow | undefined): FinancialReport {
  return {
    rowsWithFinancials: toNumber(row?.rows_with_financials),
    totalGrossProceeds: toNumber(row?.total_gross_proceeds),
    totalOfferedShares: toNumber(row?.total_offered_shares),
    avgIpoPrice: toNumber(row?.avg_ipo_price),
    avgOfferedRatio: toNumber(row?.avg_offered_ratio),
    avgDay1ReturnPct: row?.avg_day1_return_pct == null ? null : toNumber(row.avg_day1_return_pct),
    day1ReturnCount: toNumber(row?.day1_return_count),
  };
}

export async function getDashboardReport(): Promise<DashboardReport> {
  const yearlyRows = await query<YearlyListingDbRow>(`
    SELECT
      CASE WHEN i.listing_date IS NULL THEN NULL ELSE EXTRACT(YEAR FROM i.listing_date)::int END AS year,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
      COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
      COUNT(*) FILTER (WHERE i.status = 'cancelled')::int AS cancelled,
      ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness,
      COALESCE(SUM(f.gross_proceeds), 0) AS gross_proceeds,
      ROUND(AVG(i.ipo_price)::numeric, 2) AS avg_ipo_price
    FROM ipos i
    LEFT JOIN v_ipo_completeness c ON c.id = i.id
    LEFT JOIN ipo_financials f ON f.ipo_id = i.id
    GROUP BY 1
    ORDER BY year DESC NULLS LAST
  `);

  const marketRows = await query<DimensionDbRow>(`
    SELECT
      COALESCE(NULLIF(TRIM(i.market), ''), 'ไม่ระบุ / Unspecified') AS label,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
      COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
      ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
    FROM ipos i
    LEFT JOIN v_ipo_completeness c ON c.id = i.id
    GROUP BY 1
    ORDER BY total DESC, label ASC
    LIMIT 8
  `);

  const sectorRows = await query<DimensionDbRow>(`
    SELECT
      COALESCE(NULLIF(TRIM(i.sector), ''), 'ไม่ระบุ / Unspecified') AS label,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
      COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
      ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
    FROM ipos i
    LEFT JOIN v_ipo_completeness c ON c.id = i.id
    GROUP BY 1
    ORDER BY total DESC, label ASC
    LIMIT 8
  `);

  const statusRows = await query<DimensionDbRow>(`
    SELECT
      i.status AS label,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
      COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
      ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
    FROM ipos i
    LEFT JOIN v_ipo_completeness c ON c.id = i.id
    GROUP BY 1
    ORDER BY total DESC
  `);

  const completenessRows = await query<CompletenessBucketDbRow>(`
    SELECT
      bucket.label,
      COUNT(*)::int AS total,
      ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness,
      bucket.sort_order
    FROM v_ipo_completeness c
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN c.completeness_pct >= 100 THEN '100% / Complete'
          WHEN c.completeness_pct >= 80 THEN '80-99% / Strong'
          WHEN c.completeness_pct >= 60 THEN '60-79% / Needs work'
          ELSE '<60% / High risk'
        END AS label,
        CASE
          WHEN c.completeness_pct >= 100 THEN 1
          WHEN c.completeness_pct >= 80 THEN 2
          WHEN c.completeness_pct >= 60 THEN 3
          ELSE 4
        END AS sort_order
    ) bucket
    GROUP BY bucket.label, bucket.sort_order
    ORDER BY bucket.sort_order ASC
  `);

  const financialRows = await query<FinancialDbRow>(`
    SELECT
      COUNT(f.ipo_id)::int AS rows_with_financials,
      COALESCE(SUM(f.gross_proceeds), 0) AS total_gross_proceeds,
      COALESCE(SUM(f.offered_shares), 0) AS total_offered_shares,
      ROUND(AVG(i.ipo_price)::numeric, 2) AS avg_ipo_price,
      ROUND(AVG(f.offered_ratio_pct)::numeric, 2) AS avg_offered_ratio,
      ROUND(
        AVG(((i.close_d1 - i.ipo_price) / NULLIF(i.ipo_price, 0)) * 100)::numeric,
        2
      ) AS avg_day1_return_pct,
      COUNT(*) FILTER (
        WHERE i.close_d1 IS NOT NULL
          AND i.ipo_price IS NOT NULL
          AND i.ipo_price <> 0
      )::int AS day1_return_count
    FROM ipos i
    LEFT JOIN ipo_financials f ON f.ipo_id = i.id
  `);

  return {
    yearlyListings: yearlyRows.map(mapYear),
    marketMix: marketRows.map(mapDimension),
    sectorLeaders: sectorRows.map(mapDimension),
    statusMix: statusRows.map(mapDimension),
    completenessBuckets: completenessRows.map(mapBucket),
    financial: mapFinancial(financialRows[0]),
  };
}
