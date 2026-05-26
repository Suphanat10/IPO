"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Divider,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import SectionCard from "../components/SectionCard";
import LabeledField from "../components/LabeledField";
import SummaryDataGrid from "../components/SummaryDataGrid";
import type { ViewKey } from "../lib/types";
import {
  faCompaniesSummary,
  faPersonsSummary,
  leadCoSummary,
  leadUnderwritersSummary,
} from "../lib/mockData";
import { useAnalysis } from "../lib/AnalysisContext";

const VIEW_KEYS: ViewKey[] = [
  "Key Metrics",
  "Performance (Day 1)",
  "Post-IPO Performance",
  "All Columns",
];

type TabSpec = {
  key: string;
  title: string;
  nameLabel: string;
  rows: typeof faPersonsSummary;
  showCo?: boolean;
};

const TABS: TabSpec[] = [
  { key: "fa_person", title: "FA Person", nameLabel: "FA Person", rows: faPersonsSummary },
  { key: "fa_company", title: "FA Company", nameLabel: "FA Company", rows: faCompaniesSummary },
  {
    key: "lead",
    title: "Lead Underwriter",
    nameLabel: "Lead Underwriter",
    rows: leadUnderwritersSummary,
  },
  {
    key: "lead_co",
    title: "Lead-Co",
    nameLabel: "Lead Underwriter",
    rows: leadCoSummary,
    showCo: true,
  },
];

function parsePositiveInt(v: string): { ok: boolean; val: number | null; err?: string } {
  const t = v.trim();
  if (t === "") return { ok: true, val: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return { ok: false, val: null, err: "ต้องเป็นจำนวนเต็ม ≥ 1" };
  return { ok: true, val: n };
}

export default function HistoricalPerformance() {
  const { historical, setHistorical } = useAnalysis();
  const [minInput, setMinInput] = React.useState(
    historical.minIpo != null ? String(historical.minIpo) : "",
  );
  const [maxInput, setMaxInput] = React.useState(
    historical.maxIpo != null ? String(historical.maxIpo) : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(0);
  const [view, setView] = React.useState<ViewKey>("Key Metrics");

  React.useEffect(() => {
    const minP = parsePositiveInt(minInput);
    const maxP = parsePositiveInt(maxInput);
    if (!minP.ok) {
      setError(`MIN_IPO: ${minP.err}`);
      return;
    }
    if (!maxP.ok) {
      setError(`MAX_IPO: ${maxP.err}`);
      return;
    }
    if (minP.val != null && maxP.val != null && minP.val > maxP.val) {
      setError("MIN_IPO ต้องน้อยกว่า MAX_IPO");
      return;
    }
    setError(null);
    setHistorical({ minIpo: minP.val, maxIpo: maxP.val });
  }, [minInput, maxInput, setHistorical]);

  const active = TABS[activeTab];
  const filteredCount = active.rows.filter((r) => {
    if (historical.minIpo != null && r.ipo_count < historical.minIpo) return false;
    if (historical.maxIpo != null && r.ipo_count > historical.maxIpo) return false;
    return true;
  }).length;

  return (
    <SectionCard
      title="Historical Performance"
      subtitle="กรุณาระบุจำนวน IPO ขั้นต่ำ เพื่อแสดงข้อมูลสถิติ"
      icon={<QueryStatsRoundedIcon fontSize="small" />}
    >
      <Stack spacing={2.5}>
        <Box
          sx={{
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            p: { xs: 2, md: 2.5 },
            bgcolor: "#fafbfd",
          }}
        >
          <Stack spacing={1}>
            <LabeledField label="MIN_IPO">
              <TextField
                size="small"
                fullWidth
                value={minInput}
                onChange={(e) => setMinInput(e.target.value.replace(/\D/g, ""))}
                placeholder="เช่น 3"
                slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
              />
            </LabeledField>
            <LabeledField label="MAX_IPO">
              <TextField
                size="small"
                fullWidth
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value.replace(/\D/g, ""))}
                placeholder="ไม่ระบุเพื่อแสดงทั้งหมด"
                slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
              />
            </LabeledField>
          </Stack>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Box>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{
              mb: 1.5,
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", md: "center" },
            }}
          >
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {TABS.map((t) => (
                <Tab key={t.key} label={t.title} />
              ))}
            </Tabs>
            <TextField
              size="small"
              select
              label="View"
              value={view}
              onChange={(e) => setView(e.target.value as ViewKey)}
              sx={{ minWidth: 220 }}
            >
              {VIEW_KEYS.map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            แสดง {active.title}
            {historical.minIpo != null ? ` • MIN IPO: ${historical.minIpo}` : ""}
            {historical.maxIpo != null ? ` • MAX IPO: ${historical.maxIpo}` : ""}
          </Typography>
          <SummaryDataGrid
            rows={active.rows}
            nameLabel={active.nameLabel}
            view={view}
            showCo={active.showCo}
            minIpo={historical.minIpo}
            maxIpo={historical.maxIpo}
          />
        </Box>
      </Stack>
    </SectionCard>
  );
}
