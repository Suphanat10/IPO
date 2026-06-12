"use client";

import * as React from "react";
import {
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import Link from "next/link";
import { toDateOnly } from "@/lib/date-format";
import type { UpcomingRow } from "@/lib/admin/types";
import type { DecisionLabel } from "@/app/lib/scoring";
import {
  buildRecommendation,
  preloadUpcomingIpos,
  type UpcomingIpo,
} from "../../../components/UpcomingIpoHero";
import {
  ADMIN_RADIUS,
  adminColors,
  adminControlBarSx,
} from "../../components/AdminPrimitives";

function displayCompanyName(row: UpcomingRow) {
  return row.company_name_th?.trim() || row.company_name?.trim() || row.symbol;
}

type ScoredUpcomingRow = UpcomingRow & {
  analysis_score: number | null;
  recommendation_decision: DecisionLabel | null;
  pending_scrape_count: number;
};

type RecommendationSummary = {
  score: number | null;
  decision: DecisionLabel | null;
};

function recoFromIpo(ipo: UpcomingIpo): RecommendationSummary {
  try {
    const rec = buildRecommendation(ipo);
    return { score: Math.round(rec.score * 100), decision: rec.decision };
  } catch {
    return { score: null, decision: null };
  }
}

type PendingScrapeFile = {
  id: number | string;
  ipo_id: number | string | null;
};

function daysInfo(days: number | null): { label: string; fg: string; bg: string; border: string } {
  if (days == null) {
    return { label: "ยังไม่กำหนดวัน", fg: "#475569", bg: "#f8fafc", border: "#e2e8f0" };
  }
  if (days < 0) {
    return { label: `เลยกำหนด ${Math.abs(days)} วัน`, fg: "#be123c", bg: "#fff1f2", border: "#fecdd3" };
  }
  if (days <= 7) {
    return { label: `อีก ${days} วัน`, fg: "#be123c", bg: "#fff1f2", border: "#fecdd3" };
  }
  if (days <= 30) {
    return { label: `อีก ${days} วัน`, fg: "#b45309", bg: "#fffbeb", border: "#fde68a" };
  }
  return { label: `อีก ${days} วัน`, fg: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" };
}

const recommendationStyle: Record<
  DecisionLabel,
  { label: string; fg: string; bg: string; border: string }
> = {
  BUY: { label: "แนะนำซื้อ", fg: "#166534", bg: "#f0fdf4", border: "#86efac" },
  NEUTRAL: { label: "ถือ / รอดู", fg: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
  AVOID: { label: "ไม่แนะนำ", fg: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
};

function scoreColor(score: number | null, decision: DecisionLabel | null) {
  if (decision) return recommendationStyle[decision].fg;
  if (score == null) return "#64748b";
  if (score >= 60) return recommendationStyle.BUY.fg;
  if (score >= 50) return recommendationStyle.NEUTRAL.fg;
  return recommendationStyle.AVOID.fg;
}

function completenessColor(value: number) {
  if (value >= 70) return "#16a34a";
  if (value >= 40) return "#d97706";
  return "#ef4444";
}

function MarketBadge({ market }: { market: string | null }) {
  const text = market?.trim() || "-";
  const isMai = /mai/i.test(text);
  return (
    <Box
      sx={{
        px: 0.75,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0,
        textTransform: "uppercase",
        color: isMai ? "#6d28d9" : "#0369a1",
        bgcolor: isMai ? "#f3e8ff" : "#e0f2fe",
        border: `1px solid ${isMai ? "#ddd6fe" : "#bae6fd"}`,
      }}
    >
      {text}
    </Box>
  );
}

function marketAccent(market: string | null) {
  const text = market?.trim() || "";
  if (/mai/i.test(text)) return "#7c3aed";
  if (/set/i.test(text)) return "#0284c7";
  return "#64748b";
}

function ReadinessDetail({ code, ok }: { code: string; ok: boolean }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.4,
        color: ok ? "#047857" : "#be123c",
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {ok ? (
        <CheckCircleRoundedIcon sx={{ fontSize: 12 }} />
      ) : (
        <Box sx={{ width: 6, height: 6, borderRadius: 99, bgcolor: "#e11d48" }} />
      )}
      <Box component="span" sx={{ color: "#475569" }}>
        {code}
      </Box>
      <Box component="span">{ok ? "ครบ" : "ขาด"}</Box>
    </Box>
  );
}

function ReadinessSummary({ hasFa, hasLeadUw }: { hasFa: boolean; hasLeadUw: boolean }) {
  const readyCount = Number(hasFa) + Number(hasLeadUw);
  const complete = readyCount === 2;
  const label = complete
    ? "พร้อมครบ"
    : !hasFa && !hasLeadUw
      ? "ขาด FA/UW"
      : !hasFa
        ? "ขาดที่ปรึกษา"
        : "ขาดผู้จัดจำหน่าย";
  const tone = complete ? "#047857" : readyCount === 1 ? "#b45309" : "#be123c";
  const bg = complete ? "#f0fdf4" : readyCount === 1 ? "#fffbeb" : "#fff1f2";
  const border = complete ? "#bbf7d0" : readyCount === 1 ? "#fde68a" : "#fecdd3";
  return (
    <Stack
      spacing={0.35}
      title={`FA: ${hasFa ? "พร้อม" : "ขาด"} / UW: ${hasLeadUw ? "พร้อม" : "ขาด"}`}
      sx={{ alignItems: "flex-start", minWidth: 0, width: "100%", maxWidth: 172 }}
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.45,
          maxWidth: "100%",
          minHeight: 28,
          px: 0.85,
          borderRadius: "999px",
          bgcolor: bg,
          color: tone,
          border: `1px solid ${border}`,
        }}
      >
        {complete ? (
          <CheckCircleRoundedIcon sx={{ fontSize: 13, flexShrink: 0 }} />
        ) : (
          <WarningRoundedIcon sx={{ fontSize: 13, flexShrink: 0 }} />
        )}
        <Typography
          sx={{
            color: tone,
            fontSize: 11,
            fontWeight: 850,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Typography>
        <Typography sx={{ color: tone, fontSize: 10.5, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
          {readyCount}/2
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.8} sx={{ flexWrap: "wrap", rowGap: 0.2, pl: 0.35 }}>
        <ReadinessDetail code="FA" ok={hasFa} />
        <ReadinessDetail code="UW" ok={hasLeadUw} />
      </Stack>
    </Stack>
  );
}

function RecommendationBadge({ decision }: { decision: DecisionLabel | null }) {
  if (!decision) return null;
  const style = recommendationStyle[decision];
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "fit-content",
        maxWidth: "100%",
        minHeight: 20,
        px: 0.7,
        borderRadius: "999px",
        bgcolor: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
        fontSize: 10,
        fontWeight: 850,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}
    >
      {style.label}
    </Box>
  );
}

function ScoreRing({ score, decision }: { score: number | null; decision: DecisionLabel | null }) {
  const color = scoreColor(score, decision);
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));

  return (
    <Stack spacing={0.55} sx={{ alignItems: "flex-start", minWidth: 0 }}>
      <Box
        title={score == null ? "ยังไม่มีคะแนน" : `คะแนน ${score}`}
        sx={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: `conic-gradient(${score == null ? "#cbd5e1" : color} ${value * 3.6}deg, #e2e8f0 0deg)`,
          boxShadow: `inset 0 0 0 1px ${score == null ? "#cbd5e133" : `${color}22`}`,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: "#ffffff",
            color,
            fontSize: 14,
            fontWeight: 950,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {score ?? "-"}
        </Box>
      </Box>
      <RecommendationBadge decision={decision} />
    </Stack>
  );
}

function ScrapeReviewAlert({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Box
      title={`มีข้อมูลจาก scraper รออนุมัติ ${count} ไฟล์`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        width: "fit-content",
        maxWidth: "100%",
        minHeight: 24,
        px: 0.85,
        borderRadius: "999px",
        bgcolor: "#fff7ed",
        color: "#c2410c",
        border: "1px solid #fed7aa",
        fontSize: 10.5,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      <WarningRoundedIcon sx={{ fontSize: 13, flexShrink: 0 }} />
      Scraper รออนุมัติ {count}
    </Box>
  );
}

function CompletenessBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const color = completenessColor(v);
  return (
    <Box sx={{ minWidth: 0, width: "100%" }} title={`ความครบถ้วน ${v}%`}>
      <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 0.55 }}>
        <Typography sx={{ color: adminColors.muted, fontSize: 11, fontWeight: 800 }}>
          ครบถ้วน
        </Typography>
        <Typography sx={{ color, fontSize: 12, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
          {v}%
        </Typography>
      </Stack>
      <Box sx={{ height: 8, borderRadius: 99, bgcolor: "#e2e8f0", overflow: "hidden" }}>
        <Box
          sx={{
            width: `${v}%`,
            height: "100%",
            borderRadius: 99,
            bgcolor: color,
            boxShadow: v > 0 ? `0 0 0 1px ${color}22` : "none",
          }}
        />
      </Box>
    </Box>
  );
}

const boardGrid = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "140px minmax(260px, 1.55fr) 138px 118px 154px 174px 50px",
    xl: "150px minmax(320px, 1.7fr) 146px 126px 166px 184px 54px",
  },
  columnGap: 1.75,
  alignItems: "center",
};

