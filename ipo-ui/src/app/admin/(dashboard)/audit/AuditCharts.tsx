"use client";

import * as React from "react";
import { Box, Grid, Stack, Typography } from "@mui/material";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { AdminPanel, adminColors } from "../../components/AdminPrimitives";
import type { AuditLogRow } from "@/lib/admin/types";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
);

const palette = {
  blue: "#0284c7",
  green: "#059669",
  amber: "#d97706",
  rose: "#dc2626",
  violet: "#7c3aed",
  cyan: "#0891b2",
  slate: "#64748b",
  pink: "#be185d",
};

const actionColors: Record<string, string> = {
  create: palette.green,
  update: palette.blue,
  delete: palette.rose,
};

const basePlugins = {
  legend: {
    labels: {
      color: adminColors.text,
      boxWidth: 10,
      boxHeight: 10,
      usePointStyle: true,
      font: { size: 11 },
    },
  },
  tooltip: {
    titleColor: "#ffffff",
    bodyColor: "#ffffff",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    padding: 10,
    displayColors: true,
  },
};

const gridColor = "rgba(71, 85, 105, 0.14)";
const tickColor = "#475569";

// ─── Helpers ────────────────────────────────────────────

function groupByAction(rows: AuditLogRow[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.action] = (counts[row.action] ?? 0) + 1;
  }
  return counts;
}

function groupByEntity(rows: AuditLogRow[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.entity] = (counts[row.entity] ?? 0) + 1;
  }
  return counts;
}

function groupByDay(rows: AuditLogRow[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const day = row.created_at.slice(0, 10); // YYYY-MM-DD
    counts[day] = (counts[day] ?? 0) + 1;
  }
  // Sort by date
  const sorted = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  return { labels: sorted.map(([d]) => d), values: sorted.map(([, v]) => v) };
}

function groupByDayAndAction(rows: AuditLogRow[]) {
  const map: Record<string, Record<string, number>> = {};
  const actions = new Set<string>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (!map[day]) map[day] = {};
    map[day][row.action] = (map[day][row.action] ?? 0) + 1;
    actions.add(row.action);
  }
  const days = Object.keys(map).sort();
  return { days, actions: Array.from(actions).sort(), map };
}

function groupByHour(rows: AuditLogRow[]) {
  const counts = new Array(24).fill(0) as number[];
  for (const row of rows) {
    const h = new Date(row.created_at).getHours();
    counts[h]++;
  }
  return counts;
}

// ─── Charts ─────────────────────────────────────────────

function ActionDoughnut({ rows }: { rows: AuditLogRow[] }) {
  const actionCounts = groupByAction(rows);
  const labels = Object.keys(actionCounts);
  const data = Object.values(actionCounts);
  const colors = labels.map((l) => actionColors[l] ?? palette.slate);

  const chartData = {
    labels: labels.map((l) =>
      l === "create" ? "สร้าง" : l === "update" ? "แก้ไข" : l === "delete" ? "ลบ" : l,
    ),
    datasets: [
      {
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "60%",
    plugins: {
      ...basePlugins,
      legend: { ...basePlugins.legend, position: "bottom" as const },
    },
  };

  return (
    <AdminPanel title="สัดส่วนการกระทำ" subtitle="Action Distribution">
      <Box sx={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Doughnut data={chartData} options={options} />
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 1, justifyContent: "center" }}>
        {labels.map((l, i) => (
          <Typography key={l} variant="caption" sx={{ color: colors[i], fontWeight: 700 }}>
            {l === "create" ? "สร้าง" : l === "update" ? "แก้ไข" : l === "delete" ? "ลบ" : l}: {data[i]}
          </Typography>
        ))}
      </Stack>
    </AdminPanel>
  );
}

function EntityBarChart({ rows }: { rows: AuditLogRow[] }) {
  const entityCounts = groupByEntity(rows);
  const sorted = Object.entries(entityCounts).sort(([, a], [, b]) => b - a).slice(0, 10);
  const labels = sorted.map(([e]) => e);
  const data = sorted.map(([, v]) => v);

  const chartData = {
    labels,
    datasets: [
      {
        label: "จำนวนเหตุการณ์",
        data,
        backgroundColor: palette.blue,
        borderRadius: 4,
        barThickness: 22,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      ...basePlugins,
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 11 } },
      },
      y: {
        grid: { display: false },
        ticks: { color: tickColor, font: { size: 11 } },
      },
    },
  };

  return (
    <AdminPanel title="เหตุการณ์ตาม Entity" subtitle="Events by Entity (Top 10)">
      <Box sx={{ height: 280 }}>
        <Bar data={chartData} options={options} />
      </Box>
    </AdminPanel>
  );
}

