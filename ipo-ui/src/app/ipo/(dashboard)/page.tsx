export const dynamic = "force-dynamic";

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Link from "next/link";
import { toDateOnly } from "@/lib/date-format";
import {
  getDashboardStats,
  getRecentBuilds,
  getUpcomingIpos,
} from "@/lib/admin/queries";
import { getDashboardReport, type DashboardReport } from "@/lib/admin/report";
import type { BuildRun, DashboardStats, UpcomingRow } from "@/lib/admin/types";
import {
  AdminPageHeader,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
  ADMIN_RADIUS,
  adminColors,
} from "../components/AdminPrimitives";
import DashboardDataReport from "./DashboardDataReport";

function fmtDateTime(value: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtDate(value: string | Date | null) {
  if (!value) return "-";
  return toDateOnly(value) || "-";
}

function displayCompanyName(row: UpcomingRow) {
  return row.company_name_th?.trim() || row.company_name?.trim() || row.symbol;
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

function buildTone(status: BuildRun["status"]) {
  if (status === "success") return "success" as const;
  if (status === "failed") return "danger" as const;
  return "warning" as const;
}

function upcomingTiming(days: number | null) {
  if (days == null) {
    return { label: "รอวัน / Pending", color: adminColors.muted, bg: "#f1f5f9" };
  }
  if (days < 0) {
    return { label: "เลยกำหนด / Past", color: "#b91c1c", bg: "#fee2e2" };
  }
  if (days === 0) {
    return { label: "วันนี้ / Today", color: "#047857", bg: "#dcfce7" };
  }
  if (days <= 7) {
    return { label: `อีก ${days} วัน / ${days}d`, color: "#b45309", bg: "#fef3c7" };
  }
  return { label: `อีก ${days} วัน / ${days}d`, color: adminColors.blue, bg: "#dbeafe" };
}

function readinessColor(value: number) {
  if (value >= 80) return "#059669";
  if (value >= 60) return "#d97706";
  return "#dc2626";
}

export default async function AdminDashboard() {
  const [statsResult, builds, upcoming, report]: [DashboardStats | null, BuildRun[], UpcomingRow[], DashboardReport] = await Promise.all([
    getDashboardStats(),
    getRecentBuilds(),
    getUpcomingIpos(),
    getDashboardReport(),
  ]);

  const stats: DashboardStats = statsResult ?? {
    total_ipos: 0,
    listed_count: 0,
    upcoming_count: 0,
    cancelled_count: 0,
    complete_count: 0,
    incomplete_count: 0,
    last_data_update: null,
    last_build: null,
    error_count: 0,
    warning_count: 0,
    info_count: 0,
  };

  const listedPct = stats.total_ipos
    ? Math.round((stats.listed_count / stats.total_ipos) * 100)
    : 0;
  const visibleBuilds = builds.slice(0, 5);
  const upcomingPreview = upcoming.slice(0, 4);
  const urgentUpcomingCount = upcoming.filter((row) => {
    return row.days_until != null && row.days_until >= 0 && row.days_until <= 14;
  }).length;
  const avgUpcomingCompleteness = upcoming.length
    ? Math.round(upcoming.reduce((sum, row) => sum + (Number.isFinite(row.completeness_pct) ? row.completeness_pct : 0), 0) / upcoming.length)
    : 0;

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="แดชบอร์ด / Dashboard"
        title="งานข้อมูล IPO / IPO data operations"
        description="ติดตามจำนวน IPO ความครบถ้วนของข้อมูล ปัญหา validation และ build ล่าสุดจากที่เดียว / Monitor coverage, completeness, validation issues, and build activity."
        actions={
          <>
            <Link href="/ipo/import" style={{ textDecoration: "none" }}>
              <Button variant="outlined" startIcon={<UploadFileRoundedIcon />}>
                นำเข้า CSV / Import CSV
              </Button>
            </Link>
            <Link href="/ipo/ipos/new" style={{ textDecoration: "none" }}>
              <Button variant="contained" startIcon={<AddRoundedIcon />}>
                เพิ่ม IPO / New IPO
              </Button>
            </Link>
          </>
        }
        chips={
          <>
            <AdminStatusPill label={`${stats.error_count} ข้อผิดพลาด / errors`} tone={stats.error_count > 0 ? "danger" : "neutral"} />
            <AdminStatusPill label={`${stats.warning_count} คำเตือน / warnings`} tone={stats.warning_count > 0 ? "warning" : "neutral"} />
            <AdminStatusPill label={`${stats.info_count} ข้อมูล / info`} tone="info" />
          </>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <AdminStatCard
            label="IPO ทั้งหมด / Total IPOs"
            value={stats.total_ipos.toLocaleString()}
            helper="รายการหลัก / Master records"
            icon={<TableChartRoundedIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <AdminStatCard
            label="จดทะเบียนแล้ว / Listed"
            value={stats.listed_count.toLocaleString()}
            helper={`${listedPct}% ของข้อมูลทั้งหมด / coverage`}
            icon={<CheckCircleIcon fontSize="small" />}
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <AdminStatCard
            label="IPO กำลังจะเข้า"
            value={stats.upcoming_count.toLocaleString()}
            helper="รายการที่ต้องเตรียม / Listings to prepare"
            icon={<EventAvailableRoundedIcon fontSize="small" />}
            tone="info"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <AdminStatCard
            label="ครบถ้วน / Complete"
            value={stats.complete_count.toLocaleString()}
            helper="พร้อมวิเคราะห์ / Ready for analysis"
            icon={<TaskAltRoundedIcon fontSize="small" />}
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <AdminStatCard
            label="ยังไม่ครบ / Incomplete"
            value={stats.incomplete_count.toLocaleString()}
            helper="ต้องตรวจต่อ / Needs follow-up"
            icon={<WarningAmberRoundedIcon fontSize="small" />}
            tone="warning"
          />
        </Grid>
      </Grid>

      <AdminPanel title="ไทม์ไลน์ระบบ / Operational timeline" subtitle="สัญญาณความสดใหม่ของข้อมูลและ build / Freshness signals for data and build output">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: `${ADMIN_RADIUS}px`,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "#dcfce7",
                  color: "#047857",
                }}
              >
                <CheckCircleIcon />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: adminColors.muted, fontWeight: 700 }}>
                  อัปเดตข้อมูลล่าสุด / Last data update
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 800 }}>
                  {fmtDateTime(stats.last_data_update)}
                </Typography>
              </Box>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: `${ADMIN_RADIUS}px`,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "#dbeafe",
                  color: adminColors.blue,
                }}
              >
                <TaskAltRoundedIcon />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: adminColors.muted, fontWeight: 700 }}>
                  Build สำเร็จล่าสุด / Last successful build
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 800 }}>
                  {fmtDateTime(stats.last_build)}
                </Typography>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </AdminPanel>

      <Grid container spacing={2} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, lg: 6 }} sx={{ display: "flex" }}>
          <AdminPanel
            title="Build ล่าสุด / Recent builds"
            subtitle="รอบ pipeline ล่าสุดของ artifact / Latest artifact pipeline runs"
            action={
              <Link href="/ipo/builds" style={{ textDecoration: "none", color: adminColors.accent, fontSize: 13, fontWeight: 800 }}>
                ดูทั้งหมด / View all
              </Link>
            }
            noPadding
            sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
          >
            <Stack spacing={0}>
              {visibleBuilds.length === 0 ? (
                <Typography variant="body2" sx={{ p: 2.5, color: adminColors.muted }}>
                  ยังไม่มี build / No build runs yet.
                </Typography>
              ) : (
                visibleBuilds.map((b, i) => {
                  const dotColor =
                    b.status === "success" ? "#059669"
                    : b.status === "failed" ? "#dc2626"
                    : adminColors.amber;
                  const dotRing =
                    b.status === "success" ? "0 0 0 3px #dcfce7"
                    : b.status === "failed" ? "0 0 0 3px #ffe4e6"
                    : "0 0 0 3px #fef3c7";
                  const hoverBg =
                    b.status === "success" ? "#f0fdf4"
                    : b.status === "failed" ? "#fef2f2"
                    : "#fffbeb";
                  return (
                    <Stack
                      key={b.id}
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems: "center",
                        position: "relative",
                        pl: 5,
                        pr: 2.25,
                        py: 1.75,
                        transition: "background-color 0.15s ease",
                        "&:hover": { bgcolor: hoverBg },
                        "&::before": {
                          content: '""',
                          position: "absolute",
                          left: 23,
                          top: i === 0 ? "50%" : 0,
                          bottom: i === visibleBuilds.length - 1 ? "50%" : 0,
                          width: 2,
                          bgcolor: adminColors.borderSoft,
                        },
                      }}
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          left: 18,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          bgcolor: dotColor,
                          boxShadow: dotRing,
                          zIndex: 1,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          {b.status === "success" ? (
                            <CheckCircleIcon sx={{ fontSize: 16, color: "#059669" }} />
                          ) : b.status === "failed" ? (
                            <ErrorOutlineIcon sx={{ fontSize: 16, color: "#dc2626" }} />
                          ) : (
                            <HourglassEmptyIcon sx={{ fontSize: 16, color: adminColors.amber }} />
                          )}
                          <Typography sx={{ fontWeight: 900, fontSize: 14, fontFamily: "monospace", color: adminColors.text }}>
                            Build #{b.id}
                          </Typography>
                          <AdminStatusPill label={b.status} tone={buildTone(b.status)} />
                          <Chip size="small" variant="outlined" label={b.trigger_type} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: adminColors.muted, mt: 0.3, display: "block" }}>
                          <Box component="span" sx={{ fontWeight: 700 }}>{fmtDateTime(b.started_at)}</Box>
                          {" · "}
                          <Box component="span">{fmtDuration(b.duration_ms)}</Box>
                          {" · "}
                          <Box component="span">{fmtBytes(b.artifact_size)}</Box>
                        </Typography>
                        {b.error_message ? (
                          <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25 }}>
                            {b.error_message}
                          </Typography>
                        ) : null}
                      </Box>
                    </Stack>
                  );
                })
              )}
            </Stack>
          </AdminPanel>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }} sx={{ display: "flex" }}>
          <AdminPanel
            title="IPO ที่กำลังจะเข้า"
            subtitle="รายการใกล้เข้าเทรดที่ต้องตรวจขั้นสุดท้าย / Nearest listings that need final checks"
            action={
              <Link href="/ipo/upcoming" style={{ textDecoration: "none", color: adminColors.accent, fontSize: 13, fontWeight: 800 }}>
                ดูทั้งหมด / View all
              </Link>
            }
            noPadding
            sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
          >
            <Stack spacing={0} sx={{ flex: 1, minHeight: 0 }}>
              {upcoming.length === 0 ? (
                <Typography variant="body2" sx={{ p: 2.5, color: adminColors.muted }}>
                  ไม่มี IPO ที่กำลังจะเข้า / No upcoming IPOs.
                </Typography>
              ) : (
                <Stack spacing={1.25} sx={{ p: 1.5, flex: 1, minHeight: 0 }}>
                  <Box
                    sx={{
                      border: `1px solid ${adminColors.borderSoft}`,
                      borderRadius: `${ADMIN_RADIUS}px`,
                      p: 1.5,
                      background: "linear-gradient(135deg, #f8fbff 0%, #eff6ff 100%)",
                      boxShadow: "0 1px 3px rgba(10,25,41,0.04)",
                    }}
                  >
                    <Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: `${ADMIN_RADIUS}px`,
                          display: "grid",
                          placeItems: "center",
                          bgcolor: "#dbeafe",
                          color: adminColors.blue,
                          flexShrink: 0,
                          boxShadow: "0 1px 2px rgba(2,132,199,0.15)",
                        }}
                      >
                        <EventAvailableRoundedIcon />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ color: adminColors.text, fontSize: 13, fontWeight: 950 }}>
                          {upcoming.length.toLocaleString("th-TH")} รายการกำลังรอเข้าตลาด
                        </Typography>
                        <Stack direction="row" spacing={0.7} sx={{ flexWrap: "wrap", gap: 0.7, mt: 0.7 }}>
                          <Chip
                            size="small"
                            label={`${urgentUpcomingCount} ภายใน 14 วัน`}
                            sx={{ bgcolor: "#fef3c7", color: "#92400e", fontWeight: 800, fontSize: 12 }}
                          />
                          <Chip
                            size="small"
                            label={`พร้อมเฉลี่ย ${avgUpcomingCompleteness}%`}
                            sx={{
                              bgcolor: "#dcfce7",
                              color: "#047857",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          />
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>

                  <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                    {upcomingPreview.map((r) => {
                      const timing = upcomingTiming(r.days_until);
                      const readyColor = readinessColor(r.completeness_pct);
                      return (
                        <Stack
                          key={r.id}
                          spacing={0.8}
                          sx={{
                            p: 1.25,
                            border: `1px solid ${adminColors.borderSoft}`,
                            borderLeft: `4px solid ${readyColor}`,
                            borderRadius: `${ADMIN_RADIUS}px`,
                            bgcolor: "#ffffff",
                            minWidth: 0,
                            transition: "box-shadow 0.15s ease, transform 0.15s ease",
                            "&:hover": {
                              boxShadow: "0 2px 8px rgba(10,25,41,0.08), 0 1px 3px rgba(10,25,41,0.06)",
                              transform: "translateY(-1px)",
                            },
                          }}
                        >
                          <Stack direction="row" spacing={1.1} sx={{ alignItems: "center" }}>
                            <Box
                              sx={{
                                minWidth: 68,
                                maxWidth: 80,
                                px: 1,
                                py: 0.75,
                                borderRadius: `${ADMIN_RADIUS}px`,
                                background: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
                                border: "1px solid #bae6fd",
                                boxShadow: "0 1px 2px rgba(7,89,133,0.08)",
                                color: "#075985",
                                fontSize: 12.5,
                                fontWeight: 950,
                                textAlign: "center",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                                letterSpacing: "0.02em",
                              }}
                              title={r.symbol}
                            >
                              {r.symbol}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack
                                direction="row"
                                spacing={0.9}
                                sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
                              >
                                <Typography
                                  sx={{
                                    color: adminColors.text,
                                    fontSize: 13,
                                    fontWeight: 900,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={displayCompanyName(r)}
                                >
                                  {displayCompanyName(r)}
                                </Typography>
                                <Box
                                  sx={{
                                    px: 0.85,
                                    py: 0.35,
                                    borderRadius: 99,
                                    bgcolor: timing.bg,
                                    color: timing.color,
                                    fontSize: 11,
                                    fontWeight: 900,
                                    flexShrink: 0,
                                  }}
                                >
                                  {timing.label}
                                </Box>
                              </Stack>
                              <Typography
                                sx={{
                                  color: adminColors.muted,
                                  fontSize: 11.5,
                                  mt: 0.35,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {fmtDate(r.listing_date)} · {r.market ?? "-"} · {r.sector ?? "-"}
                              </Typography>
                            </Box>
                          </Stack>
                          <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 0.3, pl: 0.5 }}>
                            {r.ipo_price != null ? (
                              <Typography sx={{ color: adminColors.text, fontSize: 11.5 }}>
                                <Box component="span" sx={{ color: adminColors.muted, fontWeight: 700 }}>ราคา IPO:</Box>{" "}
                                <Box component="span" sx={{ fontWeight: 900 }}>฿{r.ipo_price.toLocaleString()}</Box>
                              </Typography>
                            ) : null}
                            {r.fa_companies?.length ? (
                              <Typography sx={{ color: adminColors.text, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.fa_companies.join(", ")}>
                                <Box component="span" sx={{ color: adminColors.muted, fontWeight: 700 }}>FA:</Box>{" "}
                                <Box component="span" sx={{ fontWeight: 800 }}>{r.fa_companies.join(", ")}</Box>
                              </Typography>
                            ) : null}
                            {r.fa_persons?.length ? (
                              <Typography sx={{ color: adminColors.text, fontSize: 11.5 }}>
                                <Box component="span" sx={{ color: adminColors.muted, fontWeight: 700 }}>FA Person:</Box>{" "}
                                <Box component="span" sx={{ fontWeight: 800 }}>{r.fa_persons.join(", ")}</Box>
                              </Typography>
                            ) : null}
                          </Stack>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Box sx={{ flex: 1, height: 10, borderRadius: 99, bgcolor: "#e8eef5", overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(10,25,41,0.06)" }}>
                              <Box
                                sx={{
                                  width: `${Math.max(0, Math.min(100, r.completeness_pct))}%`,
                                  height: "100%",
                                  borderRadius: 99,
                                  background:
                                    readyColor === "#059669"
                                      ? "linear-gradient(90deg, #34d399, #059669)"
                                      : readyColor === "#d97706"
                                      ? "linear-gradient(90deg, #fbbf24, #d97706)"
                                      : "linear-gradient(90deg, #f87171, #dc2626)",
                                }}
                              />
                            </Box>
                            <Typography sx={{ color: readyColor, fontSize: 12, fontWeight: 950, flexShrink: 0, minWidth: 36, textAlign: "right" }}>
                              {r.completeness_pct}%
                            </Typography>
                          </Stack>
                        </Stack>
                      );
                    })}
                  </Stack>

                  {upcoming.length > upcomingPreview.length ? (
                    <Typography sx={{ color: adminColors.muted, fontSize: 11.5, textAlign: "center", pt: 0.2 }}>
                      และอีก {upcoming.length - upcomingPreview.length} รายการ / more records
                    </Typography>
                  ) : null}
                </Stack>
              )}
            </Stack>
          </AdminPanel>
        </Grid>
      </Grid>

      <DashboardDataReport report={report} totalRecords={stats.total_ipos} />
    </Stack>
  );
}
