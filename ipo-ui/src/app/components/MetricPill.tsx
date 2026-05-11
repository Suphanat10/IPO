"use client";

import { Box, Typography } from "@mui/material";

type Props = {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "neutral";
};

const toneColors: Record<NonNullable<Props["tone"]>, { bg: string; fg: string }> = {
  default: { bg: "#e0f2fe", fg: "#0a1929" },
  positive: { bg: "#dcfce7", fg: "#166534" },
  negative: { bg: "#fee2e2", fg: "#991b1b" },
  neutral: { bg: "#f1f5f9", fg: "#334155" },
};

export default function MetricPill({ label, value, tone = "default" }: Props) {
  const c = toneColors[tone];
  return (
    <Box
      sx={{
        borderRadius: 2,
        px: 2,
        py: 1.25,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
        minWidth: 150,
      }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          color: c.fg,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
