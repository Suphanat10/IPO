"use client";

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";

type Props = {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  labelWidth?: number;
};

export default function LabeledField({ label, hint, children, labelWidth = 180 }: Props) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        py: 0.75,
        alignItems: { xs: "stretch", md: "flex-start" },
      }}
    >
      <Box
        sx={{
          width: { xs: "100%", md: labelWidth },
          flexShrink: 0,
          pt: { md: 1.25 },
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: "text.primary",
            textAlign: { xs: "left", md: "right" },
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Box
          sx={{
            width: { xs: "100%", md: "min(100%, 560px)" },
            minWidth: { md: 340 },
            flex: "1 1 420px",
          }}
        >
          {children}
        </Box>
        {hint ? (
          <Box sx={{ flex: "1 1 300px", pt: 1.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {hint}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Stack>
  );
}
