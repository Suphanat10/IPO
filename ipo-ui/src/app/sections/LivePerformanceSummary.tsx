"use client";

import * as React from "react";
import {
  Box,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import HorizontalRuleRoundedIcon from "@mui/icons-material/HorizontalRuleRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useAnalysis } from "../lib/AnalysisContext";
import {
  faCompaniesSummary,
  faPersonsSummary,
  leadCoSummary,
  leadUnderwritersSummary,
} from "../lib/mockData";
import type { BucketScore, DecisionLabel } from "../lib/scoring";
import { computePerformanceScores } from "../lib/scoring";
import { computeLeadCoStats, parseCoList } from "../lib/leadCoStats";
import { generateFAConclusion, generateLeadCoConclusion } from "../lib/ipoAnalytics";
import { computeFundamentalFactors, computeIpoScore } from "../lib/fundamentalFactors";

type Tone = "positive" | "negative" | "neutral" | "muted";

const toneColors: Record<Tone, { fg: string; bg: string; border: string }> = {
  positive: { fg: "#166534", bg: "#dcfce7", border: "#bbf7d0" },
  negative: { fg: "#991b1b", bg: "#fee2e2", border: "#fecaca" },
  neutral: { fg: "#9a3412", bg: "#ffedd5", border: "#fed7aa" },
  muted: { fg: "#475569", bg: "#f1f5f9", border: "#e2e8f0" },
};

function toneFromDecision(d: DecisionLabel): Tone {
  if (d === "BUY") return "positive";
  if (d === "NEUTRAL") return "neutral";
  return "negative";
}

function fmtPct(v: number | null | undefined, decimals = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(decimals)}%`;
}

function fmtNum(v: number | null | undefined, decimals = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function toneFromProbability(v: number | null | undefined): Tone {
  if (v == null || Number.isNaN(v)) return "muted";
  if (v >= 65) return "positive";
  if (v >= 50) return "neutral";
  return "negative";
}

function toneFromReturn(v: number | null | undefined): Tone {
  if (v == null || Number.isNaN(v)) return "muted";
  return v >= 0 ? "positive" : "negative";
}

function toneFromDownside(v: number | null | undefined): Tone {
  if (v == null || Number.isNaN(v)) return "muted";
  if (v <= 10) return "positive";
  if (v <= 20) return "neutral";
  return "negative";
}

function toneFromSample(v: number | null | undefined): Tone {
  if (v == null || Number.isNaN(v)) return "muted";
  if (v >= 20) return "positive";
  if (v >= 8) return "neutral";
  return "negative";
}

function MetricLine({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  const c = toneColors[tone];
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", justifyContent: "space-between", py: 0.5 }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
        {label}
      </Typography>
      <Box
        sx={{
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: c.bg,
          border: "1px solid",
          borderColor: c.border,
        }}
      >
        <Typography variant="body2" sx={{ color: c.fg, fontWeight: 700, lineHeight: 1.2 }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

function DecisionBadge({ decision, small }: { decision: DecisionLabel; small?: boolean }) {
  const c = toneColors[toneFromDecision(decision)];
  return (
    <Box
      sx={{
        px: small ? 0.75 : 1,
        py: 0.25,
        borderRadius: 1,
        bgcolor: c.fg,
        color: "#fff",
        fontSize: small ? 10 : 11,
        fontWeight: 800,
        letterSpacing: "0.05em",
      }}
    >
      {decision}
    </Box>
  );
}

function decisionLabel(decision: DecisionLabel) {
  if (decision === "BUY") return "น่าลงทุน";
  if (decision === "NEUTRAL") return "พิจารณาเพิ่ม";
  return "ควรระวัง";
}

function ComboMetric({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  const c = toneColors[tone];
  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 1.25,
        border: "1px solid",
        borderColor: c.border,
        bgcolor: c.bg,
        px: 1,
        py: 0.75,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: "block",
          color: "text.secondary",
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          mt: 0.25,
          color: c.fg,
          fontWeight: 800,
          lineHeight: 1.2,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function ComboInsightCard({
  title,
  combo,
  metrics,
}: {
  title: string;
  combo: { score: number; decision: DecisionLabel } | null;
  metrics: Array<{ label: string; value: React.ReactNode; tone?: Tone }>;
}) {
  if (!combo) {
    return (
      <Box
        sx={{
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: "#f8fafc",
          p: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            N/A
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          ข้อมูลไม่ครบสำหรับการจับคู่
        </Typography>
      </Box>
    );
  }

  const tone = toneFromDecision(combo.decision);
  const c = toneColors[tone];
  const score = Math.max(0, Math.min(100, combo.score * 100));
  const Icon =
    tone === "positive"
      ? TrendingUpRoundedIcon
      : tone === "negative"
        ? TrendingDownRoundedIcon
        : HorizontalRuleRoundedIcon;

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: c.border,
        bgcolor: "#fff",
        p: 1.5,
        boxShadow: "0 1px 2px rgba(10,25,41,0.04)",
      }}
    >
      <Stack spacing={1.25}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: 1.5,
                bgcolor: c.bg,
                color: c.fg,
                border: "1px solid",
                borderColor: c.border,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon sx={{ fontSize: 18 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, lineHeight: 1.2, overflowWrap: "anywhere" }}
              >
                {title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Combination signal
              </Typography>
            </Box>
          </Stack>
          <Box
            sx={{
              alignSelf: { xs: "flex-start", sm: "center" },
              px: 1,
              py: 0.4,
              borderRadius: 1,
              bgcolor: c.fg,
              color: "#fff",
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            {decisionLabel(combo.decision)} ({combo.decision})
          </Box>
        </Stack>

        <Box>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
              Score
            </Typography>
            <Typography variant="caption" sx={{ color: c.fg, fontWeight: 800 }}>
              {score.toFixed(2)} / 100
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={score}
            sx={{
              height: 7,
              borderRadius: 999,
              bgcolor: "#e2e8f0",
              "& .MuiLinearProgress-bar": { bgcolor: c.fg, borderRadius: 999 },
            }}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 0.75,
            gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.max(1, metrics.length)}, minmax(0, 1fr))` },
          }}
        >
          {metrics.map((metric) => (
            <ComboMetric key={metric.label} {...metric} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

function ComboRow({
  label,
  combo,
  note,
}: {
  label: string;
  combo: { score: number; decision: DecisionLabel } | null;
  note?: string;
}) {
  if (!combo) {
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", py: 0.5 }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
          ข้อมูลไม่ครบ
        </Typography>
      </Stack>
    );
  }
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", justifyContent: "space-between", py: 0.5 }}
    >
      <Stack spacing={0}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {note ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            {note}
          </Typography>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {(combo.score * 100).toFixed(0)}/100
        </Typography>
        <DecisionBadge decision={combo.decision} small />
      </Stack>
    </Stack>
  );
}

function BucketCard({
  title,
  subtitle,
  bucket,
}: {
  title: string;
  subtitle?: string;
  bucket: BucketScore | null;
}) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        p: 1.25,
        bgcolor: "#fafbfd",
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.1em" }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", lineHeight: 1.2, wordBreak: "break-word" }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {bucket ? <DecisionBadge decision={bucket.decision} /> : null}
      </Stack>
      {bucket ? (
        <>
          <MetricLine
            label="Score"
            value={`${(bucket.score * 100).toFixed(0)} / 100`}
            tone={toneFromDecision(bucket.decision)}
          />
          <MetricLine
            label="P(Close > IPO)"
            value={fmtPct(bucket.prob, 1)}
            tone={
              bucket.prob == null
                ? "muted"
                : bucket.prob >= 65
                  ? "positive"
                  : bucket.prob >= 50
                    ? "neutral"
                    : "negative"
            }
          />
          <MetricLine
            label="Avg Return D1"
            value={fmtPct(bucket.avgRet, 2)}
            tone={
              bucket.avgRet == null
                ? "muted"
                : bucket.avgRet >= 0
                  ? "positive"
                  : "negative"
            }
          />
          <MetricLine
            label="Downside risk"
            value={fmtPct(bucket.downside, 1)}
            tone={
              bucket.downside == null
                ? "muted"
                : bucket.downside <= 10
                  ? "positive"
                  : bucket.downside <= 20
                    ? "neutral"
                    : "negative"
            }
          />
          <MetricLine label="Sample" value={`n = ${bucket.sample}`} />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
          ยังไม่ได้เลือกข้อมูล
        </Typography>
      )}
    </Box>
  );
}

