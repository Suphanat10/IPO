"use client";

import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0a1929", light: "#1e3a5c", dark: "#06101c" },
    secondary: { main: "#38bdf8", light: "#7dd3fc", dark: "#0284c7" },
    success: { main: "#16a34a" },
    error: { main: "#dc2626" },
    warning: { main: "#d97706" },
    background: {
      default: "#f0f2f5",
      paper: "#ffffff",
    },
    divider: "#e2e8f0",
    text: {
      primary: "#0a1929",
      secondary: "#475569",
    },
  },
  typography: {
    fontFamily: [
      "Inter",
      "Roboto",
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
      "Noto Sans Thai",
      "sans-serif",
    ].join(","),
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid #0a19291a",
          boxShadow: "0 1px 3px rgba(10,25,41,0.08), 0 1px 2px rgba(10,25,41,0.04)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #0a19291a",
          boxShadow: "0 2px 8px rgba(10,25,41,0.12), 0 1px 2px rgba(10,25,41,0.04)",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(56,189,248,0.15), 0 2px 4px rgba(10,25,41,0.08)",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
          "& fieldset": { borderColor: "#1e3a5c3d" },
          "&:hover fieldset": { borderColor: "#38bdf866" },
          "&.Mui-focused fieldset": { 
            borderColor: "#38bdf8",
            boxShadow: "inset 0 0 0 1px rgba(56,189,248,0.1)",
          },
        },
        input: { padding: "12px 14px" },
        sizeSmall: {
          minHeight: 40,
          "& .MuiOutlinedInput-input": {
            padding: "8.5px 14px",
            boxSizing: "border-box",
          },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        inputRoot: {
          minHeight: 40,
          paddingTop: 0,
          paddingBottom: 0,
          '& .MuiAutocomplete-input': { padding: "8.5px 8px !important" },
        },
        paper: {
          border: "1px solid #1e3a5c3d",
          boxShadow: "0 8px 24px rgba(10,25,41,0.15)",
          backgroundImage: "linear-gradient(180deg, rgba(244,246,251,1) 0%, rgba(255,255,255,1) 100%)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingInline: 18,
          transition: "all 0.2s ease-in-out",
        },
        contained: {
          background: "linear-gradient(135deg, #0a1929 0%, #1e3a5c 100%)",
          color: "#ffffff",
          "&:hover": {
            background: "linear-gradient(135deg, #06101c 0%, #1a2e47 100%)",
            color: "#ffffff",
          },
          "&.Mui-disabled": {
            color: "rgba(255, 255, 255, 0.6)",
          },
        },
        outlined: {
          borderColor: "#1e3a5c66",
          color: "#0a1929",
          "&:hover": {
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56,189,248,0.04)",
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 42,
          borderBottom: "2px solid #1e3a5c1a",
        },
        indicator: {
          height: 3,
          borderRadius: 3,
          background: "linear-gradient(90deg, #0a1929 0%, #38bdf8 100%)",
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 42,
          fontWeight: 600,
          textTransform: "none",
          color: "#475569",
          transition: "all 0.2s ease-in-out",
          "&.Mui-selected": {
            color: "#0a1929",
          },
          "&:hover": {
            color: "#1e3a5c",
            backgroundColor: "rgba(56,189,248,0.04)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          // Default (colorless) chip: soft light-blue, dark text
          "&.MuiChip-filledDefault": {
            backgroundColor: "rgba(30, 58, 92, 0.08)",
            color: "#0a1929",
            border: "1px solid #1e3a5c33",
          },
          "&.MuiChip-outlinedDefault": {
            color: "#0a1929",
            borderColor: "#1e3a5c55",
          },
          // Filled colored chips: ensure white text on dark backgrounds
          "&.MuiChip-filledPrimary, &.MuiChip-filledError, &.MuiChip-filledSuccess, &.MuiChip-filledWarning, &.MuiChip-filledInfo": {
            color: "#ffffff",
            "& .MuiChip-icon": { color: "#ffffff" },
            "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.85)" },
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#1e3a5c3d",
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "rgba(56,189,248,0.04)",
          },
        },
      },
    },
  },
});

export default theme;
