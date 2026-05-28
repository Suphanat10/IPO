"use client";

import * as React from "react";
import {
  Box,
  ButtonBase,
  Chip,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { fetchEncrypted } from "@/lib/cipher";
import { formatThaiDate } from "@/lib/date-format";
import { generateFAConclusion, generateLeadCoConclusion } from "../lib/ipoAnalytics";
import { scoreFAFromConclusion, scoreUWFromConclusion, scoreFundamental } from "../lib/scoring";
import type { DecisionLabel } from "../lib/scoring";
import type { ComputedFundamental } from "../lib/AnalysisContext";

export type UpcomingIpo = {
  id: number;
  symbol: string;
  company_name: string | null;
  company_name_th: string | null;
  market: string | null;
  sector: string | null;
  listing_date: string | null;
  ipo_price: number | null;
  par_value: number | null;
  business_description: string | null;
  filing_status: string | null;
  days_until: number | null;
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
    executive_total_pct: number | null;
    total_liabilities: number | null;
    total_equity: number | null;
    net_income_latest: number | null;
  } | null;
};

type Recommendation = {
  ipo: UpcomingIpo;
  decision: DecisionLabel;
  score: number;
  tpPct: number | null;
  tpPrice: number | null;
  winRate: number | null;
  avgReturn: number | null;
  reasons: string[];
  faCompany: string | null;
  faPerson: string | null;
  leadUw: string | null;
};

type FilterKey = "ALL" | DecisionLabel;
type MarketKey = "ALL" | "SET" | "mai";
type Counts = { buy: number; neutral: number; avoid: number };
type UpcomingResponse = { ipos: UpcomingIpo[] };

let upcomingCached: UpcomingIpo[] = [];
let upcomingLoaded = false;
let upcomingInflight: Promise<UpcomingIpo[]> | null = null;

const colors = {
  ink: "#0a1929",
  muted: "#475569",
  soft: "#f8fafc",
  border: "#dbe5ee",
  borderSoft: "#edf2f7",
  cyan: "#38bdf8",
};

