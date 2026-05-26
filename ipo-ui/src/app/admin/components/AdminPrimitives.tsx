import * as React from "react";
import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
  type SxProps,
  type Theme,
} from "@mui/material";

export const ADMIN_SIDEBAR_WIDTH = 296;
export const ADMIN_RADIUS = 10;

export const adminColors = {
  appBg: "#f0f2f5",
  sidebar: "#0a1929",
  sidebarMuted: "rgba(255, 255, 255, 0.72)",
  panel: "#ffffff",
  panelAlt: "#f8fafc",
  border: "#0a19291a",
  borderSoft: "rgba(10,25,41,0.08)",
  text: "#0a1929",
  muted: "#475569",
  accent: "#1e3a5c",
  accentSoft: "rgba(10,25,41,0.06)",
  amber: "#d97706",
  rose: "#dc2626",
  blue: "#0284c7",
  cyan: "#38bdf8",
};

export const adminPanelSx = {
  borderRadius: `${ADMIN_RADIUS}px`,
  border: `1px solid ${adminColors.border}`,
  boxShadow: "0 1px 3px rgba(10,25,41,0.08), 0 1px 2px rgba(10,25,41,0.04)",
  backgroundImage: "none",
  bgcolor: adminColors.panel,
} satisfies SxProps<Theme>;

export const adminControlBarSx = {
  bgcolor: adminColors.panelAlt,
  borderBottom: "1px solid",
  borderColor: adminColors.borderSoft,
} satisfies SxProps<Theme>;

export const adminDataGridSx = {
  border: 0,
  color: adminColors.text,
  bgcolor: adminColors.panel,
  "& .MuiDataGrid-columnHeaders": {
    bgcolor: adminColors.panelAlt,
    borderColor: adminColors.borderSoft,
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 800,
  },
  "& .MuiDataGrid-cell": {
    borderColor: adminColors.borderSoft,
  },
  "& .MuiDataGrid-row:hover": {
    bgcolor: "#f8fbff",
  },
  "& .MuiDataGrid-footerContainer": {
    borderColor: adminColors.borderSoft,
    bgcolor: adminColors.panelAlt,
  },
} satisfies SxProps<Theme>;

export const adminTableSx = {
  "& .MuiTableCell-root": {
    borderColor: adminColors.borderSoft,
  },
  "& .MuiTableHead-root .MuiTableCell-root": {
    bgcolor: adminColors.panelAlt,
    color: "#1e3a5c",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  "& .MuiTableRow-root:hover": {
    bgcolor: "#f8fbff",
  },
} satisfies SxProps<Theme>;

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  chips,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  chips?: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        alignItems: { xs: "stretch", md: "flex-start" },
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="overline"
          sx={{
            color: adminColors.accent,
            fontWeight: 800,
            letterSpacing: 0,
            lineHeight: 1.4,
          }}
        >
          {eyebrow}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            color: adminColors.text,
            fontSize: { xs: 24, md: 30 },
            fontWeight: 800,
            lineHeight: 1.15,
            mt: 0.25,
          }}
        >
          {title}
        </Typography>
        {description ? (
          <Typography
            variant="body2"
            sx={{
              color: adminColors.muted,
              mt: 0.75,
              maxWidth: 760,
              lineHeight: 1.7,
            }}
          >
            {description}
          </Typography>
        ) : null}
        {chips ? (
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.5 }}>
            {chips}
          </Stack>
        ) : null}
      </Box>
      {actions ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            justifyContent: { xs: "flex-start", md: "flex-end" },
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}

export function AdminPanel({
  title,
  subtitle,
  action,
  children,
  noPadding = false,
  sx,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
  sx?: SxProps<Theme>;
}) {
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <Paper
      sx={[
        adminPanelSx,
        { overflow: "hidden" },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {hasHeader ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
            px: 2.25,
            py: 1.75,
            borderBottom: "1px solid",
            borderColor: adminColors.borderSoft,
            bgcolor: adminColors.panelAlt,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title ? (
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: adminColors.text }}>
                {title}
              </Typography>
            ) : null}
            {subtitle ? (
              <Typography variant="caption" sx={{ color: adminColors.muted }}>
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
        </Stack>
      ) : null}
      <Box sx={noPadding ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : { p: { xs: 2, md: 2.5 } }}>{children}</Box>
    </Paper>
  );
}

export function AdminStatCard({
  label,
  value,
  helper,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: { fg: adminColors.text, bg: "#eef4fb" },
    success: { fg: "#047857", bg: "#dcfce7" },
    warning: { fg: adminColors.amber, bg: "#fef3c7" },
    danger: { fg: adminColors.rose, bg: "#ffe4e6" },
    info: { fg: adminColors.blue, bg: "#dbeafe" },
  }[tone];

  return (
    <Paper
      sx={{
        ...adminPanelSx,
        height: "100%",
        p: 2,
        display: "flex",
        gap: 1.5,
        alignItems: "flex-start",
      }}
    >
      {icon ? (
        <Box
          sx={{
            width: 36,
            height: 36,
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
      ) : null}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: adminColors.muted, fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography
          variant="h5"
          sx={{ color: tones.fg, fontWeight: 850, lineHeight: 1.2, mt: 0.5 }}
        >
          {value}
        </Typography>
        {helper ? (
          <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mt: 0.5 }}>
            {helper}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}


export function AdminStatusPill({
  label,
  tone = "neutral",
}: {
  label: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: { fg: "#1e3a5c", bg: "#eef4fb", border: "#d7e2ee" },
    success: { fg: "#047857", bg: "#dcfce7", border: "#bbf7d0" },
    warning: { fg: "#92400e", bg: "#fef3c7", border: "#fde68a" },
    danger: { fg: "#be123c", bg: "#ffe4e6", border: "#fecdd3" },
    info: { fg: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
  }[tone];

  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 24,
        borderRadius: "8px",
        border: `1px solid ${tones.border}`,
        bgcolor: tones.bg,
        color: tones.fg,
        fontWeight: 800,
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}
