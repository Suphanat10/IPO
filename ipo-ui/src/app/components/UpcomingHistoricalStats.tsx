"use client";

import * as React from "react";
import { Box, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import SummaryDataGrid from "./SummaryDataGrid";
import {
  faCompaniesSummary,
  faPersonsSummary,
  leadCoSummary,
  leadUnderwritersSummary,
} from "../lib/mockData";
import type { LeadCoSummaryRow, SummaryRow, ViewKey } from "../lib/types";

const VIEW_KEYS: ViewKey[] = [
  "Key Metrics",
  "Performance (Day 1)",
  "Post-IPO Performance",
  "All Columns",
];

type Props = {
  faPersons: string[];
  faCompanies: string[];
  leadUw: string[];
  coUws: string[];
};

function matchByName<T extends { name: string }>(rows: T[], targets: string[]): T[] {
  if (targets.length === 0) return [];
  const set = new Set(targets.map((t) => t.trim()).filter(Boolean));
  if (set.size === 0) return [];
  return rows.filter((r) => set.has(r.name.trim()));
}

function matchLeadCo(
  rows: LeadCoSummaryRow[],
  leads: string[],
  cos: string[],
): LeadCoSummaryRow[] {
  if (leads.length === 0) return [];
  const leadSet = new Set(leads.map((l) => l.trim()).filter(Boolean));
  if (leadSet.size === 0) return [];
  const coSet = new Set(cos.map((c) => c.trim()).filter(Boolean));
  return rows.filter((r) => {
    if (!leadSet.has(r.name.trim())) return false;
    if (coSet.size === 0) return true;
    return coSet.has((r.co ?? "").trim());
  });
}

export default function UpcomingHistoricalStats({
  faPersons,
  faCompanies,
  leadUw,
  coUws,
}: Props) {
  const [view, setView] = React.useState<ViewKey>("Key Metrics");
  const [activeTab, setActiveTab] = React.useState(0);

  const faPersonRows = React.useMemo<SummaryRow[]>(
    () => matchByName(faPersonsSummary, faPersons),
    [faPersons],
  );
  const faCompanyRows = React.useMemo<SummaryRow[]>(
    () => matchByName(faCompaniesSummary, faCompanies),
    [faCompanies],
  );
  const leadRows = React.useMemo<SummaryRow[]>(
    () => matchByName(leadUnderwritersSummary, leadUw),
    [leadUw],
  );
  const leadCoRows = React.useMemo<LeadCoSummaryRow[]>(
    () => matchLeadCo(leadCoSummary, leadUw, coUws),
    [leadUw, coUws],
  );

  const tabs = React.useMemo(
    () => [
      { key: "fa_person", title: "FA Person", nameLabel: "FA Person", rows: faPersonRows, showCo: false },
      { key: "fa_company", title: "FA Company", nameLabel: "FA Company", rows: faCompanyRows, showCo: false },
      { key: "lead", title: "Lead UW", nameLabel: "Lead Underwriter", rows: leadRows, showCo: false },
      { key: "lead_co", title: "Lead-Co", nameLabel: "Lead Underwriter", rows: leadCoRows, showCo: true },
    ],
    [faPersonRows, faCompanyRows, leadRows, leadCoRows],
  );

  const totalMatches = faPersonRows.length + faCompanyRows.length + leadRows.length + leadCoRows.length;
  if (totalMatches === 0) return null;

  const safeIdx = Math.min(activeTab, tabs.length - 1);
  const active = tabs[safeIdx];

  return (
    <Box
      sx={{
        mt: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "#fbfdff",
        p: { xs: 1.25, md: 1.75 },
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ mb: 1, alignItems: "center" }}>
        <QueryStatsRoundedIcon sx={{ color: "#0369a1", fontSize: 18 }} />
        <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#0a1929" }}>
          สถิติย้อนหลังของ FA / Lead
        </Typography>
      </Stack>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{ mb: 1.25, justifyContent: "space-between", alignItems: { xs: "stretch", md: "center" } }}
      >
        <Tabs
          value={safeIdx}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, fontSize: 12, fontWeight: 750, textTransform: "none" } }}
        >
          {tabs.map((t) => (
            <Tab key={t.key} label={`${t.title} (${t.rows.length})`} disabled={t.rows.length === 0} />
          ))}
        </Tabs>
        <TextField
          size="small"
          select
          label="View"
          value={view}
          onChange={(e) => setView(e.target.value as ViewKey)}
          sx={{ minWidth: 200 }}
        >
          {VIEW_KEYS.map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {active.rows.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: "#64748b", p: 1.5 }}>
          ไม่มีสถิติย้อนหลังของ {active.title}
        </Typography>
      ) : (
        <SummaryDataGrid
          rows={active.rows}
          nameLabel={active.nameLabel}
          view={view}
          showCo={active.showCo}
        />
      )}
    </Box>
  );
}
