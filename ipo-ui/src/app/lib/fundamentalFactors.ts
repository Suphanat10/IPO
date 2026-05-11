import type { ComputedFundamental } from "./AnalysisContext";
import {
  globalFundamentalStats,
  peerByIndustry,
  peerBySector,
  sectorMapping,
  sectorParent,
  tierThresholds,
  type FactorTierStats,
  type PeerGroupStats,
} from "./mockData";

// Mirrors the Python `analyze_ipo_v4` spec the user provided. For each input
// factor we bucket the value into a tier, then look up the precomputed stats
// (return_tier crosstab + meanReturn) for that tier. Earnings Yield is special:
// it uses a peer-group (sector or industry) split by EY median.

export type FactorKey =
  | "offeredRatio"      // สัดส่วนเสนอขายหุ้น
  | "existingPct"       // สัดส่วนขายหุ้นเดิม
  | "executivePct"      // ผู้บริหารถือหุ้น
  | "roe"               // ROE
  | "earningsYield"     // Earnings Yield (peer-relative)
  | "de"                // D/E
  | "costRatio";        // ค่าใช้จ่าย IPO

export type ThaiTierLabel = "ต่ำ" | "กลาง" | "สูง" | "ไม่มีหุ้นเดิม";

export type ReturnTierLabel = "บวกแรง (>=50%)" | "บวก (0 ถึง +49%)" | "ลบ (-20 ถึง 0%)" | "ลบแรง (<-20%)";

const RETURN_LABEL_MAP: Record<string, ReturnTierLabel> = {
  gain_strong: "บวกแรง (>=50%)",
  gain: "บวก (0 ถึง +49%)",
  loss: "ลบ (-20 ถึง 0%)",
  loss_strong: "ลบแรง (<-20%)",
};

export type FactorAnalysis = {
  key: FactorKey;
  label: string;
  value: number | null;            // raw value as user entered (pct for pct factors, multiple for DE)
  valueDisplay: string;
  tier: ThaiTierLabel | null;
  bucketSize: number;              // n in the tier
  meanReturn: number | null;
  bullProb: number;                // P(gain) + P(gain_strong)  in %
  bearProb: number;                // P(loss) + P(loss_strong)  in %
  bestReturnTier: ReturnTierLabel | null; // most-common return_tier in this group
  bestReturnProb: number;          // its share in %
  factorScore: number;             // (bull - bear) / 100, range [-1, 1] — used by ipo score
  winProb: number;                 // bull% — used by horizontal bar chart (0-100)
};

type FactorDef = {
  key: FactorKey;
  label: string;
  fmt: "pct" | "num";
};

const FACTORS: FactorDef[] = [
  { key: "offeredRatio", label: "สัดส่วนเสนอขายหุ้น", fmt: "pct" },
  { key: "existingPct", label: "สัดส่วนขายหุ้นเดิม", fmt: "pct" },
  { key: "executivePct", label: "ผู้บริหารถือหุ้น", fmt: "pct" },
  { key: "roe", label: "ROE", fmt: "pct" },
  { key: "earningsYield", label: "Earnings Yield", fmt: "pct" },
  { key: "de", label: "D/E Ratio", fmt: "num" },
  { key: "costRatio", label: "ค่าใช้จ่าย IPO", fmt: "pct" },
];

// ---- Classifiers (mirror Python helpers) ----

function classifyFloat(fraction: number): "low" | "medium" | "high" {
  // value is fraction (0.28 = 28%)
  if (fraction <= tierThresholds.float.low) return "low";
  if (fraction <= tierThresholds.float.medium) return "medium";
  return "high";
}

function classifyExisting(fraction: number): "none" | "low" | "medium" | "high" {
  if (fraction === 0) return "none";
  if (fraction <= tierThresholds.existing.q1) return "low";
  if (fraction <= tierThresholds.existing.q2) return "medium";
  return "high";
}

