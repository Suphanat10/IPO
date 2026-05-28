"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import SectionCard from "../components/SectionCard";
import LabeledField from "../components/LabeledField";
import MetricPill from "../components/MetricPill";
import ReferenceLink from "../components/ReferenceLink";
import { useAnalysis } from "../lib/AnalysisContext";
import { useDropdownOptions } from "../lib/useDropdownOptions";
import {
  coUnderwriterOptions as mockCoOptions,
  leadCoSummary,
  leadUnderwriterOptions as mockLeadOptions,
  leadUnderwritersSummary,
} from "../lib/mockData";
import type { LeadCoSummaryRow, SummaryRow } from "../lib/types";
import { parseCoList } from "../lib/leadCoStats";
import ConclusionView from "../components/ConclusionView";
import EntityDetailView from "../components/EntityDetailView";
import { generateLeadCoConclusion } from "../lib/ipoAnalytics";
import { createFuzzyFilter } from "../lib/fuzzyMatch";

const filterLead = createFuzzyFilter("lead");
const filterCo = createFuzzyFilter("co");

function Hint({ topic, keyword }: { topic: string; keyword: string }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      หัวข้อ:{" "}
      <Link underline="hover" color="primary.main">
        {topic}
      </Link>
      &nbsp;|&nbsp;<b>Keyword:</b>{" "}
      <Box component="span" sx={{ color: "error.main" }}>
        {keyword}
      </Box>
    </Typography>
  );
}

function StatsRow({ row, title }: { row: SummaryRow | LeadCoSummaryRow; title: string }) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
        }}
      >
        <MetricPill label="IPO Count" value={row.ipo_count} tone="neutral" />
        <MetricPill
          label="P(Close > IPO)"
          value={`${row.prob_close_above_ipo.toFixed(1)}%`}
          tone={row.prob_close_above_ipo >= 60 ? "positive" : "negative"}
        />
        <MetricPill
          label="Avg Return D1"
          value={`${row.avg_return_close_d1.toFixed(2)}%`}
          tone={row.avg_return_close_d1 >= 0 ? "positive" : "negative"}
        />
        <MetricPill
          label="Avg Return 1M"
          value={`${row.avg_return_1M.toFixed(2)}%`}
          tone={row.avg_return_1M >= 0 ? "positive" : "negative"}
        />
        <MetricPill
          label="Avg Return 3M"
          value={`${row.avg_return_3M.toFixed(2)}%`}
          tone={row.avg_return_3M >= 0 ? "positive" : "negative"}
        />
        <MetricPill
          label="Avg Return 6M"
          value={`${row.avg_return_6M.toFixed(2)}%`}
          tone={row.avg_return_6M >= 0 ? "positive" : "negative"}
        />
      </Box>
    </Box>
  );
}

