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
import { ADMIN_RADIUS, AdminPanel, adminColors } from "../../components/AdminPrimitives";

ChartJS.register(ArcElement, Tooltip, Legend);

export type MissingFieldChartStat = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

export default function MissingFieldsDonutChart({
  stats,
  total,
}: {
  stats: MissingFieldChartStat[];
  total: number;
}) {
  const chartData = React.useMemo<ChartData<"doughnut", number[], string>>(
    () => ({
      labels: stats.map((stat) => stat.label),
      datasets: [
        {
          data: stats.map((stat) => stat.count),
          backgroundColor: stats.map((stat) => stat.color),
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    }),
    [stats],
  );

  const chartOptions = React.useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const stat = stats[context.dataIndex];
              if (!stat) return "";
              return `${stat.label}: ${stat.count.toLocaleString()} (${stat.pct}%)`;
            },
          },
        },
      },
    }),
    [stats],
  );

  return (
    <AdminPanel
      title="สรุปข้อมูลที่ขาด / Missing fields breakdown"
      subtitle={`${total.toLocaleString()} จุดข้อมูลที่ยังขาด / missing field occurrences`}
    >
      <Grid container spacing={3} sx={{ alignItems: "center" }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ position: "relative", width: 230, height: 230, mx: "auto" }}>
            {stats.length > 0 ? <Doughnut data={chartData} options={chartOptions} /> : null}
            <Box
              sx={{
                position: "absolute",
                inset: "50% auto auto 50%",
                transform: "translate(-50%, -50%)",
                width: 112,
                height: 112,
                borderRadius: "50%",
                bgcolor: "#ffffff",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <Box>
                <Typography sx={{ color: adminColors.text, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
                  {total.toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: adminColors.muted, fontWeight: 800 }}>
                  missing fields
                </Typography>
              </Box>
            </Box>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          {stats.length === 0 ? (
            <Typography variant="body2" sx={{ color: adminColors.muted }}>
              ไม่มีข้อมูลที่ขาด / No missing fields.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {stats.map((stat) => (
                <Stack
                  key={stat.key}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { xs: "stretch", sm: "center" },
                    justifyContent: "space-between",
                    px: 1,
                    py: 0.75,
                    borderRadius: `${ADMIN_RADIUS}px`,
                    bgcolor: adminColors.panelAlt,
                    border: "1px solid",
                    borderColor: adminColors.borderSoft,
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "3px",
                        bgcolor: stat.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="body2"
                      title={stat.label}
                      sx={{
                        color: adminColors.text,
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stat.label}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="body2"
                    sx={{ color: adminColors.muted, fontWeight: 850, flexShrink: 0 }}
                  >
                    {stat.count.toLocaleString()} รายการ / {stat.pct}%
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Grid>
      </Grid>
    </AdminPanel>
  );
}
