import type { LeadCoSummaryRow, SummaryRow } from "./types";
import data from "../data/ipo.json";

export type CompanyRow = {
  symbol: string;
  first_trade_date: string;
  ipo_price: number | null;
  fa_persons: string;
  fa_companies: string;
  leads: string[];
  cos: string[];
  return_close_d1: number | null;
  return_1M: number | null;
  return_6M: number | null;
  year: number | null;
};

export type IpoDetailRow = {
  symbol: string;
  fa_persons: string;
  fa_companies: string;
  ipo_price: number | null;
  open_d1: number | null;
  high_d1: number | null;
  low_d1: number | null;
  close_d1: number | null;
  return_open_d1: number | null;
  return_high_d1: number | null;
  return_low_d1: number | null;
  return_close_d1: number | null;
  intraday_range_d1: number | null;
  close_1W: number | null;
  close_1M: number | null;
  close_3M: number | null;
  close_6M: number | null;
  return_1W: number | null;
  return_1M: number | null;
  return_3M: number | null;
  return_6M: number | null;
};

export type RawIpoRow = {
  sym: string;
  rD1: number | null;
  rD2: number | null;
  rD3: number | null;
  rD4: number | null;
  rD5: number | null;
  r1W: number | null;
  r1M: number | null;
  r3M: number | null;
  r6M: number | null;
  range: number | null;
  dd: number | null;
  upD1: number | null;
  upD5: number | null;
  openUp: number | null;
  highUp: number | null;
  fa_persons: string;
  fa_companies: string;
  leads: string[];
  cos: string[];
};

export type LeadCoIndexEntry = [string, string, string]; // [symbol, lead, co]

export type GlobalBaseline = SummaryRow & {
  name: string;
  drawdown_mean: number;
  drawdown_median: number;
  drawdown_p75: number;
  drawdown_p90: number;
};

// Real per-IPO fundamentals from df_final_ipo.csv. All percent fields are in
// percent (e.g. roe = 25.2 means 25.2%). DE is a multiple (e.g. 0.28).
export type IpoFundamental = {
  sym: string;
  offeredRatio: number | null;
  existingPct: number | null;
  executivePct: number | null;
  roe: number | null;
  earningsYield: number | null;
  de: number | null;
  costRatio: number | null;
  pe: number | null;
  pbv: number | null;
  marketCap: number | null;
  netIncome: number | null;
  industry: string;
  market: string;
};

// 4-way return_tier distribution per (factor, tier) — mirrors Python `prob_tables`
// + meanReturn over return_close_d1 (mirrors `mean_tables`).
export type FactorTierStats = {
  n: number;
  meanReturn: number | null;
  probGainStrong: number;
  probGain: number;
  probLoss: number;
  probLossStrong: number;
};

// e.g. globalFundamentalStats.roe["สูง"] = FactorTierStats
// e.g. globalFundamentalStats.float["low"] = FactorTierStats (English keys for float/exec/existing)
export type GlobalFundamentalStats = Record<string, Record<string, FactorTierStats>>;

export type TierThresholds = {
  float: { low: number; medium: number };       // offered_ratio fraction (0.25, 0.30)
  existing: { q1: number; q2: number };         // existing_pct fraction quantiles of >0 group
  exec: { low: number; mid: number };           // executive_total_pct
  roe: { q1: number; q2: number };              // ROE fraction qcut bins
  ey: { q1: number; q2: number };               // earnings_yield fraction qcut bins
  de: { q1: number; q2: number };               // DE multiple qcut bins
  cost: { q1: number; q2: number };             // cost_ratio_final fraction qcut bins
};

export type PeerGroupStats = {
  n: number;
  meanEY: number;                               // fraction (mean)
  medianEY: number;                             // fraction (median — used for above/below split)
  full: FactorTierStats;
  above: FactorTierStats;                       // EY > median
  below: FactorTierStats;                       // EY ≤ median
};

export type SectorMapping = Record<
  string, // keyword (lowercase substring match)
  { name: string; type: "sector" | "industry" }
>;

export const faPersonsSummary: SummaryRow[] = data.faPersons as SummaryRow[];
export const faCompaniesSummary: SummaryRow[] = data.faCompanies as SummaryRow[];
export const leadUnderwritersSummary: SummaryRow[] =
  data.leadUnderwriters as SummaryRow[];
export const leadCoSummary: LeadCoSummaryRow[] = data.leadCo as LeadCoSummaryRow[];
export const companies: CompanyRow[] = data.companies as CompanyRow[];
export const ipoDetails: IpoDetailRow[] = data.ipoDetails as IpoDetailRow[];
export const ipoDetailsBySymbol: Map<string, IpoDetailRow> = new Map(
  ipoDetails.map((r) => [r.symbol, r]),
);
export const rawIpo: RawIpoRow[] = data.rawIpo as RawIpoRow[];
export const leadCoIndex: LeadCoIndexEntry[] = data.leadCoIndex as LeadCoIndexEntry[];
export const globalBaseline = data.globalBase as GlobalBaseline;

export const fundamentalsBySymbol = data.fundamentalsBySymbol as Record<
  string,
  IpoFundamental
>;
export const globalFundamentalStats =
  data.globalFundamentalStats as GlobalFundamentalStats;
// roe/ey/de/cost quantiles can be null in ipo.json when there isn't enough
// data to compute them, so go through `unknown` (TierThresholds keeps them as
// number for the consuming tier logic, which already treats a missing bin as 0).
export const tierThresholds = data.tierThresholds as unknown as TierThresholds;
export const peerBySector = data.peerBySector as Record<string, PeerGroupStats>;
export const peerByIndustry = data.peerByIndustry as Record<string, PeerGroupStats>;
export const sectorParent = data.sectorParent as Record<string, string>;
export const sectorMapping = data.sectorMapping as SectorMapping;
export const knownSectors = data.knownSectors as string[];
export const knownIndustries = data.knownIndustries as string[];

// Autocomplete options extracted directly from Database - base.csv (per user spec).
export const faPersonOptions = data.faPersonOptions as string[];
export const faCompanyOptions = data.faCompanyOptions as string[];
export const leadUnderwriterOptions = data.leadUnderwriterOptions as string[];
export const coUnderwriterOptions = data.coUnderwriterOptions as string[];

export const rawIpoBySymbol: Map<string, RawIpoRow> = new Map(
  rawIpo.map((r) => [r.sym, r]),
);

export const dataCounts = data.counts as {
  base: number;
  financials: number;
  dfFinal: number;
  faPersons: number;
  faCompanies: number;
  leadUnderwriters: number;
  leadCoPairs: number;
  companies: number;
  rawIpo: number;
  leadCoIndex: number;
  fundamentals: number;
};
