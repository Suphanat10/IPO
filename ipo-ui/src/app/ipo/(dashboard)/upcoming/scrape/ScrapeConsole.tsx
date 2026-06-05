"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  Link,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import Swal from "sweetalert2";
import {
  AdminPanel,
  AdminStatusPill,
  adminColors,
  adminTableSx,
} from "../../../components/AdminPrimitives";

type Run = {
  id: string;
  source: string;
  status: "running" | "success" | "failed" | "partial";
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_fetched: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  failed_count: number;
  error_message: string | null;
};

type DiffEntry = { before: unknown; after: unknown };

type ItemRow = {
  id: number;
  symbol: string;
  ipo_id: number | null;
  action: "inserted" | "updated" | "unchanged" | "failed";
  diff: Record<string, DiffEntry> | null;
  scraped_data: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

type RunDetail = {
  run: Run & { log_excerpt: string | null };
  items: ItemRow[];
};

const STATUS_LABELS: Record<Run["status"], string> = {
  running: "กำลังทำงาน / Running",
  success: "สำเร็จ / Success",
  failed: "ล้มเหลว / Failed",
  partial: "สำเร็จบางส่วน / Partial",
};

const ACTION_LABELS: Record<ItemRow["action"], string> = {
  inserted: "เพิ่มใหม่ / Inserted",
  updated: "อัปเดต / Updated",
  unchanged: "ไม่เปลี่ยน / Unchanged",
  failed: "ล้มเหลว / Failed",
};

type ScheduleSlot = {
  id?: number;
  hour: number;
  minute: number;
  enabled: boolean;
  updated_by?: string | null;
  updated_at?: string;
};

const DEFAULT_SCHEDULE_SLOTS: ScheduleSlot[] = [
  { hour: 8, minute: 0, enabled: true },
  { hour: 17, minute: 30, enabled: true },
];
const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const BANGKOK_WEEKDAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const BANGKOK_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const BANGKOK_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: BANGKOK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type BangkokDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function formatDuration(ms: number | null) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getBangkokParts(date: Date): BangkokDateParts {
  const parts = BANGKOK_DATE_PARTS.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function addBangkokDays(parts: BangkokDateParts, days: number): BangkokDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function bangkokWallTimeToDate(parts: BangkokDateParts, hour: number, minute = 0): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 7, minute, 0, 0));
}

function formatBangkokNextRun(parts: BangkokDateParts, hour: number, minute = 0): string {
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
  return `${BANGKOK_WEEKDAY_SHORT[weekday]} ${parts.day} ${BANGKOK_MONTH_SHORT[parts.month - 1]} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  if (totalMinutes === 0) return "น้อยกว่า 1 นาที / less than 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} นาที / ${minutes}m`;
  return `${hours} ชั่วโมง ${minutes} นาที / ${hours}h ${minutes}m`;
}

function getNextScrapeRun(now: Date, slots: ScheduleSlot[]) {
  const enabledSlots = slots
    .filter((s) => s.enabled)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  if (enabledSlots.length === 0) return null;

  const parts = getBangkokParts(now);
  const currentSeconds = parts.hour * 3600 + parts.minute * 60 + parts.second;
  const nextSlot = enabledSlots.find(
    (slot) => currentSeconds < slot.hour * 3600 + slot.minute * 60,
  );
  const targetParts = nextSlot == null ? addBangkokDays(parts, 1) : parts;
  const slot = nextSlot ?? enabledSlots[0];
  const nextRun = bangkokWallTimeToDate(targetParts, slot.hour, slot.minute);

  return {
    nextRun,
    nextRunLabel: formatBangkokNextRun(targetParts, slot.hour, slot.minute),
    remainingLabel: formatCountdown(nextRun.getTime() - now.getTime()),
  };
}

function statusTone(status: Run["status"]): "info" | "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "partial") return "warning";
  return "info";
}

function actionTone(action: ItemRow["action"]): "success" | "info" | "neutral" | "danger" {
  if (action === "inserted") return "success";
  if (action === "updated") return "info";
  if (action === "failed") return "danger";
  return "neutral";
}

