import "server-only";

import { query } from "@/lib/db";
import { toDateOnly } from "@/lib/date-format";
import type { DropdownOptions, UpcomingData } from "./publicHomeTypes";

const EMPTY_DROPDOWN_OPTIONS: DropdownOptions = {
  faPersons: [],
  faCompanies: [],
  underwriters: [],
};

const EMPTY_UPCOMING_DATA: UpcomingData = {
  ipos: [],
  scrapedAt: null,
};

function warnPublicHomeFallback(source: string, error: unknown) {
  console.warn(
    `[public-home] ${source} unavailable; rendering fallback data:`,
    error instanceof Error ? error.message : String(error),
  );
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Strip stray quote/backslash artifacts, trim leading/trailing separators, and
// drop separator-only tokens so junk left in the DB never reaches autocomplete.
function cleanName(value: string): string {
  return value
    .replace(/[\\'"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,/\-\u2013]+|[\s.,/\-\u2013]+$/g, "")
    .trim();
}

function cleanList(rows: { name: string }[], sortTh = false): string[] {
  const out = [...new Set(rows.map((row) => cleanName(row.name)).filter(Boolean))];
  return sortTh ? out.sort((a, b) => a.localeCompare(b, "th")) : out;
}

export async function getDropdownOptions(): Promise<DropdownOptions> {
  try {
    const [faPersonsRes, faCompaniesRes, underwritersRes] = await Promise.all([
      query<{ name: string }>(
        "SELECT DISTINCT UNNEST(fa_persons) AS name FROM ipos WHERE fa_persons IS NOT NULL ORDER BY name",
      ),
      query<{ name: string }>(
        "SELECT DISTINCT UNNEST(fa_companies) AS name FROM ipos WHERE fa_companies IS NOT NULL ORDER BY name",
      ),
      query<{ name: string }>(
        `SELECT DISTINCT name FROM (
           SELECT UNNEST(lead_uw) AS name FROM ipos WHERE lead_uw IS NOT NULL
           UNION
           SELECT UNNEST(co_uws) AS name FROM ipos WHERE co_uws IS NOT NULL
         ) s WHERE TRIM(COALESCE(name, '')) <> '' ORDER BY name`,
      ),
    ]);

    return {
      faPersons: cleanList(faPersonsRes, true),
      faCompanies: cleanList(faCompaniesRes),
      underwriters: cleanList(underwritersRes),
    };
  } catch (error) {
    warnPublicHomeFallback("dropdown options", error);
    return EMPTY_DROPDOWN_OPTIONS;
  }
}

export async function getUpcomingRecommendations(): Promise<UpcomingData> {
  try {
    const scrapeRun = await query<{ finished_at: string | Date | null }>(
      `SELECT finished_at FROM scrape_runs
       WHERE status IN ('success', 'partial') AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 1`,
    );
    const scrapedAt =
      scrapeRun[0]?.finished_at instanceof Date
        ? scrapeRun[0].finished_at.toISOString()
        : (scrapeRun[0]?.finished_at ?? null);

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
      return { ipos: [], scrapedAt };
    }

    const ids = upcoming.map((row) => row.id);

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

    const faMap = new Map(faRows.map((row) => [row.id, row]));
    const finMap = new Map(finRows.map((row) => [row.ipo_id, row]));

    const ipos = upcoming.map((row) => {
      const fa = faMap.get(row.id);
      const fin = finMap.get(row.id);

      return {
        id: row.id,
        symbol: row.symbol,
        company_name: row.company_name,
        market: row.market,
        sector: row.sector,
        listing_date: row.listing_date == null ? null : toDateOnly(row.listing_date),
        ipo_price: num(row.ipo_price),
        par_value: num(fa?.par_value),
        days_until: row.days_until,
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

    return { ipos, scrapedAt };
  } catch (error) {
    warnPublicHomeFallback("upcoming recommendations", error);
    return EMPTY_UPCOMING_DATA;
  }
}
