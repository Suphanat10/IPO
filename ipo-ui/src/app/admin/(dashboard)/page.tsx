import * as React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import Link from "next/link";
import {
  isSupabaseConfigured,
  MOCK_BUILDS,
  MOCK_STATS,
  MOCK_UPCOMING,
} from "@/lib/supabase/mock";
import {
  getDashboardStats,
  getRecentBuilds,
  getUpcomingIpos,
} from "@/lib/supabase/queries";
import type { BuildRun, DashboardStats, UpcomingRow } from "@/lib/supabase/types";

function StatTile({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: string;
}) {
  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        height: "100%",
      }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: color ?? "text.primary", mt: 0.5 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  );
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function AdminDashboard() {
  const usingMock = !isSupabaseConfigured();
  let stats: DashboardStats;
  let builds: BuildRun[];
  let upcoming: UpcomingRow[];

  if (usingMock) {
    stats = MOCK_STATS;
    builds = MOCK_BUILDS;
    upcoming = MOCK_UPCOMING;
  } else {
    stats = (await getDashboardStats()) ?? MOCK_STATS;
    builds = await getRecentBuilds();
    upcoming = await getUpcomingIpos();
  }

  return (
    <Stack spacing={3}>
      {usingMock ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Supabase ยังไม่ถูกตั้งค่า — กำลังแสดง mock data เพื่อ preview UI ดู
          <Box component="code" sx={{ ml: 0.5 }}>
            ipo-ui/.env.example
          </Box>{" "}
          และ <Box component="code">docs/ADMIN_SETUP.md</Box>
        </Alert>
      ) : null}

      <Box>
        <Typography variant="overline" color="primary" sx={{ letterSpacing: 0.6 }}>
          DASHBOARD
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          IPO Data Overview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          สถานะข้อมูล IPO ทั้งระบบ + ปัญหา validation + build pipeline
        </Typography>
      </Box>

      {/* Top tiles */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <StatTile label="Total IPO" value={stats.total_ipos} />
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <StatTile
            label="Listed"
            value={stats.listed_count}
            hint={`${Math.round((stats.listed_count / stats.total_ipos) * 100)}%`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <StatTile
            label="Upcoming"
            value={stats.upcoming_count}
            hint="next 30+ days"
            color="info.main"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <StatTile
            label="Complete"
            value={stats.complete_count}
            hint="100% fields"
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 2.4 }}>
          <StatTile
            label="Incomplete"
            value={stats.incomplete_count}
            hint="< 100% fields"
            color="warning.main"
          />
        </Grid>
      </Grid>

      {/* Update / build timestamps */}
      <Paper sx={{ p: 2.5, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <CheckCircleIcon color="success" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Last Data Update
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {fmtDateTime(stats.last_data_update)}
                </Typography>
              </Box>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <CheckCircleIcon color="success" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Last Build
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {fmtDateTime(stats.last_build)}
                </Typography>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        {/* Recent builds */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, height: "100%" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Recent Builds
              </Typography>
              <Link href="/admin/builds" style={{ fontSize: 13, textDecoration: "none" }}>
                View all →
              </Link>
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Stack divider={<Divider flexItem />} spacing={0}>
              {builds.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  ยังไม่มี build runs
                </Typography>
              ) : (
                builds.map((b) => (
                  <Stack
                    key={b.id}
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ py: 1.25 }}
                  >
                    {b.status === "success" ? (
                      <CheckCircleIcon color="success" fontSize="small" />
                    ) : b.status === "failed" ? (
                      <ErrorOutlineIcon color="error" fontSize="small" />
                    ) : (
                      <HourglassEmptyIcon color="warning" fontSize="small" />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        #{b.id}{" "}
                        <Box component="span" sx={{ color: "text.secondary", fontWeight: 400, ml: 0.5 }}>
                          {b.trigger_type}
                        </Box>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtDateTime(b.started_at)} • {fmtDuration(b.duration_ms)} • {fmtBytes(b.artifact_size)}
                      </Typography>
                      {b.error_message ? (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ display: "block", mt: 0.25 }}
                        >
                          {b.error_message}
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>
                ))
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* Upcoming */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, height: "100%" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Upcoming IPO
              </Typography>
              <Link
                href="/admin/upcoming"
                style={{ fontSize: 13, textDecoration: "none" }}
              >
                View all →
              </Link>
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Stack divider={<Divider flexItem />} spacing={0}>
              {upcoming.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  ไม่มี IPO ที่กำลังจะเข้าตลาด
                </Typography>
              ) : (
                upcoming.slice(0, 5).map((r) => (
                  <Stack
                    key={r.id}
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ py: 1.25 }}
                  >
                    <Chip
                      label={r.symbol}
                      size="small"
                      sx={{ fontWeight: 700, minWidth: 64 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {r.company_name ?? "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.listing_date} • {r.market ?? "—"} • {r.sector ?? "—"}
                      </Typography>
                    </Box>
                    <Stack alignItems="flex-end">
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {r.days_until != null ? `${r.days_until} d` : "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.completeness_pct}%
                      </Typography>
                    </Stack>
                  </Stack>
                ))
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Validation summary */}
      <Paper sx={{ p: 2.5, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Validation Issues
          </Typography>
          <Link
            href="/admin/validation"
            style={{ fontSize: 13, textDecoration: "none" }}
          >
            View all →
          </Link>
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Stack direction="row" spacing={2}>
          <Chip
            label={`${stats.error_count} errors`}
            color="error"
            variant={stats.error_count > 0 ? "filled" : "outlined"}
          />
          <Chip
            label={`${stats.warning_count} warnings`}
            color="warning"
            variant={stats.warning_count > 0 ? "filled" : "outlined"}
          />
          <Chip
            label={`${stats.info_count} info`}
            variant="outlined"
          />
        </Stack>
      </Paper>
    </Stack>
  );
}