const filingStatusConfig: Record<string, { label: string; tooltip: string; fg: string; bg: string; border: string }> = {
  Effective: { label: "Filing มีผลบังคับใช้", tooltip: "แบบ Filing ของบริษัทมีผลบังคับใช้", fg: "#166534", bg: "#f0fdf4", border: "#86efac" },
  Approved: { label: "ได้รับอนุญาต", tooltip: "ได้รับอนุญาตแบบคำขอให้เสนอขายหลักทรัพย์ที่ออกใหม่แล้ว", fg: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd" },
  Submitted: { label: "ยื่น Filing แล้ว", tooltip: "ยื่นแบบ Filing ต่อสำนักงาน ก.ล.ต. แล้ว", fg: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
};

function computeFundamentalFromFinancials(ipo: UpcomingIpo): ComputedFundamental {
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

export function buildRecommendation(ipo: UpcomingIpo): Recommendation {
  const reasons: string[] = [];
  const scores: number[] = [];
  let winRate: number | null = null;
  let avgReturn: number | null = null;
  let tpPct: number | null = null;

  const faPerson = ipo.fa_persons?.[0] ?? null;
  const faCompany = ipo.fa_companies?.[0] ?? null;
  const lead = ipo.lead_uw?.[0] ?? null;
  const co = ipo.co_uws?.join(", ") ?? null;

  if (faPerson || faCompany) {
    const faConc = generateFAConclusion(faPerson, faCompany);
    if (faConc.found) {
      const bucket = scoreFAFromConclusion(faConc);
      if (bucket) {
        scores.push(bucket.score);
        if (bucket.prob != null) winRate = bucket.prob;
        if (bucket.avgRet != null) avgReturn = bucket.avgRet;
        reasons.push(`FA ${faConc.decision === "BUY" ? "สถิติดี" : "สถิติต่ำ"} (${faConc.sampleSize} IPOs)`);
        if (faConc.bestTpD1) tpPct = faConc.bestTpD1.target;
      }
    }
  }

  if (lead) {
    const uwConc = generateLeadCoConclusion(lead, co);
    if (uwConc.found) {
      const bucket = scoreUWFromConclusion(uwConc);
      if (bucket) {
        scores.push(bucket.score);
        if (winRate == null && bucket.prob != null) winRate = bucket.prob;
        if (avgReturn == null && bucket.avgRet != null) avgReturn = bucket.avgRet;
        reasons.push(`UW ${uwConc.decision === "BUY" ? "สถิติดี" : "สถิติต่ำ"} (${uwConc.sampleSize} IPOs)`);
        if (tpPct == null && uwConc.bestTpD1) tpPct = uwConc.bestTpD1.target;
      }
    }
  }

  const computed = computeFundamentalFromFinancials(ipo);
  const finScore = scoreFundamental(computed);
  if (finScore) {
    scores.push(finScore.score);
    const passing = finScore.checks.filter((c) => c.pass).length;
    reasons.push(`พื้นฐาน ผ่าน ${passing}/${finScore.checks.length} เกณฑ์`);
  }

  const avgScore = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0.5;
  let decision: DecisionLabel = "NEUTRAL";
  if (avgScore >= 0.6) decision = "BUY";
  else if (avgScore < 0.5) decision = "AVOID";

  const tpPrice = tpPct != null && ipo.ipo_price != null ? ipo.ipo_price * (1 + tpPct / 100) : null;

  return {
    ipo,
    decision,
    score: avgScore,
    tpPct,
    tpPrice,
    winRate,
    avgReturn,
    reasons,
    faCompany,
    faPerson,
    leadUw: lead,
  };
}

export function preloadUpcomingIpos(): Promise<UpcomingIpo[]> {
  if (upcomingLoaded) return Promise.resolve(upcomingCached);

  if (!upcomingInflight) {
    upcomingInflight = fetchEncrypted<UpcomingResponse>("/api/upcoming-recommendations")
      .then((data) => {
        upcomingCached = data.ipos;
        return data.ipos;
      })
      .catch(() => {
        upcomingCached = [];
        return [];
      })
      .finally(() => {
        upcomingLoaded = true;
        upcomingInflight = null;
      });
  }

  return upcomingInflight;
}

function getPreloadedUpcomingIpos() {
  return upcomingLoaded ? upcomingCached : null;
}

function buildRecommendations(ipos: UpcomingIpo[]) {
  return ipos
    .map(buildRecommendation)
    .sort((a, b) => {
      // Primary: score descending (high → low)
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: days_until ascending (closer first)
      return (a.ipo.days_until ?? 9999) - (b.ipo.days_until ?? 9999);
    });
}

const decisionConfig: Record<
  DecisionLabel,
  {
    labelTh: string;
    labelEn: string;
    fg: string;
    bg: string;
    panel: string;
    border: string;
    barColor: string;
    Icon: typeof TrendingUpRoundedIcon;
  }
> = {
  BUY: {
    labelTh: "แนะนำซื้อ",
    labelEn: "BUY",
    fg: "#166534",
    bg: "#f0fdf4",
    panel: "#ecfdf5",
    border: "#86efac",
    barColor: "#16a34a",
    Icon: TrendingUpRoundedIcon,
  },
  NEUTRAL: {
    labelTh: "ถือ / รอดู",
    labelEn: "NEUTRAL",
    fg: "#92400e",
    bg: "#fffbeb",
    panel: "#fff7ed",
    border: "#fcd34d",
    barColor: "#d97706",
    Icon: RemoveRoundedIcon,
  },
  AVOID: {
    labelTh: "ไม่แนะนำ",
    labelEn: "AVOID",
    fg: "#991b1b",
    bg: "#fef2f2",
    panel: "#fff1f2",
    border: "#fca5a5",
    barColor: "#dc2626",
    Icon: TrendingDownRoundedIcon,
  },
};

const FILTERS: { key: FilterKey; label: string; fg: string; bg: string; border: string }[] = [
  { key: "ALL", label: "ทั้งหมด", fg: colors.ink, bg: "#eef4fb", border: "#cbd5e1" },
  { key: "BUY", label: "แนะนำซื้อ", fg: decisionConfig.BUY.fg, bg: decisionConfig.BUY.bg, border: decisionConfig.BUY.border },
  { key: "NEUTRAL", label: "ถือ/รอ", fg: decisionConfig.NEUTRAL.fg, bg: decisionConfig.NEUTRAL.bg, border: decisionConfig.NEUTRAL.border },
  { key: "AVOID", label: "ไม่แนะนำ", fg: decisionConfig.AVOID.fg, bg: decisionConfig.AVOID.bg, border: decisionConfig.AVOID.border },
];

function formatDate(dateStr: string | null) {
  return formatThaiDate(dateStr);
}

function formatMoney(value: number | null, fallback = "รอข้อมูล") {
  if (value == null) return fallback;
  return `฿${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null, fallback = "รอข้อมูล") {
  if (value == null) return fallback;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function daysLabel(days: number | null) {
  if (days == null) return "รอวันเข้าเทรด";
  if (days < 0) return `เลยกำหนด ${Math.abs(days)} วัน`;
  if (days === 0) return "วันนี้";
  if (days === 1) return "พรุ่งนี้";
  return `อีก ${days} วัน`;
}

function daysTone(days: number | null) {
  if (days == null) return { fg: colors.muted, bg: "#f8fafc", border: "#e2e8f0" };
  if (days < 0 || days <= 3) return { fg: "#be123c", bg: "#fff1f2", border: "#fecdd3" };
  if (days <= 14) return { fg: "#92400e", bg: "#fffbeb", border: "#fde68a" };
  return { fg: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" };
}

function companyDisplayName(rec: Recommendation) {
  return rec.ipo.company_name_th?.trim() || rec.ipo.company_name?.trim() || rec.faCompany?.trim() || "รอชื่อบริษัท";
}

function scoreLabel(score: number) {
  const value = Math.round(score * 100);
  if (value >= 70) return `${value} แข็งแรง`;
  if (value >= 55) return `${value} กลาง`;
  return `${value} ต้องระวัง`;
}

function ScoreRing({ score, color, size = 48, showLabel }: { score: number; color: string; size?: number; showLabel?: boolean }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ * (1 - pct / 100);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 0.25 }}>
      <Box sx={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={3} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontWeight: 850, fontSize: size > 40 ? 14 : 11, color, lineHeight: 1 }}>
            {pct.toFixed(0)}
          </Typography>
        </Box>
      </Box>
      {showLabel ? (
        <Typography sx={{ fontSize: 10, color: "#64748b", fontWeight: 700, lineHeight: 1 }}>
          Score
        </Typography>
      ) : null}
    </Box>
  );
}

function DecisionPill({ decision }: { decision: DecisionLabel }) {
  const cfg = decisionConfig[decision];

  return (
    <Box
      sx={{
        px: 1,
        py: 0.45,
        borderRadius: 1.5,
        bgcolor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.fg,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
      }}
    >
      <cfg.Icon sx={{ fontSize: 15 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 850, lineHeight: 1.2 }}>
        {cfg.labelTh}
      </Typography>
    </Box>
  );
}

function IpoListItem({ rec, selected, onClick }: { rec: Recommendation; selected: boolean; onClick: () => void }) {
  const cfg = decisionConfig[rec.decision];
  const { ipo } = rec;
  const day = daysTone(ipo.days_until);

  return (
    <ButtonBase
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        width: "100%",
        display: "block",
        textAlign: "left",
        p: 1.25,
        borderRadius: 2,
        border: "1px solid",
        borderColor: selected ? cfg.border : colors.borderSoft,
        bgcolor: selected ? cfg.panel : "#ffffff",
        boxShadow: selected ? `inset 3px 0 0 ${cfg.barColor}` : "none",
        transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          bgcolor: selected ? cfg.panel : colors.soft,
          borderColor: selected ? cfg.border : "#cbd5e1",
        },
        "&:focus-visible": {
          outline: `2px solid ${colors.cyan}`,
          outlineOffset: 2,
        },
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
        <ScoreRing score={Math.round(rec.score * 100)} color={cfg.barColor} size={38} showLabel />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography sx={{ fontWeight: 850, fontSize: 15, color: colors.ink, lineHeight: 1.2 }}>
              {ipo.symbol}
            </Typography>
            <Box
              sx={{
                minWidth: 0,
                px: 0.75,
                py: 0.2,
                borderRadius: 1.5,
                bgcolor: day.bg,
                border: `1px solid ${day.border}`,
                color: day.fg,
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1.35,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {daysLabel(ipo.days_until)}
            </Box>
          </Stack>
          <Typography
            sx={{
              mt: 0.35,
              fontSize: 12,
              color: colors.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.35,
            }}
          >
            {companyDisplayName(rec)}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, alignItems: "center" }}>
            <Typography sx={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
              {formatDate(ipo.listing_date)}
            </Typography>
            {ipo.market ? (
              <Typography sx={{ fontSize: 11, color: "#2563eb", fontWeight: 750 }}>
                {ipo.market}
              </Typography>
            ) : null}
          </Stack>
        </Box>
        <DecisionPill decision={rec.decision} />
      </Stack>
    </ButtonBase>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        minHeight: 72,
        px: { xs: 1.25, sm: 1.5 },
        py: 1.15,
        borderRadius: 2,
        bgcolor: "#ffffff",
        border: `1px solid ${colors.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Typography
        sx={{
          minWidth: 0,
          fontSize: { xs: 12, sm: 11 },
          color: "#64748b",
          fontWeight: 750,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.4,
          fontWeight: 850,
          fontSize: { xs: 18, sm: 17 },
          color: color ?? colors.ink,
          lineHeight: 1.2,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function DetailCard({ rec }: { rec: Recommendation }) {
  const cfg = decisionConfig[rec.decision];
  const { ipo } = rec;
  const scoreNum = Math.round(rec.score * 100);
  const day = daysTone(ipo.days_until);

  return (
    <Box
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "#ffffff",
        border: "1px solid",
        borderColor: cfg.border,
        boxShadow: `0 10px 24px ${cfg.barColor}14`,
        height: "100%",
        minHeight: 318,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ height: 4, bgcolor: cfg.barColor }} />
      <Box sx={{ p: { xs: 1.5, md: 2 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-start" } }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
              <Typography sx={{ fontWeight: 900, fontSize: { xs: 22, md: 26 }, color: colors.ink, lineHeight: 1 }}>
                {ipo.symbol}
              </Typography>
              <Chip
                size="small"
                label={daysLabel(ipo.days_until)}
                sx={{
                  height: 24,
                  borderRadius: 1.5,
                  bgcolor: day.bg,
                  border: `1px solid ${day.border}`,
                  color: day.fg,
                  fontSize: 11,
                  fontWeight: 850,
                  "& .MuiChip-label": { px: 1 },
                }}
              />
            </Stack>
            <Typography sx={{ mt: 0.75, fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
              {companyDisplayName(rec)}
            </Typography>
            {ipo.business_description ? (
              <Typography sx={{ mt: 0.35, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                {ipo.business_description}
              </Typography>
            ) : null}
          </Box>
          <DecisionPill decision={rec.decision} />
        </Stack>

        <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: "wrap", rowGap: 0.75 }}>
          <Chip
            label={formatDate(ipo.listing_date)}
            size="small"
            sx={{ height: 24, borderRadius: 1.5, bgcolor: "#f8fafc", border: `1px solid ${colors.borderSoft}`, color: colors.muted, fontWeight: 750 }}
          />
          {ipo.market ? (
            <Chip
              label={ipo.market}
              size="small"
              sx={{ height: 24, borderRadius: 1.5, bgcolor: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontWeight: 750 }}
            />
          ) : null}
          {ipo.sector ? (
            <Chip
              label={ipo.sector}
              size="small"
              sx={{ height: 24, borderRadius: 1.5, bgcolor: "#f5f3ff", border: "1px solid #ddd6fe", color: "#6d28d9", fontWeight: 750 }}
            />
          ) : null}
          {ipo.filing_status && filingStatusConfig[ipo.filing_status] ? (
            <Tooltip title={filingStatusConfig[ipo.filing_status].tooltip} arrow>
              <Chip
                label={filingStatusConfig[ipo.filing_status].label}
                size="small"
                sx={{
                  height: 24,
                  borderRadius: 1.5,
                  bgcolor: filingStatusConfig[ipo.filing_status].bg,
                  border: `1px solid ${filingStatusConfig[ipo.filing_status].border}`,
                  color: filingStatusConfig[ipo.filing_status].fg,
                  fontWeight: 750,
                }}
              />
            </Tooltip>
          ) : null}
        </Stack>

        <Box
          sx={{
            mt: 1.75,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "120px minmax(0, 1fr)" },
            gap: 1.25,
            alignItems: "stretch",
          }}
        >
          <Box
            sx={{
              borderRadius: 2,
              bgcolor: cfg.panel,
              border: `1px solid ${cfg.border}`,
              p: 1.25,
              display: "flex",
              flexDirection: { xs: "row", sm: "column" },
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            <ScoreRing score={scoreNum} color={cfg.barColor} size={54} />
            <Box sx={{ textAlign: { xs: "left", sm: "center" } }}>
              <Typography sx={{ color: cfg.fg, fontSize: 12, fontWeight: 850, lineHeight: 1.25 }}>
                {scoreLabel(rec.score)}
              </Typography>
              <Typography sx={{ color: "#64748b", fontSize: 11, lineHeight: 1.35, mt: 0.25 }}>
                Composite
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(4, minmax(104px, 1fr))",
              },
              gap: 1,
            }}
          >
            <MetricCell label="ราคา IPO" value={formatMoney(ipo.ipo_price ?? ipo.par_value, "รอราคา")} />
            <MetricCell label="Target" value={formatMoney(rec.tpPrice)} color={rec.tpPrice != null ? cfg.fg : "#94a3b8"} />
            <MetricCell
              label="Win Rate"
              value={rec.winRate != null ? `${rec.winRate.toFixed(0)}%` : "รอข้อมูล"}
              color={rec.winRate != null ? (rec.winRate >= 60 ? "#166534" : rec.winRate < 50 ? "#991b1b" : colors.muted) : "#94a3b8"}
            />
            <MetricCell
              label="Avg D1"
              value={formatPercent(rec.avgReturn)}
              color={rec.avgReturn != null ? (rec.avgReturn >= 0 ? "#166534" : "#991b1b") : "#94a3b8"}
            />
          </Box>
        </Box>

        {rec.tpPct != null ? (
          <Box sx={{ mt: 1.5 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
              <Typography sx={{ fontSize: 11, color: colors.muted, fontWeight: 750 }}>Upside target</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 850, color: cfg.fg }}>+{Math.round(rec.tpPct)}%</Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, rec.tpPct * 2)}
              sx={{
                height: 6,
                borderRadius: 1.5,
                bgcolor: "#eef2f7",
                "& .MuiLinearProgress-bar": { borderRadius: 1.5, bgcolor: cfg.barColor },
              }}
            />
          </Box>
        ) : null}

        {(rec.faCompany || rec.faPerson || rec.leadUw) ? (
          <Box
            sx={{
              mt: 1.5,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
              gap: 1,
            }}
          >
            <InfoCell label="FA Company" value={rec.faCompany} />
            <InfoCell label="FA Person" value={rec.faPerson} />
            <InfoCell label="Lead UW" value={rec.leadUw} />
          </Box>
        ) : null}

        {rec.reasons.length > 0 ? (
          <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 0.75 }}>
            {rec.reasons.map((reason) => (
              <Chip
                key={reason}
                label={reason}
                size="small"
                sx={{
                  maxWidth: "100%",
                  height: 24,
                  borderRadius: 1.5,
                  bgcolor: "#ffffff",
                  border: `1px solid ${colors.borderSoft}`,
                  color: colors.muted,
                  fontSize: 11,
                  fontWeight: 750,
                }}
              />
            ))}
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
}

function InfoCell({ label, value }: { label: string; value: string | null }) {
  return (
    <Box sx={{ minWidth: 0, p: 1, borderRadius: 2, bgcolor: colors.soft, border: `1px solid ${colors.borderSoft}` }}>
      <Typography sx={{ fontSize: 10, color: "#64748b", fontWeight: 800, lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.35, color: value ? colors.ink : "#94a3b8", fontSize: 12, fontWeight: 750, lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {value ?? "รอข้อมูล"}
      </Typography>
    </Box>
  );
}

function SkeletonLoader() {
  return (
    <Box sx={{ p: { xs: 1.25, md: 2 }, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "280px minmax(0, 1fr)" } }}>
      <Stack spacing={1}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={76} sx={{ borderRadius: 2 }} />
        ))}
      </Stack>
      <Skeleton variant="rounded" height={352} sx={{ borderRadius: 2 }} />
    </Box>
  );
}

export default function UpcomingIpoHero() {
  const initialRecs = React.useMemo(() => {
    const ipos = getPreloadedUpcomingIpos();
    return ipos ? buildRecommendations(ipos) : null;
  }, []);
  const [recs, setRecs] = React.useState<Recommendation[] | null>(initialRecs);
  const [selectedId, setSelectedId] = React.useState<number | null>(initialRecs?.[0]?.ipo.id ?? null);
  const [filter, setFilter] = React.useState<FilterKey>("ALL");
  const [marketFilter, setMarketFilter] = React.useState<MarketKey>("ALL");

  React.useEffect(() => {
    if (recs !== null) return;

    let active = true;

    preloadUpcomingIpos()
      .then((ipos) => {
        if (!active) return;
        const recommendations = buildRecommendations(ipos);
        setRecs(recommendations);
        if (recommendations.length > 0) setSelectedId(recommendations[0].ipo.id);
      });

    return () => {
      active = false;
    };
  }, [recs]);

  const marketFiltered = React.useMemo(() => {
    if (!recs) return [];
    return marketFilter === "ALL" ? recs : recs.filter((r) => r.ipo.market === marketFilter);
  }, [marketFilter, recs]);

  const filtered = React.useMemo(() => {
    return filter === "ALL" ? marketFiltered : marketFiltered.filter((r) => r.decision === filter);
  }, [filter, marketFiltered]);

  const counts = React.useMemo<Counts | null>(() => {
    if (!recs) return null;
    return {
      buy: marketFiltered.filter((r) => r.decision === "BUY").length,
      neutral: marketFiltered.filter((r) => r.decision === "NEUTRAL").length,
      avoid: marketFiltered.filter((r) => r.decision === "AVOID").length,
    };
  }, [recs, marketFiltered]);

  const selected = filtered.find((r) => r.ipo.id === selectedId) ?? filtered[0] ?? null;
  const selectedIdx = selected ? filtered.findIndex((r) => r.ipo.id === selected.ipo.id) : -1;
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx >= 0 && selectedIdx < filtered.length - 1;

  if (recs !== null && recs.length === 0) return null;

  return (
    <Box>
      <Box>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderBottom: `1px solid ${colors.borderSoft}`, bgcolor: "#f8fbfd" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip
              label={recs ? `${recs.length} ตัว` : "กำลังโหลด"}
              size="small"
              sx={{ height: 22, borderRadius: 1, bgcolor: colors.ink, color: colors.cyan, fontSize: 11, fontWeight: 850 }}
            />
            <Typography sx={{ color: colors.muted, fontSize: 12, lineHeight: 1.45 }}>
              รายการ IPO ที่กำลังจะเข้าเทรด
            </Typography>
          </Stack>
        </Box>

        {recs && recs.length > 1 ? (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.25}
            sx={{
              alignItems: { xs: "stretch", md: "center" },
              justifyContent: "space-between",
              p: { xs: 1.25, md: 1.5 },
              borderBottom: `1px solid ${colors.borderSoft}`,
              bgcolor: colors.soft,
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, alignItems: "center" }}>
              <Select
                size="small"
                value={marketFilter}
                onChange={(e) => {
                  const mk = e.target.value as MarketKey;
                  setMarketFilter(mk);
                  setFilter("ALL");
                  const newList = mk === "ALL" ? recs : recs.filter((r) => r.ipo.market === mk);
                  if (newList.length > 0) setSelectedId(newList[0].ipo.id);
                }}
                sx={{
                  height: 30,
                  minWidth: 130,
                  fontSize: 12,
                  fontWeight: 750,
                  borderRadius: 1.5,
                  color: "#0369a1",
                  bgcolor: "#ffffff",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.border },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#7dd3fc" },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#7dd3fc" },
                  "& .MuiSelect-select": { py: 0.5, px: 1.5 },
                }}
              >
                {(["ALL", "SET", "mai"] as MarketKey[]).map((mk) => {
                  const mCount = mk === "ALL" ? recs.length : recs.filter((r) => r.ipo.market === mk).length;
                  if (mk !== "ALL" && !mCount) return null;
                  return (
                    <MenuItem key={mk} value={mk} sx={{ fontSize: 12, fontWeight: 750 }}>
                      {mk === "ALL" ? "ทุกตลาด" : mk} ({mCount})
                    </MenuItem>
                  );
                })}
              </Select>
              {FILTERS.map((f) => {
                const count = f.key === "ALL" ? marketFiltered.length : f.key === "BUY" ? counts?.buy : f.key === "NEUTRAL" ? counts?.neutral : counts?.avoid;
                if (f.key !== "ALL" && !count) return null;
                const active = filter === f.key;

                return (
                  <Chip
                    key={f.key}
                    label={`${f.label} (${count})`}
                    size="small"
                    onClick={() => {
                      setFilter(f.key);
                      const newFiltered = f.key === "ALL" ? marketFiltered : marketFiltered.filter((r) => r.decision === f.key);
                      if (newFiltered.length > 0) setSelectedId(newFiltered[0].ipo.id);
                    }}
                    sx={{
                      height: 30,
                      borderRadius: 1.5,
                      fontSize: 12,
                      fontWeight: active ? 850 : 750,
                      bgcolor: active ? f.bg : "#ffffff",
                      color: active ? f.fg : colors.muted,
                      border: `1px solid ${active ? f.border : colors.border}`,
                      cursor: "pointer",
                      "&:hover": { bgcolor: f.bg, color: f.fg, borderColor: f.border },
                    }}
                  />
                );
              })}
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: { xs: "space-between", md: "flex-end" }, flexShrink: 0 }}>
              <Tooltip title="รายการก่อนหน้า">
                <span>
                  <IconButton
                    size="small"
                    aria-label="previous upcoming IPO"
                    disabled={!canPrev}
                    onClick={() => {
                      if (canPrev) setSelectedId(filtered[selectedIdx - 1].ipo.id);
                    }}
                    sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "#ffffff", border: `1px solid ${colors.border}`, "&:hover": { bgcolor: "#eef4fb" } }}
                  >
                    <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="รายการถัดไป">
                <span>
                  <IconButton
                    size="small"
                    aria-label="next upcoming IPO"
                    disabled={!canNext}
                    onClick={() => {
                      if (canNext) setSelectedId(filtered[selectedIdx + 1].ipo.id);
                    }}
                    sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "#ffffff", border: `1px solid ${colors.border}`, "&:hover": { bgcolor: "#eef4fb" } }}
                  >
                    <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
        ) : null}

        {recs === null ? (
          <SkeletonLoader />
        ) : recs.length === 1 && selected ? (
          <Box sx={{ p: { xs: 1.25, md: 2 } }}>
            <DetailCard rec={selected} />
          </Box>
        ) : (
          <Box
            sx={{
              p: { xs: 1.25, md: 2 },
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", md: "280px minmax(0, 1fr)" },
              alignItems: "stretch",
            }}
          >
            <Box
              sx={{
                minWidth: 0,
                display: { xs: "flex", md: "block" },
                gap: 1,
                overflowX: { xs: "auto", md: "visible" },
                overflowY: { md: "auto" },
                maxHeight: { md: 464 },
                pr: { md: 0.5 },
                pb: { xs: 0.5, md: 0 },
                "&::-webkit-scrollbar": { width: 4, height: 4 },
                "&::-webkit-scrollbar-thumb": { bgcolor: "#cbd5e1", borderRadius: 1 },
              }}
            >
              {filtered.length === 0 ? (
                <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, p: 2, color: "#64748b", fontSize: 13, textAlign: "center" }}>
                  ไม่มี IPO ในหมวดนี้
                </Box>
              ) : (
                <Stack spacing={0.75} direction={{ xs: "row", md: "column" }} sx={{ minWidth: { xs: "max-content", md: "auto" } }}>
                  {filtered.map((rec) => (
                    <Box key={rec.ipo.id} sx={{ minWidth: { xs: 268, md: "auto" } }}>
                      <IpoListItem rec={rec} selected={rec.ipo.id === selected?.ipo.id} onClick={() => setSelectedId(rec.ipo.id)} />
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Box sx={{ minWidth: 0 }}>
              {selected ? (
                <DetailCard rec={selected} />
              ) : (
                <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, p: 3, color: "#64748b", fontSize: 14, textAlign: "center" }}>
                  เลือก IPO จากรายการ
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
