"use client";

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Swal from "sweetalert2";
import { DataGrid, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid";
import { useRouter, useSearchParams } from "next/navigation";
import { toDateOnly } from "@/lib/date-format";
import type { CompletenessRow } from "@/lib/admin/types";
import {
  AdminStatusPill,
  adminColors,
  adminControlBarSx,
  adminDataGridSx,
} from "../../components/AdminPrimitives";

const STATUS_COLOR: Record<string, "default" | "success" | "info" | "warning"> = {
  listed: "success",
  upcoming: "info",
  cancelled: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  listed: "จดทะเบียนแล้ว / Listed",
  upcoming: "IPO กำลังจะเข้า",
  cancelled: "ยกเลิก / Cancelled",
};

function CompletenessBar({ value }: { value: number }) {
  const color =
    value === 100 ? "#047857" : value >= 70 ? adminColors.amber : adminColors.rose;
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
        <Box sx={{ width: `${value}%`, height: "100%", bgcolor: color }} />
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

const COLUMNS: GridColDef<CompletenessRow>[] = [
  {
    field: "symbol",
    headerName: "ชื่อย่อ / Symbol",
    width: 118,
    renderCell: (p) => <AdminStatusPill label={p.value as string} />,
  },
  {
    field: "status",
    headerName: "สถานะ / Status",
    width: 178,
    renderCell: (p) => (
      <Chip
        label={STATUS_LABEL[p.value as string] ?? (p.value as string)}
        size="small"
        color={STATUS_COLOR[p.value as string] ?? "default"}
        variant="outlined"
      />
    ),
  },
  {
    field: "market",
    headerName: "ตลาด / Market",
    width: 126,
    renderCell: (p) => <TextCell value={p.value} />,
  },
  {
    field: "industry",
    headerName: "กลุ่มอุตสาหกรรม / Industry",
    flex: 1,
    minWidth: 220,
    renderCell: (p) => <TextCell value={p.value} />,
  },
  {
    field: "sector",
    headerName: "หมวดธุรกิจ / Sector",
    flex: 1,
    minWidth: 220,
    renderCell: (p) => <TextCell value={p.value} />,
  },
  {
    field: "listing_date",
    headerName: "วันที่เข้าเทรด / Listing date",
    width: 190,
    renderCell: (p) => <TextCell value={toDateOnly(p.value) || "-"} />,
  },
  {
    field: "completeness_pct",
    headerName: "ความครบถ้วน / Completeness",
    width: 230,
    renderCell: (p) => <CompletenessBar value={Number(p.value)} />,
  },
  {
    field: "updated_at",
    headerName: "อัปเดต / Updated",
    width: 172,
    valueFormatter: (v) =>
      v ? new Date(v as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-",
  },
];

async function handleDelete(id: number, symbol: string, refreshFn: () => void) {
  const confirm = await Swal.fire({
    title: `ลบ ${symbol}?`,
    text: "ข้อมูล IPO นี้จะถูกลบออกจากระบบ",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ / Delete",
    cancelButtonText: "ยกเลิก / Cancel",
    confirmButtonColor: "#be123c",
  });
  if (!confirm.isConfirmed) return;

  Swal.fire({
    title: "กำลังลบ / Deleting…",
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await fetch(`/api/admin/ipos/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    Swal.close();
    await Swal.fire({
      title: "ลบสำเร็จ",
      text: `${symbol} ถูกลบแล้ว`,
      icon: "success",
      timer: 1800,
      showConfirmButton: false,
    });
    refreshFn();
  } catch (err) {
    Swal.close();
    await Swal.fire({
      title: "เกิดข้อผิดพลาด",
      text: err instanceof Error ? err.message : String(err),
      icon: "error",
      confirmButtonText: "ตกลง",
      confirmButtonColor: "#be123c",
    });
  }
}

export default function IposTable({
  rows,
  industries = [],
  sectors = [],
}: {
  rows: CompletenessRow[];
  industries?: string[];
  sectors?: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [status, setStatus] = React.useState(params.get("status") ?? "");
  const [min, setMin] = React.useState(params.get("min") ?? "");
  const [industry, setIndustry] = React.useState(params.get("industry") ?? "");
  const [sector, setSector] = React.useState(params.get("sector") ?? "");
  const [dateFrom, setDateFrom] = React.useState(params.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = React.useState(params.get("dateTo") ?? "");

  const columns: GridColDef<CompletenessRow>[] = [
    {
      field: "actions",
      type: "actions",
      headerName: "จัดการ",
      width: 100,
      getActions: (p) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditRoundedIcon fontSize="small" />}
          label="แก้ไข / Edit"
          onClick={() => router.push(`/admin/ipos/${p.row.id}`)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteOutlineRoundedIcon fontSize="small" sx={{ color: adminColors.rose }} />}
          label="ลบ / Delete"
          onClick={() => handleDelete(p.row.id, p.row.symbol, () => router.refresh())}
        />,
      ],
    },
    ...COLUMNS,
  ];

  function applyFilters() {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (min) sp.set("min", min);
    if (industry) sp.set("industry", industry);
    if (sector) sp.set("sector", sector);
    if (dateFrom) sp.set("dateFrom", dateFrom);
    if (dateTo) sp.set("dateTo", dateTo);
    const next = sp.toString();
    router.push(next ? `/admin/ipos?${next}` : "/admin/ipos");
  }

  function clearFilters() {
    setQ("");
    setStatus("");
    setMin("");
    setIndustry("");
    setSector("");
    setDateFrom("");
    setDateTo("");
    router.push("/admin/ipos");
  }

  return (
    <Stack spacing={0}>
      <Stack
        spacing={1.25}
        sx={{
          ...adminControlBarSx,
          p: 2,
        }}
      >
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25}>
          <TextField
            size="small"
            label="ค้นหาชื่อย่อ / Search symbol"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            sx={{ flex: 1 }}
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
            label="สถานะ / Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">ทั้งหมด / All</MenuItem>
            <MenuItem value="listed">จดทะเบียนแล้ว / Listed</MenuItem>
            <MenuItem value="upcoming">IPO กำลังจะเข้า</MenuItem>
            <MenuItem value="cancelled">ยกเลิก / Cancelled</MenuItem>
          </TextField>
          <TextField
            size="small"
            select
            label="ความครบถ้วนขั้นต่ำ / Min completeness"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">ไม่จำกัด / Any</MenuItem>
            <MenuItem value="100">ครบ 100% / 100% only</MenuItem>
            <MenuItem value="70">อย่างน้อย 70% / At least 70%</MenuItem>
            <MenuItem value="50">อย่างน้อย 50% / At least 50%</MenuItem>
            <MenuItem value="0">ยังไม่ครบ / Incomplete (&lt; 100)</MenuItem>
          </TextField>
        </Stack>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25}>
          <TextField
            size="small"
            select
            label="กลุ่มอุตสาหกรรม / Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            sx={{ minWidth: 200, flex: 1 }}
          >
            <MenuItem value="">ทั้งหมด / All</MenuItem>
            {industries.map((v) => (
              <MenuItem key={v} value={v}>{v}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            select
            label="หมวดธุรกิจ / Sector"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            sx={{ minWidth: 200, flex: 1 }}
          >
            <MenuItem value="">ทั้งหมด / All</MenuItem>
            {sectors.map((v) => (
              <MenuItem key={v} value={v}>{v}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="date"
            label="วันที่เข้าเทรด ตั้งแต่ / Listing from"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 180 }}
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
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<SearchRoundedIcon />}
              onClick={applyFilters}
              sx={{ minWidth: 112 }}
            >
              ค้นหา / Apply
            </Button>
            <IconButton onClick={clearFilters} aria-label="ล้างตัวกรอง / Clear filters">
              <RestartAltRoundedIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Stack>

      <Box sx={{ height: 640, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="compact"
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          sx={adminDataGridSx}
        />
      </Box>
    </Stack>
  );
}
