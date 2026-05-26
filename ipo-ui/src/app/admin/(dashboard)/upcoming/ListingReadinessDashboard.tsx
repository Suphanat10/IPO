import {
  Box,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type React from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import Link from "next/link";
import type { UpcomingRow } from "@/lib/admin/types";
import {
  ADMIN_RADIUS,
  AdminStatusPill,
  adminColors,
  adminPanelSx,
} from "../../components/AdminPrimitives";

type Bucket = {
  key: string;
  label: string;
  value: number;
  color: string;
  helper?: string;
};

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function displayCompanyName(row: UpcomingRow) {
  return row.company_name_th?.trim() || row.company_name?.trim() || row.symbol;
}

function avgCompleteness(rows: UpcomingRow[]) {
  if (rows.length === 0) return 0;
  return clampPercent(
    rows.reduce((sum, row) => sum + Number(row.completeness_pct || 0), 0) / rows.length,
  );
}

function daysBucket(row: UpcomingRow) {
  if (row.days_until == null) return "noDate";
  if (row.days_until < 0) return "overdue";
  if (row.days_until <= 7) return "week";
  if (row.days_until <= 30) return "month";
  return "later";
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: { fg: adminColors.text, bg: "#eef4fb" },
    success: { fg: "#047857", bg: "#dcfce7" },
    warning: { fg: "#b45309", bg: "#fef3c7" },
    danger: { fg: "#be123c", bg: "#ffe4e6" },
    info: { fg: adminColors.blue, bg: "#dbeafe" },
  }[tone];

  return (
    <Paper sx={{ ...adminPanelSx, height: "100%", p: 2 }}>
      <Stack direction="row" spacing={1.4} sx={{ alignItems: "flex-start" }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: `${ADMIN_RADIUS}px`,
            display: "grid",
            placeItems: "center",
            bgcolor: tones.bg,
            color: tones.fg,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: adminColors.muted, fontSize: 12, fontWeight: 850 }}>
            {label}
          </Typography>
          <Typography sx={{ color: tones.fg, fontSize: 26, fontWeight: 950, lineHeight: 1.15, mt: 0.35 }}>
            {value}
          </Typography>
          <Typography sx={{ color: adminColors.muted, fontSize: 11.5, lineHeight: 1.35, mt: 0.45 }}>
            {helper}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function SegmentedBar({ buckets, total }: { buckets: Bucket[]; total: number }) {
  return (
    <Stack spacing={1.15}>
      <Box
        sx={{
          height: 14,
          display: "flex",
          overflow: "hidden",
          borderRadius: 99,
          bgcolor: "#e5edf5",
          border: "1px solid rgba(15, 23, 42, 0.06)",
        }}
      >
        {buckets.map((bucket) => (
          <Box
            key={bucket.key}
            title={`${bucket.label}: ${bucket.value}`}
            sx={{
              width: `${pct(bucket.value, total)}%`,
              minWidth: bucket.value > 0 ? 6 : 0,
              bgcolor: bucket.color,
            }}
          />
        ))}
      </Box>
      <Grid container spacing={1.2}>
        {buckets.map((bucket) => (
          <Grid key={bucket.key} size={{ xs: 12, sm: 6 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: bucket.color, flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: adminColors.text, fontSize: 12, fontWeight: 850, lineHeight: 1.2 }}>
                  {bucket.label}
                </Typography>
                <Typography sx={{ color: adminColors.muted, fontSize: 11 }}>
                  {bucket.value} รายการ / {pct(bucket.value, total)}%
                </Typography>
              </Box>
            </Stack>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

function TimelineBars({ buckets, total }: { buckets: Bucket[]; total: number }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.value));

  return (
    <Stack spacing={1.2}>
      {buckets.map((bucket) => (
        <Box key={bucket.key}>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1, mb: 0.5 }}>
            <Typography sx={{ color: adminColors.text, fontSize: 12, fontWeight: 850 }}>
              {bucket.label}
            </Typography>
            <Typography sx={{ color: adminColors.muted, fontSize: 12, fontWeight: 800 }}>
              {bucket.value} / {pct(bucket.value, total)}%
            </Typography>
          </Stack>
          <Box sx={{ height: 9, borderRadius: 99, bgcolor: "#edf2f7", overflow: "hidden" }}>
            <Box
              sx={{
                width: `${Math.max(bucket.value > 0 ? 5 : 0, (bucket.value / max) * 100)}%`,
                height: "100%",
                borderRadius: 99,
                bgcolor: bucket.color,
              }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function PriorityList({ rows }: { rows: UpcomingRow[] }) {
  const priorityRows = [...rows]
    .sort((a, b) => {
      const aUrgency = a.days_until == null ? 20 : Math.max(-10, Math.min(45, a.days_until));
      const bUrgency = b.days_until == null ? 20 : Math.max(-10, Math.min(45, b.days_until));
      const aScore = (100 - a.completeness_pct) * 2 + (45 - aUrgency);
      const bScore = (100 - b.completeness_pct) * 2 + (45 - bUrgency);
      return bScore - aScore;
    })
    .slice(0, 5);

  return (
    <Stack spacing={1}>
      {priorityRows.length === 0 ? (
        <Typography sx={{ color: adminColors.muted, fontSize: 13 }}>
          ไม่มี IPO ที่ต้องติดตามเร่งด่วน / No priority listings.
        </Typography>
      ) : (
        priorityRows.map((row) => {
          const tone = row.completeness_pct >= 100 ? "success" : row.completeness_pct >= 70 ? "warning" : "danger";
          return (
            <Link key={row.id} href={`/admin/ipos/${row.id}`} style={{ textDecoration: "none" }}>
              <Stack
                direction="row"
                spacing={1.25}
                sx={{
                  alignItems: "center",
                  p: 1,
                  borderRadius: `${ADMIN_RADIUS}px`,
                  border: `1px solid ${adminColors.borderSoft}`,
                  bgcolor: "#ffffff",
                  color: adminColors.text,
                  transition: "border-color 120ms ease, transform 120ms ease",
                  "&:hover": {
                    borderColor: "rgba(14, 165, 233, 0.35)",
                    transform: "translateY(-1px)",
                  },
                }}
              >
                <AdminStatusPill label={row.symbol} tone={tone} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 900, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayCompanyName(row)}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.45 }}>
                    <Typography sx={{ color: adminColors.muted, fontSize: 11.5, fontWeight: 800 }}>
                      {row.days_until == null ? "No date" : `${row.days_until}d`}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={clampPercent(row.completeness_pct)}
                      sx={{
                        flex: 1,
                        height: 6,
                        borderRadius: 99,
                        bgcolor: "#edf2f7",
                        "& .MuiLinearProgress-bar": {
                          borderRadius: 99,
                          bgcolor: row.completeness_pct >= 100 ? "#10b981" : row.completeness_pct >= 70 ? "#f59e0b" : "#ef4444",
                        },
                      }}
                    />
                    <Typography sx={{ color: adminColors.muted, fontSize: 11.5, fontWeight: 850 }}>
                      {row.completeness_pct}%
                    </Typography>
                  </Stack>
                </Box>
                <ArrowForwardRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
              </Stack>
            </Link>
          );
        })
      )}
    </Stack>
  );
}

export default function ListingReadinessDashboard({ rows }: { rows: UpcomingRow[] }) {
  const total = rows.length;
  const average = avgCompleteness(rows);
  const overdue = rows.filter((row) => daysBucket(row) === "overdue").length;
  const urgent = rows.filter((row) => daysBucket(row) === "week").length;
  const complete = rows.filter((row) => row.completeness_pct >= 100).length;
  const lowCompleteness = rows.filter((row) => row.completeness_pct < 70).length;

  const completenessBuckets: Bucket[] = [
    { key: "complete", label: "ครบ 100%", value: complete, color: "#10b981" },
    {
      key: "partial",
      label: "70-99%",
      value: rows.filter((row) => row.completeness_pct >= 70 && row.completeness_pct < 100).length,
      color: "#f59e0b",
    },
    { key: "low", label: "ต่ำกว่า 70%", value: lowCompleteness, color: "#ef4444" },
  ];

  const timelineBuckets: Bucket[] = [
    { key: "overdue", label: "เลยกำหนด", value: overdue, color: "#be123c" },
    { key: "week", label: "ภายใน 7 วัน", value: urgent, color: "#ef4444" },
    {
      key: "month",
      label: "8-30 วัน",
      value: rows.filter((row) => daysBucket(row) === "month").length,
      color: "#f59e0b",
    },
    {
      key: "later",
      label: "มากกว่า 30 วัน",
      value: rows.filter((row) => daysBucket(row) === "later").length,
      color: "#0ea5e9",
    },
    {
      key: "noDate",
      label: "ไม่มีวันที่",
      value: rows.filter((row) => daysBucket(row) === "noDate").length,
      color: "#64748b",
    },
  ];

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="IPO กำลังจะเข้า"
            value={total.toLocaleString()}
            helper="รายการที่ยังรอวันเข้าเทรด"
            icon={<EventAvailableRoundedIcon fontSize="small" />}
            tone="info"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="ครบพร้อมใช้"
            value={`${pct(complete, total)}%`}
            helper={`${complete.toLocaleString()} รายการครบ 100%`}
            icon={<CheckCircleRoundedIcon fontSize="small" />}
            tone="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="ข้อมูลต่ำกว่า 70%"
            value={lowCompleteness.toLocaleString()}
            helper="ควรเติมก่อนใช้วิเคราะห์"
            icon={<FactCheckRoundedIcon fontSize="small" />}
            tone={lowCompleteness > 0 ? "warning" : "success"}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="ต้องดูทันที"
            value={(overdue + urgent).toLocaleString()}
            helper="เลยกำหนดหรือเข้าใน 7 วัน"
            icon={<ErrorOutlineRoundedIcon fontSize="small" />}
            tone={overdue + urgent > 0 ? "danger" : "neutral"}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ ...adminPanelSx, p: 2, height: "100%" }}>
            <Typography sx={{ color: adminColors.text, fontSize: 15, fontWeight: 900 }}>
              ความครบถ้วนของข้อมูล / Completeness mix
            </Typography>
            <Typography sx={{ color: adminColors.muted, fontSize: 12, mt: 0.35, mb: 1.5 }}>
              ค่าเฉลี่ยความครบถ้วน {average}%
            </Typography>
            <SegmentedBar buckets={completenessBuckets} total={total} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ ...adminPanelSx, p: 2, height: "100%" }}>
            <Typography sx={{ color: adminColors.text, fontSize: 15, fontWeight: 900 }}>
              Timeline pressure
            </Typography>
            <Typography sx={{ color: adminColors.muted, fontSize: 12, mt: 0.35, mb: 1.5 }}>
              กระจายตามจำนวนวันก่อนเข้าเทรด
            </Typography>
            <TimelineBars buckets={timelineBuckets} total={total} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ ...adminPanelSx, p: 2, height: "100%" }}>
            <Typography sx={{ color: adminColors.text, fontSize: 15, fontWeight: 900 }}>
              Priority queue
            </Typography>
            <Typography sx={{ color: adminColors.muted, fontSize: 12, mt: 0.35, mb: 1.5 }}>
              รายการที่ควรตรวจ/เติมข้อมูลก่อน
            </Typography>
            <PriorityList rows={rows} />
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
