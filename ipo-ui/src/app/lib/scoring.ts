import type { LeadCoSummaryRow, SummaryRow } from "./types";
import type { ComputedFundamental } from "./AnalysisContext";
import type { Conclusion } from "./ipoAnalytics";

export type DecisionLabel = "BUY" | "NEUTRAL" | "AVOID";

export type BucketScore = {
  score: number;
  prob: number | null;
  avgRet: number | null;
  downside: number | null;
  sample: number;
  decision: DecisionLabel;
};

export type FundamentalBucketScore = {
  score: number;
  checks: Array<{ label: string; pass: boolean; value: string }>;
  decision: DecisionLabel;
};

export type ComboScore = {
  score: number;
  decision: DecisionLabel;
};

export type PerformanceScores = {
  fa: BucketScore | null;
  uw: BucketScore | null;
  fin: FundamentalBucketScore | null;
  combos: {
    faUw: ComboScore | null;
    faFin: ComboScore | null;
    uwFin: ComboScore | null;
  };
  overall: { score: number; decision: DecisionLabel } | null;
  factorsUsed: string[];
};

function decisionFromScore01(s: number): DecisionLabel {
  if (s >= 0.6) return "BUY";
  if (s >= 0.5) return "NEUTRAL";
  return "AVOID";
}

