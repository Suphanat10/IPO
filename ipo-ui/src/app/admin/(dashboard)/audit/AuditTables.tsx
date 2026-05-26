"use client";

import * as React from "react";
import {
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Link from "next/link";
import type { AuditLogRow, IpoStatus, RecentUpdateRow } from "@/lib/admin/types";
import {
  adminColors,
  adminControlBarSx,
  adminDataGridSx,
} from "../../components/AdminPrimitives";

const STATUS_LABEL: Record<IpoStatus, string> = {
  listed: "จดทะเบียนแล้ว / Listed",
  upcoming: "IPO กำลังจะเข้า",
  cancelled: "ยกเลิก / Cancelled",
};

const PART_LABEL: Record<RecentUpdateRow["last_touched_part"], string> = {
  core: "ข้อมูลหลัก / Core",
  financials: "การเงิน / Financials",
};

const ACTION_LABEL: Record<string, string> = {
  create: "สร้าง / Create",
  update: "แก้ไข / Update",
  delete: "ลบ / Delete",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว / ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว / ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว / ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว / ${days}d ago`;
}

function gridSx() {
  return [
    adminDataGridSx,
    {
      "& .MuiDataGrid-cell": {
        py: 0.75,
      },
    },
  ];
}

function recentSearchText(row: RecentUpdateRow) {
  return [
    row.symbol,
    row.status,
    STATUS_LABEL[row.status],
    row.last_touched_part,
    PART_LABEL[row.last_touched_part],
    row.last_touched_at,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

function auditSearchText(row: AuditLogRow) {
  return [
    row.entity,
    row.entity_id,
    row.action,
    ACTION_LABEL[row.action],
    row.created_at,
    row.diff ? JSON.stringify(row.diff) : "",
  ]
    .join(" ")
    .toLowerCase();
}

export function RecentUpdatesGrid({ rows }: { rows: RecentUpdateRow[] }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [part, setPart] = React.useState("");

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !recentSearchText(row).includes(q)) return false;
      if (status && row.status !== status) return false;
      if (part && row.last_touched_part !== part) return false;
      return true;
    });
  }, [part, rows, search, status]);

  const columns = React.useMemo<GridColDef<RecentUpdateRow>[]>(
    () => [
      {
        field: "symbol",
        headerName: "ชื่อย่อ / Symbol",
        width: 130,
        renderCell: (p) => (
          <Link
            href={`/admin/ipos/${p.row.id}`}
            style={{ color: adminColors.accent, fontWeight: 850, textDecoration: "none" }}
          >
            {p.row.symbol}
          </Link>
        ),
      },
      {
        field: "status",
        headerName: "สถานะ / Status",
        width: 178,
        renderCell: (p) => (
          <Chip
            size="small"
            label={STATUS_LABEL[p.row.status] ?? p.row.status}
            variant="outlined"
            color={p.row.status === "listed" ? "default" : "info"}
          />
        ),
      },
      {
        field: "last_touched_part",
        headerName: "ส่วนที่แก้ / Part touched",
        width: 188,
        renderCell: (p) => (
          <Chip
            size="small"
            label={PART_LABEL[p.row.last_touched_part] ?? p.row.last_touched_part}
            color={p.row.last_touched_part === "financials" ? "secondary" : "primary"}
            variant="outlined"
          />
        ),
      },
      {
        field: "last_touched_at",
        headerName: "เวลา / When",
        width: 210,
        renderCell: (p) => <Typography variant="caption">{fmtDateTime(p.row.last_touched_at)}</Typography>,
      },
      {
        field: "relative",
        headerName: "เทียบเวลา / Relative",
        width: 190,
        sortable: false,
        valueGetter: (_, row) => relativeTime(row.last_touched_at),
        renderCell: (p) => (
          <Typography variant="caption" sx={{ color: adminColors.muted }}>
            {p.value as string}
          </Typography>
        ),
      },
    ],
    [],
  );

  return (
    <Stack spacing={0}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1.25}
        sx={{
          ...adminControlBarSx,
          p: 2,
        }}
      >
        <TextField
          size="small"
          label="ค้นหา / Search"
          placeholder="ชื่อย่อ สถานะ ส่วนที่แก้"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: { lg: 320 } }}
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
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">ทั้งหมด / All</MenuItem>
          <MenuItem value="listed">จดทะเบียนแล้ว / Listed</MenuItem>
          <MenuItem value="upcoming">IPO กำลังจะเข้า</MenuItem>
          <MenuItem value="cancelled">ยกเลิก / Cancelled</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="ส่วนที่แก้ / Part"
          value={part}
          onChange={(e) => setPart(e.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">ทั้งหมด / All</MenuItem>
          <MenuItem value="core">ข้อมูลหลัก / Core</MenuItem>
          <MenuItem value="financials">การเงิน / Financials</MenuItem>
        </TextField>
        <Typography
          variant="caption"
          sx={{
            color: adminColors.muted,
            fontWeight: 800,
            minWidth: 128,
            alignSelf: "center",
            textAlign: { xs: "left", lg: "right" },
          }}
        >
          {filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} รายการ
        </Typography>
      </Stack>

      <Box sx={{ height: { xs: 430, lg: 470 }, width: "100%" }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          density="compact"
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: "ไม่พบข้อมูล / No rows" }}
          sx={gridSx()}
        />
      </Box>
    </Stack>
  );
}

export function AuditLogGrid({ rows }: { rows: AuditLogRow[] }) {
  const [search, setSearch] = React.useState("");
  const [action, setAction] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const entities = React.useMemo(() => Array.from(new Set(rows.map((row) => row.entity))).sort(), [rows]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !auditSearchText(row).includes(q)) return false;
      if (action && row.action !== action) return false;
      if (entity && row.entity !== entity) return false;
      return true;
    });
  }, [action, entity, rows, search]);

  const columns = React.useMemo<GridColDef<AuditLogRow>[]>(
    () => [
      {
        field: "created_at",
        headerName: "เวลา / When",
        width: 220,
        renderCell: (p) => (
          <Stack>
            <Typography variant="caption">{fmtDateTime(p.row.created_at)}</Typography>
            <Typography variant="caption" sx={{ color: adminColors.muted }}>
              {relativeTime(p.row.created_at)}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "entity",
        headerName: "เอนทิตี / Entity",
        width: 150,
        renderCell: (p) => <Chip size="small" label={p.row.entity} variant="outlined" />,
      },
      {
        field: "entity_id",
        headerName: "ID",
        width: 130,
        renderCell: (p) => (
          <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
            {p.row.entity_id}
          </Typography>
        ),
      },
      {
        field: "action",
        headerName: "การกระทำ / Action",
        width: 170,
        renderCell: (p) => (
          <Chip
            size="small"
            label={ACTION_LABEL[p.row.action] ?? p.row.action}
            color={
              p.row.action === "create"
                ? "success"
                : p.row.action === "delete"
                  ? "error"
                  : "primary"
            }
          />
        ),
      },
      {
        field: "diff",
        headerName: "รายละเอียด / Diff",
        flex: 1,
        minWidth: 360,
        sortable: false,
        renderCell: (p) =>
          p.row.diff ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                fontFamily: "monospace",
                fontSize: 11,
                lineHeight: 1.45,
                maxHeight: 96,
                overflow: "auto",
                color: adminColors.muted,
                whiteSpace: "pre-wrap",
                width: "100%",
              }}
            >
              {JSON.stringify(p.row.diff, null, 2)}
            </Box>
          ) : (
            <Typography variant="caption" sx={{ color: adminColors.muted }}>
              -
            </Typography>
          ),
      },
    ],
    [],
  );

  return (
    <Stack spacing={0}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1.25}
        sx={{
          ...adminControlBarSx,
          p: 2,
        }}
      >
        <TextField
          size="small"
          label="ค้นหา / Search"
          placeholder="entity, ID, action, diff"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: { lg: 320 } }}
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
          label="การกระทำ / Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">ทั้งหมด / All</MenuItem>
          <MenuItem value="create">สร้าง / Create</MenuItem>
          <MenuItem value="update">แก้ไข / Update</MenuItem>
          <MenuItem value="delete">ลบ / Delete</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="เอนทิตี / Entity"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">ทั้งหมด / All</MenuItem>
          {entities.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>
        <Typography
          variant="caption"
          sx={{
            color: adminColors.muted,
            fontWeight: 800,
            minWidth: 128,
            alignSelf: "center",
            textAlign: { xs: "left", lg: "right" },
          }}
        >
          {filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} รายการ
        </Typography>
      </Stack>

      <Box sx={{ height: { xs: 540, lg: 640 }, width: "100%" }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          density="compact"
          getRowHeight={() => "auto"}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: "ไม่พบข้อมูล / No rows" }}
          sx={gridSx()}
        />
      </Box>
    </Stack>
  );
}