function formatValue(v: unknown): string {
  if (v == null) return "-";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ข้อมูลที่มาจาก ก.ล.ต. (อยู่ใน scraped_data.secMeta) — แสดงเป็นตารางแทน JSON ดิบ.
const SEC_FIELD_LABELS: Record<string, string> = {
  filing_url: "ลิงก์แบบไฟลิ่ง / Filing",
  sec_trans_id: "เลขที่คำขอ (TransID)",
  executive_summary_url: "สรุปผู้บริหาร / Exec summary",
  par_value: "ราคาพาร์ / Par value",
  pe_ratio: "P/E",
  market_cap: "มูลค่าตลาด / Market cap",
  issued_size: "ขนาดที่ออก / Issued size",
};
const SEC_FIELD_ORDER = Object.keys(SEC_FIELD_LABELS);

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function SecMetaSection({ scraped }: { scraped: Record<string, unknown> | null }) {
  const secMeta =
    scraped && typeof scraped.secMeta === "object" && scraped.secMeta !== null
      ? (scraped.secMeta as Record<string, unknown>)
      : null;
  if (!secMeta) return null;

  const keys = [
    ...SEC_FIELD_ORDER.filter((k) => secMeta[k] != null),
    ...Object.keys(secMeta).filter((k) => !SEC_FIELD_ORDER.includes(k) && secMeta[k] != null),
  ];
  if (keys.length === 0) return null;

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, mb: 1, fontSize: 14 }}>
        ข้อมูลจาก ก.ล.ต. / SEC data
      </Typography>
      <TableContainer>
        <Table size="small" sx={adminTableSx}>
          <TableBody>
            {keys.map((k) => {
              const value = secMeta[k];
              return (
                <TableRow key={k}>
                  <TableCell sx={{ width: 220, fontSize: 12, fontWeight: 700 }}>
                    {SEC_FIELD_LABELS[k] ?? k}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, wordBreak: "break-all" }}>
                    {isHttpUrl(value) ? (
                      <Link href={value} target="_blank" rel="noopener noreferrer">
                        {value}
                      </Link>
                    ) : (
                      formatValue(value)
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default function ScrapeConsole() {
  const [runs, setRuns] = React.useState<Run[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [triggering, setTriggering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [historyPage, setHistoryPage] = React.useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = React.useState(25);
  const [scheduleNow, setScheduleNow] = React.useState<Date | null>(null);

  const [scheduleSlots, setScheduleSlots] = React.useState<ScheduleSlot[]>(DEFAULT_SCHEDULE_SLOTS);
  const [editingSchedule, setEditingSchedule] = React.useState(false);
  const [draftSlots, setDraftSlots] = React.useState<ScheduleSlot[]>([]);
  const [savingSchedule, setSavingSchedule] = React.useState(false);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = React.useState<string | null>(null);

  const loadRuns = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ipo/upcoming/runs", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { runs: Run[] };
      setRuns(data.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = React.useCallback(async (runId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ipo/upcoming/runs/${runId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RunDetail;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadSchedule = React.useCallback(async () => {
    try {
      const res = await fetch("/api/ipo/upcoming/schedule", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { slots: ScheduleSlot[] };
      if (data.slots.length > 0) setScheduleSlots(data.slots);
    } catch {
      // fall back to defaults silently
    }
  }, []);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadRuns();
      void loadSchedule();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadRuns, loadSchedule]);

  // Poll while any run is "running"
  React.useEffect(() => {
    if (!runs?.some((r) => r.status === "running")) return;
    const id = window.setInterval(() => {
      void loadRuns();
      if (activeRunId) void loadDetail(activeRunId);
    }, 3000);
    return () => window.clearInterval(id);
  }, [runs, loadRuns, loadDetail, activeRunId]);

  React.useEffect(() => {
    const updateScheduleNow = () => setScheduleNow(new Date());
    const initialId = window.setTimeout(updateScheduleNow, 0);
    const id = window.setInterval(() => {
      updateScheduleNow();
    }, 30_000);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(id);
    };
  }, []);

  async function triggerScrape() {
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch("/api/ipo/upcoming/scrape", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  }

  function openDetail(runId: string) {
    setActiveRunId(runId);
    void loadDetail(runId);
  }

  function closeDetail() {
    setActiveRunId(null);
    setDetail(null);
  }

  const lastRun = runs?.[0] ?? null;
  const runningCount = runs?.filter((r) => r.status === "running").length ?? 0;
  const runRows = runs ?? [];
  const maxHistoryPage = runRows.length > 0
    ? Math.max(0, Math.ceil(runRows.length / historyRowsPerPage) - 1)
    : 0;
  const visibleHistoryPage = Math.min(historyPage, maxHistoryPage);
  const pagedRuns = runRows.slice(
    visibleHistoryPage * historyRowsPerPage,
    visibleHistoryPage * historyRowsPerPage + historyRowsPerPage,
  );
  const nextScrapeRun = React.useMemo(
    () => (scheduleNow ? getNextScrapeRun(scheduleNow, scheduleSlots) : null),
    [scheduleNow, scheduleSlots],
  );

  function startEditSchedule() {
    setDraftSlots(scheduleSlots.map((s) => ({ ...s })));
    setEditingSchedule(true);
    setScheduleError(null);
    setScheduleSuccess(null);
  }

  function cancelEditSchedule() {
    setEditingSchedule(false);
    setDraftSlots([]);
    setScheduleError(null);
  }

  function addDraftSlot() {
    if (draftSlots.length >= 6) return;
    setDraftSlots([...draftSlots, { hour: 12, minute: 0, enabled: true }]);
  }

  function removeDraftSlot(index: number) {
    if (draftSlots.length <= 1) return;
    setDraftSlots(draftSlots.filter((_, i) => i !== index));
  }

  function updateDraftSlot(index: number, field: "hour" | "minute" | "enabled", value: number | boolean) {
    setDraftSlots(draftSlots.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    setScheduleError(null);
    setScheduleSuccess(null);
    try {
      const res = await fetch("/api/ipo/upcoming/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: draftSlots.map((s) => ({ hour: s.hour, minute: s.minute, enabled: s.enabled })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setScheduleSlots(data.slots);
      setEditingSchedule(false);
      setScheduleSuccess(null);
      void Swal.fire({
        title: "บันทึกตารางเวลาแล้ว",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSchedule(false);
    }
  }

  function handleHistoryPageChange(_: React.MouseEvent<HTMLButtonElement> | null, page: number) {
    setHistoryPage(page);
  }

  function handleHistoryRowsPerPageChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setHistoryRowsPerPage(Number.parseInt(event.target.value, 10));
    setHistoryPage(0);
  }

  return (
    <Stack spacing={3}>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <AdminPanel
        title="ควบคุมการดึงข้อมูล / Scrape Control"
        subtitle="ดึงข้อมูลล่าสุดจาก SET API + SEC filing pages / Fetch latest data from SET API + SEC filing pages"
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={loadRuns}
              disabled={loading}
            >
              รีเฟรช / Refresh
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={triggering ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRoundedIcon />}
              onClick={triggerScrape}
              disabled={triggering || runningCount > 0}
            >
              {runningCount > 0 ? "กำลังทำงาน... / Running..." : "เริ่ม Scrape / Start Scrape"}
            </Button>
          </Stack>
        }
      >
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <SummaryStat label="ครั้งล่าสุด / Last run" value={lastRun ? formatDateTime(lastRun.started_at) : "ยังไม่มี / No runs yet"} />
          <SummaryStat
            label="สถานะ / Status"
            value={lastRun ? <AdminStatusPill tone={statusTone(lastRun.status)} label={STATUS_LABELS[lastRun.status]} /> : "-"}
          />
          <SummaryStat
            label={
              <>
                เพิ่มใหม่ / อัปเดต / ไม่เปลี่ยน / ล้มเหลว
                <br />
                Inserted / Updated / Unchanged / Failed
              </>
            }
            value={
              lastRun
                ? `${lastRun.inserted_count} / ${lastRun.updated_count} / ${lastRun.unchanged_count} / ${lastRun.failed_count}`
                : "-"
            }
          />
          <SummaryStat label="ระยะเวลา / Duration" value={lastRun ? formatDuration(lastRun.duration_ms) : "-"} />
        </Stack>
        {scheduleSuccess ? (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setScheduleSuccess(null)}>
            {scheduleSuccess}
          </Alert>
        ) : null}

        <Box
          sx={{
            mt: 2,
            p: { xs: 1.35, sm: 1.5 },
            border: `1px solid ${adminColors.borderSoft}`,
            borderRadius: 1,
            bgcolor: "#f8fafc",
          }}
        >
          {!editingSchedule ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.25}
              sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1,
                  display: "grid",
                  placeItems: "center",
                  color: adminColors.blue,
                  bgcolor: "#dbeafe",
                  flexShrink: 0,
                }}
              >
                <ScheduleRoundedIcon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: adminColors.muted }}>
                  ตั้งเวลาให้แล้ว / Scheduled automation
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 850, color: adminColors.text, mt: 0.25 }}>
                  Upcoming IPO Scraper
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                  {scheduleSlots.map((slot, i) => (
                    <Chip
                      key={i}
                      size="small"
                      label={`${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`}
                      variant={slot.enabled ? "filled" : "outlined"}
                      sx={{
                        fontWeight: 800,
                        fontSize: 13,
                        fontFamily: "monospace",
                        bgcolor: slot.enabled ? "#dbeafe" : undefined,
                        color: slot.enabled ? adminColors.blue : adminColors.muted,
                        textDecoration: slot.enabled ? "none" : "line-through",
                      }}
                    />
                  ))}
                  <Typography sx={{ fontSize: 12, color: adminColors.muted, alignSelf: "center", ml: 0.5 }}>
                    (เวลาไทย / Asia/Bangkok)
                  </Typography>
                </Stack>
                {nextScrapeRun ? (
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 0.5, md: 2 }}
                    sx={{ mt: 1 }}
                  >
                    <Typography sx={{ fontSize: 13, color: adminColors.text, fontWeight: 750 }}>
                      รอบถัดไป / Next run: {nextScrapeRun.nextRunLabel}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: adminColors.blue, fontWeight: 850 }}>
                      เหลืออีก / Time left: {nextScrapeRun.remainingLabel}
                    </Typography>
                  </Stack>
                ) : (
                  <Typography sx={{ fontSize: 13, color: adminColors.muted, mt: 1 }}>
                    ไม่มีรอบที่เปิดใช้งาน / No enabled schedule slots
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <AdminStatusPill
                  tone={scheduleSlots.some((s) => s.enabled) ? "info" : "neutral"}
                  label={scheduleSlots.some((s) => s.enabled) ? "เปิดใช้งาน / Active" : "ปิดทั้งหมด / Inactive"}
                />
                <Tooltip title="แก้ไขตารางเวลา / Edit schedule">
                  <IconButton size="small" onClick={startEditSchedule}>
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          ) : (
            <ScheduleEditor
              draftSlots={draftSlots}
              saving={savingSchedule}
              error={scheduleError}
              onUpdate={updateDraftSlot}
              onAdd={addDraftSlot}
              onRemove={removeDraftSlot}
              onSave={saveSchedule}
              onCancel={cancelEditSchedule}
            />
          )}
        </Box>
      </AdminPanel>

      <AdminPanel title="ประวัติการดึงข้อมูล / Run History" subtitle="50 รายการล่าสุด / Latest 50 runs" noPadding>
        <TableContainer
          sx={{
            width: "100%",
            overflowX: "auto",
            scrollbarWidth: "thin",
          }}
        >
          <Table
            size="small"
            sx={[
              adminTableSx,
              {
                width: "100%",
                minWidth: { xs: 840, lg: "100%" },
                tableLayout: "fixed",
                "& .MuiTableCell-root": {
                  px: { xs: 0.75, sm: 1, md: 1.15 },
                  py: 0.85,
                  fontSize: { xs: 11, md: 12 },
                  lineHeight: 1.25,
                  verticalAlign: "middle",
                },
                "& .MuiTableHead-root .MuiTableCell-root": {
                  fontSize: { xs: 10, md: 11 },
                  whiteSpace: "normal",
                  wordBreak: "keep-all",
                },
                "& .MuiTableBody-root .MuiTableCell-root": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
                "& .MuiChip-root": {
                  maxWidth: "100%",
                },
                "& .MuiChip-label": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              },
            ]}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: { xs: 138, lg: "14%" } }}>เริ่มเมื่อ / Started</TableCell>
                <TableCell sx={{ width: { xs: 150, lg: "15%" } }}>สถานะ / Status</TableCell>
                <TableCell sx={{ width: { xs: 128, lg: "13%" } }}>โดย / Triggered by</TableCell>
                <TableCell align="right" sx={{ width: { xs: 74, lg: "8%" } }}>ดึงมา / Fetched</TableCell>
                <TableCell align="right" sx={{ width: { xs: 82, lg: "9%" } }}>เพิ่มใหม่ / Inserted</TableCell>
                <TableCell align="right" sx={{ width: { xs: 78, lg: "8%" } }}>อัปเดต / Updated</TableCell>
                <TableCell align="right" sx={{ width: { xs: 92, lg: "10%" } }}>ไม่เปลี่ยน / Unchanged</TableCell>
                <TableCell align="right" sx={{ width: { xs: 78, lg: "8%" } }}>ล้มเหลว / Failed</TableCell>
                <TableCell align="right" sx={{ width: { xs: 90, lg: "9%" } }}>ระยะเวลา / Duration</TableCell>
                <TableCell align="center" sx={{ width: { xs: 58, lg: "6%" } }}>ดู / View</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs == null && loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : runs && runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4, color: adminColors.muted }}>
                    ยังไม่มีประวัติ / No run history yet. กดปุ่มเริ่ม Scrape / Start Scrape เพื่อเริ่มต้น.
                  </TableCell>
                </TableRow>
              ) : (
                pagedRuns.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{formatDateTime(r.started_at)}</TableCell>
                    <TableCell>
                      {r.status === "running" ? (
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <CircularProgress size={12} />
                          <Typography sx={{ fontSize: 12, fontWeight: 700 }}>กำลังทำงาน / Running</Typography>
                        </Stack>
                      ) : (
                        <AdminStatusPill tone={statusTone(r.status)} label={STATUS_LABELS[r.status]} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: adminColors.muted }}>
                      {r.triggered_by ?? "-"}
                    </TableCell>
                    <TableCell align="right">{r.total_fetched}</TableCell>
                    <TableCell align="right" sx={{ color: "#047857", fontWeight: 700 }}>
                      {r.inserted_count}
                    </TableCell>
                    <TableCell align="right" sx={{ color: adminColors.blue, fontWeight: 700 }}>
                      {r.updated_count}
                    </TableCell>
                    <TableCell align="right" sx={{ color: adminColors.muted }}>
                      {r.unchanged_count}
                    </TableCell>
                    <TableCell align="right" sx={{ color: r.failed_count > 0 ? adminColors.rose : adminColors.muted, fontWeight: 700 }}>
                      {r.failed_count}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 12 }}>
                      {formatDuration(r.duration_ms)}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => openDetail(r.id)} aria-label="ดูรายละเอียด / View details">
                        <VisibilityRoundedIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={runRows.length}
          page={visibleHistoryPage}
          rowsPerPage={historyRowsPerPage}
          rowsPerPageOptions={[10, 25, 50]}
          onPageChange={handleHistoryPageChange}
          onRowsPerPageChange={handleHistoryRowsPerPageChange}
          labelRowsPerPage="Rows per page:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
          sx={{
            borderTop: `1px solid ${adminColors.borderSoft}`,
            bgcolor: adminColors.panelAlt,
            color: adminColors.text,
            ".MuiTablePagination-toolbar": {
              minHeight: 52,
              px: { xs: 1, sm: 2 },
              gap: { xs: 0.5, sm: 1 },
            },
            ".MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows": {
              m: 0,
              fontSize: 13,
              color: adminColors.text,
            },
            ".MuiTablePagination-select": {
              fontSize: 13,
              fontWeight: 700,
            },
          }}
        />
      </AdminPanel>

      <Dialog open={activeRunId != null} onClose={closeDetail} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pr: 5 }}>
          รายละเอียดการ scrape / Scrape Details
          <IconButton onClick={closeDetail} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading && !detail ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : detail ? (
            <RunDetailView detail={detail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

function SummaryStat({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: adminColors.muted, textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Box sx={{ mt: 0.5, fontSize: 14, fontWeight: 800, color: adminColors.text }}>{value}</Box>
    </Box>
  );
}

function ScheduleEditor({
  draftSlots,
  saving,
  error,
  onUpdate,
  onAdd,
  onRemove,
  onSave,
  onCancel,
}: {
  draftSlots: ScheduleSlot[];
  saving: boolean;
  error: string | null;
  onUpdate: (index: number, field: "hour" | "minute" | "enabled", value: number | boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const activeSlotCount = draftSlots.filter((slot) => slot.enabled).length;

  return (
    <Stack spacing={1.25} sx={{ width: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              display: "grid",
              placeItems: "center",
              color: adminColors.blue,
              bgcolor: "#e0f2fe",
              flexShrink: 0,
            }}
          >
            <ScheduleRoundedIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 850, color: adminColors.text, lineHeight: 1.25 }}>
              ตั้งเวลา Scraper / Configure Schedule
            </Typography>
            <Typography sx={{ fontSize: 12, color: adminColors.muted, mt: 0.15 }}>
              เวลาไทย / Asia/Bangkok
            </Typography>
          </Box>
        </Stack>
        <Chip
          size="small"
          label={`${activeSlotCount}/${draftSlots.length} เปิดใช้งาน / Active`}
          sx={{
            height: 24,
            fontSize: 11,
            fontWeight: 800,
            bgcolor: activeSlotCount > 0 ? "#dbeafe" : "#eef2f7",
            color: activeSlotCount > 0 ? adminColors.blue : adminColors.muted,
            alignSelf: { xs: "flex-start", sm: "center" },
          }}
        />
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ py: 0 }}>
          {error}
        </Alert>
      ) : null}

      <Stack spacing={0.75}>
        {draftSlots.map((slot, index) => (
          <Box
            key={index}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "76px minmax(172px, 230px) minmax(128px, 1fr) 36px",
              },
              gap: { xs: 0.75, sm: 1 },
              alignItems: "center",
              p: { xs: 1, sm: 1.1 },
              border: `1px solid ${adminColors.borderSoft}`,
              borderRadius: 1,
              bgcolor: "#ffffff",
            }}
          >
            <Typography
              sx={{
                fontSize: 12.5,
                fontWeight: 850,
                color: adminColors.text,
                whiteSpace: "nowrap",
              }}
            >
              รอบ {index + 1}
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: "center",
                minWidth: 0,
                width: "100%",
              }}
            >
              <FormControl size="small" sx={{ width: { xs: 80, sm: 78 }, flexShrink: 0 }}>
                <Select
                  value={slot.hour}
                  inputProps={{ "aria-label": `ชั่วโมงรอบ ${index + 1} / Slot ${index + 1} hour` }}
                  onChange={(e) => onUpdate(index, "hour", Number(e.target.value))}
                  sx={{
                    height: 38,
                    borderRadius: 1,
                    fontSize: 13,
                    fontFamily: "monospace",
                    fontWeight: 800,
                    bgcolor: adminColors.panelAlt,
                    "& .MuiSelect-select": { py: 0.95, pl: 1.5, pr: 3.1 },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: adminColors.borderSoft },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#93c5fd" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: adminColors.blue },
                  }}
                >
                  {hours.map((h) => (
                    <MenuItem key={h} value={h} sx={{ fontSize: 13, fontFamily: "monospace" }}>
                      {String(h).padStart(2, "0")}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography sx={{ fontSize: 16, fontWeight: 900, color: adminColors.muted, lineHeight: 1 }}>:</Typography>
              <FormControl size="small" sx={{ width: { xs: 80, sm: 78 }, flexShrink: 0 }}>
                <Select
                  value={slot.minute}
                  inputProps={{ "aria-label": `นาทีรอบ ${index + 1} / Slot ${index + 1} minute` }}
                  onChange={(e) => onUpdate(index, "minute", Number(e.target.value))}
                  sx={{
                    height: 38,
                    borderRadius: 1,
                    fontSize: 13,
                    fontFamily: "monospace",
                    fontWeight: 800,
                    bgcolor: adminColors.panelAlt,
                    "& .MuiSelect-select": { py: 0.95, pl: 1.5, pr: 3.1 },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: adminColors.borderSoft },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#93c5fd" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: adminColors.blue },
                  }}
                >
                  {minutes.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontSize: 13, fontFamily: "monospace" }}>
                      {String(m).padStart(2, "0")}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: "center",
                justifyContent: { xs: "space-between", sm: "flex-start" },
                minWidth: 0,
              }}
            >
              <Tooltip title={slot.enabled ? "เปิดใช้งาน / Enabled" : "ปิดใช้งาน / Disabled"}>
                <Switch
                  size="small"
                  checked={slot.enabled}
                  onChange={(e) => onUpdate(index, "enabled", e.target.checked)}
                  sx={{
                    width: 44,
                    height: 28,
                    p: 0.5,
                    "& .MuiSwitch-switchBase": {
                      p: 0.75,
                      "&.Mui-checked": {
                        color: "#ffffff",
                        transform: "translateX(16px)",
                        "& + .MuiSwitch-track": {
                          bgcolor: adminColors.blue,
                          opacity: 1,
                        },
                      },
                    },
                    "& .MuiSwitch-thumb": {
                      width: 16,
                      height: 16,
                      boxShadow: "0 1px 2px rgba(10,25,41,0.28)",
                    },
                    "& .MuiSwitch-track": {
                      borderRadius: 999,
                      bgcolor: "#cbd5e1",
                      opacity: 1,
                    },
                  }}
                />
              </Tooltip>
              <Box
                component="span"
                sx={{
                  px: 1,
                  py: 0.35,
                  borderRadius: 999,
                  border: `1px solid ${slot.enabled ? "rgba(4,120,87,0.18)" : adminColors.borderSoft}`,
                  bgcolor: slot.enabled ? "#dcfce7" : "#eef2f7",
                  color: slot.enabled ? "#047857" : adminColors.muted,
                  fontSize: 11,
                  fontWeight: 850,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                {slot.enabled ? "เปิด / ON" : "ปิด / OFF"}
              </Box>
            </Stack>
            <Box sx={{ display: "flex", justifyContent: { xs: "flex-end", sm: "center" } }}>
              {draftSlots.length > 1 ? (
                <Tooltip title="ลบรอบนี้ / Remove">
                  <IconButton
                    size="small"
                    onClick={() => onRemove(index)}
                    sx={{
                      width: 32,
                      height: 32,
                      color: adminColors.rose,
                      border: `1px solid ${adminColors.borderSoft}`,
                      bgcolor: "#fff7f8",
                      "&:hover": { bgcolor: "#ffe4e6" },
                    }}
                    aria-label={`ลบรอบ ${index + 1} / Remove slot ${index + 1}`}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Box sx={{ width: 32, height: 32 }} />
              )}
            </Box>
          </Box>
        ))}
      </Stack>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ pt: 0.25, alignItems: { xs: "stretch", sm: "center" } }}
      >
        {draftSlots.length < 6 ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={onAdd}
            sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
          >
            เพิ่มรอบ / Add slot
          </Button>
        ) : null}
        <Box sx={{ flex: 1, display: { xs: "none", sm: "block" } }} />
        <Stack
          direction={{ xs: "column-reverse", sm: "row" }}
          spacing={1}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          <Button size="small" variant="outlined" onClick={onCancel} disabled={saving} sx={{ width: { xs: "100%", sm: "auto" } }}>
            ยกเลิก / Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRoundedIcon />}
            onClick={onSave}
            disabled={saving}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            บันทึก / Save
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