function BoardHeader() {
  const headings = ["หุ้น", "บริษัท / หมวดธุรกิจ", "วันเข้าเทรด", "คะแนน", "ข้อมูล", "ความพร้อม", ""];
  return (
    <Box
      sx={{
        ...boardGrid,
        display: { xs: "none", md: "grid" },
        position: "sticky",
        top: 0,
        zIndex: 1,
        px: 2,
        py: 1.05,
        bgcolor: "#f8fafc",
        borderTop: "1px solid #e2e8f0",
        borderBottom: "1px solid #cbd5e1",
        boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
      }}
    >
      {headings.map((heading) => (
        <Typography
          key={heading || "action"}
          sx={{
            color: heading ? "#334155" : "transparent",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: 0,
            lineHeight: 1.2,
          }}
        >
          {heading || "-"}
        </Typography>
      ))}
    </Box>
  );
}

function IpoBoardRow({ row }: { row: ScoredUpcomingRow }) {
  const days = daysInfo(row.days_until);
  const listed = toDateOnly(row.listing_date);
  const score = row.analysis_score;
  const accent = marketAccent(row.market);
  const completeness = Number(row.completeness_pct || 0);

  return (
    <Link href={`/ipo/ipos/${row.id}`} style={{ textDecoration: "none" }}>
      <Paper
        sx={{
          ...boardGrid,
          position: "relative",
          rowGap: 1.35,
          px: { xs: 1.35, md: 2 },
          py: { xs: 1.35, md: 1.45 },
          minHeight: { md: 86 },
          borderRadius: { xs: `${ADMIN_RADIUS}px`, md: 0 },
          border: { xs: `1px solid ${adminColors.borderSoft}`, md: 0 },
          borderBottom: { md: `1px solid ${adminColors.borderSoft}` },
          boxShadow: "none",
          backgroundImage: "none",
          bgcolor: "#ffffff",
          overflow: "hidden",
          transition: "background-color 140ms ease, box-shadow 140ms ease",
          cursor: "pointer",
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: { xs: 10, md: 0 },
            bottom: { xs: 10, md: 0 },
            width: { xs: 4, md: 3 },
            borderRadius: { xs: "0 99px 99px 0", md: 0 },
            bgcolor: accent,
            opacity: 0.95,
          },
          "&:hover": {
            bgcolor: "#fbfdff",
            boxShadow: { xs: "0 8px 22px rgba(15,23,42,0.08)", md: "inset 0 0 0 1px rgba(14,165,233,0.18)" },
          },
          "&:hover .row-action": {
            bgcolor: adminColors.accent,
            color: "#ffffff",
            transform: "translateX(2px)",
          },
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box sx={{ minWidth: 0, pl: { xs: 0.8, md: 0 } }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
              <Typography
                sx={{
                  color: adminColors.text,
                  fontSize: { xs: 17, md: 16 },
                  fontWeight: 950,
                  letterSpacing: 0,
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                }}
              >
                {row.symbol}
              </Typography>
              <MarketBadge market={row.market} />
            </Stack>
            <Typography
              sx={{
                display: { xs: "block", md: "none" },
                color: adminColors.muted,
                fontSize: 11,
                fontWeight: 750,
                mt: 0.35,
              }}
            >
              {row.sector?.trim() || "ไม่ระบุหมวดธุรกิจ"}
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            title={displayCompanyName(row)}
            sx={{
              color: adminColors.text,
              fontSize: { xs: 13.5, md: 13 },
              fontWeight: 900,
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: { xs: "normal", md: "nowrap" },
            }}
          >
            {displayCompanyName(row)}
          </Typography>
          <Typography
            sx={{
              color: adminColors.muted,
              fontSize: 11,
              fontWeight: 750,
              mt: 0.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.sector?.trim() || row.industry?.trim() || "ไม่ระบุหมวดธุรกิจ"}
          </Typography>
          <Box sx={{ mt: row.pending_scrape_count > 0 ? 0.65 : 0 }}>
            <ScrapeReviewAlert count={row.pending_scrape_count} />
          </Box>
        </Box>

        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              color: adminColors.text,
              fontSize: 11.5,
              fontWeight: 900,
            }}
          >
            <EventRoundedIcon sx={{ fontSize: 13, color: adminColors.muted }} />
            {listed || "รอวัน"}
          </Box>
          <Box
            sx={{
              alignSelf: "flex-start",
              px: 0.75,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              borderRadius: "6px",
              bgcolor: days.bg,
              color: days.fg,
              border: `1px solid ${days.border}`,
              fontSize: 10.5,
              fontWeight: 850,
            }}
          >
            {days.label}
          </Box>
        </Stack>

        <ScoreRing score={score} decision={row.recommendation_decision} />

        <CompletenessBar value={completeness} />

        <ReadinessSummary hasFa={Boolean(row.has_fa)} hasLeadUw={Boolean(row.has_lead_uw)} />

        <Box
          sx={{
            display: "flex",
            justifyContent: { xs: "flex-start", md: "flex-end" },
            alignItems: "center",
          }}
        >
          <Box
            className="row-action"
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              display: "grid",
              placeItems: "center",
              bgcolor: "#eef4fb",
              color: adminColors.accent,
              transition: "background-color 140ms ease, color 140ms ease, transform 140ms ease",
            }}
          >
            <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      </Paper>
    </Link>
  );
}

