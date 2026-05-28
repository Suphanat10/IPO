"use client";

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import Link from "next/link";
import { toDateOnly } from "@/lib/date-format";
import type { MissingFieldsRow } from "@/lib/admin/types";
import {
  adminColors,
  adminControlBarSx,
  adminTableSx,
} from "../../components/AdminPrimitives";

const MISSING_FIELD_LABEL: Record<string, string> = {
  company_name: "ชื่อบริษัท / Company name",
  listing_date: "วันที่เข้าเทรด / Listing date",
  ipo_price: "ราคา IPO / IPO price",
  market: "ตลาด / Market",
  industry: "กลุ่มอุตสาหกรรม / Industry",
  sector: "หมวดธุรกิจ / Sector",
  fa_persons: "บุคคล FA / FA persons",
  fa_companies: "บริษัท FA / FA companies",
  lead_uw: "ผู้จัดจำหน่ายหลัก / Lead underwriters",
  co_uws: "ผู้จัดจำหน่ายร่วม / Co-underwriters",
  open_d1: "ราคาเปิดวันแรก / Day-1 open",
  high_d1: "ราคาสูงสุดวันแรก / Day-1 high",
  low_d1: "ราคาต่ำสุดวันแรก / Day-1 low",
  close_d1: "ราคาปิดวันแรก / Day-1 close",
  close_d2: "ราคาปิด D2 / D2 close",
  close_d3: "ราคาปิด D3 / D3 close",
  close_d4: "ราคาปิด D4 / D4 close",
  close_d5: "ราคาปิด D5 / D5 close",
  close_1w: "ราคาปิด 1W / 1W close",
  close_1m: "ราคาปิด 1M / 1M close",
  close_3m: "ราคาปิด 3M / 3M close",
  close_6m: "ราคาปิด 6M / 6M close",
  gross_proceeds: "เงินระดมทุน / Gross proceeds",
  total_expense: "ค่าใช้จ่ายรวม / Total expense",
  offered_shares: "หุ้นเสนอขาย / Offered shares",
  offered_ratio_pct: "สัดส่วนเสนอขาย / Offered ratio",
  existing_shares_pct: "ผู้ถือหุ้นเดิม / Existing holders",
  executive_total_pct: "ผู้บริหาร / Executives",
  total_assets: "สินทรัพย์รวม / Total assets",
  total_liabilities: "หนี้สินรวม / Total liabilities",
  total_equity: "ส่วนของผู้ถือหุ้น / Total equity",
  revenue_latest: "รายได้ล่าสุด / Revenue latest",
  revenue_prev: "รายได้ปีก่อน / Revenue prev",
  net_income_latest: "กำไรล่าสุด / Net income latest",
  net_income_prev: "กำไรปีก่อน / Net income prev",
};

const STATUS_LABEL: Record<string, string> = {
  listed: "จดทะเบียนแล้ว / Listed",
  upcoming: "IPO กำลังจะเข้า",
  cancelled: "ยกเลิก / Cancelled",
};

function CompletenessBar({ value }: { value: number }) {
  const color = value >= 100 ? "success" : value >= 70 ? "warning" : "error";
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 150 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, value)}
        color={color}
        sx={{ flex: 1, height: 7, borderRadius: 1 }}
      />
      <Typography variant="caption" sx={{ minWidth: 38, textAlign: "right", fontWeight: 800 }}>
        {value}%
      </Typography>
    </Stack>
  );
}

type StatusFilter = "" | "listed" | "upcoming" | "cancelled";
type CompletenessFilter = "" | "lt50" | "lt70" | "lt100" | "eq100";

const COMPLETENESS_OPTIONS: { value: CompletenessFilter; label: string }[] = [
  { value: "", label: "ทั้งหมด / All" },
  { value: "lt50", label: "ต่ำกว่า 50%" },
  { value: "lt70", label: "ต่ำกว่า 70%" },
  { value: "lt100", label: "ไม่ครบ 100%" },
  { value: "eq100", label: "ครบ 100%" },
];

function matchCompleteness(pct: number, filter: CompletenessFilter): boolean {
  if (filter === "") return true;
  if (filter === "lt50") return pct < 50;
  if (filter === "lt70") return pct < 70;
  if (filter === "lt100") return pct < 100;
  if (filter === "eq100") return pct >= 100;
  return true;
}

function dateOnly(value: unknown) {
  return toDateOnly(value);
}