export default function LeadCoAnalysis() {
  const { leadCo, setLeadCo } = useAnalysis();
  const [tab, setTab] = React.useState(0);
  const dbOpts = useDropdownOptions();
  const leadUnderwriterOptions = React.useMemo(
    () =>
      [...new Set([...mockLeadOptions, ...dbOpts.underwriters])].sort((a, b) =>
        a.localeCompare(b, "th"),
      ),
    [dbOpts.underwriters],
  );
  const coUnderwriterOptions = React.useMemo(
    () =>
      [...new Set([...mockCoOptions, ...dbOpts.underwriters])].sort((a, b) =>
        a.localeCompare(b, "th"),
      ),
    [dbOpts.underwriters],
  );

  const lead = leadCo.lead;
  const co = leadCo.co;

  const coList = React.useMemo(() => parseCoList(co), [co]);

  const leadRow = React.useMemo(
    () => (lead ? leadUnderwritersSummary.find((r) => r.name === lead) : undefined),
    [lead],
  );
  const pairRow = React.useMemo(
    () =>
      lead && coList[0]
        ? leadCoSummary.find((r) => r.name === lead && r.co === coList[0])
        : undefined,
    [lead, coList],
  );

  // Python-spec conclusions
  const conclusion = React.useMemo(
    () => generateLeadCoConclusion(lead, co),
    [lead, co],
  );

  return (
    <SectionCard
      title="Lead-Co Underwriter Analysis"
      subtitle="วิเคราะห์สถิติของผู้จัดการการจัดจำหน่ายและผู้ร่วมจำหน่าย"
      icon={<AccountBalanceRoundedIcon fontSize="small" />}
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
            <LabeledField
              label="LEAD_UNDERWRITER"
              hint={
                <>
                  <Hint
                    topic="การจอง การจำหน่าย และการจัดสรร"
                    keyword="ผู้จัดการการจัดจำหน่าย, ผู้จัดจำหน่ายหลักทรัพย์"
                  />
                  <ReferenceLink
                    example={{
                      value: leadUnderwritersSummary[0]?.name,
                      excerpt: `ผู้จัดการการจัดจำหน่าย (ตัวอย่าง): ${leadUnderwritersSummary[0]?.name ?? "-"}`,
                      source: "Filing: หัวข้อ การจอง การจำหน่าย และการจัดสรร",
                      note: "กรอกชื่อให้ตรงรายการ เพื่อดึงสถิติย้อนหลังได้ทันที",
                    }}
                  />
                </>
              }
            >
              <Autocomplete
                size="small"
                freeSolo
                options={leadUnderwriterOptions}
                filterOptions={filterLead}
                inputValue={lead ?? ""}
                onInputChange={(_, v) => setLeadCo({ lead: v || null })}
                renderInput={(params) => (
                  <TextField {...params} placeholder="พิมพ์ชื่อ Lead Underwriter" />
                )}
              />
            </LabeledField>
            <LabeledField
              label="CO_UNDERWRITER"
              hint={
                <>
                  <Hint
                    topic="การจอง การจำหน่าย และการจัดสรร"
                    keyword="ผู้ร่วมจัดจำหน่าย, ผู้จัดจำหน่ายหลักทรัพย์"
                  />
                  <ReferenceLink
                    example={{
                      value: leadCoSummary[0]?.co,
                      excerpt: `ผู้ร่วมจัดจำหน่าย (ตัวอย่าง): ${leadCoSummary[0]?.co ?? "-"}`,
                      source: "Filing: หัวข้อ การจอง การจำหน่าย และการจัดสรร",
                      note: "ใส่หลายรายได้ด้วย , (comma)",
                    }}
                  />
                </>
              }
            >
              <Autocomplete
                size="small"
                multiple
                freeSolo
                options={coUnderwriterOptions}
                filterOptions={filterCo}
                value={parseCoList(co)}
                onChange={(_, v) =>
                  setLeadCo({ co: v.length ? v.join(", ") : null })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="เลือกหรือพิมพ์ชื่อ Co Underwriter (หลายรายได้)"
                  />
                )}
              />
            </LabeledField>
          </Stack>
        </Box>

        {(lead || coList.length > 0) ? (
          <Box
            sx={{
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: "#f8fafc",
                minHeight: 36,
                "& .MuiTab-root": { minHeight: 36, fontSize: 12, fontWeight: 700 },
              }}
            >
              <Tab label="Conclusion" />
              <Tab label="Lead Underwriter" />
              <Tab label="Co Underwriter" />
              <Tab label="Lead-Co Matched" />
            </Tabs>
            <Box sx={{ p: 2 }}>
              {tab === 0 ? (
                <ConclusionView
                  header={
                    <>
                      <Box>Lead Underwriter: {lead ?? "None"}</Box>
                      <Box>
                        Co Underwriter:{" "}
                        {coList.length > 0 ? coList.join(", ") : "None"}
                      </Box>
                    </>
                  }
                  conclusion={conclusion}
                />
              ) : null}
              {tab === 1 && lead ? (
                <EntityDetailView mode="lead" lead={lead} />
              ) : null}
              {tab === 2 && coList.length > 0 ? (
                <EntityDetailView mode="co" coList={coList} />
              ) : null}
              {tab === 3 && lead && coList.length > 0 ? (
                <EntityDetailView mode="leadco" lead={lead} coList={coList} />
              ) : null}
            </Box>
          </Box>
        ) : null}

        <Box>
          {leadRow || pairRow ? (
            <Stack spacing={2.5}>
              {leadRow ? <StatsRow title={`Lead - ${leadRow.name}`} row={leadRow} /> : null}
              {pairRow ? (
                <StatsRow
                  title={`Lead & Co - ${pairRow.name} x ${pairRow.co}`}
                  row={pairRow}
                />
              ) : null}
            </Stack>
          ) : (
            <Typography color="text.secondary">
              กรอกชื่อ Lead หรือ Lead/Co เพื่อดูสถิติที่เกี่ยวข้อง
            </Typography>
          )}
        </Box>
      </Stack>
    </SectionCard>
  );
}
