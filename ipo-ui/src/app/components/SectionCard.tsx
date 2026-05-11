"use client";

import * as React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export default function SectionCard({ title, subtitle, icon, action, children }: Props) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        backgroundColor: "#fff",
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          background:
            "linear-gradient(90deg, rgba(10,25,41,0.05) 0%, rgba(56,189,248,0.04) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          {icon ? (
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {icon}
            </Box>
          ) : null}
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
        </Stack>
        {action}
      </Box>
      <Box sx={{ p: 3 }}>{children}</Box>
    </Paper>
  );
}
