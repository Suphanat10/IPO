"use client";

import * as React from "react";
import { Box, Grid, Stack, Typography } from "@mui/material";
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { ADMIN_RADIUS, adminColors } from "../components/AdminPrimitives";

ChartJS.register(ArcElement, Legend, Tooltip);

type DimensionReport = {
  label: string;
  total: number;
  listed: number;
  upcoming: number;
  avgCompleteness: number;
};

const marketColors = [
  "rgba(20, 184, 166, 0.86)",
  "rgba(2, 132, 199, 0.82)",
  "rgba(124, 58, 237, 0.76)",
  "rgba(217, 119, 6, 0.72)",
  "rgba(190, 24, 93, 0.68)",
  "rgba(100, 116, 139, 0.64)",
];

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function fmtNumber(value: number) {
  return Math.round(value).toLocaleString("th-TH");
}

export default function MarketMixDoughnutChart({ rows }: { rows: DimensionReport[] }) {
  const chartRows = React.useMemo(() => rows.slice(0, 6), [rows]);
  const total = React.useMemo(
    () => chartRows.reduce((sum, row) => sum + row.total, 0),
    [chartRows],
  );

  const data = React.useMemo<ChartData<"doughnut", number[], string>>(
    () => ({
      labels: chartRows.map((row) => row.label),
      datasets: [
        {
          data: chartRows.map((row) => row.total),
          backgroundColor: chartRows.map((_, index) => marketColors[index % marketColors.length]),
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    }),
    [chartRows],
  );

  const options = React.useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: adminColors.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            font: { size: 10, weight: 700 },
          },
        },
        tooltip: {
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          padding: 10,
          callbacks: {
            label: (context) => {
              const row = chartRows[context.dataIndex];
              if (!row) return "";
              return [
                `Total IPO: ${fmtNumber(row.total)} (${pct(row.total, total)}%)`,
                `Listed: ${fmtNumber(row.listed)}`,
                `Upcoming: ${fmtNumber(row.upcoming)}`,
                `Completeness: ${row.avgCompleteness.toFixed(1)}%`,
              ];
            },
          },
        },
      },
    }),
    [chartRows, total],
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
    <Grid container spacing={1.5} sx={{ alignItems: "center" }}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Box sx={{ height: { xs: 280, md: 360 }, minWidth: 0 }}>
          <Doughnut data={data} options={options} />
        </Box>
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <Stack spacing={0.8}>
          {chartRows.map((row, index) => (
            <Stack
              key={row.label}
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                border: `1px solid ${adminColors.borderSoft}`,
                borderRadius: `${ADMIN_RADIUS}px`,
                p: 0.9,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: marketColors[index % marketColors.length],
                  flexShrink: 0,
                }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    color: adminColors.text,
                    fontSize: 12.2,
                    fontWeight: 900,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </Typography>
                <Typography sx={{ color: adminColors.muted, fontSize: 11 }}>
                  {pct(row.total, total)}% · avg {row.avgCompleteness.toFixed(1)}%
                </Typography>
              </Box>
              <Typography sx={{ color: adminColors.text, fontSize: 12, fontWeight: 950, flexShrink: 0 }}>
                {fmtNumber(row.total)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Grid>
    </Grid>
  );
}
