export type SummaryRow = {
  name: string;
  ipo_count: number;
  prob_open_above_ipo: number;
  prob_high_above_ipo: number;
  prob_low_above_ipo: number;
  prob_close_above_ipo: number;
  avg_return_open_d1: number;
  avg_return_high_d1: number;
  avg_return_low_d1: number;
  avg_return_close_d1: number;
  best_return_d1: number;
  worst_return_d1: number;
  avg_intraday_range_d1: number;
  avg_return_1W: number;
  avg_return_1M: number;
  avg_return_3M: number;
  avg_return_6M: number;
  max_return_week: number;
  min_return_week: number;
  prob_close_d5_above_ipo: number;
};

export type LeadCoSummaryRow = SummaryRow & { co: string };

export type EntityType = "FA Person" | "FA Company" | "Lead Underwriter";

export type ViewKey =
  | "Key Metrics"
  | "Performance (Day 1)"
  | "Post-IPO Performance"
  | "All Columns";

export const VIEW_COLUMNS: Record<ViewKey, (keyof SummaryRow)[] | "ALL"> = {
  "Key Metrics": [
    "ipo_count",
    "prob_close_above_ipo",
    "avg_return_close_d1",
    "avg_return_1W",
    "avg_return_1M",
    "avg_return_3M",
    "avg_return_6M",
  ],
  "Performance (Day 1)": [
    "ipo_count",
    "prob_open_above_ipo",
    "prob_high_above_ipo",
    "prob_low_above_ipo",
    "prob_close_above_ipo",
    "avg_return_open_d1",
    "avg_return_high_d1",
    "avg_return_low_d1",
    "avg_return_close_d1",
    "best_return_d1",
    "worst_return_d1",
  ],
  "Post-IPO Performance": [
    "ipo_count",
    "avg_return_1W",
    "avg_return_1M",
    "avg_return_3M",
    "avg_return_6M",
    "max_return_week",
    "min_return_week",
    "prob_close_d5_above_ipo",
  ],
  "All Columns": "ALL",
};

export const COLUMN_LABELS: Record<string, string> = {
  name: "Name",
  ipo_count: "IPO Count",
  prob_open_above_ipo: "P(Open>IPO) %",
  prob_high_above_ipo: "P(High>IPO) %",
  prob_low_above_ipo: "P(Low>IPO) %",
  prob_close_above_ipo: "P(Close>IPO) %",
  avg_return_open_d1: "Avg Return Open D1 %",
  avg_return_high_d1: "Avg Return High D1 %",
  avg_return_low_d1: "Avg Return Low D1 %",
  avg_return_close_d1: "Avg Return Close D1 %",
  best_return_d1: "Best Return D1 %",
  worst_return_d1: "Worst Return D1 %",
  avg_intraday_range_d1: "Avg Intraday Range D1 %",
  avg_return_1W: "Avg Return 1W %",
  avg_return_1M: "Avg Return 1M %",
  avg_return_3M: "Avg Return 3M %",
  avg_return_6M: "Avg Return 6M %",
  max_return_week: "Max Return Week %",
  min_return_week: "Min Return Week %",
  prob_close_d5_above_ipo: "P(Close D5>IPO) %",
  co: "Co-Underwriter",
};
