"use client";

import * as React from "react";
import { Box, Chip, Divider, Stack, Tab, Tabs, Typography } from "@mui/material";
import SummarizeRoundedIcon from "@mui/icons-material/SummarizeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SectionCard from "../components/SectionCard";

type Outlook = "positive" | "negative" | "neutral" | "na";

type SummaryContent = {
  title: string;
  outlook: Outlook;
  bullets: string[];
};

const CONCLUSION: SummaryContent = {
  title: "OVERALL PERFORMANCE SUMMARY",
  outlook: "neutral",
  bullets: [
    "การวิเคราะห์แบบจับคู่ปัจจัย (Combinations)",
    "• [FA & Underwriter]  :  N/A (ข้อมูลไม่ครบสำหรับการจับคู่)",
    "• [FA & Fundamental]  :  N/A (ข้อมูลไม่ครบสำหรับการจับคู่)",
    "• [Underwriter & Fundamental] : N/A (ข้อมูลไม่ครบสำหรับการจับคู่)",
    "——————————————————————————————",
    "สรุปทิศทางภาพรวม : รอข้อมูล FA / Underwriter / Fundamental เพิ่มเติม",
  ],
};

const FA_SUMMARY: SummaryContent = {
  title: "FA Performance",
  outlook: "positive",
  bullets: [
    "FA Company ที่คุณเลือกมีสถิติ P(Close > IPO) สูงกว่าค่าเฉลี่ยตลาด",
    "ผลตอบแทนเฉลี่ยวันแรก (Close D1) เป็นบวกอย่างมีนัยสำคัญ",
    "ระยะ 1M–3M ยังคงรักษาผลตอบแทนเฉลี่ยเป็นบวก",
    "แนวโน้มเป็น Positive (Mock) — เชื่อมต่อ dataset จริงเพื่อผลลัพธ์ที่แม่นยำ",
  ],
};

const LEADCO_SUMMARY: SummaryContent = {
  title: "Lead–Co Underwriter Performance",
  outlook: "neutral",
  bullets: [
    "Lead underwriter มีประวัติ IPO ที่เพียงพอต่อการสรุป",
    "คู่ Lead × Co ที่เลือกยังมีตัวอย่างน้อย ควรพิจารณาร่วมกับ FA",
    "ผลตอบแทนระยะ 6M กระจายตัวสูง — แสดงความไม่แน่นอน",
    "แนวโน้มเป็น Neutral (Mock)",
  ],
};

const FUNDAMENTAL_SUMMARY: SummaryContent = {
  title: "Fundamental Performance",
  outlook: "na",
  bullets: [
    "ยังไม่พบข้อมูลพื้นฐานสำหรับการประเมิน",
    "กรุณากรอกข้อมูลใน \"วิเคราะห์ปัจจัยหุ้นพื้นฐาน\" แล้วกดคำนวณ",
  ],
};

function OutlookChip({ outlook }: { outlook: Outlook }) {
  const map: Record<Outlook, { label: string; color: "success" | "error" | "default" | "warning" }> = {
    positive: { label: "Positive", color: "success" },
    negative: { label: "Negative", color: "error" },
    neutral: { label: "Neutral", color: "warning" },
    na: { label: "N/A", color: "default" },
  };
  const s = map[outlook];
  return (
    <Chip
      size="small"
      color={s.color}
      label={s.label}
      icon={
        outlook === "positive" ? (
          <CheckCircleRoundedIcon />
        ) : outlook === "na" ? undefined : (
          <ErrorOutlineRoundedIcon />
        )
      }
    />
  );
}

function SummaryPanel({ content }: { content: SummaryContent }) {
  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "#fafbfd",
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, alignItems: "center" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {content.title}
        </Typography>
        <OutlookChip outlook={content.outlook} />
      </Stack>
      <Divider sx={{ mb: 1.5 }} />
      <Stack spacing={1}>
        {content.bullets.map((b, i) => (
          <Typography
            key={i}
            variant="body2"
            sx={{
              fontFamily:
                b.startsWith("•") || b.includes("——")
                  ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                  : undefined,
              color: "text.primary",
              whiteSpace: "pre-wrap",
            }}
          >
            {b}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

const TABS: { label: string; content: SummaryContent }[] = [
  { label: "Overall Conclusion", content: CONCLUSION },
  { label: "FA Summary", content: FA_SUMMARY },
  { label: "Lead-Co Summary", content: LEADCO_SUMMARY },
  { label: "Fundamental Summary", content: FUNDAMENTAL_SUMMARY },
];

export default function PerformanceSummary() {
  const [tab, setTab] = React.useState(0);
  return (
    <SectionCard
      title="Performance Summary"
      subtitle="สรุปผลการวิเคราะห์รวมจากทุกมิติ พร้อมทิศทางภาพรวม"
      icon={<SummarizeRoundedIcon fontSize="small" />}
    >
      <Stack spacing={2}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((t) => (
            <Tab key={t.label} label={t.label} />
          ))}
        </Tabs>
        <SummaryPanel content={TABS[tab].content} />
      </Stack>
    </SectionCard>
  );
}
