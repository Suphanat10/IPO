import { query } from "@/lib/db";
import { encryptedJson } from "@/lib/cipher";
import { toDateOnly } from "@/lib/date-format";
import { syncMaturedIpoStatuses } from "@/lib/ipo-status";

export async function GET() {
  await syncMaturedIpoStatuses();

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
    completeness_pct: number | null;
  }>("SELECT * FROM v_upcoming_ipos ORDER BY listing_date ASC");

  if (upcoming.length === 0) {
    return encryptedJson({ ipos: [] });
  }

  const ids = upcoming.map((r) => r.id);

  const [faRows, finRows] = await Promise.all([
    query<{
      id: number;
      fa_persons: string[] | null;
      fa_companies: string[] | null;
      lead_uw: string[] | null;
      co_uws: string[] | null;
      par_value: number | null;
      company_name_th: string | null;
      business_description: string | null;
      filing_status: string | null;
    }>(
      "SELECT id, fa_persons, fa_companies, lead_uw, co_uws, par_value, company_name_th, business_description, filing_status FROM ipos WHERE id = ANY($1)",
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

  const faMap = new Map(faRows.map((r) => [r.id, r]));
  const finMap = new Map(finRows.map((r) => [r.ipo_id, r]));

  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const ipos = upcoming.map((row) => {
    const fa = faMap.get(row.id);
    const fin = finMap.get(row.id);
    return {
      id: row.id,
      symbol: row.symbol,
      company_name: row.company_name,
      market: row.market,
      industry: row.industry,
      sector: row.sector,
      listing_date: row.listing_date == null ? null : toDateOnly(row.listing_date),
      ipo_price: num(row.ipo_price),
      par_value: num(fa?.par_value),
      days_until: row.days_until,
      completeness_pct: row.completeness_pct,
      company_name_th: fa?.company_name_th ?? null,
      business_description: fa?.business_description ?? null,
      filing_status: fa?.filing_status ?? null,
      fa_persons: fa?.fa_persons ?? [],
      fa_companies: fa?.fa_companies ?? [],
      lead_uw: fa?.lead_uw ?? [],
      co_uws: fa?.co_uws ?? [],
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

  return encryptedJson({ ipos });
}
