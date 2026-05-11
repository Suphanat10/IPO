"use client";

import * as React from "react";
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CompletenessRow } from "@/lib/supabase/types";

const STATUS_COLOR: Record<string, "default" | "success" | "info" | "warning"> = {
  listed: "success",
  upcoming: "info",
  cancelled: "warning",
};

function CompletenessBar({ value }: { value: number }) {
  const color =
    value === 100 ? "#16a34a" : value >= 70 ? "#f59e0b" : "#dc2626";
  return (
    <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        sx={{
          flex: 1,
          height: 8,
          bgcolor: "rgba(0,0,0,0.06)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <Box sx={{ width: `${value}%`, height: "100%", bgcolor: color }} />
      </Box>
      <Box sx={{ fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: "right" }}>
        {value}%
      </Box>
    </Box>
  );
}

const COLUMNS: GridColDef<CompletenessRow>[] = [
  {
    field: "symbol",
    headerName: "Symbol",
    width: 110,
    renderCell: (p) => (
      <Chip label={p.value as string} size="small" sx={{ fontWeight: 700 }} />
    ),
  },
  { field: "company_name", headerName: "Company", flex: 1, minWidth: 220 },
  {
    field: "status",
    headerName: "Status",
    width: 110,
    renderCell: (p) => (
      <Chip
        label={p.value as string}
        size="small"
        color={STATUS_COLOR[p.value as string] ?? "default"}
        variant="outlined"
      />
    ),
  },
  { field: "listing_date", headerName: "Listing Date", width: 130 },
  {
    field: "completeness_pct",
    headerName: "Completeness",
    width: 180,
    renderCell: (p) => <CompletenessBar value={Number(p.value)} />,
  },
  {
    field: "updated_at",
    headerName: "Updated",
    width: 170,
    valueFormatter: (v) =>
      v ? new Date(v as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—",
  },
  {
    field: "actions",
    headerName: "",
    width: 60,
    sortable: false,
    renderCell: (p) => (
      <Link href={`/admin/ipos/${p.row.id}`}>
        <IconButton size="small">
          <EditRoundedIcon fontSize="small" />
        </IconButton>
      </Link>
    ),
  },
];

export default function IposTable({ rows }: { rows: CompletenessRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [status, setStatus] = React.useState(params.get("status") ?? "");
  const [min, setMin] = React.useState(params.get("min") ?? "");

  function applyFilters() {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (min) sp.set("min", min);
    router.push(`/admin/ipos?${sp.toString()}`);
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <TextField
          size="small"
          label="ค้นหา (symbol / company)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="listed">Listed</MenuItem>
          <MenuItem value="upcoming">Upcoming</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="Min completeness"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="100">100% only</MenuItem>
          <MenuItem value="70">≥ 70%</MenuItem>
          <MenuItem value="50">≥ 50%</MenuItem>
          <MenuItem value="0">Incomplete (&lt; 100)</MenuItem>
        </TextField>
      </Stack>

      <Box sx={{ height: 580 }}>
        <DataGrid
          rows={rows}
          columns={COLUMNS}
          density="compact"
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
        />
      </Box>
    </Stack>
  );
}
