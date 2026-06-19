"use client";

import * as React from "react";
import { Box, Tab, Tabs } from "@mui/material";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import { AnalysisProvider } from "../lib/AnalysisContext";
import type { DropdownOptions } from "../lib/publicHomeTypes";
import { DropdownOptionsProvider } from "../lib/useDropdownOptions";
import FAAnalysis from "../sections/FAAnalysis";
import FundamentalAnalysis from "../sections/FundamentalAnalysis";
import LeadCoAnalysis from "../sections/LeadCoAnalysis";
import LivePerformanceSummary from "../sections/LivePerformanceSummary";

type Props = {
  dropdownOptions: DropdownOptions;
};

const analysisTabs = [
  {
    label: "FA Analysis",
    icon: <AssignmentIndRoundedIcon />,
    content: <FAAnalysis />,
  },
  {
    label: "Lead-Co UW",
    icon: <AccountBalanceRoundedIcon />,
    content: <LeadCoAnalysis />,
  },
  {
    label: "Fundamental",
    icon: <InsightsRoundedIcon />,
    content: <FundamentalAnalysis />,
  },
] as const;

function HomeAnalysisContent() {
  const [tab, setTab] = React.useState(0);

  return (
    <Box>
      <Box
        sx={{
          bgcolor: "#fff",
          borderBottom: "1px solid",
          borderColor: "#d7dee8",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 50,
            px: { xs: 0.75, md: 1.25 },
            "& .MuiTabs-indicator": {
              height: 3,
              bgcolor: "#38bdf8",
            },
            "& .MuiTab-root": {
              minHeight: 50,
              px: { xs: 1.25, md: 2 },
              mr: { xs: 0.5, md: 1 },
              fontSize: 13,
              fontWeight: 800,
              color: "#64748b",
              textTransform: "none",
              gap: 1,
              "& .MuiTab-iconWrapper": {
                mr: 1,
                mb: 0,
                fontSize: 18,
              },
              "&.Mui-selected": {
                color: "#0f172a",
              },
            },
          }}
        >
          {analysisTabs.map((item) => (
            <Tab
              key={item.label}
              icon={React.cloneElement(item.icon, { sx: { fontSize: 18 } })}
              iconPosition="start"
              label={item.label}
            />
          ))}
        </Tabs>
      </Box>

      <Box
        sx={{
          p: { xs: 1.5, md: 2.5 },
          bgcolor: "#f8fafc",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: { xs: 2, lg: 2.5 },
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 380px" },
            alignItems: "start",
          }}
        >
          <Box sx={{ minWidth: 0 }}>{analysisTabs[tab].content}</Box>
          <Box sx={{ minWidth: 0, position: { lg: "sticky" }, top: { lg: 88 } }}>
            <LivePerformanceSummary />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function HomeAnalysisPanel({ dropdownOptions }: Props) {
  return (
    <DropdownOptionsProvider initialOptions={dropdownOptions}>
      <AnalysisProvider>
        <HomeAnalysisContent />
      </AnalysisProvider>
    </DropdownOptionsProvider>
  );
}
