// Type definitions for the ipo.json data graph.
//
// The data itself is NO LONGER imported here — it used to be a static
// `import data from "../data/ipo.json"` that inlined the full ~3.7MB artifact
// into every client bundle. The values are now fetched lazily per slice via
// src/app/lib/ipoDataClient.ts (served by /api/ipo-data/*). This module keeps
// only the shared type definitions consumed across the analytics UI.

import type { SummaryRow } from "./types";

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
