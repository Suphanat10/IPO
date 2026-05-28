"use client";

import * as React from "react";
import {
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Link from "next/link";
import { toDateOnly } from "@/lib/date-format";
import type { UpcomingRow } from "@/lib/admin/types";
import {
  AdminStatusPill,
  adminColors,
  adminControlBarSx,
  adminDataGridSx,
} from "../../components/AdminPrimitives";

function daysChip(days: number | null) {
  if (days == null) return <AdminStatusPill label="ไม่มีวันที่ / No date" />;
  if (days < 0) {
    return <AdminStatusPill tone="danger" label={`เลยกำหนด ${Math.abs(days)} วัน / Past ${Math.abs(days)}d`} />;
  }
  if (days <= 7) return <AdminStatusPill tone="danger" label={`${days} วัน / ${days}d`} />;
  if (days <= 30) return <AdminStatusPill tone="warning" label={`${days} วัน / ${days}d`} />;
  return <AdminStatusPill tone="neutral" label={`${days} วัน / ${days}d`} />;
}

function CompletenessBar({ value }: { value: number }) {
  const color =
    value >= 100 ? "#047857" : value >= 70 ? adminColors.amber : adminColors.rose;
  return (
    <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        sx={{
          flex: 1,
          height: 8,
          bgcolor: "#edf2ee",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <Box sx={{ width: `${Math.min(100, value)}%`, height: "100%", bgcolor: color }} />
      </Box>
      <Box sx={{ fontSize: 12, fontWeight: 800, minWidth: 38, textAlign: "right" }}>
        {value}%
      </Box>
    </Box>
  );
}

function TextCell({ value }: { value: unknown }) {
  const text = typeof value === "string" && value.trim() ? value.trim() : "-";
  return (
    <Box
      title={text}
      sx={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        width: "100%",
      }}
    >
      {text}
    </Box>
  );
}

function displayCompanyName(row: UpcomingRow) {
  return row.company_name_th?.trim() || row.company_name?.trim() || row.symbol;
}

const COLUMNS: GridColDef<UpcomingRow>[] = [
  {
    field: "symbol",
    headerName: "ชื่อย่อ / Symbol",
    width: 132,
    renderCell: (p) => (
      <Link href={`/ipo/ipos/${p.row.id}`} style={{ textDecoration: "none" }}>
        <AdminStatusPill label={p.row.symbol} />
      </Link>
    ),
  },
  {
    field: "company_name",
    headerName: "บริษัท / Company",
    flex: 1.25,
    minWidth: 260,
    renderCell: (p) => <TextCell value={displayCompanyName(p.row)} />,
  },
  {
    field: "market",
    headerName: "ตลาด / Market",
    width: 120,
    renderCell: (p) => <TextCell value={p.value} />,
  },
  {
    field: "sector",
    headerName: "หมวดธุรกิจ / Sector",
    flex: 1,
    minWidth: 210,
    renderCell: (p) => <TextCell value={p.value} />,
  },
  {
    field: "ipo_price",
    headerName: "ราคา IPO / IPO price",
    width: 160,
    align: "right",
    headerAlign: "right",
    renderCell: (p) => (
      <Box sx={{ width: "100%", textAlign: "right" }}>
        {p.row.ipo_price != null ? p.row.ipo_price.toLocaleString() : "-"}
      </Box>
    ),
  },
  {
    field: "listing_date",
    headerName: "วันที่เข้าเทรด / Listing date",
    width: 190,
    renderCell: (p) => <TextCell value={toDateOnly(p.value) || "-"} />,
  },
  {
    field: "days_until",
    headerName: "จำนวนวัน / Days",
    width: 190,
    align: "center",
    headerAlign: "center",
    renderCell: (p) => daysChip(p.row.days_until),
  },
  {
    field: "completeness_pct",
    headerName: "ความครบถ้วน / Completeness",
    width: 230,
    renderCell: (p) => <CompletenessBar value={Number(p.row.completeness_pct)} />,
  },
  {
    field: "actions",
    headerName: "",
    width: 92,
    sortable: false,
    filterable: false,
    renderCell: (p) => (
      <Link
        href={`/ipo/ipos/${p.row.id}`}
        aria-label={`แก้ไข ${p.row.symbol} / Edit ${p.row.symbol}`}
        style={{ color: adminColors.accent, fontWeight: 800, textDecoration: "none" }}
      >
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", fontSize: 12 }}>
          <EditRoundedIcon fontSize="small" />
          <span>แก้ไข</span>
        </Stack>
      </Link>
    ),
  },
];

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

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
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
  }, [completeness, query, rows, urgency]);

  function clearFilters() {
    setQuery("");
    setUrgency("all");
    setCompleteness("all");
  }

  return (
    <Stack spacing={0}>
      <Stack
        direction={{ xs: "column", xl: "row" }}
        spacing={1.25}
        sx={{
          ...adminControlBarSx,
          p: 2,
        }}
      >
        <TextField
          size="small"
          label="ค้นหา / Search"
          placeholder="ชื่อย่อ บริษัท ตลาด หมวดธุรกิจ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flex: 1, minWidth: { xl: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          size="small"
          select
          label="ความเร่งด่วน / Urgency"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="all">ทั้งหมด / All</MenuItem>
          <MenuItem value="overdue">เลยกำหนด / Overdue</MenuItem>
          <MenuItem value="urgent">ภายใน 7 วัน / Within 7 days</MenuItem>
          <MenuItem value="month">ภายใน 30 วัน / Within 30 days</MenuItem>
          <MenuItem value="nodate">ไม่มีวันที่ / No date</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="ความครบถ้วน / Completeness"
          value={completeness}
          onChange={(e) => setCompleteness(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="all">ทั้งหมด / All</MenuItem>
          <MenuItem value="complete">ครบ 100% / Complete</MenuItem>
          <MenuItem value="incomplete">ยังไม่ครบ / Incomplete</MenuItem>
          <MenuItem value="low">ต่ำกว่า 70% / Below 70%</MenuItem>
        </TextField>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            variant="outlined"
            startIcon={<RestartAltRoundedIcon />}
            onClick={clearFilters}
            sx={{ minWidth: 128 }}
          >
            ล้าง / Reset
          </Button>
          <Typography
            variant="caption"
            sx={{ color: adminColors.muted, fontWeight: 800, minWidth: 118, textAlign: { xs: "left", xl: "right" } }}
          >
            {filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} รายการ
          </Typography>
        </Stack>
      </Stack>

      <Box sx={{ height: { xs: 560, lg: 680 }, width: "100%" }}>
        <DataGrid
          rows={filteredRows}
          columns={COLUMNS}
          density="compact"
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          localeText={{
            noRowsLabel: "ไม่พบข้อมูล / No rows",
            footerRowSelected: (count) => `${count.toLocaleString()} รายการที่เลือก`,
          }}
          sx={adminDataGridSx}
        />
      </Box>
    </Stack>
  );
}