function TimelineChart({ rows }: { rows: AuditLogRow[] }) {
  const { days, actions, map } = groupByDayAndAction(rows);

  const actionLabels: Record<string, string> = {
    create: "สร้าง",
    update: "แก้ไข",
    delete: "ลบ",
  };

  const datasets = actions.map((action) => ({
    label: actionLabels[action] ?? action,
    data: days.map((d) => map[d]?.[action] ?? 0),
    backgroundColor: actionColors[action] ?? palette.slate,
    borderRadius: 3,
    barThickness: 14,
  }));

  const chartData = {
    labels: days.map((d) => {
      const parts = d.split("-");
      return `${parts[2]}/${parts[1]}`;
    }),
    datasets,
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      ...basePlugins,
      legend: { ...basePlugins.legend, position: "top" as const },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 },
      },
      y: {
        stacked: true,
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 11 } },
        beginAtZero: true,
      },
    },
  };

  return (
    <AdminPanel title="เหตุการณ์รายวัน" subtitle="Daily Activity (Stacked)">
      <Box sx={{ height: 280 }}>
        <Bar data={chartData} options={options} />
      </Box>
    </AdminPanel>
  );
}

function HourlyHeatChart({ rows }: { rows: AuditLogRow[] }) {
  const hourlyCounts = groupByHour(rows);
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

  const chartData = {
    labels,
    datasets: [
      {
        label: "เหตุการณ์",
        data: hourlyCounts,
        fill: true,
        borderColor: palette.violet,
        backgroundColor: "rgba(124, 58, 237, 0.12)",
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: palette.violet,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      ...basePlugins,
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 11 } },
        beginAtZero: true,
      },
    },
  };

  return (
    <AdminPanel title="กิจกรรมตามชั่วโมง" subtitle="Hourly Activity Pattern">
      <Box sx={{ height: 240 }}>
        <Line data={chartData} options={options} />
      </Box>
    </AdminPanel>
  );
}

function TrendLineChart({ rows }: { rows: AuditLogRow[] }) {
  const { labels, values } = groupByDay(rows);
  // Cumulative
  const cumulative: number[] = [];
  let sum = 0;
  for (const v of values) {
    sum += v;
    cumulative.push(sum);
  }

  const chartData = {
    labels: labels.map((d) => {
      const parts = d.split("-");
      return `${parts[2]}/${parts[1]}`;
    }),
    datasets: [
      {
        label: "สะสม / Cumulative",
        data: cumulative,
        borderColor: palette.cyan,
        backgroundColor: "rgba(8, 145, 178, 0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: "รายวัน / Daily",
        data: values,
        borderColor: palette.amber,
        backgroundColor: "rgba(217, 119, 6, 0.1)",
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderDash: [4, 4],
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      ...basePlugins,
      legend: { ...basePlugins.legend, position: "top" as const },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 10 },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 11 } },
        beginAtZero: true,
      },
    },
  };

  return (
    <AdminPanel title="แนวโน้มเหตุการณ์" subtitle="Event Trend (Cumulative & Daily)">
      <Box sx={{ height: 260 }}>
        <Line data={chartData} options={options} />
      </Box>
    </AdminPanel>
  );
}

// ─── Main Export ─────────────────────────────────────────

export function AuditCharts({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return (
      <AdminPanel title="กราฟสถิติ" subtitle="Charts">
        <Typography variant="body2" sx={{ color: adminColors.muted, textAlign: "center", py: 4 }}>
          ยังไม่มีข้อมูลสำหรับแสดงกราฟ / No data available for charts
        </Typography>
      </AdminPanel>
    );
  }

  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 6 }}>
        <EntityBarChart rows={rows} />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <HourlyHeatChart rows={rows} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TrendLineChart rows={rows} />
      </Grid>
    </Grid>
  );
}
