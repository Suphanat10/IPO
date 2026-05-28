"use client";

import * as React from "react";
import { Box, Chip, Stack, Tab, Tabs, Typography } from "@mui/material";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import FAAnalysis from "./sections/FAAnalysis";
import LeadCoAnalysis from "./sections/LeadCoAnalysis";
import FundamentalAnalysis from "./sections/FundamentalAnalysis";
import LivePerformanceSummary from "./sections/LivePerformanceSummary";
import UpcomingIpoHero from "./components/UpcomingIpoHero";

const c = {
  card: "#ffffff",
  cardBorder: "#e1e5eb",
  cardHeaderBg: "#f7f8fa",
  sectionBg: "#f0f2f5",
  ink: "#0a1929",
  muted: "#64748b",
  accent: "#0ea5e9",
  accentSoft: "rgba(14,165,233,0.08)",
};

function DashboardCard({
  icon,
  title,
  subtitle,
  badge,
  children,
  noPadding,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: `1px solid ${c.cardBorder}`,
        bgcolor: c.card,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      <Box
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.75,
          bgcolor: c.cardHeaderBg,
          borderBottom: `1px solid ${c.cardBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: c.ink,
              color: "#38bdf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Typography
                sx={{
                  fontSize: { xs: 15, md: 17 },
                  fontWeight: 800,
                  color: c.ink,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </Typography>
              {badge && (
                <Chip
                  label={badge}
                  size="small"
                  sx={{
                    height: 20,
                    borderRadius: 1,
                    bgcolor: c.accentSoft,
                    color: c.accent,
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: "0.03em",
                  }}
                />
              )}
            </Stack>
            {subtitle && (
              <Typography
                sx={{
                  fontSize: { xs: 11, md: 12 },
                  color: c.muted,
                  lineHeight: 1.4,
                  mt: 0.15,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
      <Box sx={noPadding ? {} : { p: { xs: 2, md: 2.5 } }}>{children}</Box>
    </Box>
  );
}

const ANALYSIS_TABS = [
  {
    key: "fa",
    label: "FA Analysis",
    icon: <AssignmentIndRoundedIcon sx={{ fontSize: 18 }} />,
  },
  {
    key: "leadCo",
    label: "Lead-Co UW",
    icon: <AccountBalanceRoundedIcon sx={{ fontSize: 18 }} />,
  },
  {
    key: "fundamental",
    label: "Fundamental",
    icon: <InsightsRoundedIcon sx={{ fontSize: 18 }} />,
  },
] as const;

type AnalysisTab = (typeof ANALYSIS_TABS)[number]["key"];

export default function Page() {
  const [activeTab, setActiveTab] = React.useState<AnalysisTab>("fa");

  return (
    <Stack spacing={3}>
      {/* ── Upcoming IPO Section Header ── */}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: "rgba(10,25,41,0.06)",
            display: "grid",
            placeItems: "center",
            color: c.accent,
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          <RocketLaunchRoundedIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 800, color: c.ink, lineHeight: 1.2 }}>
            หุ้นที่กำลังจะ IPO เข้าตลาด
          </Typography>
          <Typography sx={{ mt: 0.5, color: c.muted, fontSize: { xs: 13, md: 14 }, lineHeight: 1.5 }}>
            คิวเข้าเทรดเร็วๆ นี้ พร้อมคะแนนแนะนำจาก FA, Underwriter และปัจจัยพื้นฐาน
          </Typography>
        </Box>
      </Stack>

      {/* ── Upcoming IPO Card ── */}
      <Box
        sx={{
          borderRadius: 3,
          border: `1px solid ${c.cardBorder}`,
          bgcolor: c.card,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <UpcomingIpoHero />
      </Box>

      {/* ── Analysis Section Header (standalone) ── */}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: "rgba(10,25,41,0.06)",
            display: "grid",
            placeItems: "center",
            color: c.accent,
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          <BarChartRoundedIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 800, color: c.ink, lineHeight: 1.2 }}>
              วิเคราะห์ IPO เชิงลึก
            </Typography>
            <Chip
              label="3 หมวด"
              size="small"
              sx={{
                height: 22,
                borderRadius: 1.5,
                bgcolor: "rgba(10,25,41,0.06)",
                color: c.accent,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.05em",
              }}
            />
          </Stack>
          <Typography sx={{ mt: 0.5, color: c.muted, fontSize: { xs: 13, md: 14 }, lineHeight: 1.5 }}>
            กรอกข้อมูล IPO ตัวใหม่ (FA / Lead-Co / Fundamental) เพื่อดูสถิติและคะแนนรวมจากฐานข้อมูล IPO ย้อนหลัง
          </Typography>
        </Box>
      </Stack>

      {/* ── Analysis Card ── */}
      <Box
        sx={{
          borderRadius: 3,
          border: `1px solid ${c.cardBorder}`,
          bgcolor: c.card,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        }}
      >

        {/* Tab navigation */}
        <Box
          sx={{
            borderBottom: `1px solid ${c.cardBorder}`,
            bgcolor: "#fff",
          }}
        >
          <Tabs
            value={ANALYSIS_TABS.findIndex((t) => t.key === activeTab)}
            onChange={(_, idx) => setActiveTab(ANALYSIS_TABS[idx].key)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 48,
              px: { xs: 1, md: 2 },
              "& .MuiTabs-indicator": {
                height: 3,
                borderRadius: "3px 3px 0 0",
                bgcolor: c.accent,
              },
            }}
          >
            {ANALYSIS_TABS.map((tab) => (
              <Tab
                key={tab.key}
                icon={tab.icon}
                iconPosition="start"
                label={tab.label}
                sx={{
                  minHeight: 48,
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: 13,
                  color: c.muted,
                  gap: 0.75,
                  "&.Mui-selected": { color: c.ink },
                }}
              />
            ))}
          </Tabs>
        </Box>

        {/* Tab content + sidebar */}
        <Box
          sx={{
            p: { xs: 2, md: 2.5 },
            display: "grid",
            gap: 2.5,
            alignItems: "start",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 380px" },
          }}
        >
          <Box>
            {activeTab === "fa" && <FAAnalysis />}
            {activeTab === "leadCo" && <LeadCoAnalysis />}
            {activeTab === "fundamental" && <FundamentalAnalysis />}
          </Box>
          <Box sx={{ position: { lg: "sticky" }, top: { lg: 80 } }}>
            <LivePerformanceSummary />
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