function classifyExec(pct: number): "low" | "mid" | "high" {
  if (pct < tierThresholds.exec.low) return "low";
  if (pct < tierThresholds.exec.mid) return "mid";
  return "high";
}

// qcut-style bin via the precomputed q1/q2 bins.
// Strict `<` to match Python's pd.qcut (which uses left-closed/right-open intervals
// in practice — verified empirically against notebook tier counts).
function qcutTier(value: number, bins: { q1: number; q2: number }): ThaiTierLabel {
  if (value < bins.q1) return "ต่ำ";
  if (value < bins.q2) return "กลาง";
  return "สูง";
}

// English → Thai tier label
const TIER_TH: Record<string, ThaiTierLabel> = {
  low: "ต่ำ", medium: "กลาง", mid: "กลาง", high: "สูง", none: "ไม่มีหุ้นเดิม",
};

// ---- Sector resolution (mirror map_user_sector_input) ----

export type SectorResolution =
  | { name: string; type: "sector" | "industry" }
  | null;

export function mapUserSectorInput(input: string): SectorResolution {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  // exact sector match
  for (const sector of Object.keys(peerBySector)) {
    if (sector.toLowerCase() === text) return { name: sector, type: "sector" };
  }
  // exact industry match
  for (const industry of Object.keys(peerByIndustry)) {
    if (industry.toLowerCase() === text) return { name: industry, type: "industry" };
  }
  // keyword mapping (partial substring match)
  for (const [kw, target] of Object.entries(sectorMapping)) {
    if (text.includes(kw.toLowerCase())) return target;
  }
  return null;
}

// ---- Stat helpers ----

function bullBear(stats: FactorTierStats): { bull: number; bear: number } {
  return {
    bull: stats.probGain + stats.probGainStrong,
    bear: stats.probLoss + stats.probLossStrong,
  };
}

function bestReturnTier(stats: FactorTierStats): { label: ReturnTierLabel; prob: number } {
  // Python `prob.idxmax()` on a Series indexed by alphabetically-sorted columns
  // (gain < gain_strong < loss < loss_strong) → first one wins on ties.
  const entries: [keyof typeof RETURN_LABEL_MAP, number][] = [
    ["gain", stats.probGain],
    ["gain_strong", stats.probGainStrong],
    ["loss", stats.probLoss],
    ["loss_strong", stats.probLossStrong],
  ];
  let best = entries[0];
  for (const e of entries) if (e[1] > best[1]) best = e;
  return { label: RETURN_LABEL_MAP[best[0]], prob: best[1] };
}

function buildFactor(
  def: FactorDef,
  rawValue: number | null,
  tierLabel: ThaiTierLabel | null,
  stats: FactorTierStats | null,
): FactorAnalysis {
  const valueDisplay = rawValue == null
    ? "-"
    : def.fmt === "pct"
      ? `${rawValue.toFixed(rawValue >= 10 ? 0 : 2)}%`
      : rawValue.toFixed(2);

  if (!stats) {
    return {
      key: def.key,
      label: def.label,
      value: rawValue,
      valueDisplay,
      tier: tierLabel,
      bucketSize: 0,
      meanReturn: null,
      bullProb: 0,
      bearProb: 0,
      bestReturnTier: null,
      bestReturnProb: 0,
      factorScore: 0,
      winProb: 0,
    };
  }
  const { bull, bear } = bullBear(stats);
  const best = bestReturnTier(stats);
  return {
    key: def.key,
    label: def.label,
    value: rawValue,
    valueDisplay,
    tier: tierLabel,
    bucketSize: stats.n,
    meanReturn: stats.meanReturn,
    bullProb: bull,
    bearProb: bear,
    bestReturnTier: best.label,
    bestReturnProb: best.prob,
    factorScore: (bull - bear) / 100,
    winProb: Math.round(bull * 10) / 10,
  };
}

// ---- Earnings Yield peer-group resolution (mirrors analyze_ipo_v4 EY block) ----

