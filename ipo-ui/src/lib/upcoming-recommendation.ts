import { generateFAConclusion, generateLeadCoConclusion } from "@/app/lib/ipoAnalytics";
import { scoreFAFromConclusion, scoreFundamental, scoreUWFromConclusion } from "@/app/lib/scoring";
import type { DecisionLabel } from "@/app/lib/scoring";

export type UpcomingRecommendationIpo = {
  id: number;
  symbol: string;
  company_name: string | null;
  company_name_th?: string | null;
  market: string | null;
  industry?: string | null;
  sector: string | null;
  listing_date: string | null;
  ipo_price: number | null;
  par_value?: number | null;
  days_until?: number | null;
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
    executive_total_pct?: number | null;
    total_liabilities: number | null;
    total_equity: number | null;
    net_income_latest: number | null;
  } | null;
};

type ComputedFundamentalLite = {
  costRatio: number | null;
  netProceedsRatio: number | null;
  newPct: number | null;
  totalShares: number | null;
  marketCap: number | null;
  roe: number | null;
  de: number | null;
  pe: number | null;
  pbv: number | null;
};

export type RecommendationSignal = {
  decision: DecisionLabel;
  score: number;
  tpPct: number | null;
  tpPrice: number | null;
  winRate: number | null;
  avgReturn: number | null;
  faCompany: string | null;
  faPerson: string | null;
  leadUw: string | null;
  reasons: string[];
  components: {
    fa: {
      score: number;
      decision: DecisionLabel;
      sample: number;
      winRate: number | null;
      avgReturn: number | null;
      mode: string;
    } | null;
    uw: {
      score: number;
      decision: DecisionLabel;
      sample: number;
      winRate: number | null;
      avgReturn: number | null;
      mode: string;
    } | null;
    fundamental: {
      score: number;
      decision: DecisionLabel;
      checksPassed: number;
      checksTotal: number;
    } | null;
  };
};

function computeFundamentalFromFinancials(
  ipo: UpcomingRecommendationIpo,
): ComputedFundamentalLite {
  const fin = ipo.financials;
  if (!fin) {
    return {
      costRatio: null,
      netProceedsRatio: null,
      newPct: null,
      totalShares: null,
      marketCap: null,
      roe: null,
      de: null,
      pe: null,
      pbv: null,
    };
  }

  const gross = fin.gross_proceeds;
  const expense = fin.total_expense;
  const shares = fin.offered_shares;
  const offered = fin.offered_ratio_pct;
  const existing = fin.existing_shares_pct;
  const liab = fin.total_liabilities;
  const equity = fin.total_equity;
  const income = fin.net_income_latest;
  const price = ipo.ipo_price;

  const costRatio = gross != null && gross > 0 && expense != null ? (expense / gross) * 100 : null;
  const netProceedsRatio = costRatio != null ? 100 - costRatio : null;
  const newPct = existing != null ? 100 - existing : null;
  const totalShares = shares != null && offered != null && offered > 0 ? shares / (offered / 100) : null;
  const marketCap = totalShares != null && price != null ? totalShares * price : null;
  const roe = income != null && equity != null && equity > 0 ? (income / equity) * 100 : null;
  const de = liab != null && equity != null && equity > 0 ? liab / equity : null;
  const pe = marketCap != null && income != null && income > 0 ? marketCap / income : null;
  const pbv = marketCap != null && equity != null && equity > 0 ? marketCap / equity : null;

  return { costRatio, netProceedsRatio, newPct, totalShares, marketCap, roe, de, pe, pbv };
}

export function buildUpcomingRecommendationSignal(
  ipo: UpcomingRecommendationIpo,
): RecommendationSignal {
  const reasons: string[] = [];
  const scores: number[] = [];
  let winRate: number | null = null;
  let avgReturn: number | null = null;
  let tpPct: number | null = null;

  const faPerson = ipo.fa_persons?.[0] ?? null;
  const faCompany = ipo.fa_companies?.[0] ?? null;
  const lead = ipo.lead_uw?.[0] ?? null;
  const co = ipo.co_uws?.join(", ") ?? null;

  let faComponent: RecommendationSignal["components"]["fa"] = null;
  let uwComponent: RecommendationSignal["components"]["uw"] = null;
  let fundamentalComponent: RecommendationSignal["components"]["fundamental"] = null;

  if (faPerson || faCompany) {
    const faConclusion = generateFAConclusion(faPerson, faCompany);
    const bucket = scoreFAFromConclusion(faConclusion);
    if (bucket) {
      scores.push(bucket.score);
      winRate = bucket.prob ?? winRate;
      avgReturn = bucket.avgRet ?? avgReturn;
      if (faConclusion.bestTpD1) tpPct = faConclusion.bestTpD1.target;
      reasons.push(`FA ${faConclusion.decision} (${faConclusion.sampleSize} IPOs)`);
      faComponent = {
        score: bucket.score,
        decision: bucket.decision,
        sample: bucket.sample,
        winRate: bucket.prob,
        avgReturn: bucket.avgRet,
        mode: faConclusion.modeDesc,
      };
    }
  }

  if (lead) {
    const uwConclusion = generateLeadCoConclusion(lead, co);
    const bucket = scoreUWFromConclusion(uwConclusion);
    if (bucket) {
      scores.push(bucket.score);
      if (winRate == null) winRate = bucket.prob;
      if (avgReturn == null) avgReturn = bucket.avgRet;
      if (tpPct == null && uwConclusion.bestTpD1) tpPct = uwConclusion.bestTpD1.target;
      reasons.push(`UW ${uwConclusion.decision} (${uwConclusion.sampleSize} IPOs)`);
      uwComponent = {
        score: bucket.score,
        decision: bucket.decision,
        sample: bucket.sample,
        winRate: bucket.prob,
        avgReturn: bucket.avgRet,
        mode: uwConclusion.modeDesc,
      };
    }
  }

  const fundamental = scoreFundamental(computeFundamentalFromFinancials(ipo));
  if (fundamental) {
    scores.push(fundamental.score);
    const checksPassed = fundamental.checks.filter((check) => check.pass).length;
    reasons.push(`Fundamental ${checksPassed}/${fundamental.checks.length}`);
    fundamentalComponent = {
      score: fundamental.score,
      decision: fundamental.decision,
      checksPassed,
      checksTotal: fundamental.checks.length,
    };
  }

  const score = scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0.5;
  let decision: DecisionLabel = "NEUTRAL";
  if (score >= 0.6) decision = "BUY";
  else if (score < 0.5) decision = "AVOID";

  const tpPrice = tpPct != null && ipo.ipo_price != null ? ipo.ipo_price * (1 + tpPct / 100) : null;

  return {
    decision,
    score,
    tpPct,
    tpPrice,
    winRate,
    avgReturn,
    faCompany,
    faPerson,
    leadUw: lead,
    reasons,
    components: {
      fa: faComponent,
      uw: uwComponent,
      fundamental: fundamentalComponent,
    },
  };
}