function RunDetailView({ detail }: { detail: RunDetail }) {
  const { run, items } = detail;
  const [tab, setTab] = React.useState<"items" | "log" | "summary">("items");
  const [activeItemId, setActiveItemId] = React.useState<number | null>(null);
  const activeItem = items.find((i) => i.id === activeItemId) ?? null;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <SummaryStat label="รหัสรัน / Run ID" value={<code style={{ fontSize: 11 }}>{run.id}</code>} />
        <SummaryStat label="สถานะ / Status" value={<AdminStatusPill tone={statusTone(run.status)} label={STATUS_LABELS[run.status]} />} />
        <SummaryStat label="เริ่ม / Started" value={formatDateTime(run.started_at)} />
        <SummaryStat label="เสร็จ / Finished" value={formatDateTime(run.finished_at)} />
        <SummaryStat label="ระยะเวลา / Duration" value={formatDuration(run.duration_ms)} />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <Chip size="small" label={`ดึงมา / Fetched: ${run.total_fetched}`} />
        <Chip size="small" label={`เพิ่มใหม่ / Inserted: ${run.inserted_count}`} color="success" variant="outlined" />
        <Chip size="small" label={`อัปเดต / Updated: ${run.updated_count}`} color="info" variant="outlined" />
        <Chip size="small" label={`ไม่เปลี่ยน / Unchanged: ${run.unchanged_count}`} variant="outlined" />
        <Chip size="small" label={`ล้มเหลว / Failed: ${run.failed_count}`} color="error" variant="outlined" />
      </Stack>

      {run.error_message ? (
        <Alert severity="error">{run.error_message}</Alert>
      ) : null}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab label={`รายการ IPO / IPO Items (${items.length})`} value="items" />
        <Tab label="บันทึก / Log" value="log" />
      </Tabs>

      {tab === "items" ? (
        items.length === 0 ? (
          <Typography sx={{ color: adminColors.muted, py: 2 }}>
            {run.status === "running" ? "กำลังประมวลผล... / Processing..." : "ไม่มีรายการ / No items"}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" sx={adminTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell>สัญลักษณ์ / Symbol</TableCell>
                  <TableCell>การทำงาน / Action</TableCell>
                  <TableCell>การเปลี่ยนแปลง / Changes</TableCell>
                  <TableCell align="center" sx={{ width: 80 }}>ดู / View</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it) => {
                  const changedFields = it.diff ? Object.keys(it.diff) : [];
                  return (
                    <TableRow key={it.id} hover>
                      <TableCell sx={{ fontWeight: 800 }}>{it.symbol}</TableCell>
                      <TableCell>
                        <AdminStatusPill tone={actionTone(it.action)} label={ACTION_LABELS[it.action]} />
                      </TableCell>
                      <TableCell>
                        {it.error_message ? (
                          <Typography sx={{ fontSize: 12, color: adminColors.rose }}>{it.error_message}</Typography>
                        ) : changedFields.length === 0 ? (
                          <Typography sx={{ fontSize: 12, color: adminColors.muted }}>-</Typography>
                        ) : (
                          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                            {changedFields.slice(0, 4).map((f) => (
                              <Chip key={f} size="small" label={f} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                            ))}
                            {changedFields.length > 4 ? (
                              <Chip size="small" label={`+${changedFields.length - 4}`} sx={{ height: 20, fontSize: 11 }} />
                            ) : null}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => setActiveItemId(it.id)} aria-label="ดูรายละเอียดรายการ / View item details">
                          <VisibilityRoundedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )
      ) : null}

      {tab === "log" ? (
        <Box
          component="pre"
          sx={{
            fontSize: 11,
            lineHeight: 1.5,
            p: 2,
            bgcolor: "#0a1929",
            color: "#e2e8f0",
            borderRadius: 1,
            overflow: "auto",
            maxHeight: 480,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {run.log_excerpt ?? "(ไม่มี log / No log)"}
        </Box>
      ) : null}

      <Dialog open={activeItem != null} onClose={() => setActiveItemId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 5 }}>
          {activeItem?.symbol} - {activeItem ? ACTION_LABELS[activeItem.action] : ""}
          <IconButton onClick={() => setActiveItemId(null)} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {activeItem ? <ItemDetailView item={activeItem} /> : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

function ItemDetailView({ item }: { item: ItemRow }) {
  const diffEntries = item.diff ? Object.entries(item.diff) : [];

  return (
    <Stack spacing={2}>
      {item.error_message ? (
        <Alert severity="error">{item.error_message}</Alert>
      ) : null}

      {diffEntries.length > 0 ? (
        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1, fontSize: 14 }}>
            ความต่าง / Diff ({diffEntries.length} ฟิลด์ / fields)
          </Typography>
          <TableContainer>
            <Table size="small" sx={adminTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180 }}>ฟิลด์ / Field</TableCell>
                  <TableCell>ก่อน / Before</TableCell>
                  <TableCell>หลัง / After</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {diffEntries.map(([field, { before, after }]) => (
                  <TableRow key={field}>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                      {field}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: adminColors.rose, bgcolor: "#fff1f2" }}>
                      {formatValue(before)}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#047857", bgcolor: "#f0fdf4" }}>
                      {formatValue(after)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ) : (
        <Typography sx={{ color: adminColors.muted, fontSize: 13 }}>
          ไม่มีการเปลี่ยนแปลงข้อมูล / No data changes
        </Typography>
      )}

      <SecMetaSection scraped={item.scraped_data} />

      <Divider />

      <Box>
        <Typography sx={{ fontWeight: 800, mb: 1, fontSize: 14 }}>
          ข้อมูลที่ scrape มาทั้งหมด / Scraped data
        </Typography>
        <Box
          component="pre"
          sx={{
            fontSize: 11,
            lineHeight: 1.5,
            p: 2,
            bgcolor: "#f8fafc",
            color: adminColors.text,
            border: `1px solid ${adminColors.borderSoft}`,
            borderRadius: 1,
            overflow: "auto",
            maxHeight: 360,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {JSON.stringify(item.scraped_data, null, 2)}
        </Box>
      </Box>
    </Stack>
  );
}