function resolveEYPeer(input: string): {
  peer: PeerGroupStats | null;
  groupName: string;
} {
  const mapped = mapUserSectorInput(input);
  if (!mapped) return { peer: null, groupName: "" };

  if (mapped.type === "sector" && mapped.name !== "-") {
    const sectorPeer = peerBySector[mapped.name];
    // Python: use sector if n >= 3 OR name === "ธนาคาร"; else fall back to industry
    if (sectorPeer && (sectorPeer.n >= 3 || mapped.name === "ธนาคาร")) {
      return { peer: sectorPeer, groupName: `หมวดธุรกิจ ${mapped.name}` };
    }
    const parent = sectorParent[mapped.name];
    if (parent && peerByIndustry[parent]) {
      return { peer: peerByIndustry[parent], groupName: `กลุ่มอุตสาหกรรม ${parent}` };
    }
    return sectorPeer
      ? { peer: sectorPeer, groupName: `หมวดธุรกิจ ${mapped.name}` }
      : { peer: null, groupName: "" };
  }
  // industry mapping
  const industryPeer = peerByIndustry[mapped.name];
  if (industryPeer) return { peer: industryPeer, groupName: `กลุ่มอุตสาหกรรม ${mapped.name}` };
  return { peer: null, groupName: "" };
}

function computeEarningsYield(c: ComputedFundamental): number | null {
  if (c.pe == null || c.pe <= 0) return null;
  return 100 / c.pe;
}

// ---- Public entry point ----

export type FactorRunResult = {
  factors: FactorAnalysis[];
  warnings: string[];
  eyPeerGroup: string | null; // resolved peer group label, or null
};

