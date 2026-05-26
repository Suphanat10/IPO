"use client";

import * as React from "react";
import { Box, Grid, Stack } from "@mui/material";
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
  type ChartData,
  type ChartOptions,
  type Plugin,
} from "chart.js";
import { Chart, Doughnut } from "react-chartjs-2";
import { AdminPanel, adminColors } from "../components/AdminPrimitives";

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

type YearlyListingReport = {
  year: number | null;
  total: number;
  listed: number;
  upcoming: number;
  cancelled: number;
  avgCompleteness: number;
  avgIpoPrice: number;
};

type DimensionReport = {
  label: string;
  total: number;
  listed: number;
  upcoming: number;
  avgCompleteness: number;
};

type DashboardReportForCharts = {
  yearlyListings: YearlyListingReport[];
  statusMix: DimensionReport[];
};

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

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function fmtNumber(value: number) {
  return Math.round(value).toLocaleString("th-TH");
}

function statusLabel(label: string) {
  if (label === "listed") return "จดทะเบียนแล้ว / Listed";
  if (label === "upcoming") return "IPO กำลังจะเข้า / Upcoming";
  if (label === "cancelled") return "ยกเลิก / Cancelled";
  return label;
}

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

const yearlyComboLabelPlugin: Plugin<"bar" | "line"> = {
  id: "yearlyComboLabelPlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!chart.isDatasetVisible(datasetIndex)) return;

      meta.data.forEach((element, index) => {
        const rawValue = Number(dataset.data[index] ?? 0);
        if (!Number.isFinite(rawValue)) return;

        const position = element.tooltipPosition(true);
        const point = {
          x: Number(position.x),
          y: Number(position.y),
        };
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        if (dataset.type === "line") {
          const label = fmtNumber(rawValue);
          const width = Math.max(28, ctx.measureText(label).width + 14);
          const height = 20;
          const x = point.x - width / 2;
          const y = point.y - 26;

          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "rgba(15, 23, 42, 0.14)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x, y, width, height, 10);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#111827";
          ctx.font = "700 10px Inter, sans-serif";
          ctx.fillText(label, point.x, y + height / 2 + 0.5);
          return;
        }

        const label = fmtNumber(rawValue);
        ctx.fillStyle = "#111827";
        ctx.font = "800 10px Inter, sans-serif";
        ctx.fillText(label, point.x, point.y - 10);
      });
    });

    ctx.restore();
  },
};

function ChartShell({
  title,
  subtitle,
  children,
  height = 320,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <AdminPanel title={title} subtitle={subtitle}>
      <Box sx={{ height: { xs: Math.max(260, height - 40), md: height }, minWidth: 0 }}>
        {children}
      </Box>
    </AdminPanel>
  );
}

export default function DashboardReportCharts({
  report,
  totalRecords,
}: {
  report: DashboardReportForCharts;
  totalRecords: number;
}) {
  const yearlyRows = React.useMemo(
    () => report.yearlyListings.filter((row) => row.year != null).slice(0, 12).reverse(),
    [report.yearlyListings],
  );

  const yearlyData = React.useMemo<ChartData<"bar" | "line", number[], string>>(
    () => ({
      labels: yearlyRows.map((row) => String(row.year)),
      datasets: [
        {
          type: "bar" as const,
          label: "Total IPO",
          data: yearlyRows.map((row) => row.total),
          backgroundColor: "rgba(20, 184, 166, 0.92)",
          hoverBackgroundColor: "rgba(13, 148, 136, 0.98)",
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.66,
          categoryPercentage: 0.82,
          yAxisID: "y",
        },
        {
          type: "line" as const,
          label: "Listed IPO",
          data: yearlyRows.map((row) => row.listed),
          borderColor: "#3f3f46",
          backgroundColor: "#3f3f46",
          pointBackgroundColor: "#3f3f46",
          pointBorderColor: "#3f3f46",
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.28,
          borderWidth: 2,
          yAxisID: "y1",
        },
      ],
    }),
    [yearlyRows],
  );

  const yearlyOptions = React.useMemo<ChartOptions<"bar" | "line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 22, right: 8 } },
      plugins: {
        ...basePlugins,
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed.y || 0);
              if (context.dataset.type === "line") {
                return `Listed IPO: ${fmtNumber(value)}`;
              }
              return `Total IPO: ${fmtNumber(value)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "transparent" },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            maxRotation: 45,
            minRotation: 45,
          },
        },
        y: {
          position: "left",
          beginAtZero: true,
          grid: { color: gridColor },
          title: {
            display: true,
            text: "Total IPO",
            color: tickColor,
            font: { size: 11, weight: 700 },
          },
          ticks: { color: tickColor, precision: 0 },
        },
        y1: {
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: "Listed IPO",
            color: tickColor,
            font: { size: 11, weight: 700 },
          },
          ticks: { color: tickColor, precision: 0 },
        },
      },
    }),
    [],
  );

  const statusData = React.useMemo<ChartData<"doughnut", number[], string>>(
    () => ({
      labels: report.statusMix.map((row) => statusLabel(row.label)),
      datasets: [
        {
          data: report.statusMix.map((row) => row.total),
          backgroundColor: [palette.green, palette.blue, palette.rose, palette.slate],
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    }),
    [report.statusMix],
  );

  const statusOptions = React.useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        ...basePlugins,
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed || 0);
              return `${context.label}: ${fmtNumber(value)} (${pct(value, totalRecords)}%)`;
            },
          },
        },
      },
    }),
    [totalRecords],
  );

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <ChartShell
            title="แนวโน้ม IPO รายปี / Yearly IPO trend"
            subtitle="แท่งสี teal คือจำนวน IPO ทั้งหมด เส้นสีเทาคือจำนวนที่จดทะเบียนแล้ว / Bars show total IPO, line shows listed IPO"
            height={390}
          >
            <Chart type="bar" data={yearlyData} options={yearlyOptions} plugins={[yearlyComboLabelPlugin]} />
          </ChartShell>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <ChartShell
            title="สถานะข้อมูล / Status distribution"
            subtitle="จดทะเบียนแล้ว / Listed, IPO กำลังจะเข้า / Upcoming และ ยกเลิก / Cancelled"
            height={340}
          >
            <Box sx={{ width: "100%", height: "100%" }}>
              <Doughnut data={statusData} options={statusOptions} />
            </Box>
          </ChartShell>
        </Grid>
      </Grid>

    </Stack>
  );
}