type SortKey = "score" | "soonest" | "completeness" | "symbol";

function searchText(row: UpcomingRow) {
  return [
    row.symbol,
    row.company_name_th,
    row.company_name,
    row.market,
    row.industry,
    row.sector,
    toDateOnly(row.listing_date),
    row.ipo_price,
    row.days_until,
    row.completeness_pct,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

export default function UpcomingTable({ rows }: { rows: UpcomingRow[] }) {
  const [query, setQuery] = React.useState("");
  const [urgency, setUrgency] = React.useState("all");
  const [completeness, setCompleteness] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("score");
  const [recoById, setRecoById] = React.useState<Record<number, RecommendationSummary>>({});
  const [pendingScrapeByIpoId, setPendingScrapeByIpoId] = React.useState<Record<number, number>>({});

  React.useEffect(() => {
    let active = true;
    preloadUpcomingIpos().then((ipos) => {
      if (!active) return;
      const map: Record<number, RecommendationSummary> = {};
      for (const ipo of ipos) {
        map[ipo.id] = recoFromIpo(ipo);
      }
      setRecoById(map);
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch("/api/ipo/upcoming/source-files?resolved=false&status=needs_review&limit=500", {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : { files: [] }))
      .then((json: { files?: PendingScrapeFile[] }) => {
        if (!active) return;
        const counts: Record<number, number> = {};
        for (const file of json.files ?? []) {
          const ipoId = Number(file.ipo_id);
          if (Number.isInteger(ipoId)) counts[ipoId] = (counts[ipoId] ?? 0) + 1;
        }
        setPendingScrapeByIpoId(counts);
      })
      .catch(() => {
        if (active) setPendingScrapeByIpoId({});
      });
    return () => {
      active = false;
    };
  }, []);

  const scoredRows = React.useMemo<ScoredUpcomingRow[]>(
    () =>
      rows.map((row) => {
        const recommendation = recoById[row.id] ?? { score: null, decision: null };
        return {
          ...row,
          analysis_score: recommendation.score,
          recommendation_decision: recommendation.decision,
          pending_scrape_count: pendingScrapeByIpoId[row.id] ?? 0,
        };
      }),
    [pendingScrapeByIpoId, rows, recoById],
  );

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = scoredRows.filter((row) => {
      const matchesSearch = !q || searchText(row).includes(q);
      const matchesUrgency =
        urgency === "all" ||
        (urgency === "overdue" && row.days_until != null && row.days_until < 0) ||
        (urgency === "urgent" && row.days_until != null && row.days_until >= 0 && row.days_until <= 7) ||
        (urgency === "month" && row.days_until != null && row.days_until > 7 && row.days_until <= 30) ||
        (urgency === "nodate" && row.days_until == null);
      const matchesCompleteness =
        completeness === "all" ||
        (completeness === "complete" && row.completeness_pct >= 100) ||
        (completeness === "incomplete" && row.completeness_pct < 100) ||
        (completeness === "low" && row.completeness_pct < 70);
      return matchesSearch && matchesUrgency && matchesCompleteness;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "soonest": {
          const av = a.days_until ?? Number.POSITIVE_INFINITY;
          const bv = b.days_until ?? Number.POSITIVE_INFINITY;
          return av - bv;
        }
        case "completeness":
          return Number(b.completeness_pct) - Number(a.completeness_pct);
        case "symbol":
          return a.symbol.localeCompare(b.symbol);
        case "score":
        default:
          return (b.analysis_score ?? -1) - (a.analysis_score ?? -1);
      }
    });
    return sorted;
  }, [completeness, query, scoredRows, sortKey, urgency]);

  const pendingReviewCount = React.useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.pending_scrape_count, 0),
    [filteredRows],
  );

  function clearFilters() {
    setQuery("");
    setUrgency("all");
    setCompleteness("all");
    setSortKey("score");
  }

  const controlSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: "#ffffff",
      transition: "box-shadow 140ms ease, border-color 140ms ease",
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: "#94a3b8",
      },
      "&.Mui-focused": {
        boxShadow: "0 0 0 3px rgba(14,165,233,0.14)",
      },
    },
    "& .MuiInputLabel-root": {
      color: adminColors.muted,
      fontWeight: 750,
    },
  };

  return (
    <Stack spacing={0} sx={{ flex: 1, minHeight: 0, bgcolor: "#f8fafc" }}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1.25}
        sx={{
          ...adminControlBarSx,
          position: "sticky",
          top: 0,
          zIndex: 2,
          p: { xs: 1.5, md: 2 },
          bgcolor: "#f8fafc",
          alignItems: { xs: "stretch", lg: "center" },
        }}
      >
        <TextField
          size="small"
          label="ค้นหา"
          placeholder="ชื่อย่อ บริษัท ตลาด หมวดธุรกิจ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ ...controlSx, flex: 1, minWidth: { xl: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          size="small"
          select
          label="ความเร่งด่วน"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value)}
          sx={{ ...controlSx, minWidth: { xs: "100%", sm: 190 } }}
        >
          <MenuItem value="all">ทั้งหมด</MenuItem>
          <MenuItem value="overdue">เลยกำหนด</MenuItem>
          <MenuItem value="urgent">ภายใน 7 วัน</MenuItem>
          <MenuItem value="month">ภายใน 30 วัน</MenuItem>
          <MenuItem value="nodate">ไม่มีวันที่</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="ความครบถ้วน"
          value={completeness}
          onChange={(e) => setCompleteness(e.target.value)}
          sx={{ ...controlSx, minWidth: { xs: "100%", sm: 190 } }}
        >
          <MenuItem value="all">ทั้งหมด</MenuItem>
          <MenuItem value="complete">ครบ 100%</MenuItem>
          <MenuItem value="incomplete">ยังไม่ครบ</MenuItem>
          <MenuItem value="low">ต่ำกว่า 70%</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="เรียงตาม"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          sx={{ ...controlSx, minWidth: { xs: "100%", sm: 190 } }}
        >
          <MenuItem value="score">คะแนนสูงสุด</MenuItem>
          <MenuItem value="soonest">ใกล้เข้าเทรด</MenuItem>
          <MenuItem value="completeness">ความครบถ้วน</MenuItem>
          <MenuItem value="symbol">ชื่อย่อ ก-ฮ</MenuItem>
        </TextField>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: { xs: "space-between", lg: "flex-end" } }}>
          <Button
            variant="outlined"
            startIcon={<RestartAltRoundedIcon />}
            onClick={clearFilters}
            sx={{
              minWidth: 110,
              height: 40,
              borderRadius: "12px",
              textTransform: "none",
              bgcolor: "#ffffff",
              color: adminColors.accent,
              fontWeight: 850,
            }}
          >
            ล้าง
          </Button>
          <Stack
            spacing={0.2}
            sx={{
              minWidth: 104,
              alignItems: { xs: "flex-end", lg: "flex-start" },
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: adminColors.text, fontWeight: 900, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}
            >
              {filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} รายการ
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: pendingReviewCount > 0 ? "#c2410c" : adminColors.muted, fontWeight: 750, lineHeight: 1.2 }}
            >
              Scraper {pendingReviewCount.toLocaleString()}
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      <BoardHeader />

      <Box sx={{ p: { xs: 1.25, md: 0 }, flex: 1, minHeight: 0, overflow: "auto" }}>
        {filteredRows.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center", color: adminColors.muted }}>
            <Typography sx={{ fontWeight: 650, fontSize: 13 }}>ไม่พบรายการ</Typography>
            <Typography sx={{ fontSize: 13, mt: 0.5 }}>
              ลองปรับคำค้นหรือตัวกรอง
            </Typography>
          </Box>
        ) : (
          <Stack spacing={{ xs: 1.25, md: 0 }}>
            {filteredRows.map((row) => (
              <IpoBoardRow key={row.id} row={row} />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
