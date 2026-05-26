// Fallback data shown when Supabase is not configured.
// Lets developers preview admin UI without running migrations first.

import type {
  BuildRun,
  CompletenessRow,
  DashboardStats,
  IpoRow,
  IpoFinancialsRow,
  UpcomingRow,
  ValidationResult,
} from "./types";

export const MOCK_STATS: DashboardStats = {
  total_ipos: 548,
  listed_count: 544,
  upcoming_count: 4,
  cancelled_count: 0,
  complete_count: 482,
  incomplete_count: 66,
  last_data_update: "2026-05-11T09:13:22Z",
  last_build: "2026-05-11T09:15:48Z",
  error_count: 3,
  warning_count: 12,
  info_count: 24,
};

export const MOCK_BUILDS: BuildRun[] = [
  {
    id: 142,
    triggered_by: null,
    trigger_type: "manual",
    status: "success",
    started_at: "2026-05-11T09:15:30Z",
    finished_at: "2026-05-11T09:15:48Z",
    duration_ms: 18243,
    artifact_size: 3_312_456,
    artifact_sha: "8f3e9...c1a2",
    git_commit: "a7b4c2e",
    error_message: null,
    github_run_url: null,
  },
  {
    id: 141,
    triggered_by: null,
    trigger_type: "cron",
    status: "failed",
    started_at: "2026-05-11T08:02:11Z",
    finished_at: "2026-05-11T08:02:34Z",
    duration_ms: 23104,
    artifact_size: null,
    artifact_sha: null,
    git_commit: null,
    error_message: "validation failed: 3 errors blocking build",
    github_run_url: null,
  },
  {
    id: 140,
    triggered_by: null,
    trigger_type: "on_change",
    status: "success",
    started_at: "2026-05-10T15:42:01Z",
    finished_at: "2026-05-10T15:42:18Z",
    duration_ms: 17321,
    artifact_size: 3_310_991,
    artifact_sha: "b2c4...e7f1",
    git_commit: "f93e1ab",
    error_message: null,
    github_run_url: null,
  },
];

export const MOCK_UPCOMING: UpcomingRow[] = [
  {
    id: 9001,
    symbol: "XYZ",
    company_name: "บริษัท เอ็กซ์วายแซด จำกัด (มหาชน)",
    status: "upcoming",
    listing_date: "2026-05-18",
    market: "SET",
    industry: "บริการ",
    sector: "การท่องเที่ยวและสันทนาการ",
    ipo_price: 4.5,
    days_until: 7,
    updated_at: "2026-05-09T10:00:00Z",
    completeness_pct: 70,
  },
  {
    id: 9002,
    symbol: "ABC",
    company_name: "บริษัท เอบีซี โฮลดิ้ง จำกัด (มหาชน)",
    status: "upcoming",
    listing_date: "2026-05-22",
    market: "mai",
    industry: "เทคโนโลยี",
    sector: "เทคโนโลยีสารสนเทศและการสื่อสาร",
    ipo_price: 2.1,
    days_until: 11,
    updated_at: "2026-05-08T14:30:00Z",
    completeness_pct: 50,
  },
  {
    id: 9003,
    symbol: "QWE",
    company_name: "บริษัท คิวดับเบิลยูอี รีเทล จำกัด",
    status: "upcoming",
    listing_date: "2026-06-02",
    market: "SET",
    industry: "บริการ",
    sector: "พาณิชย์",
    ipo_price: null,
    days_until: 22,
    updated_at: "2026-05-05T09:11:00Z",
    completeness_pct: 30,
  },
  {
    id: 9004,
    symbol: "RTY",
    company_name: "บริษัท อาร์ทีวาย ไฟแนนเชียล จำกัด",
    status: "upcoming",
    listing_date: "2026-06-15",
    market: "SET",
    industry: "ธุรกิจการเงิน",
    sector: "เงินทุนและหลักทรัพย์",
    ipo_price: 12.0,
    days_until: 35,
    updated_at: "2026-05-01T08:00:00Z",
    completeness_pct: 80,
  },
];

