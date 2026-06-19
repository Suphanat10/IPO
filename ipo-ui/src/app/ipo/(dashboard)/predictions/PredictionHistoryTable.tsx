"use client";

import * as React from "react";
import {
  Box,
  Button,
  InputAdornment,
  Pagination,
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
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import type { IpoRecommendationOutcomeRow } from "@/lib/ipo-recommendation-tracking";
import {
  AdminStatusPill,
  adminColors,
  adminControlBarSx,
  adminTableSx,
} from "../../components/AdminPrimitives";

const ROWS_PER_PAGE = 10;

function fmtPct(value: number | null, decimals = 1, signed = false) {
  if (value == null || Number.isNaN(value)) return "-";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals)}%`;
}

function fmtScore(value: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(0)}`;
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function returnColor(value: number | null) {
  if (value == null) return adminColors.muted;
  return value >= 0 ? "#047857" : "#be123c";
}

function winRateColor(value: number | null) {
  if (value == null) return adminColors.muted;
  if (value >= 65) return "#047857";
  if (value >= 50) return "#b45309";
  return "#be123c";
}

function decisionTone(decision: IpoRecommendationOutcomeRow["decision"]) {
  if (decision === "BUY") return "success";
  if (decision === "AVOID") return "danger";
  return "warning";
}

function decisionLabel(decision: IpoRecommendationOutcomeRow["decision"]) {
  if (decision === "BUY") return "แนะนำซื้อ";
  if (decision === "AVOID") return "ไม่แนะนำ";
  return "ถือ/รอดู";
}

