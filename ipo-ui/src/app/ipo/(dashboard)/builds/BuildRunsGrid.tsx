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
import type { BuildRun } from "@/lib/admin/types";
import {
  adminColors,
  adminControlBarSx,
  adminDataGridSx,
} from "../../components/AdminPrimitives";

const STATUS_LABEL: Record<BuildRun["status"], string> = {
  queued: "รอคิว / Queued",
  running: "กำลังทำงาน / Running",
  success: "สำเร็จ / Success",
  failed: "ล้มเหลว / Failed",
};

const STATUS_ORDER: BuildRun["status"][] = ["queued", "running", "success", "failed"];

const TRIGGER_LABEL: Record<string, string> = {
  manual: "สั่งเอง / Manual",
  auto: "อัตโนมัติ / Automatic",
  automatic: "อัตโนมัติ / Automatic",
  data_change: "ข้อมูลเปลี่ยน / Data change",
  csv_import: "นำเข้า CSV / CSV import",
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtBytes(n: number | null) {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function triggerLabel(trigger: string) {
  return TRIGGER_LABEL[trigger] ?? trigger;
}

function StatusChip({ s }: { s: BuildRun["status"] }) {
  if (s === "success") {
    return <Chip size="small" color="success" label={STATUS_LABEL[s]} variant="filled" />;
  }
  if (s === "failed") {
    return <Chip size="small" color="error" label={STATUS_LABEL[s]} variant="filled" />;
  }
  if (s === "running") {
    return <Chip size="small" color="warning" label={STATUS_LABEL[s]} variant="filled" />;
  }
  return <Chip size="small" color="default" label={STATUS_LABEL[s]} variant="outlined" />;
}

function gridSx() {
  return [
    adminDataGridSx,
    {
      "& .MuiDataGrid-cell": {
        alignItems: "center",
        display: "flex",
        py: 0.9,
      },
    },
  ];
}

function searchText(row: BuildRun) {
  return [
    `#${row.id}`,
    row.id,
    row.status,
    STATUS_LABEL[row.status],
    row.trigger_type,
    triggerLabel(row.trigger_type),
    row.started_at,
    row.finished_at,
    row.duration_ms,
    row.artifact_size,
    row.artifact_sha,
    row.git_commit,
    row.error_message,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

export default function BuildRunsGrid({ rows }: { rows: BuildRun[] }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [trigger, setTrigger] = React.useState("");

  const triggerOptions = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.trigger_type))).sort(),
    [rows],
  );

  const statusOptions = React.useMemo(
    () => STATUS_ORDER.filter((option) => rows.some((row) => row.status === option)),
    [rows],
  );

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !searchText(row).includes(q)) return false;
      if (status && row.status !== status) return false;
      if (trigger && row.trigger_type !== trigger) return false;
      return true;
    });
  }, [rows, search, status, trigger]);

  const columns = React.useMemo<GridColDef<BuildRun>[]>(
    () => [
      {
        field: "id",
        headerName: "#",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontWeight: 850 }}>
            #{p.row.id}
          </Typography>
        ),
      },
      {
        field: "status",
        headerName: "สถานะ / Status",
        width: 190,
        renderCell: (p) => <StatusChip s={p.row.status} />,
      },
      {
        field: "trigger_type",
        headerName: "ประเภทเริ่มงาน / Trigger",
        width: 220,
        renderCell: (p) => <Chip size="small" variant="outlined" label={triggerLabel(p.row.trigger_type)} />,
      },
      {
        field: "started_at",
        headerName: "เริ่มเมื่อ / Started",
        width: 220,
        renderCell: (p) => <Typography variant="caption">{fmtDateTime(p.row.started_at)}</Typography>,
      },
      {
        field: "duration_ms",
        headerName: "เวลาใช้ / Duration",
        width: 150,
        renderCell: (p) => <Typography variant="caption">{fmtDuration(p.row.duration_ms)}</Typography>,
      },
      {
        field: "artifact_size",
        headerName: "ไฟล์ผลลัพธ์ / Artifact",
        flex: 0.9,
        minWidth: 240,
        renderCell: (p) => (
          <Stack sx={{ minWidth: 0 }}>
            <Typography variant="caption">{fmtBytes(p.row.artifact_size)}</Typography>
            {p.row.artifact_sha ? (
              <Typography
                variant="caption"
                sx={{
                  color: adminColors.muted,
                  fontFamily: "monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.row.artifact_sha}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: "git_commit",
        headerName: "Commit",
        flex: 0.65,
        minWidth: 170,
        renderCell: (p) => (
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.row.git_commit ?? "-"}
          </Typography>
        ),
      },
      {
        field: "error_message",
        headerName: "ข้อผิดพลาด / Error",
        flex: 1,
        minWidth: 280,
        renderCell: (p) =>
          p.row.error_message ? (
            <Typography variant="caption" color="error">
              {p.row.error_message}
            </Typography>
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
          placeholder="เลขรัน สถานะ trigger commit error"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: { lg: 340 } }}
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
          {statusOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {STATUS_LABEL[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="ประเภทเริ่มงาน / Trigger"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">ทั้งหมด / All</MenuItem>
          {triggerOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {triggerLabel(option)}
            </MenuItem>
          ))}
        </TextField>
        <Typography
          variant="caption"
          sx={{
            color: adminColors.muted,
            fontWeight: 800,
            minWidth: 140,
            alignSelf: "center",
            textAlign: { xs: "left", lg: "right" },
          }}
        >
          {filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} รายการ / runs
        </Typography>
      </Stack>

      <Box sx={{ height: { xs: 520, lg: 620 }, width: "100%" }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          density="compact"
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          getRowHeight={() => "auto"}
          localeText={{ noRowsLabel: "ไม่พบรายการ Build / No build runs" }}
          sx={gridSx()}
        />
      </Box>
    </Stack>
  );
}
