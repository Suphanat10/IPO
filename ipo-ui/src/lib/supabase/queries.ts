import { createSupabaseServerClient } from "./server";
import type {
  BuildRun,
  CompletenessRow,
  DashboardStats,
  IpoRow,
  IpoFinancialsRow,
  UpcomingRow,
  ValidationResult,
} from "./types";

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("v_dashboard_stats").select("*").single();
  return data as DashboardStats | null;
}

export async function getRecentBuilds(limit = 5): Promise<BuildRun[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("build_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as BuildRun[];
}

export async function getUpcomingIpos(): Promise<UpcomingRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("v_upcoming_ipos").select("*");
  return (data ?? []) as UpcomingRow[];
}

export async function getIposList(opts: {
  search?: string;
  status?: string;
  minCompleteness?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: CompletenessRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("v_ipo_completeness")
    .select("*", { count: "exact" })
    .order("listing_date", { ascending: false, nullsFirst: false });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.search) {
    query = query.or(
      `symbol.ilike.%${opts.search}%,company_name.ilike.%${opts.search}%`,
    );
  }
  if (opts.minCompleteness != null) {
    query = query.gte("completeness_pct", opts.minCompleteness);
  }
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count } = await query;
  return {
    rows: (data ?? []) as CompletenessRow[],
    total: count ?? 0,
  };
}

export async function getIpo(id: number): Promise<{
  ipo: IpoRow | null;
  financials: IpoFinancialsRow | null;
}> {
  const supabase = await createSupabaseServerClient();
  const [ipoRes, finRes] = await Promise.all([
    supabase.from("ipos").select("*").eq("id", id).maybeSingle(),
    supabase.from("ipo_financials").select("*").eq("ipo_id", id).maybeSingle(),
  ]);
  return {
    ipo: (ipoRes.data ?? null) as IpoRow | null,
    financials: (finRes.data ?? null) as IpoFinancialsRow | null,
  };
}

export async function getValidations(opts: {
  resolved?: boolean;
  severity?: string;
} = {}): Promise<(ValidationResult & { symbol: string | null })[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("validation_results")
    .select("*, ipos(symbol)")
    .order("severity", { ascending: true })
    .order("detected_at", { ascending: false });

  if (opts.resolved != null) query = query.eq("resolved", opts.resolved);
  if (opts.severity) query = query.eq("severity", opts.severity);

  const { data } = await query;
  return ((data ?? []) as Array<ValidationResult & { ipos: { symbol: string } | null }>)
    .map((r) => ({ ...r, symbol: r.ipos?.symbol ?? null }));
}
