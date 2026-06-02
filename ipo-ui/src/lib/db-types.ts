// Minimal type shapes for tables used by admin UI.
// Keep in sync with db/migrations/ when the schema changes.

export type IpoStatus = "upcoming" | "listed" | "cancelled";

export interface IpoRow {
  id: number;
  symbol: string;
  company_name: string | null;
  company_name_th?: string | null;
  market: string | null;
  industry: string | null;
  sector: string | null;
  status: IpoStatus;
  listing_date: string | null;
  ipo_price: number | null;
  open_d1: number | null;
  high_d1: number | null;
  low_d1: number | null;
  close_d1: number | null;
  close_d2: number | null;
  close_d3: number | null;
  close_d4: number | null;
  close_d5: number | null;
  close_1w: number | null;
  close_1m: number | null;
  close_3m: number | null;
  close_6m: number | null;
  fa_persons: string[] | null;
  fa_companies: string[] | null;
  lead_uw: string[] | null;
  co_uws: string[] | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface IpoFinancialsRow {
  ipo_id: number;
  gross_proceeds: number | null;
  total_expense: number | null;
  offered_shares: number | null;
  offered_ratio_pct: number | null;
  existing_shares_pct: number | null;
  executive_total_pct: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  revenue_latest: number | null;
  revenue_prev: number | null;
  net_income_latest: number | null;
  net_income_prev: number | null;
  updated_at: string;
}

export interface DashboardStats {
  total_ipos: number;
  listed_count: number;
  upcoming_count: number;
  cancelled_count: number;
  complete_count: number;
  incomplete_count: number;
  last_data_update: string | null;
  last_build: string | null;
  error_count: number;
  warning_count: number;
  info_count: number;
}

export interface CompletenessRow {
  id: number;
  symbol: string;
  company_name: string | null;
  company_name_th?: string | null;
  market: string | null;
  industry: string | null;
  sector: string | null;
  status: IpoStatus;
  listing_date: string | null;
  updated_at: string;
  completeness_pct: number;
}

export interface UpcomingRow extends CompletenessRow {
  market: string | null;
  industry: string | null;
  sector: string | null;
  ipo_price: number | null;
  fa_companies: string[] | null;
  fa_persons: string[] | null;
  days_until: number | null;
}

export interface ValidationResult {
  id: number;
  ipo_id: number | null;
  rule_key: string;
  severity: "error" | "warning" | "info";
  message: string | null;
  resolved: boolean;
  detected_at: string;
}

export interface BuildRun {
  id: number;
  triggered_by: string | null;
  trigger_type: string;
  status: "queued" | "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  artifact_size: number | null;
  artifact_sha: string | null;
  git_commit: string | null;
  error_message: string | null;
  github_run_url: string | null;
}

export interface BuildLog {
  id: number;
  run_id: number;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface MissingFieldsRow {
  id: number;
  symbol: string;
  company_name: string | null;
  status: IpoStatus;
  listing_date: string | null;
  updated_at: string;
  missing_fields: string[];
  completeness_pct: number;
}

export interface RecentUpdateRow {
  id: number;
  symbol: string;
  company_name: string | null;
  status: IpoStatus;
  updated_at: string;
  updated_by: string | null;
  last_touched_at: string;
  last_touched_part: "financials" | "core";
}

export interface SyncJobRow {
  id: number;
  source: string;
  status: "running" | "success" | "failed";
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  error_message: string | null;
  ran_at: string;
}
