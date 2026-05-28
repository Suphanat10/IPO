// Analytical engine mirroring the Python spec the user provided
// (`generate_investment_conclusion` / `generate_lead_co_conclusion` + helpers).
//
// Produces structured results — no rendering. UI components consume these.

import { rawIpo, leadCoIndex, rawIpoBySymbol } from "./mockData";
import type { RawIpoRow } from "./mockData";
import { parseCoList } from "./leadCoStats";

export const MIN_SAMPLE = 5;
export const LONG_TERM_DIFF_THRESHOLD = 15;
export const STRONG_HITRATE = 60;
export const SCORE_THRESHOLD = 0.5;

// ---------- name matching helpers ----------

function looseEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, "").replace(/[()."]/g, "");
  return norm(a) === norm(b);
}

function looseIncludes(stored: string, query: string): boolean {
  const n = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const s = n(stored);
  const q = n(query);
  if (!s || !q) return false;
  return s.includes(q) || q.includes(s);
}

// ---------- summary (mirrors `summarize_from_base`) ----------

export type Summary = {
  ipo_count: number;
  prob_close_above_ipo: number;
  prob_open_above_ipo: number;
  prob_high_above_ipo: number;
  prob_low_above_ipo: number;
  best_return_d1: number | null;
  worst_return_d1: number | null;
  avg_return_open_d1: number | null;
  avg_return_high_d1: number | null;
  avg_return_low_d1: number | null;
  avg_return_close_d1: number | null;
  avg_return_d2: number | null;
  avg_return_d3: number | null;
  avg_return_d4: number | null;
  avg_return_d5: number | null;
  avg_intraday_range_d1: number | null;
  avg_return_1W: number | null;
  avg_return_1M: number | null;
  avg_return_3M: number | null;
  avg_return_6M: number | null;
};

function meanOf(xs: Array<number | null>): number | null {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function probOf(xs: Array<number | null>): number {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  if (v.length === 0) return 0;
  return (v.filter((x) => x > 0).length / v.length) * 100;
}

function maxOf(xs: Array<number | null>): number | null {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  return v.length ? Math.max(...v) : null;
}

function minOf(xs: Array<number | null>): number | null {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  return v.length ? Math.min(...v) : null;
}

export function summarize(rows: RawIpoRow[]): Summary {
  return {
    ipo_count: rows.length,
    prob_close_above_ipo: probOf(rows.map((r) => r.rD1)),
    prob_open_above_ipo: probOf(rows.map((r) => r.openUp)),
    prob_high_above_ipo: probOf(rows.map((r) => r.highUp)),
    prob_low_above_ipo: 0, // not used in conclusion
    best_return_d1: maxOf(rows.map((r) => r.rD1)),
    worst_return_d1: minOf(rows.map((r) => r.rD1)),
    avg_return_open_d1: null,
    avg_return_high_d1: null,
    avg_return_low_d1: null,
    avg_return_close_d1: meanOf(rows.map((r) => r.rD1)),
    avg_return_d2: meanOf(rows.map((r) => r.rD2)),
    avg_return_d3: meanOf(rows.map((r) => r.rD3)),
    avg_return_d4: meanOf(rows.map((r) => r.rD4)),
    avg_return_d5: meanOf(rows.map((r) => r.rD5)),
    avg_intraday_range_d1: meanOf(rows.map((r) => r.range)),
    avg_return_1W: meanOf(rows.map((r) => r.r1W)),
    avg_return_1M: meanOf(rows.map((r) => r.r1M)),
    avg_return_3M: meanOf(rows.map((r) => r.r3M)),
    avg_return_6M: meanOf(rows.map((r) => r.r6M)),
  };
}

// ---------- risk metrics (mirrors `calculate_risk_metrics`) ----------

export type RiskMetrics = {
  prob_up: number;
  downside_freq_20: number;
  risk_reward: number | null;
};

export function calculateRiskMetrics(rows: RawIpoRow[]): RiskMetrics {
  const returns = rows.map((r) => r.rD1).filter((v) => v != null) as number[];
  const probUp = returns.length ? (returns.filter((v) => v > 0).length / returns.length) * 100 : 0;
  const down20 = returns.length ? (returns.filter((v) => v < -20).length / returns.length) * 100 : 0;
  const gains = returns.filter((v) => v > 0);
  const losses = returns.filter((v) => v < 0);
  const avgGain = gains.length ? gains.reduce((s, v) => s + v, 0) / gains.length : null;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : null;
  const rr = avgGain != null && avgLoss != null && avgLoss !== 0 ? avgGain / avgLoss : null;
  return { prob_up: probUp, downside_freq_20: down20, risk_reward: rr };
}

// ---------- score (mirrors `calculate_score`) ----------

function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

export function calculateScore(s: Summary, r: RiskMetrics): number {
  const prob_n = normalizeValue(s.prob_close_above_ipo, 30, 90);
  const ret_n = normalizeValue(s.avg_return_close_d1 ?? 0, -20, 60);
  const rr_n = normalizeValue(r.risk_reward ?? 0, 0, 5);
  const down_n = normalizeValue(r.downside_freq_20, 0, 50);
  return 0.5 * prob_n + 0.2 * ret_n + 0.2 * rr_n - 0.1 * down_n;
}

// ---------- horizon analysis (mirrors `analyze_dynamic_horizon`) ----------

export type HorizonAnalysis = {
  best_period: string;
  diff_6m_d1: number | null;
  cont_3m_6m: number;
  diff_vs_d1: number | null;
  cont_vs_d1: number | null;
};

export function analyzeDynamicHorizon(rows: RawIpoRow[], summary: Summary): HorizonAnalysis {
  const periods: Record<string, number | null> = {
    Day1: summary.avg_return_close_d1,
    Day2: summary.avg_return_d2,
    "1M": summary.avg_return_1M,
    "3M": summary.avg_return_3M,
    "6M": summary.avg_return_6M,
  };
  let best = "Day1";
  let bestVal = -Infinity;
  for (const [k, v] of Object.entries(periods)) {
    if (v == null) continue;
    if (v > bestVal) { best = k; bestVal = v; }
  }
  const diff_6m_d1 =
    summary.avg_return_6M != null && summary.avg_return_close_d1 != null
      ? summary.avg_return_6M - summary.avg_return_close_d1
      : null;

  const validPairs = rows
    .map((r) => ({ r3: r.r3M, r6: r.r6M }))
    .filter((p) => p.r3 != null && p.r6 != null) as { r3: number; r6: number }[];
  const cont_3m_6m = validPairs.length
    ? (validPairs.filter((p) => p.r6 > p.r3).length / validPairs.length) * 100
    : 0;

  let diff_vs_d1: number | null = null;
  let cont_vs_d1: number | null = null;
  if (best !== "Day1" && best !== null) {
    const bestV = periods[best];
    const d1V = periods.Day1;
    if (bestV != null && d1V != null) diff_vs_d1 = bestV - d1V;

    const colMap: Record<string, keyof RawIpoRow> = {
      Day2: "rD2",
      "1M": "r1M",
      "3M": "r3M",
      "6M": "r6M",
    };
    const col = colMap[best];
    if (col) {
      const pairs = rows
        .map((r) => ({ d1: r.rD1, x: r[col] as number | null }))
        .filter((p) => p.d1 != null && p.x != null) as { d1: number; x: number }[];
      cont_vs_d1 = pairs.length
        ? (pairs.filter((p) => p.x > p.d1).length / pairs.length) * 100
        : null;
    }
  }

  return { best_period: best, diff_6m_d1, cont_3m_6m, diff_vs_d1, cont_vs_d1 };
}

// ---------- target edge (mirrors `analyze_target_edge` + `select_optimal_tp`) ----------

export type TargetRow = { target: number; hitRate: number; ev: number };

export function analyzeTargetEdge(
  rows: RawIpoRow[],
  field: "rD1" | "rD2",
  targets: number[] = [10, 20, 30],
): TargetRow[] {
  const returns = rows.map((r) => r[field]).filter((v) => v != null) as number[];
  return targets.map((t) => {
    const hit = returns.length ? (returns.filter((v) => v >= t).length / returns.length) * 100 : 0;
    return { target: t, hitRate: hit, ev: (hit / 100) * t };
  });
}

export function selectOptimalTP(table: TargetRow[]): TargetRow {
  const strong = table.filter((r) => r.hitRate >= STRONG_HITRATE);
  const pool = strong.length ? strong : table;
  return pool.reduce((best, cur) => (cur.ev > best.ev ? cur : best), pool[0]);
}

// ---------- day1 vs day2 (mirrors `analyze_day1_day2`) ----------

export type Day12Analysis = {
  avg_two: number;
  d1_above: number;
  d2_above: number;
  continuation: number;
};

export function analyzeDay1Day2(rows: RawIpoRow[]): Day12Analysis {
  const d1 = rows.map((r) => r.rD1).filter((v) => v != null) as number[];
  const d2 = rows.map((r) => r.rD2).filter((v) => v != null) as number[];
  const meanD1 = d1.length ? d1.reduce((s, v) => s + v, 0) / d1.length : 0;
  const meanD2 = d2.length ? d2.reduce((s, v) => s + v, 0) / d2.length : 0;
  const avgTwo = (meanD1 + meanD2) / 2;
  const d1Above = d1.length ? (d1.filter((v) => v > avgTwo).length / d1.length) * 100 : 0;
  const d2Above = d2.length ? (d2.filter((v) => v > avgTwo).length / d2.length) * 100 : 0;
  const pairs = rows
    .map((r) => ({ d1: r.rD1, d2: r.rD2 }))
    .filter((p) => p.d1 != null && p.d2 != null) as { d1: number; d2: number }[];
  const continuation = pairs.length
    ? (pairs.filter((p) => p.d2 > p.d1).length / pairs.length) * 100
    : 0;
  return { avg_two: avgTwo, d1_above: d1Above, d2_above: d2Above, continuation };
}

// ---------- dataset selection ----------

function tokenMatch(stored: string, query: string): boolean {
  if (!stored || !query) return false;
  return stored.split(",").some((tok) => looseEq(tok, query) || looseIncludes(tok, query));
}
export function filterByPerson(person: string): RawIpoRow[] {
  return rawIpo.filter((r) => tokenMatch(r.fa_persons, person));
}
export function filterByCompany(company: string): RawIpoRow[] {
  return rawIpo.filter((r) => tokenMatch(r.fa_companies, company));
}
export function filterByPersonAndCompany(person: string, company: string): RawIpoRow[] {
  return rawIpo.filter(
    (r) => tokenMatch(r.fa_persons, person) && tokenMatch(r.fa_companies, company),
  );
}

export function selectFADataset(
  person: string | null,
  company: string | null,
): { rows: RawIpoRow[]; mode: string } {
  const provided = [person, company].filter(Boolean) as string[];
  if (provided.length === 2) {
    const both = filterByPersonAndCompany(person!, company!);
    if (both.length >= MIN_SAMPLE) return { rows: both, mode: "Matched 2-factor" };
    // weighted single: union of person rows + company rows, dedupe
    const combined = new Map<string, RawIpoRow>();
    for (const r of filterByPerson(person!)) combined.set(r.sym, r);
    for (const r of filterByCompany(company!)) combined.set(r.sym, r);
    if (combined.size > 0) return { rows: Array.from(combined.values()), mode: "Weighted Single Entity" };
    return { rows: [], mode: "No Data" };
  }
  if (provided.length === 1) {
    const rows = person ? filterByPerson(person) : filterByCompany(company!);
    return rows.length > 0
      ? { rows, mode: "Single Entity" }
      : { rows: [], mode: "No Data" };
  }
  return { rows: [], mode: "No Data" };
}

// Lead/Co filter functions use leadCoIndex (mirrors Python's lead_co detail table).
// leadCoIndex only contains [symbol, lead, co] rows for IPOs that have BOTH a lead
// AND a co underwriter — IPOs with no co are excluded, matching Python behaviour.

function symbolsFromIndex(predicate: (l: string, c: string) => boolean): RawIpoRow[] {
  const syms = new Set<string>();
  for (const [sym, l, c] of leadCoIndex) {
    if (predicate(l, c)) syms.add(sym);
  }
  return Array.from(syms)
    .map((s) => rawIpoBySymbol.get(s))
    .filter((r): r is RawIpoRow => !!r);
}

export function filterByLeadAndCos(lead: string, coList: string[]): RawIpoRow[] {
  return symbolsFromIndex(
    (l, c) => looseIncludes(l, lead) && coList.some((co) => looseIncludes(c, co)),
  );
}
export function filterByLead(lead: string): RawIpoRow[] {
  return symbolsFromIndex((l) => looseIncludes(l, lead));
}
export function filterByCos(coList: string[]): RawIpoRow[] {
  return symbolsFromIndex((_, c) => coList.some((co) => looseIncludes(c, co)));
}

export function selectLeadCoDataset(
  lead: string | null,
  coList: string[],
): { rows: RawIpoRow[]; mode: string } {
  if (lead && coList.length > 0) {
    const exact = filterByLeadAndCos(lead, coList);
    if (exact.length >= MIN_SAMPLE) return { rows: exact, mode: "Lead + Co (Matched)" };
    const lo = filterByLead(lead);
    if (lo.length > 0) return { rows: lo, mode: `Lead: ${lead}` };
    const co = filterByCos(coList);
    if (co.length > 0) return { rows: co, mode: `Co: ${coList.join(", ")}` };
    return { rows: [], mode: "No Data" };
  }
  if (lead) {
    const lo = filterByLead(lead);
    return lo.length > 0
      ? { rows: lo, mode: `Lead: ${lead}` }
      : { rows: [], mode: "No Data" };
  }
  if (coList.length > 0) {
    const co = filterByCos(coList);
    return co.length > 0
      ? { rows: co, mode: `Co: ${coList.join(", ")}` }
      : { rows: [], mode: "No Data" };
  }
  return { rows: [], mode: "No Data" };
}

// ---------- conclusion (mirrors `generate_investment_conclusion` + `generate_lead_co_conclusion`) ----------

export type Conclusion = {
  found: boolean;
  modeDesc: string;
  sampleSize: number;
  symbols: string[];
  summary: Summary | null;
  risk: RiskMetrics | null;
  score: number;
  decision: "BUY" | "AVOID";
  decisionLabel: string;
  holding: { label: string; value: number | null }[];
  horizon: HorizonAnalysis | null;
  day12: Day12Analysis | null;
  tpD1: TargetRow[];
  tpD2: TargetRow[];
  bestTpD1: TargetRow | null;
  bestTpD2: TargetRow | null;
  showLongTerm: boolean;
  recommendation: string[];
  warningLowSample: boolean;
  fallbackNotice: string | null;
  drawdown: {
    mean: number | null;
    median: number | null;
    p75: number | null;
    p90: number | null;
  };
};

function buildConclusion(rows: RawIpoRow[], modeDesc: string): Conclusion {
  if (rows.length === 0) {
    return {
      found: false,
      modeDesc,
      sampleSize: 0,
      symbols: [],
      summary: null,
      risk: null,
      score: 0,
      decision: "AVOID",
      decisionLabel: "ไม่พบข้อมูลในฐานข้อมูล",
      holding: [],
      horizon: null,
      day12: null,
      tpD1: [],
      tpD2: [],
      bestTpD1: null,
      bestTpD2: null,
      showLongTerm: false,
      recommendation: [],
      warningLowSample: false,
      fallbackNotice: null,
      drawdown: { mean: null, median: null, p75: null, p90: null },
    };
  }

  const summary = summarize(rows);
  const risk = calculateRiskMetrics(rows);
  const score = calculateScore(summary, risk);
  const decision: "BUY" | "AVOID" = score >= SCORE_THRESHOLD ? "BUY" : "AVOID";
  const decisionLabel =
    decision === "BUY" ? "แนะนำให้เข้าลงทุน IPO ตัวนี้" : "ไม่แนะนำให้เข้าลงทุน IPO ตัวนี้";

  const holding = [
    { label: "Day1", value: summary.avg_return_close_d1 },
    { label: "Day2", value: summary.avg_return_d2 },
    { label: "Day3", value: summary.avg_return_d3 },
    { label: "Day4", value: summary.avg_return_d4 },
    { label: "Day5", value: summary.avg_return_d5 },
    { label: "1W", value: summary.avg_return_1W },
    { label: "1M", value: summary.avg_return_1M },
    { label: "3M", value: summary.avg_return_3M },
    { label: "6M", value: summary.avg_return_6M },
  ];

  const horizon = analyzeDynamicHorizon(rows, summary);
  const day12 = analyzeDay1Day2(rows);
  const tpD1 = analyzeTargetEdge(rows, "rD1");
  const tpD2 = analyzeTargetEdge(rows, "rD2");
  const bestTpD1 = tpD1.length ? selectOptimalTP(tpD1) : null;
  const bestTpD2 = tpD2.length ? selectOptimalTP(tpD2) : null;

  const longDiff =
    summary.avg_return_6M != null && summary.avg_return_close_d1 != null
      ? summary.avg_return_6M - summary.avg_return_close_d1
      : 0;
  const showLongTerm =
    (horizon.best_period === "3M" || horizon.best_period === "6M") &&
    longDiff > LONG_TERM_DIFF_THRESHOLD;

  const recommendation: string[] = [];
  const useDay2 =
    bestTpD2 != null && bestTpD1 != null && bestTpD2.ev > bestTpD1.ev && day12.continuation > 50;

  if (showLongTerm) {
    if (useDay2 && bestTpD2) {
      recommendation.push(
        `ระยะสั้น: แนะนำขายวันที่ 2 โดยตั้ง TP ประมาณ ${Math.round(bestTpD2.target)}% จากราคา IPO`,
      );
    } else if (bestTpD1) {
      recommendation.push(
        `ระยะสั้น: แนะนำขายวันแรก โดยตั้ง TP ประมาณ ${Math.round(bestTpD1.target)}% จากราคา IPO`,
      );
    }
    if (horizon.diff_vs_d1 != null && horizon.cont_vs_d1 != null) {
      recommendation.push(
        `ระยะยาว: ผลตอบแทนเฉลี่ย ${horizon.best_period} สูงกว่าวันแรกประมาณ ${horizon.diff_vs_d1.toFixed(2)}% โดยมีสัดส่วนที่ ${horizon.best_period} ให้ผลตอบแทนสูงกว่าวันแรกอยู่ที่ ${horizon.cont_vs_d1.toFixed(2)}% สามารถพิจารณาถือถึง ${horizon.best_period} ได้`,
      );
    }
  } else {
    if (useDay2 && bestTpD2) {
      recommendation.push(
        `แนะนำขายวันที่ 2 โดยตั้ง TP ประมาณ ${Math.round(bestTpD2.target)}% จากราคา IPO`,
      );
    } else if (bestTpD1) {
      recommendation.push(
        `แนะนำขายวันแรก โดยตั้ง TP ประมาณ ${Math.round(bestTpD1.target)}% จากราคา IPO`,
      );
    }
  }

  const dds = rows
    .map((r) => r.dd)
    .filter((v): v is number => v != null && !Number.isNaN(v));
  const drawdown = {
    mean: dds.length ? dds.reduce((s, v) => s + v, 0) / dds.length : null,
    median: percentileOf(dds, 50),
    p75: percentileOf(dds, 75),
    p90: percentileOf(dds, 90),
  };

  return {
    found: true,
    modeDesc,
    sampleSize: rows.length,
    symbols: rows.map((r) => r.sym),
    summary,
    risk,
    score,
    decision,
    decisionLabel,
    holding,
    horizon,
    day12,
    tpD1,
    tpD2,
    bestTpD1,
    bestTpD2,
    showLongTerm,
    recommendation,
    warningLowSample: rows.length < 10,
    fallbackNotice: null,
    drawdown,
  };
}

function percentileOf(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function generateFAConclusion(
  person: string | null,
  company: string | null,
): Conclusion {
  const { rows, mode } = selectFADataset(person, company);
  return buildConclusion(rows, mode);
}

export function generateLeadCoConclusion(
  lead: string | null,
  co: string | null,
): Conclusion {
  const coList = parseCoList(co);
  const { rows, mode } = selectLeadCoDataset(lead, coList);
  const conclusion = buildConclusion(rows, mode);

  // ถ้า user ใส่ทั้ง Lead + Co แต่ mode ที่ถูกเลือกไม่ได้คิด Co (เช่น "Lead: XXX")
  // หมายความว่า Lead+Co exact-match มีตัวอย่างไม่ถึง MIN_SAMPLE → fall back ใช้ Lead อย่างเดียว
  if (lead && coList.length > 0 && conclusion.found) {
    const exactCount = filterByLeadAndCos(lead, coList).length;
    if (mode.startsWith("Lead:") || mode.startsWith("Co:")) {
      conclusion.fallbackNotice =
        `ข้อมูล Lead + Co ร่วมกันมีเพียง ${exactCount} ราย (ต่ำกว่าเกณฑ์ขั้นต่ำ ${MIN_SAMPLE} ราย) ` +
        `จึงยังไม่ถูกนำมาคิดสถิติ — ระบบใช้สถิติของ ${mode.startsWith("Lead:") ? "Lead เพียงตัวเดียว" : "Co เพียงตัวเดียว"}แทน`;
    }
  }

  return conclusion;
}

// ---------- single-entity views (FA Person tab / FA Company tab / Lead-only / Co-only) ----------

export function viewSinglePerson(person: string): Conclusion {
  return buildConclusion(filterByPerson(person), `FA Person: ${person}`);
}
export function viewSingleCompany(company: string): Conclusion {
  return buildConclusion(filterByCompany(company), `FA Company: ${company}`);
}
export function viewLeadOnly(lead: string): Conclusion {
  return buildConclusion(filterByLead(lead), `Lead: ${lead}`);
}
export function viewCoOnly(coList: string[]): Conclusion {
  return buildConclusion(filterByCos(coList), `Co: ${coList.join(", ")}`);
}
export function viewMatchedFA(person: string, company: string): Conclusion {
  return buildConclusion(filterByPersonAndCompany(person, company), `FA Person & FA Company`);
}
export function viewMatchedLeadCo(lead: string, coList: string[]): Conclusion {
  return buildConclusion(filterByLeadAndCos(lead, coList), `Lead + Co (Matched)`);
}
