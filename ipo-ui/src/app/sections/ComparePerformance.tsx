"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Chip,
  Link,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import SectionCard from "../components/SectionCard";
import LabeledField from "../components/LabeledField";
import ReferenceLink from "../components/ReferenceLink";
import { useAnalysis } from "../lib/AnalysisContext";
import { useDropdownOptions } from "../lib/useDropdownOptions";
import type { EntityType, SummaryRow } from "../lib/types";
import { useSummary } from "../lib/ipoDataClient";

const ENTITY_LABELS: Record<EntityType, string> = {
  "FA Person": "FA Person",
  "FA Company": "FA Company",
  "Lead Underwriter": "Lead Underwriter",
};
const ENTITY_TYPES = Object.keys(ENTITY_LABELS) as EntityType[];

const METRICS: { key: keyof SummaryRow; label: string; unit?: "pct" | "num" }[] = [
  { key: "ipo_count", label: "IPO Count", unit: "num" },
  { key: "prob_close_above_ipo", label: "Probability (Close > IPO)", unit: "pct" },
  { key: "avg_return_close_d1", label: "Average Return Day 1 (Close)", unit: "pct" },
  { key: "worst_return_d1", label: "Worst Return Day 1", unit: "pct" },
  { key: "avg_return_1W", label: "Average Return 1 Week", unit: "pct" },
  { key: "avg_return_1M", label: "Average Return 1 Month", unit: "pct" },
  { key: "avg_return_3M", label: "Average Return 3 Months", unit: "pct" },
  { key: "avg_return_6M", label: "Average Return 6 Months", unit: "pct" },
];

function Hint({ topic, keyword }: { topic: string; keyword: string }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      หัวข้อ:{" "}
      <Link underline="hover" color="primary.main">
        {topic}
      </Link>
      &nbsp;|&nbsp;<b>Keyword:</b>{" "}
      <Box component="span" sx={{ color: "error.main" }}>
        {keyword}
      </Box>
    </Typography>
  );
}

function fmt(v: number, unit?: "pct" | "num") {
  if (v == null || Number.isNaN(v)) return "-";
  if (unit === "num") return v.toFixed(0);
  return `${v.toFixed(2)}%`;
}

function fmtDelta(v: number | null, unit?: "pct" | "num") {
  if (v == null || Number.isNaN(v)) return "-";
  const sign = v > 0 ? "+" : "";
  if (unit === "num") return `${sign}${v.toFixed(0)}`;
  return `${sign}${v.toFixed(2)}%`;
}