function strictAvg(...vals: Array<number | null | undefined>): number | null {
  if (vals.some((v) => v == null || Number.isNaN(v))) return null;
  const nums = vals as number[];
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function flexAvg(...vals: Array<number | null | undefined>): number | null {
  const valid = vals.filter((v) => v != null && !Number.isNaN(v)) as number[];
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function estimateDownside(row: SummaryRow): number {
  const worst = row.worst_return_d1;
  if (worst == null || Number.isNaN(worst)) return 0;
  if (worst <= -20) {
    const base = Math.min(40, (Math.abs(worst) - 20) * 2 + 10);
    return Math.max(5, Math.round(base * 10) / 10);
  }
  return Math.max(0, Math.round((20 + worst) * 0.5 * 10) / 10);
}

function bucketFromRows(rows: SummaryRow[]): BucketScore | null {
  if (rows.length === 0) return null;
  const totalIpo = rows.reduce((s, r) => s + r.ipo_count, 0);
  const prob = rows.reduce((s, r) => s + r.prob_close_above_ipo, 0) / rows.length;
  const avgRet = rows.reduce((s, r) => s + r.avg_return_close_d1, 0) / rows.length;
  const downside = rows.reduce((s, r) => s + estimateDownside(r), 0) / rows.length;

  const probScore = Math.max(0, Math.min(1, (prob - 40) / 45));
  const retScore = Math.max(0, Math.min(1, (avgRet + 5) / 25));
  const downScore = Math.max(0, Math.min(1, 1 - downside / 40));
  const sampleBoost = Math.min(0.1, totalIpo / 200);

  const rawScore = 0.5 * probScore + 0.35 * retScore + 0.15 * downScore + sampleBoost;
  const score = Math.max(0, Math.min(1, rawScore));

  return {
    score,
    prob,
    avgRet,
    downside,
    sample: totalIpo,
    decision: decisionFromScore01(score),
  };
}

export function scoreFA(
  personRow: SummaryRow | undefined,
  companyRow: SummaryRow | undefined,
): BucketScore | null {
  const rows = [personRow, companyRow].filter(Boolean) as SummaryRow[];
  return bucketFromRows(rows);
}

export function scoreFAFromConclusion(c: Conclusion): BucketScore | null {
  if (!c.found || !c.summary || !c.risk) return null;
  const prob = c.summary.prob_close_above_ipo;
  const avgRet = c.summary.avg_return_close_d1 ?? 0;
  const downside = c.risk.downside_freq_20;
  const score = c.score;
  return {
    score,
    prob,
    avgRet: c.summary.avg_return_close_d1,
    downside,
    sample: c.sampleSize,
    decision: decisionFromScore01(score),
  };
}

export function scoreUW(
  leadRow: SummaryRow | undefined,
  pairRow: LeadCoSummaryRow | undefined,
): BucketScore | null {
  const rows = [pairRow ?? leadRow].filter(Boolean) as SummaryRow[];
  return bucketFromRows(rows);
}

export function scoreUWFromConclusion(c: Conclusion): BucketScore | null {
  if (!c.found || !c.summary || !c.risk) return null;
  const prob = c.summary.prob_close_above_ipo;
  const avgRet = c.summary.avg_return_close_d1 ?? 0;
  const downside = c.risk.downside_freq_20;
  const score = c.score;
  return {
    score,
    prob,
    avgRet: c.summary.avg_return_close_d1,
    downside,
    sample: c.sampleSize,
    decision: decisionFromScore01(score),
  };
}

export function scoreFundamental(
  computed: ComputedFundamental,
): FundamentalBucketScore | null {
  const checks: Array<{ label: string; pass: boolean; value: string }> = [];
  let passes = 0;
  let total = 0;

  if (computed.roe != null) {
    total++;
    const pass = computed.roe >= 12;
    if (pass) passes++;
    checks.push({ label: "ROE ≥ 12%", pass, value: `${computed.roe.toFixed(2)}%` });
  }
  if (computed.de != null) {
    total++;
    const pass = computed.de <= 1.5;
    if (pass) passes++;
    checks.push({ label: "D/E ≤ 1.5", pass, value: computed.de.toFixed(2) });
  }
  if (computed.pe != null) {
    total++;
    const pass = computed.pe > 0 && computed.pe <= 20;
    if (pass) passes++;
    checks.push({ label: "P/E ≤ 20", pass, value: computed.pe.toFixed(2) });
  }
  if (computed.pbv != null) {
    total++;
    const pass = computed.pbv > 0 && computed.pbv <= 3;
    if (pass) passes++;
    checks.push({ label: "P/BV ≤ 3", pass, value: computed.pbv.toFixed(2) });
  }
  if (computed.costRatio != null) {
    total++;
    const pass = computed.costRatio <= 7;
    if (pass) passes++;
    checks.push({
      label: "Cost Ratio ≤ 7%",
      pass,
      value: `${computed.costRatio.toFixed(2)}%`,
    });
  }
  if (computed.newPct != null) {
    total++;
    const pass = computed.newPct >= 70;
    if (pass) passes++;
    checks.push({
      label: "หุ้นใหม่ ≥ 70%",
      pass,
      value: `${computed.newPct.toFixed(1)}%`,
    });
  }

  if (total === 0) return null;
  const score = passes / total;
  return { score, checks, decision: decisionFromScore01(score) };
}

function combo(a: number | null, b: number | null): ComboScore | null {
  const avg = strictAvg(a, b);
  if (avg == null) return null;
  return { score: avg, decision: decisionFromScore01(avg) };
}

export function computePerformanceScores(args: {
  personRow: SummaryRow | undefined;
  companyRow: SummaryRow | undefined;
  leadRow: SummaryRow | undefined;
  pairRow: LeadCoSummaryRow | undefined;
  fundamental: ComputedFundamental;
  faConclusion?: Conclusion;
  leadCoConclusion?: Conclusion;
  // When provided, replaces scoreFundamental in overall/combo calculations.
  // Should be the normalized 0–1 score from computeIpoScore.
  ipoFactorScore?: number | null;
}): PerformanceScores {
  const fa = args.faConclusion
    ? scoreFAFromConclusion(args.faConclusion)
    : scoreFA(args.personRow, args.companyRow);
  const uw = args.leadCoConclusion
    ? scoreUWFromConclusion(args.leadCoConclusion)
    : scoreUW(args.leadRow, args.pairRow);
  const fin = scoreFundamental(args.fundamental);

  const finScore = args.ipoFactorScore != null ? args.ipoFactorScore : (fin?.score ?? null);

  const faUw = combo(fa?.score ?? null, uw?.score ?? null);
  const faFin = combo(fa?.score ?? null, finScore);
  const uwFin = combo(uw?.score ?? null, finScore);

  const factorsUsed: string[] = [];
  if (fa) factorsUsed.push("FA");
  if (uw) factorsUsed.push("Underwriter");
  if (finScore != null) factorsUsed.push("ปัจจัยพื้นฐานและโครงสร้าง IPO");

  const overallScore = flexAvg(fa?.score ?? null, uw?.score ?? null, finScore);
  const overall =
    overallScore != null
      ? { score: overallScore, decision: decisionFromScore01(overallScore) }
      : null;

  return {
    fa,
    uw,
    fin,
    combos: { faUw, faFin, uwFin },
    overall,
    factorsUsed,
  };
}
