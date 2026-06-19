export type DropdownOptions = {
  faPersons: string[];
  faCompanies: string[];
  underwriters: string[];
};

export type UpcomingIpo = {
  id: number;
  symbol: string;
  company_name: string | null;
  company_name_th: string | null;
  market: string | null;
  sector: string | null;
  listing_date: string | null;
  ipo_price: number | null;
  par_value: number | null;
  business_description: string | null;
  filing_status: string | null;
  days_until: number | null;
  fa_persons: string[];
  fa_companies: string[];
  lead_uw: string[];
  co_uws: string[];
  financials: {
    gross_proceeds: number | null;
    total_expense: number | null;
    offered_shares: number | null;
    offered_ratio_pct: number | null;
    existing_shares_pct: number | null;
    executive_total_pct: number | null;
    total_liabilities: number | null;
    total_equity: number | null;
    net_income_latest: number | null;
  } | null;
};

export type UpcomingData = {
  ipos: UpcomingIpo[];
  scrapedAt: string | null;
};