export default function ComparePerformance() {
  const { compare, setCompare } = useAnalysis();
  const { type, nameA, nameB } = compare;
  const dbOpts = useDropdownOptions();
  const summaryState = useSummary();

  const rows = React.useMemo<SummaryRow[]>(() => {
    const s = summaryState.data;
    if (!s) return [];
    return type === "FA Person"
      ? s.faPersons
      : type === "FA Company"
        ? s.faCompanies
        : s.leadUnderwriters;
  }, [summaryState.data, type]);
  const summaryNames = React.useMemo(
    () => new Set(rows.map((r) => r.name)),
    [rows],
  );
  const options = React.useMemo(() => {
    // Only include names that have summary stats — DB names without stats can't be compared
    const dbList =
      type === "FA Person"
        ? dbOpts.faPersons
        : type === "FA Company"
          ? dbOpts.faCompanies
          : dbOpts.underwriters;
    return [...new Set([...summaryNames, ...dbList.filter((n) => summaryNames.has(n))])].sort(
      (a, b) => a.localeCompare(b, "th"),
    );
  }, [summaryNames, type, dbOpts]);

  const aRow = React.useMemo(
    () => (nameA ? rows.find((r) => r.name === nameA) : undefined),
    [rows, nameA],
  );
  const bRow = React.useMemo(
    () => (nameB ? rows.find((r) => r.name === nameB) : undefined),
    [rows, nameB],
  );

  const compared = aRow && bRow ? { a: aRow, b: bRow } : null;
  const hasNotFound = Boolean((nameA && !aRow) || (nameB && !bRow));
  const comparisonRows = React.useMemo(() => {
    if (!compared) return [];
    return METRICS.map((metric) => {
      const aValue = Number(compared.a[metric.key]);
      const bValue = Number(compared.b[metric.key]);
      const valid = Number.isFinite(aValue) && Number.isFinite(bValue);
      const delta = valid ? aValue - bValue : null;
      let winner: "a" | "b" | "tie" | "none" = "none";
      if (valid && delta != null) {
        winner = delta === 0 ? "tie" : delta > 0 ? "a" : "b";
      }
      return { metric, aValue, bValue, delta, winner };
    });
  }, [compared]);
  const comparisonSummary = React.useMemo(() => {
    const aWins = comparisonRows.filter((row) => row.winner === "a").length;
    const bWins = comparisonRows.filter((row) => row.winner === "b").length;
    const ties = comparisonRows.filter((row) => row.winner === "tie").length;
    return { aWins, bWins, ties };
  }, [comparisonRows]);

  if (summaryState.loading || summaryState.error) {
    return (
      <SectionCard
        title="Compare Performance"
        subtitle="เปรียบเทียบสถิติของ FA / Underwriter สองรายแบบตัวต่อตัว"
        icon={<CompareArrowsRoundedIcon fontSize="small" />}
      >
        <Typography
          variant="body2"
          color={summaryState.error ? "error" : "text.secondary"}
        >
          {summaryState.error
            ? "โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง"
            : "กำลังโหลดข้อมูล…"}
        </Typography>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Compare Performance"
      subtitle="เปรียบเทียบสถิติของ FA / Underwriter สองรายแบบตัวต่อตัว"
      icon={<CompareArrowsRoundedIcon fontSize="small" />}
    >
      <Stack spacing={2.5}>
        <Box
          sx={{
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            p: { xs: 2, md: 2.5 },
            bgcolor: "#fafbfd",
          }}
        >
          <Stack spacing={1}>
            <LabeledField label="TYPE">
              <TextField
                size="small"
                select
                fullWidth
                value={type}
                onChange={(e) => {
                  setCompare({
                    type: e.target.value as EntityType,
                    nameA: null,
                    nameB: null,
                  });
                }}
              >
                {ENTITY_TYPES.map((k) => (
                  <MenuItem key={k} value={k}>
                    {k}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>
            <LabeledField
              label="NAME_A"
              hint={
                <>
                  <Hint
                    topic="การจอง การจำหน่าย และการจัดสรร"
                    keyword="ที่ปรึกษาทางการเงิน, ผู้จัดจำหน่าย, Lead Underwriter"
                  />
                  <ReferenceLink
                    example={{
                      value: options[0],
                      excerpt: `รายการตัวอย่างจากฐานข้อมูล: ${options[0] ?? "-"}`,
                      source: "Mock dataset: Summary performance",
                      note: "พิมพ์ชื่อให้ตรงกับรายการ เพื่อให้จับคู่สถิติได้ทันที",
                    }}
                  />
                </>
              }
            >
              <Autocomplete
                size="small"
                freeSolo
                options={options}
                inputValue={nameA ?? ""}
                onInputChange={(_, v) => setCompare({ nameA: v || null })}
                renderInput={(params) => (
                  <TextField {...params} placeholder="พิมพ์ชื่อรายการ A" />
                )}
              />
            </LabeledField>
            <LabeledField
              label="NAME_B"
              hint={
                <>
                  <Hint
                    topic="การจอง การจำหน่าย และการจัดสรร"
                    keyword="ที่ปรึกษาทางการเงิน, ผู้จัดจำหน่าย, Lead Underwriter"
                  />
                  <ReferenceLink
                    example={{
                      value: options[1] ?? options[0],
                      excerpt: `รายการตัวอย่างจากฐานข้อมูล: ${options[1] ?? options[0] ?? "-"}`,
                      source: "Mock dataset: Summary performance",
                      note: "กรอก A/B ให้ครบเพื่อให้ตาราง Compare แสดงผล",
                    }}
                  />
                </>
              }
            >
              <Autocomplete
                size="small"
                freeSolo
                options={options}
                inputValue={nameB ?? ""}
                onInputChange={(_, v) => setCompare({ nameB: v || null })}
                renderInput={(params) => (
                  <TextField {...params} placeholder="พิมพ์ชื่อรายการ B" />
                )}
              />
            </LabeledField>
          </Stack>
        </Box>

        {hasNotFound && (
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: "#fffbeb",
              border: "1px solid #fde68a",
            }}
          >
            <Typography variant="body2" sx={{ color: "#92400e", fontWeight: 600 }}>
              {nameA && !aRow && (
                <>ไม่พบข้อมูลสถิติของ &quot;{nameA}&quot; — ลองเลือกจากรายการแนะนำ<br /></>
              )}
              {nameB && !bRow && (
                <>ไม่พบข้อมูลสถิติของ &quot;{nameB}&quot; — ลองเลือกจากรายการแนะนำ</>
              )}
            </Typography>
          </Box>
        )}

        <Box>
          {compared ? (
            <Box>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, mb: 1.5 }}
              >
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    Compare {ENTITY_LABELS[type]}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    อ่านคอลัมน์ส่วนต่าง: ค่าบวก = ฝั่ง A สูงกว่า, ค่าลบ = ฝั่ง B สูงกว่า
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
                  <Chip
                    size="small"
                    label={`A ชนะ ${comparisonSummary.aWins}`}
                    sx={{ bgcolor: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", fontWeight: 700 }}
                  />
                  <Chip
                    size="small"
                    label={`B ชนะ ${comparisonSummary.bWins}`}
                    sx={{ bgcolor: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe", fontWeight: 700 }}
                  />
                  <Chip
                    size="small"
                    label={`เสมอ ${comparisonSummary.ties}`}
                    sx={{ bgcolor: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0", fontWeight: 700 }}
                  />
                </Stack>
              </Stack>
              <TableContainer
                component={Box}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "#f8fafc" }}>
                      <TableCell sx={{ fontWeight: 700, width: "34%" }}>Metric</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {compared.a.name}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {compared.b.name}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                        A - B
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                        ดีกว่า
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {comparisonRows.map((row, idx) => {
                      const { metric, aValue, bValue, delta, winner } = row;
                      const aWin = winner === "a";
                      const bWin = winner === "b";
                      const tie = winner === "tie";
                      return (
                        <TableRow
                          key={metric.key as string}
                          sx={{ bgcolor: idx % 2 === 0 ? "#fff" : "#fcfdff" }}
                        >
                          <TableCell sx={{ fontWeight: 600, color: "text.primary" }}>
                            {metric.label}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 600,
                              color: aWin ? "success.main" : "text.primary",
                              bgcolor: aWin ? "#f0fdf4" : "transparent",
                            }}
                          >
                            {fmt(aValue, metric.unit)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 600,
                              color: bWin ? "primary.main" : "text.primary",
                              bgcolor: bWin ? "#eff6ff" : "transparent",
                            }}
                          >
                            {fmt(bValue, metric.unit)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              color:
                                delta == null
                                  ? "text.secondary"
                                  : delta > 0
                                    ? "success.main"
                                    : delta < 0
                                      ? "primary.main"
                                      : "text.secondary",
                            }}
                          >
                            {fmtDelta(delta, metric.unit)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              label={aWin ? "A" : bWin ? "B" : tie ? "เสมอ" : "-"}
                              sx={{
                                height: 22,
                                minWidth: 48,
                                fontWeight: 700,
                                bgcolor: aWin
                                  ? "#dcfce7"
                                  : bWin
                                    ? "#dbeafe"
                                    : "#f1f5f9",
                                color: aWin
                                  ? "#166534"
                                  : bWin
                                    ? "#1d4ed8"
                                    : "#475569",
                                border: "1px solid",
                                borderColor: aWin
                                  ? "#bbf7d0"
                                  : bWin
                                    ? "#bfdbfe"
                                    : "#e2e8f0",
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {hasNotFound
                ? "ไม่พบชื่อที่กรอกในฐานข้อมูล ลองเลือกจากรายการแนะนำ"
                : "กรอกชื่อ A และ B เพื่อดูการเปรียบเทียบ"}
            </Typography>
          )}
        </Box>
      </Stack>
    </SectionCard>
  );
}