export const MOCK_VALIDATIONS: (ValidationResult & { symbol: string | null })[] = [
  {
    id: 1, ipo_id: 100, rule_key: "missing_listing_date", severity: "error",
    message: "Symbol XYZ has no listing_date", resolved: false,
    detected_at: "2026-05-11T09:00:00Z", symbol: "XYZ",
  },
  {
    id: 2, ipo_id: 101, rule_key: "price_inconsistency", severity: "error",
    message: "Symbol ABC close_d1=5.2 outside [3.0, 4.8]", resolved: false,
    detected_at: "2026-05-11T09:00:00Z", symbol: "ABC",
  },
  {
    id: 3, ipo_id: 102, rule_key: "duplicate_symbol", severity: "error",
    message: "Symbol DEF duplicates Def", resolved: false,
    detected_at: "2026-05-11T09:00:00Z", symbol: "DEF",
  },
  ...Array.from({ length: 12 }).map((_, i) => ({
    id: 10 + i, ipo_id: 200 + i, rule_key: "missing_offered_ratio" as const,
    severity: "warning" as const,
    message: `Symbol SYM${i} missing offered_ratio_pct`, resolved: false,
    detected_at: "2026-05-11T09:00:00Z", symbol: `SYM${i}`,
  })),
];

export const MOCK_COMPLETENESS: CompletenessRow[] = Array.from({ length: 30 }).map(
  (_, i) => ({
    id: i + 1,
    symbol: `SYM${String(i + 1).padStart(3, "0")}`,
    company_name: `บริษัทตัวอย่าง ${i + 1} จำกัด`,
    status: i < 25 ? "listed" : "upcoming",
    listing_date: i < 25 ? "2025-09-02" : "2026-05-18",
    updated_at: "2026-05-11T09:00:00Z",
    completeness_pct: [100, 100, 100, 90, 80, 70, 60][i % 7],
  }),
);

export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !==
      "https://your-project.supabase.co"
  );
}

export const MOCK_IPO_DETAIL: { ipo: IpoRow; financials: IpoFinancialsRow } = {
  ipo: {
    id: 9001,
    symbol: "XYZ",
    company_name: "บริษัท เอ็กซ์วายแซด จำกัด (มหาชน)",
    market: "SET",
    industry: "บริการ",
    sector: "การท่องเที่ยวและสันทนาการ",
    status: "upcoming",
    listing_date: "2026-05-18",
    ipo_price: 4.5,
    open_d1: null, high_d1: null, low_d1: null,
    close_d1: null, close_d2: null, close_d3: null, close_d4: null, close_d5: null,
    close_1w: null, close_1m: null, close_3m: null, close_6m: null,
    fa_persons: ["นางสาว สมหญิง ตัวอย่าง"],
    fa_companies: ["บริษัทหลักทรัพย์ ตัวอย่าง"],
    lead_uw: ["บริษัทหลักทรัพย์ ลีด จำกัด (มหาชน)"],
    co_uws: ["บริษัทหลักทรัพย์ โค-1 จำกัด", "บริษัทหลักทรัพย์ โค-2 จำกัด"],
    source: "manual",
    created_at: "2026-05-09T10:00:00Z",
    updated_at: "2026-05-09T10:00:00Z",
  },
  financials: {
    ipo_id: 9001,
    gross_proceeds: 450_000_000,
    total_expense: 35_000_000,
    offered_shares: 100_000_000,
    offered_ratio_pct: 25,
    existing_shares_pct: 20,
    executive_total_pct: 42.5,
    total_assets: 1_200_000_000,
    total_liabilities: 350_000_000,
    total_equity: 850_000_000,
    revenue_latest: 980_000_000,
    revenue_prev: 720_000_000,
    net_income_latest: 145_000_000,
    net_income_prev: 88_000_000,
    updated_at: "2026-05-09T10:00:00Z",
  },
};