function FundamentalCard({
  bucket,
}: {
  bucket: ReturnType<typeof computePerformanceScores>["fin"];
}) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        p: 1.25,
        bgcolor: "#fafbfd",
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.1em" }}>
          ปัจจัยพื้นฐาน
        </Typography>
        {bucket ? <DecisionBadge decision={bucket.decision} /> : null}
      </Stack>
      {bucket ? (
        <>
          <MetricLine
            label="Score"
            value={`${(bucket.score * 100).toFixed(0)} / 100`}
            tone={toneFromDecision(bucket.decision)}
          />
          <Stack spacing={0.5} sx={{ mt: 0.75 }}>
            {bucket.checks.map((c) => (
              <Stack
                key={c.label}
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  {c.pass ? (
                    <CheckRoundedIcon sx={{ fontSize: 14, color: "success.main" }} />
                  ) : (
                    <CloseRoundedIcon sx={{ fontSize: 14, color: "error.main" }} />
                  )}
                  <Typography variant="caption">{c.label}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {c.value}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
          กรอก ROE/DE/PE เพื่อดูคะแนนปัจจัยพื้นฐาน
        </Typography>
      )}
    </Box>
  );
}

export default function LivePerformanceSummary() {
  const { fa, leadCo, fundamental } = useAnalysis();
  const [tab, setTab] = React.useState(0);

  const personRow = React.useMemo(
    () => (fa.person ? faPersonsSummary.find((r) => r.name === fa.person) : undefined),
    [fa.person],
  );
  const companyRow = React.useMemo(
    () => (fa.company ? faCompaniesSummary.find((r) => r.name === fa.company) : undefined),
    [fa.company],
  );
  const leadRow = React.useMemo(
    () =>
      leadCo.lead ? leadUnderwritersSummary.find((r) => r.name === leadCo.lead) : undefined,
    [leadCo.lead],
  );
  const coList = React.useMemo(() => parseCoList(leadCo.co), [leadCo.co]);
  const pairRow = React.useMemo(
    () =>
      leadCo.lead && coList[0]
        ? leadCoSummary.find((r) => r.name === leadCo.lead && r.co === coList[0])
        : undefined,
    [leadCo.lead, coList],
  );
  const leadCoMatchedStats = React.useMemo(
    () => (leadCo.lead ? computeLeadCoStats(leadCo.lead, coList) : null),
    [leadCo.lead, coList],
  );

  const faConclusion = React.useMemo(
    () => (fa.person || fa.company ? generateFAConclusion(fa.person, fa.company) : undefined),
    [fa.person, fa.company],
  );

  const leadCoConclusion = React.useMemo(
    () =>
      leadCo.lead || leadCo.co
        ? generateLeadCoConclusion(leadCo.lead, leadCo.co)
        : undefined,
    [leadCo.lead, leadCo.co],
  );

  const ipoScore = React.useMemo(() => {
    const { factors } = computeFundamentalFactors(fundamental.computed, fundamental.raw);
    return computeIpoScore(factors);
  }, [fundamental.computed, fundamental.raw]);

  const scores = React.useMemo(
    () =>
      computePerformanceScores({
        personRow,
        companyRow,
        leadRow,
        pairRow,
        fundamental: fundamental.computed,
        faConclusion: faConclusion ?? undefined,
        leadCoConclusion: leadCoConclusion ?? undefined,
        ipoFactorScore: ipoScore.factorsWithData > 0 ? ipoScore.normalizedScore : null,
      }),
    [personRow, companyRow, leadRow, pairRow, fundamental.computed, faConclusion, leadCoConclusion, ipoScore],
  );

  const { overall, combos, fa: faBucket, uw: uwBucket, fin: finBucket, factorsUsed } = scores;

  const overallTone: Tone = overall ? toneFromDecision(overall.decision) : "muted";
  const overallLabel = overall ? overall.decision : "รอข้อมูล";
  const progressValue = overall ? Math.max(5, Math.min(100, overall.score * 100)) : 0;
  const OverallIcon =
    overallTone === "positive"
      ? TrendingUpRoundedIcon
      : overallTone === "negative"
        ? TrendingDownRoundedIcon
        : HorizontalRuleRoundedIcon;

  const overallDesc = overall
    ? overall.decision === "BUY"
      ? factorsUsed.length === 3
        ? "หุ้นตัวนี้มีสถิติที่แข็งแกร่งครบทุกมิติ (FA, ผู้จัดจำหน่าย, และปัจจัยพื้นฐาน) โอกาสเปิดบวกสูง"
        : `หุ้นตัวนี้มีสถิติที่แข็งแกร่งจากมิติที่ประเมิน (${factorsUsed.join(", ")}) โอกาสเปิดบวกสูง`
      : overall.decision === "NEUTRAL"
        ? "หุ้นมีความเสี่ยงปานกลาง ควรประเมินความเสี่ยงจากสภาวะตลาด ประกอบการตัดสินใจ"
        : "หุ้นขาดปัจจัยสนับสนุนที่ชัดเจนและมีสถิติเชิงลบมากกว่าเชิงบวก มีความเสี่ยงสูงที่จะทำผลงานได้ต่ำกว่าราคาจองในวันแรก"
    : "กรอกข้อมูลด้านซ้ายเพื่อให้ระบบประเมินทันที";

  const c = toneColors[overallTone];

  const completion = React.useMemo(() => {
    const checks = [
      fa.person || fa.company,
      leadCo.lead,
      leadCo.co,
      fundamental.computed.roe != null,
      fundamental.computed.de != null,
      fundamental.computed.pe != null,
      fundamental.computed.marketCap != null,
    ];
    const filled = checks.filter(Boolean).length;
    return { filled, total: checks.length };
  }, [fa, leadCo, fundamental.computed]);

  const faUwWinProb = avgNonNull([faBucket?.prob ?? null, uwBucket?.prob ?? null]);
  const faUwAvgReturn = avgNonNull([faBucket?.avgRet ?? null, uwBucket?.avgRet ?? null]);
  const faWinProb = faBucket?.prob ?? null;
  const uwWinProb = uwBucket?.prob ?? null;

  return (
    <Paper
      elevation={0}
      sx={{ borderRadius: 3, overflow: "hidden", backgroundColor: "#fff" }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          background:
            "#0a1929", // subtle overlay to make the header stand out more
          color: "#fff",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
          {/* <AutoAwesomeRoundedIcon fontSize="small" /> */}
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.1em" }}>
            Performance Summary
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          ผลรวมจาก FA, Underwriter, และปัจจัยพื้นฐาน
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          minHeight: 36,
          "& .MuiTab-root": { minHeight: 36, fontSize: 11, fontWeight: 700, px: 0.5 },
        }}
      >
        <Tab label="Overall" />
        <Tab label="FA" />
        <Tab label="Lead-Co" />
        <Tab label="Fundamental" />
      </Tabs>

      <Box sx={{ p: 2 }}>
        {tab === 0 ? (
          <Stack spacing={1.5}>
            <Box
              sx={{
                p: 1.75,
                borderRadius: 2,
                bgcolor: c.bg,
                border: "1px solid",
                borderColor: c.border,
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 0.75 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    bgcolor: c.fg,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <OverallIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: c.fg, fontWeight: 700 }}>
                    OVERALL PERFORMANCE SUMMARY
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ color: c.fg, fontWeight: 800, lineHeight: 1.1 }}
                  >
                    {overallLabel}
                  </Typography>
                </Box>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progressValue}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.6)",
                  "& .MuiLinearProgress-bar": { bgcolor: c.fg },
                }}
              />
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", mt: 0.5, color: c.fg }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  OVERALL SCORE
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {overall ? `${(overall.score * 100).toFixed(2)} / 100` : "—"}
                </Typography>
              </Stack>
            </Box>

            <Box
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "#fafbfd",
                p: 1.5,
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={0.75}
                sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, mb: 1.25 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="overline"
                    sx={{ fontWeight: 800, letterSpacing: "0.08em", display: "block", lineHeight: 1.2 }}
                  >
                    การวิเคราะห์แบบจับคู่ปัจจัย (Combinations)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    แยกดูแต่ละคู่เพื่อเทียบ score, โอกาสปิดบวก และผลตอบแทนวันแรก
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={`${[combos.faUw, combos.faFin, combos.uwFin].filter(Boolean).length} / 3 คู่พร้อมวิเคราะห์`}
                  sx={{
                    alignSelf: { xs: "flex-start", sm: "center" },
                    height: 24,
                    bgcolor: c.bg,
                    color: c.fg,
                    border: `1px solid ${c.border}`,
                    fontWeight: 800,
                  }}
                />
              </Stack>
              <Stack spacing={1}>
                <ComboInsightCard
                  title="FA + Underwriter"
                  combo={combos.faUw}
                  metrics={[
                    {
                      label: "โอกาสปิดบวกวันแรก",
                      value: fmtPct(faUwWinProb, 2),
                      tone: toneFromProbability(faUwWinProb),
                    },
                    {
                      label: "ผลตอบแทนเฉลี่ย",
                      value: fmtPct(faUwAvgReturn, 2),
                      tone: toneFromReturn(faUwAvgReturn),
                    },
                  ]}
                />
                <ComboInsightCard
                  title="FA + Fundamental"
                  combo={combos.faFin}
                  metrics={[
                    {
                      label: "โอกาสปิดบวกวันแรก (ฝั่ง FA)",
                      value: fmtPct(faWinProb, 2),
                      tone: toneFromProbability(faWinProb),
                    },
                  ]}
                />
                <ComboInsightCard
                  title="Underwriter + Fundamental"
                  combo={combos.uwFin}
                  metrics={[
                    {
                      label: "โอกาสปิดบวกวันแรก (ฝั่ง UW)",
                      value: fmtPct(uwWinProb, 2),
                      tone: toneFromProbability(uwWinProb),
                    },
                  ]}
                />
              </Stack>
            </Box>

            {factorsUsed.length > 0 ? (
              <Box
                sx={{
                  borderTop: "1px dashed",
                  borderBottom: "1px dashed",
                  borderColor: "divider",
                  py: 1,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                  สรุปทิศทางจากปัจจัยที่มีข้อมูล ({factorsUsed.join(" + ")})
                </Typography>
                <Stack
                  spacing={0.25}
                  sx={{ mt: 0.5, fontFamily: "monospace", fontSize: 12 }}
                >
                  <Box>
                    - โอกาสปิดบวกวันแรกเฉลี่ย ≈{" "}
                    {fmtPct(
                      avgNonNull([
                        faBucket?.prob ?? null,
                        uwBucket?.prob ?? null,
                      ]),
                      2,
                    )}
                  </Box>
                  <Box>
                    - ผลตอบแทนเฉลี่ยวันแรก ≈{" "}
                    {fmtPct(
                      avgNonNull([
                        faBucket?.avgRet ?? null,
                        uwBucket?.avgRet ?? null,
                      ]),
                      2,
                    )}
                  </Box>
                </Stack>
              </Box>
            ) : null}

            <Box>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, display: "block", color: c.fg }}
              >
                คะแนนรวมเฉลี่ย (OVERALL SCORE):{" "}
                {overall ? `${(overall.score * 100).toFixed(2)} / 100` : "—"}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, display: "block", mt: 0.5, color: c.fg }}
              >
                สรุปคำแนะนำ: {overallLabel}{" "}
                {overall?.decision === "BUY"
                  ? "(น่าลงทุน)"
                  : overall?.decision === "NEUTRAL"
                    ? "(พิจารณาความเสี่ยงเพิ่มเติม)"
                    : overall?.decision === "AVOID"
                      ? "(ควรหลีกเลี่ยงหรือระมัดระวังเป็นพิเศษ)"
                      : ""}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                &gt;&gt; {overallDesc}
              </Typography>
            </Box>

            <Box>
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  ความครบถ้วนของข้อมูล
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {completion.filled} / {completion.total}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={(completion.filled / completion.total) * 100}
                sx={{ height: 6, borderRadius: 3 }}
              />
              {factorsUsed.length > 0 ? (
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", mt: 0.75 }}>
                  {factorsUsed.map((f) => (
                    <Chip
                      key={f}
                      size="small"
                      label={f}
                      sx={{
                        height: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: c.bg,
                        color: c.fg,
                        border: `1px solid ${c.border}`,
                      }}
                    />
                  ))}
                </Stack>
              ) : null}
            </Box>
          </Stack>
        ) : null}

        {tab === 1 ? (
          faConclusion && faConclusion.found ? (
            <Stack spacing={1.5}>
              <Box
                sx={{
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  p: 1.5,
                  bgcolor: "#fafbfd",
                }}
              >
                <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.1em" }}>
                  FA Summary
                </Typography>
                {fa.person ? (
                  <Typography variant="caption" sx={{ display: "block", color: "text.secondary", wordBreak: "break-word" }}>
                    Person: {fa.person}
                  </Typography>
                ) : null}
                {fa.company ? (
                  <Typography variant="caption" sx={{ display: "block", color: "text.secondary", wordBreak: "break-word" }}>
                    Company: {fa.company}
                  </Typography>
                ) : null}
              </Box>

              <MetricLine
                label="โอกาสปิดบวกวันแรก"
                value={fmtPct(faConclusion.summary?.prob_close_above_ipo)}
                tone={
                  (faConclusion.summary?.prob_close_above_ipo ?? 0) >= 65
                    ? "positive"
                    : (faConclusion.summary?.prob_close_above_ipo ?? 0) >= 50
                      ? "neutral"
                      : "negative"
                }
              />
              <MetricLine
                label="ผลตอบแทนเฉลี่ยวันแรก"
                value={fmtPct(faConclusion.summary?.avg_return_close_d1)}
                tone={
                  (faConclusion.summary?.avg_return_close_d1 ?? 0) >= 0
                    ? "positive"
                    : "negative"
                }
              />
              <MetricLine
                label="โอกาสขาดทุนเกิน -20%"
                value={fmtPct(faConclusion.risk?.downside_freq_20)}
                tone={
                  (faConclusion.risk?.downside_freq_20 ?? 0) <= 10
                    ? "positive"
                    : (faConclusion.risk?.downside_freq_20 ?? 0) <= 20
                      ? "neutral"
                      : "negative"
                }
              />
              <MetricLine label="จำนวน IPO" value={`n = ${faConclusion.sampleSize}`} />

              <Box
                sx={{
                  mt: 0.5,
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: faConclusion.decision === "BUY" ? "#dcfce7" : "#fee2e2",
                  border: "1px solid",
                  borderColor: faConclusion.decision === "BUY" ? "#bbf7d0" : "#fecaca",
                  textAlign: "center",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 800,
                    color: faConclusion.decision === "BUY" ? "#166534" : "#991b1b",
                    fontSize: 13,
                  }}
                >
                  {faConclusion.decisionLabel}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: faConclusion.decision === "BUY" ? "#166534" : "#991b1b",
                  }}
                >
                  Score: {(faConclusion.score * 100).toFixed(2)} / 100
                </Typography>
              </Box>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              ยังไม่ได้เลือกข้อมูล
            </Typography>
          )
        ) : null}

        {tab === 2 ? (
          uwBucket ? (
            (() => {
              const tone = toneFromDecision(uwBucket.decision);
              const c2 = toneColors[tone];
              const scoreValue = Math.max(0, Math.min(100, uwBucket.score * 100));
              const RecommendationIcon =
                tone === "positive"
                  ? TrendingUpRoundedIcon
                  : tone === "negative"
                    ? TrendingDownRoundedIcon
                    : HorizontalRuleRoundedIcon;
              const recommendation =
                leadCoConclusion?.decisionLabel ??
                (uwBucket.decision === "BUY"
                  ? "แนะนำให้เข้าลงทุน IPO ตัวนี้"
                  : uwBucket.decision === "NEUTRAL"
                    ? "ควรพิจารณาความเสี่ยงเพิ่มเติมก่อนลงทุน IPO ตัวนี้"
                    : "ไม่แนะนำให้เข้าลงทุน IPO ตัวนี้");

              return (
                <Stack spacing={1.5}>
                  <Box
                    sx={{
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "#fafbfd",
                      p: 1.5,
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.25}
                      sx={{
                        justifyContent: "space-between",
                        alignItems: { xs: "stretch", sm: "center" },
                        mb: 1.25,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="overline"
                          sx={{ display: "block", fontWeight: 800, letterSpacing: "0.08em", lineHeight: 1.2 }}
                        >
                          Lead-Co Underwriter
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          สรุปจากสถิติ IPO ย้อนหลังของผู้จัดจำหน่าย
                        </Typography>
                      </Box>
                      <DecisionBadge decision={uwBucket.decision} />
                    </Stack>

                    <Stack spacing={1}>
                      {leadCo.lead ? (
                        <Box
                          sx={{
                            borderRadius: 1.5,
                            border: "1px solid",
                            borderColor: "#dbeafe",
                            bgcolor: "#eff6ff",
                            px: 1.25,
                            py: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "#1e3a8a", fontWeight: 800 }}
                          >
                            Lead Underwriter
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                            {leadCo.lead}
                          </Typography>
                        </Box>
                      ) : null}

                      {coList.length > 0 ? (
                        <Box
                          sx={{
                            borderRadius: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            bgcolor: "#fff",
                            px: 1.25,
                            py: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary", fontWeight: 800 }}
                          >
                            Co Underwriter
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                            {coList.map((co) => (
                              <Chip
                                key={co}
                                size="small"
                                label={co}
                                sx={{
                                  height: "auto",
                                  minHeight: 24,
                                  maxWidth: "100%",
                                  borderRadius: 1,
                                  bgcolor: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  "& .MuiChip-label": {
                                    whiteSpace: "normal",
                                    py: 0.35,
                                    lineHeight: 1.25,
                                  },
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : null}
                    </Stack>
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gap: 1,
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    }}
                  >
                    <ComboMetric
                      label="โอกาสปิดบวกวันแรก"
                      value={fmtPct(uwBucket.prob, 2)}
                      tone={toneFromProbability(uwBucket.prob)}
                    />
                    <ComboMetric
                      label="ผลตอบแทนเฉลี่ยวันแรก"
                      value={fmtPct(uwBucket.avgRet, 2)}
                      tone={toneFromReturn(uwBucket.avgRet)}
                    />
                    <ComboMetric
                      label="โอกาสขาดทุนเกิน -20%"
                      value={fmtPct(uwBucket.downside, 2)}
                      tone={toneFromDownside(uwBucket.downside)}
                    />
                    <ComboMetric
                      label="จำนวน IPO ที่ใช้วิเคราะห์"
                      value={uwBucket.sample.toLocaleString()}
                      tone={toneFromSample(uwBucket.sample)}
                    />
                  </Box>

                  <Box
                    sx={{
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: c2.border,
                      bgcolor: c2.bg,
                      p: 1.5,
                    }}
                  >
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1.5,
                          bgcolor: c2.fg,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <RecommendationIcon fontSize="small" />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ display: "block", color: c2.fg, fontWeight: 800 }}>
                          คำแนะนำจาก Lead-Co
                        </Typography>
                        <Typography variant="body1" sx={{ color: c2.fg, fontWeight: 800, lineHeight: 1.25 }}>
                          {recommendation}
                        </Typography>
                      </Box>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={scoreValue}
                      sx={{
                        height: 7,
                        borderRadius: 999,
                        bgcolor: "rgba(255,255,255,0.65)",
                        "& .MuiLinearProgress-bar": { bgcolor: c2.fg, borderRadius: 999 },
                      }}
                    />
                    <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.5, color: c2.fg }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        Score
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        {scoreValue.toFixed(2)} / 100
                      </Typography>
                    </Stack>
                  </Box>
                </Stack>
              );
            })()
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              ไม่มีการวิเคราะห์ในส่วน Lead-Co Underwriter
            </Typography>
          )
        ) : null}

        {tab === 3 ? (
          ipoScore.factorsWithData === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              กรอกข้อมูลใน &quot;วิเคราะห์ปัจจัยหุ้นพื้นฐาน&quot; เพื่อดูผลประเมิน
            </Typography>
          ) : (() => {
            const tone = toneFromDecision(ipoScore.label);
            const c3 = toneColors[tone];
            return (
              <Stack spacing={1.25}>
                <Box
                  sx={{
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: c3.border,
                    bgcolor: c3.bg,
                    p: 1.5,
                  }}
                >
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                    <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.08em", color: c3.fg }}>
                      Fundamental Score
                    </Typography>
                    <DecisionBadge decision={ipoScore.label} />
                  </Stack>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: c3.fg, lineHeight: 1.1 }}>
                    {ipoScore.rawScore.toFixed(2)}
                    <Typography component="span" variant="caption" sx={{ fontWeight: 600, ml: 0.5 }}>
                      / 100
                    </Typography>
                  </Typography>
                </Box>
                <Box
                  sx={{
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    p: 1.5,
                    bgcolor: "#fafbfd",
                    fontFamily: "monospace",
                    fontSize: 13,
                  }}
                >
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 13 }}>
                    คะแนนวิเคราะห์ปัจจัยพื้นฐานและโครงสร้าง IPO (Fundamental Score):{" "}
                    <b>{ipoScore.rawScore.toFixed(2)} / 100</b>
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 13, mt: 0.5 }}>
                    <b>แนวโน้ม:</b> {ipoScore.thaiTrend}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 13 }}>
                    <b>คำแนะนำ:</b> {ipoScore.thaiRecommendation}
                  </Typography>
                </Box>
              </Stack>
            );
          })()
        ) : null}
      </Box>
    </Paper>
  );
}

function avgNonNull(vals: Array<number | null>): number | null {
  const filtered = vals.filter((v) => v != null && !Number.isNaN(v)) as number[];
  if (filtered.length === 0) return null;
  return filtered.reduce((s, v) => s + v, 0) / filtered.length;
}
