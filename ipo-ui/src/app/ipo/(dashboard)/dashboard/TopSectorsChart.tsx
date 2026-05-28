"use client";

import * as React from "react";
import { Box, Typography } from "@mui/material";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { adminColors } from "../../components/AdminPrimitives";

ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip);

type DimensionReport = {
  label: string;
  total: number;
  listed: number;
  upcoming: number;
  avgCompleteness: number;
};

const sectorColors = [
  "rgba(20, 184, 166, 0.88)",
  "rgba(2, 132, 199, 0.84)",
  "rgba(124, 58, 237, 0.78)",
  "rgba(5, 150, 105, 0.78)",
  "rgba(217, 119, 6, 0.76)",
  "rgba(190, 24, 93, 0.72)",
  "rgba(100, 116, 139, 0.7)",
  "rgba(220, 38, 38, 0.68)",
];

function fmtNumber(value: number) {
  return Math.round(value).toLocaleString("th-TH");
}

function shortLabel(value: string) {
  return value.length > 30 ? `${value.slice(0, 29)}...` : value;
}

const valueLabelPlugin: Plugin<"bar"> = {
  id: "topSectorValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);

    ctx.save();
    ctx.font = "800 11px Inter, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";

    meta.data.forEach((element, index) => {
      const rawValue = Number(chart.data.datasets[0].data[index] ?? 0);
      const label = fmtNumber(rawValue);
      const position = element.tooltipPosition(true);
      const textWidth = ctx.measureText(label).width;
      const x = Math.min(Number(position.x) + 14, chartArea.right - textWidth - 2);
      const y = Number(position.y);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        ctx.fillText(label, x, y);
      }
    });

    ctx.restore();
  },
};

export default function TopSectorsChart({ rows }: { rows: DimensionReport[] }) {
  const chartRows = React.useMemo(() => rows.slice(0, 8), [rows]);

  const data = React.useMemo<ChartData<"bar", number[], string>>(
    () => ({
      labels: chartRows.map((row) => shortLabel(row.label)),
      datasets: [
        {
          label: "IPO ทั้งหมด / Total IPO",
          data: chartRows.map((row) => row.total),
          backgroundColor: chartRows.map((_, index) => sectorColors[index % sectorColors.length]),
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.68,
          categoryPercentage: 0.72,
        },
      ],
    }),
    [chartRows],
  );

  const options = React.useMemo<ChartOptions<"bar">>(
    () => ({
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 34 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          padding: 10,
          callbacks: {
            title: (items) => chartRows[items[0]?.dataIndex ?? 0]?.label ?? "",
            label: (context) => {
              const row = chartRows[context.dataIndex];
              if (!row) return "";
              return [
                `Total IPO: ${fmtNumber(row.total)}`,
                `Listed: ${fmtNumber(row.listed)}`,
                `Upcoming: ${fmtNumber(row.upcoming)}`,
                `Completeness: ${row.avgCompleteness.toFixed(1)}%`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(71, 85, 105, 0.14)" },
          ticks: { color: "#475569", precision: 0 },
        },
        y: {
          grid: { color: "transparent" },
          ticks: {
            color: adminColors.text,
            font: { size: 11, weight: 700 },
          },
        },
      },
    }),
    [chartRows],
  );

  if (chartRows.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography sx={{ color: adminColors.muted, fontSize: 13 }}>
          ไม่มีข้อมูล / No data
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: { xs: 360, md: 420 }, minWidth: 0 }}>
      <Bar data={data} options={options} plugins={[valueLabelPlugin]} />
    </Box>
  );
}