function searchText(row: IpoRecommendationOutcomeRow) {
  return [
    row.symbol,
    row.company_name,
    row.market,
    row.snapshot_date,
    decisionLabel(row.decision),
    row.decision,
    fmtScore(row.score),
    row.win_rate,
    row.avg_return_d1,
    row.target_pct,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

function ReturnCell({
  value,
  label,
  color,
  decimals = 2,
  signed = true,
}: {
  value: number | null;
  label: string;
  color?: string;
  decimals?: number;
  signed?: boolean;
}) {
  const metricColor = color ?? returnColor(value);
  return (
    <Box sx={{ minWidth: 72 }}>
      <Typography
        sx={{
          color: metricColor,
          fontSize: 13,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
        }}
      >
        {fmtPct(value, decimals, signed)}
      </Typography>
      <Typography
        sx={{
          color: adminColors.muted,
          fontSize: 10.5,
          fontWeight: 750,
          lineHeight: 1.25,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function OutcomeRow({ row }: { row: IpoRecommendationOutcomeRow }) {
  return (
    <TableRow hover>
      <TableCell sx={{ py: 1.2 }}>
        <Box sx={{ minWidth: 180 }}>
          <Typography sx={{ color: adminColors.text, fontWeight: 900, fontSize: 13.5, lineHeight: 1.2 }}>
            {row.symbol}
          </Typography>
          <Typography sx={{ color: adminColors.muted, fontSize: 12, lineHeight: 1.35, mt: 0.25 }}>
            {row.company_name ?? "-"}
          </Typography>
        </Box>
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap", py: 1.2 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 800, lineHeight: 1.25 }}>
          {fmtDate(row.snapshot_date)}
        </Typography>
        <Typography sx={{ color: adminColors.muted, fontSize: 11, lineHeight: 1.25 }}>
          เข้าเทรด {fmtDate(row.actual_listing_date)}
        </Typography>
      </TableCell>
      <TableCell sx={{ py: 1.2 }}>
        <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
          <AdminStatusPill label={decisionLabel(row.decision)} tone={decisionTone(row.decision)} />
          <Typography sx={{ fontSize: 12, color: adminColors.muted, lineHeight: 1.25 }}>
            คะแนน {fmtScore(row.score)}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell align="right" sx={{ py: 1.2 }}>
        <ReturnCell
          value={row.win_rate}
          label="ชนะ (WR)"
          color={winRateColor(row.win_rate)}
          decimals={1}
          signed={false}
        />
      </TableCell>
      <TableCell align="right" sx={{ py: 1.2 }}>
        <ReturnCell value={row.avg_return_d1} label="เฉลี่ย D1" decimals={1} />
      </TableCell>
      <TableCell align="right" sx={{ py: 1.2 }}>
        <Box sx={{ minWidth: 72 }}>
          <Typography
            sx={{
              color: row.target_pct == null ? adminColors.muted : "#1d4ed8",
              fontSize: 13,
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.2,
            }}
          >
            {row.target_pct == null ? "-" : fmtPct(row.target_pct, 0, true)}
          </Typography>
          <Typography
            sx={{
              color: adminColors.muted,
              fontSize: 10.5,
              fontWeight: 750,
              lineHeight: 1.25,
            }}
          >
            เป้า (TP)
          </Typography>
        </Box>
      </TableCell>
    </TableRow>
  );
}

export default function PredictionHistoryTable({
  rows,
}: {
  rows: IpoRecommendationOutcomeRow[];
}) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchText(row).includes(q));
  }, [query, rows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const firstRowNumber = filteredRows.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const lastRowNumber = Math.min(currentPage * ROWS_PER_PAGE, filteredRows.length);
  const pageRows = filteredRows.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  function clearControls() {
    setQuery("");
    setPage(1);
  }

  return (
    <Stack spacing={0} sx={{ minHeight: 0 }}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1.5}
        sx={{
          ...adminControlBarSx,
          p: { xs: 1.5, md: 2 },
          alignItems: { xs: "stretch", lg: "center" },
        }}
      >
        <TextField
          size="small"
          label="ค้นหา"
          placeholder="ค้นหาสัญลักษณ์หุ้น ชื่อบริษัท คำแนะนำ หรือคะแนน"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          sx={{
            flex: 1,
            minWidth: { lg: 320 },
            "& .MuiOutlinedInput-root": { borderRadius: "12px", bgcolor: "#ffffff" },
            "& .MuiInputLabel-root": { color: adminColors.muted, fontWeight: 750 },
          }}
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

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
        >
          <Typography sx={{ color: adminColors.muted, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
            แสดง {firstRowNumber.toLocaleString()}-{lastRowNumber.toLocaleString()} จาก{" "}
            {filteredRows.length.toLocaleString()} รายการ
            {query ? ` / ทั้งหมด ${rows.length.toLocaleString()}` : ""}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<RestartAltRoundedIcon />}
            onClick={clearControls}
            sx={{
              height: 38,
              borderRadius: "12px",
              textTransform: "none",
              bgcolor: "#ffffff",
              color: adminColors.accent,
              fontWeight: 850,
              whiteSpace: "nowrap",
            }}
          >
            ล้าง
          </Button>
        </Stack>
      </Stack>

      {filteredRows.length === 0 ? (
        <Stack spacing={1} sx={{ p: 3, alignItems: "center", color: adminColors.muted }}>
          <PendingActionsRoundedIcon />
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
            ไม่พบรายการที่ตรงกับคำค้นหา
          </Typography>
        </Stack>
      ) : (
        <TableContainer sx={{ maxHeight: "calc(100vh - 430px)" }}>
          <Table stickyHeader size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>หุ้น IPO</TableCell>
                <TableCell>วันที่บันทึก</TableCell>
                <TableCell>คำแนะนำ/คะแนน</TableCell>
                <TableCell align="right">ชนะ (WR)</TableCell>
                <TableCell align="right">เฉลี่ย D1</TableCell>
                <TableCell align="right">เป้า (TP)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((row) => (
                <OutcomeRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {filteredRows.length > 0 ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          sx={{
            p: { xs: 1.5, md: 2 },
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${adminColors.border}`,
          }}
        >
          <Typography sx={{ color: adminColors.muted, fontSize: 12, fontWeight: 800 }}>
            หน้า {currentPage.toLocaleString()} / {pageCount.toLocaleString()} แสดงทีละ{" "}
            {ROWS_PER_PAGE.toLocaleString()} รายการ
          </Typography>
          <Pagination
            count={pageCount}
            page={currentPage}
            onChange={(_, value) => setPage(value)}
            color="primary"
            shape="rounded"
            showFirstButton
            showLastButton
            siblingCount={1}
            boundaryCount={1}
            sx={{
              "& .MuiPaginationItem-root": {
                fontSize: 12,
                fontWeight: 850,
              },
            }}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
