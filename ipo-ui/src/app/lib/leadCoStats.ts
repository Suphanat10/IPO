import type { RawIpoRow } from "./mockData";
import { leadCoIndex, rawIpoBySymbol } from "./mockData";

export type DayReturns = {
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d4: number | null;
  d5: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
};

export type TargetHit = {
  target: number; // in %
  hitDay1: number; // % of IPOs whose D1 return >= target
  hitDay2: number; // % of IPOs whose max(D1,D2) return >= target
  evDay1: number;
  evDay2: number;
};

export type LeadCoMatchedStats = {
  sample: number;
  symbols: string[];
  upD1Prob: number | null;
  avgD1: number | null;
  downProb20: number | null; // P(D1 <= -20%)
  riskReward: number | null; // best/worst ratio
  avgReturns: DayReturns;
  bestDay: string | null; // which of d1..6M has highest avg
  day1VsDay2: {
    comboAvg: number | null;
    d1ExceedCombo: number | null;
    d2ExceedCombo: number | null;
    d2HigherThanD1: number | null;
  } | null;
  targetHits: TargetHit[];
  drawdown: {
    mean: number | null;
    median: number | null;
    p75: number | null;
    p90: number | null;
  };
};

function mean(xs: Array<number | null | undefined>): number | null {
  const valid = xs.filter((v) => v != null && !Number.isNaN(v)) as number[];
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function prob(xs: Array<number | null | undefined>): number | null {
  const valid = xs.filter((v) => v != null && !Number.isNaN(v)) as number[];
  if (valid.length === 0) return null;
  const hits = valid.filter((v) => v > 0).length;
  return (hits / valid.length) * 100;
}

function probAtLeast(xs: Array<number | null | undefined>, t: number): number | null {
  const valid = xs.filter((v) => v != null && !Number.isNaN(v)) as number[];
  if (valid.length === 0) return null;
  const hits = valid.filter((v) => v >= t).length;
  return (hits / valid.length) * 100;
}

function probAtMost(xs: Array<number | null | undefined>, t: number): number | null {
  const valid = xs.filter((v) => v != null && !Number.isNaN(v)) as number[];
  if (valid.length === 0) return null;
  const hits = valid.filter((v) => v <= t).length;
  return (hits / valid.length) * 100;
}

function percentile(xs: Array<number | null | undefined>, p: number): number | null {
  const valid = (xs.filter((v) => v != null && !Number.isNaN(v)) as number[]).slice();
  if (valid.length === 0) return null;
  valid.sort((a, b) => a - b);
  const idx = Math.min(valid.length - 1, Math.floor((p / 100) * valid.length));
  return valid[idx];
}

// Normalize name — strip whitespace and prefixes for loose matching
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function parseCoList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Fuzzy-ish contains: the stored name contains the query OR vice versa (case-insensitive, whitespace-insensitive)
function looseIncludes(stored: string, query: string): boolean {
  const s = norm(stored);
  const q = norm(query);
  if (!s || !q) return false;
  return s.includes(q) || q.includes(s);
}

export function matchedLeadCoSymbols(lead: string, coList: string[]): string[] {
  if (!lead || coList.length === 0) return [];
  const found = new Set<string>();
  for (const [sym, l, c] of leadCoIndex) {
    if (!looseIncludes(l, lead)) continue;
    if (coList.some((co) => looseIncludes(c, co))) {
      found.add(sym);
    }
  }
  return Array.from(found);
}

export function leadOnlySymbols(lead: string): string[] {
  if (!lead) return [];
  const found = new Set<string>();
  for (const [sym, l] of leadCoIndex) {
    if (looseIncludes(l, lead)) found.add(sym);
  }
  return Array.from(found);
}

export function coOnlySymbols(co: string): string[] {
  if (!co) return [];
  const found = new Set<string>();
  for (const [sym, , c] of leadCoIndex) {
    if (looseIncludes(c, co)) found.add(sym);
  }
  return Array.from(found);
}

function buildStats(symbols: string[]): LeadCoMatchedStats {
  const rows = symbols
    .map((s) => rawIpoBySymbol.get(s))
    .filter((r): r is RawIpoRow => !!r);

  const d1 = rows.map((r) => r.rD1);
  const d2 = rows.map((r) => r.rD2);
  const d3 = rows.map((r) => r.rD3);
  const d4 = rows.map((r) => r.rD4);
  const d5 = rows.map((r) => r.rD5);
  const w1 = rows.map((r) => r.r1W);
  const m1 = rows.map((r) => r.r1M);
  const m3 = rows.map((r) => r.r3M);
  const m6 = rows.map((r) => r.r6M);
  const range = rows.map((r) => r.range);

  const avgReturns: DayReturns = {
    d1: mean(d1),
    d2: mean(d2),
    d3: mean(d3),
    d4: mean(d4),
    d5: mean(d5),
    w1: mean(w1),
    m1: mean(m1),
    m3: mean(m3),
    m6: mean(m6),
  };

  const entries: Array<[string, number | null]> = [
    ["Day1", avgReturns.d1],
    ["Day2", avgReturns.d2],
    ["Day3", avgReturns.d3],
    ["Day4", avgReturns.d4],
    ["Day5", avgReturns.d5],
    ["1W", avgReturns.w1],
    ["1M", avgReturns.m1],
    ["3M", avgReturns.m3],
    ["6M", avgReturns.m6],
  ];
  const valid = entries.filter(([, v]) => v != null) as Array<[string, number]>;
  const bestDay = valid.length > 0
    ? valid.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0]
    : null;

  // Day1 vs Day2 analysis
  const pairs = rows
    .map((r) => ({ d1: r.rD1, d2: r.rD2 }))
    .filter((p) => p.d1 != null && p.d2 != null) as { d1: number; d2: number }[];
  let day1VsDay2: LeadCoMatchedStats["day1VsDay2"] = null;
  if (pairs.length > 0) {
    const combos = pairs.map((p) => (p.d1 + p.d2) / 2);
    const comboAvg = combos.reduce((s, v) => s + v, 0) / combos.length;
    const d1Exceed = pairs.filter((p, i) => p.d1 > combos[i]).length / pairs.length * 100;
    const d2Exceed = pairs.filter((p, i) => p.d2 > combos[i]).length / pairs.length * 100;
    const d2Higher = pairs.filter((p) => p.d2 > p.d1).length / pairs.length * 100;
    day1VsDay2 = {
      comboAvg,
      d1ExceedCombo: d1Exceed,
      d2ExceedCombo: d2Exceed,
      d2HigherThanD1: d2Higher,
    };
  }

  // Target hit rates (10%, 20%, 30%)
  const targetHits: TargetHit[] = [10, 20, 30].map((target) => {
    const hitD1 = probAtLeast(d1, target) ?? 0;
    // Day2 hit rate = P(max(d1, d2) >= target)
    const maxD1D2 = pairs.map((p) => Math.max(p.d1, p.d2));
    const hitD2 =
      maxD1D2.length > 0
        ? (maxD1D2.filter((v) => v >= target).length / maxD1D2.length) * 100
        : 0;
    return {
      target,
      hitDay1: hitD1,
      hitDay2: hitD2,
      evDay1: (hitD1 * target) / 100,
      evDay2: (hitD2 * target) / 100,
    };
  });

  // Risk/Reward: avg(positive d1) / avg(|negative d1|)
  const pos = (d1.filter((v) => v != null && v > 0) as number[]);
  const neg = (d1.filter((v) => v != null && v < 0) as number[]).map((v) => Math.abs(v));
  const avgPos = pos.length > 0 ? pos.reduce((s, v) => s + v, 0) / pos.length : null;
  const avgNeg = neg.length > 0 ? neg.reduce((s, v) => s + v, 0) / neg.length : null;
  const riskReward = avgPos != null && avgNeg != null && avgNeg > 0 ? avgPos / avgNeg : null;

  return {
    sample: rows.length,
    symbols,
    upD1Prob: prob(d1),
    avgD1: mean(d1),
    downProb20: probAtMost(d1, -20),
    riskReward,
    avgReturns,
    bestDay,
    day1VsDay2,
    targetHits,
    drawdown: {
      mean: mean(range),
      median: percentile(range, 50),
      p75: percentile(range, 75),
      p90: percentile(range, 90),
    },
  };
}

export function computeLeadCoStats(lead: string, coList: string[]): LeadCoMatchedStats {
  const syms = matchedLeadCoSymbols(lead, coList);
  return buildStats(syms);
}

export function computeLeadOnlyStats(lead: string): LeadCoMatchedStats {
  return buildStats(leadOnlySymbols(lead));
}

export function computeCoOnlyStats(co: string): LeadCoMatchedStats {
  return buildStats(coOnlySymbols(co));
}