export function computeFundamentalFactors(
  computed: ComputedFundamental,
  raw: Record<string, string>,
): FactorRunResult {
  const parseP = (k: string): number | null => {
    const v = raw[k];
    if (!v) return null;
    const cleaned = v.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const factors: FactorAnalysis[] = [];
  const warnings: string[] = [];
  let eyPeerGroup: string | null = null;

  // 1. Float (offered_ratio)
  {
    const def = FACTORS[0];
    const valuePct = parseP("offeredRatio");
    if (valuePct != null) {
      const fraction = valuePct / 100;
      const t = classifyFloat(fraction);
      const stats = globalFundamentalStats.float?.[t] ?? null;
      factors.push(buildFactor(def, valuePct, TIER_TH[t], stats));
    }
  }

  // 2. Existing (existing_pct)
  {
    const def = FACTORS[1];
    const valuePct = parseP("existingPct");
    if (valuePct != null) {
      const fraction = valuePct / 100;
      const t = classifyExisting(fraction);
      const stats = globalFundamentalStats.existing?.[t] ?? null;
      factors.push(buildFactor(def, valuePct, TIER_TH[t], stats));
    }
  }

  // 3. Exec (executive_total_pct, already pct)
  {
    const def = FACTORS[2];
    const valuePct = parseP("executivePct");
    if (valuePct != null) {
      const t = classifyExec(valuePct);
      const stats = globalFundamentalStats.exec?.[t] ?? null;
      factors.push(buildFactor(def, valuePct, TIER_TH[t], stats));
    }
  }

  // 4. ROE (qcut)
  {
    const def = FACTORS[3];
    const roePct = computed.roe;
    if (roePct != null) {
      const fraction = roePct / 100;
      const t = qcutTier(fraction, tierThresholds.roe);
      const stats = globalFundamentalStats.roe?.[t] ?? null;
      factors.push(buildFactor(def, roePct, t, stats));
    }
  }

  // 5. Earnings Yield (peer-relative, requires user_sector_input)
  {
    const def = FACTORS[4];
    const eyPct = computeEarningsYield(computed);
    const sectorRaw = (raw["sector"] ?? "").trim();
    if (eyPct != null && sectorRaw) {
      const fraction = eyPct / 100;
      const { peer, groupName } = resolveEYPeer(sectorRaw);
      if (peer) {
        eyPeerGroup = groupName;
        const isAbove = fraction > peer.medianEY;
        let group: FactorTierStats = isAbove ? peer.above : peer.below;
        if (group.n < 3) group = peer.full; // Python fallback
        const tier: ThaiTierLabel = isAbove ? "สูง" : "ต่ำ";
        factors.push(buildFactor(def, eyPct, tier, group));
      } else {
        warnings.push(
          `ไม่พบข้อมูลหุ้นในกลุ่ม "${sectorRaw}" กรุณากรอกหมวดธุรกิจ หรือ กลุ่มอุตสาหกรรมใหม่`,
        );
      }
    }
  }

  // 6. D/E (qcut)
  {
    const def = FACTORS[5];
    const de = computed.de;
    if (de != null) {
      const t = qcutTier(de, tierThresholds.de);
      const stats = globalFundamentalStats.de?.[t] ?? null;
      factors.push(buildFactor(def, de, t, stats));
    }
  }

  // 7. Cost ratio (qcut)
  {
    const def = FACTORS[6];
    const costPct = computed.costRatio;
    if (costPct != null) {
      const fraction = costPct / 100;
      const t = qcutTier(fraction, tierThresholds.cost);
      const stats = globalFundamentalStats.cost?.[t] ?? null;
      factors.push(buildFactor(def, costPct, t, stats));
    }
  }

  return { factors, warnings, eyPeerGroup };
}

export function computeIpoScore(factors: FactorAnalysis[]): {
  score: number;            // 0..1 rounded to 2 dp (used for label/decision)
  rawScore: number;         // 0..100 truncated to 2 dp (display)
  normalizedScore: number;  // 0..1 exact (used for combo/overall calculations)
  label: "BUY" | "NEUTRAL" | "AVOID";
  thaiRecommendation: string;
  thaiTrend: string;
  factorsWithData: number;
} {
  // avg_score = ((sum(factor_score) / count) + 1) / 2 over scored factors.
  // Python: cost_ratio_final is shown but NOT contributing to score_total / score_max.
  const scored = factors.filter((f) => f.value != null && f.key !== "costRatio");
  if (scored.length === 0) {
    return {
      score: 0,
      rawScore: 0,
      normalizedScore: 0,
      label: "AVOID",
      thaiRecommendation: "ยังไม่มีข้อมูล",
      thaiTrend: "กรอกข้อมูลปัจจัยพื้นฐานเพื่อดูผลประเมิน",
      factorsWithData: 0,
    };
  }
  const sum = scored.reduce((s, f) => s + f.factorScore, 0);
  const avg = sum / scored.length; // [-1, 1]
  const normalized = (avg + 1) / 2; // [0, 1]
  const score = Math.round(normalized * 100) / 100;
  const rawScore = Math.floor(normalized * 10000) / 100; // truncate to 2 dp (floor, not round)

  let label: "BUY" | "NEUTRAL" | "AVOID";
  let thaiRecommendation: string;
  let thaiTrend: string;
  if (score > 0.65) {
    label = "BUY";
    thaiRecommendation = "ควรพิจารณาลงทุน";
    thaiTrend = "มีโอกาสเปิดบวก และมีสถิติสนับสนุนหลายปัจจัย";
  } else if (score > 0.5) {
    label = "NEUTRAL";
    thaiRecommendation = "ควรพิจารณาอย่างระมัดระวัง";
    thaiTrend = "มีโอกาสบวก แต่ยังมีความเสี่ยงบางปัจจัย";
  } else {
    label = "AVOID";
    thaiRecommendation = "ไม่แนะนำให้ลงทุน";
    thaiTrend = "มีแนวโน้มลบจากข้อมูลสถิติ";
  }
  return {
    score,
    rawScore,
    normalizedScore: normalized,
    label,
    thaiRecommendation,
    thaiTrend,
    factorsWithData: scored.length,
  };
}