export default function MissingFieldsTable({ rows }: { rows: MissingFieldsRow[] }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [completeness, setCompleteness] = React.useState<CompletenessFilter>("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const inSym = r.symbol.toLowerCase().includes(q);
        const inComp = (r.company_name ?? "").toLowerCase().includes(q);
        if (!inSym && !inComp) return false;
      }
      if (status && r.status !== status) return false;
      const listingDate = dateOnly(r.listing_date);
      if (dateFrom) {
        if (!listingDate) return false;
        if (listingDate < dateFrom) return false;
      }
      if (dateTo) {
        if (!listingDate) return false;
        if (listingDate > dateTo) return false;
      }
      if (!matchCompleteness(r.completeness_pct, completeness)) return false;
      return true;
    });
  }, [rows, search, status, dateFrom, dateTo, completeness]);

  const hasActiveFilter =
    search.trim() !== "" ||
    status !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    completeness !== "";

  function clearAll() {
    setSearch("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setCompleteness("");
  }

  return (
    <Stack spacing={0}>
      <Box
        sx={{
          ...adminControlBarSx,
          p: 2,
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ alignItems: "center" }}>
            <TextField
              size="small"
              fullWidth
              placeholder="ค้นหา symbol หรือชื่อบริษัท / Search symbol or company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch("")}>
                        <ClearRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
            <Typography
              variant="caption"
              sx={{ color: adminColors.muted, minWidth: 110, textAlign: "right" }}
            >
              {filtered.length} / {rows.length} แถว
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.25}
            sx={{ alignItems: { xs: "stretch", md: "center" } }}
          >
            <TextField
              size="small"
              select
              label="สถานะ / Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">ทั้งหมด / All</MenuItem>
              <MenuItem value="listed">จดทะเบียนแล้ว / Listed</MenuItem>
              <MenuItem value="upcoming">IPO กำลังจะเข้า</MenuItem>
              <MenuItem value="cancelled">ยกเลิก / Cancelled</MenuItem>
            </TextField>

            <TextField
              size="small"
              type="date"
              label="วันที่เข้าเทรด ตั้งแต่ / Listing from"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 200 }}
            />
            <TextField
              size="small"
              type="date"
              label="ถึง / to"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 180 }}
            />

            <TextField
              size="small"
              select
              label="ความครบถ้วน / Completeness"
              value={completeness}
              onChange={(e) => setCompleteness(e.target.value as CompletenessFilter)}
              sx={{ minWidth: 200 }}
            >
              {COMPLETENESS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ flex: 1 }} />

            <Button
              size="small"
              variant="outlined"
              onClick={clearAll}
              disabled={!hasActiveFilter}
              startIcon={<ClearRoundedIcon />}
            >
              ล้างตัวกรอง / Clear
            </Button>
          </Stack>
        </Stack>
      </Box>

      <TableContainer sx={{ maxHeight: 560 }}>
        <Table size="small" stickyHeader sx={adminTableSx}>
          <TableHead>
            <TableRow>
              <TableCell width={64}>แก้ไข</TableCell>
              <TableCell>ชื่อย่อ / Symbol</TableCell>
              <TableCell>สถานะ / Status</TableCell>
              <TableCell>วันที่เข้าเทรด / Listing</TableCell>
              <TableCell>ความครบถ้วน / Completeness</TableCell>
              <TableCell>ข้อมูลที่ขาด / Missing fields</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" sx={{ color: adminColors.muted, py: 4 }}>
                    {search
                      ? "ไม่พบรายการที่ค้นหา / No matches."
                      : "ข้อมูล IPO ครบทุกตัวแล้ว / Every IPO is complete."}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell>
                    <Tooltip title="แก้ไขข้อมูล / Edit IPO">
                      <IconButton
                        size="small"
                        component={Link}
                        href={`/ipo/ipos/${m.id}`}
                      >
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component={Link}
                      href={`/ipo/ipos/${m.id}`}
                      sx={{
                        fontWeight: 800,
                        textDecoration: "none",
                        color: adminColors.text,
                        "&:hover": { color: adminColors.accent },
                      }}
                    >
                      {m.symbol}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={STATUS_LABEL[m.status] ?? m.status}
                      color={m.status === "listed" ? "default" : "info"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{dateOnly(m.listing_date) || "-"}</Typography>
                  </TableCell>
                  <TableCell>
                    <CompletenessBar value={m.completeness_pct} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                      {m.missing_fields.map((f) => (
                        <Chip
                          key={f}
                          size="small"
                          label={MISSING_FIELD_LABEL[f] ?? f}
                          sx={{
                            height: 22,
                            fontSize: 11,
                            bgcolor: "#fef3c7",
                            color: "#92400e",
                            border: "1px solid #fde68a",
                          }}
                        />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
