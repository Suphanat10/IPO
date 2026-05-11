"use client";

import * as React from "react";
import {
  Box,
  Button,
  InputAdornment,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SectionCard from "../components/SectionCard";
import LabeledField from "../components/LabeledField";
import MetricPill from "../components/MetricPill";
import CollapseBlock from "../components/CollapseBlock";
import ReferenceLink from "../components/ReferenceLink";
import { useAnalysis } from "../lib/AnalysisContext";
import {
  computeFundamentalFactors,
  computeIpoScore,
  type FactorAnalysis,
} from "../lib/fundamentalFactors";

type Hint = {
  topic: string;
  sheet?: string;
  keyword: string;
};

type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  adornment?: string;
  hint: Hint;
};

const FIELDS: FieldDef[] = [
  {
    key: "ipoPrice",
    label: "ราคา IPO",
    placeholder: "เช่น 5.50",
    adornment: "บาท",
    hint: {
      topic: "การจอง การจำหน่าย และการจัดสรร",
      keyword: "ราคาหุ้นละ, ประมาณการจำนวนเงิน, ในราคาเสนอขายหุ้นละ, จำนวนเงินค่าหุ้น",
    },
  },
  {
    key: "grossProceeds",
    label: "มูลค่าการเสนอขาย",
    placeholder: "เช่น 550,000,000",
    adornment: "บาท",
    hint: {
      topic: "การจอง การจำหน่าย และการจัดสรร",
      keyword: "ประมาณการจำนวนเงิน, จำนวนเงินค่าหุ้น",
    },
  },
  {
    key: "totalExpense",
    label: "ค่าใช้จ่ายในการเสนอขาย",
    placeholder: "เช่น 25,000,000",
    adornment: "บาท",
    hint: {
      topic: "การจอง การจำหน่าย และการจัดสรร",
      keyword: "รวมค่าใช้จ่าย, ประมาณการค่าใช้จ่าย",
    },
  },
  {
    key: "offeredShares",
    label: "จำนวนหุ้นที่เสนอขาย",
    placeholder: "เช่น 100,000,000",
    adornment: "หุ้น",
    hint: {
      topic: "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
      keyword:
        "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย, รายละเอียดของหลักทรัพย์ที่เสนอขาย",
    },
  },
  {
    key: "offeredRatio",
    label: "สัดส่วนหุ้นที่เสนอขาย",
    placeholder: "เช่น 25",
    adornment: "%",
    hint: {
      topic: "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
      keyword: "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย, คิดเป็นร้อยละ",
    },
  },
  {
    key: "existingPct",
    label: "สัดส่วนการขายหุ้นเดิม",
    placeholder: "เช่น 10",
    adornment: "%",
    hint: {
      topic: "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
      keyword: "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย, รายละเอียดของหุ้นที่เสนอขาย",
    },
  },
  {
    key: "totalLiabilities",
    label: "หนี้สินทั้งหมด",
    placeholder: "เช่น 600,000,000",
    adornment: "บาท",
    hint: {
      topic: "งบการเงิน, งบการเงิน ประจำปี",
      sheet: "BS",
      keyword: "รวมหนี้สิน",
    },
  },
  {
    key: "totalEquity",
    label: "ส่วนของผู้ถือหุ้นทั้งหมด",
    placeholder: "เช่น 800,000,000",
    adornment: "บาท",
    hint: {
      topic: "งบการเงิน, งบการเงิน ประจำปี",
      sheet: "BS",
      keyword: "รวมส่วนของผู้ถือหุ้น, รวมส่วนของเจ้าของ",
    },
  },
  {
    key: "netIncome",
    label: "กำไรสุทธิ",
    placeholder: "เช่น 120,000,000",
    adornment: "บาท",
    hint: {
      topic: "งบการเงิน, งบการเงิน ประจำปี",
      sheet: "PL",
      keyword: "กำไรสำหรับปี",
    },
  },
  {
    key: "executivePct",
    label: "สัดส่วนการถือหุ้นของผู้บริหาร",
    placeholder: "เช่น 60",
    adornment: "%",
    hint: {
      topic: "โครงสร้างและการดำเนินงานของกลุ่มบริษัท, รายละเอียดเกี่ยวกับกรรมการ ผู้บริหาร",
      keyword: "รายชื่อผู้ถือหุ้น, ผู้ถือหุ้น",
    },
  },
  {
    key: "sector",
    label: "หมวดธุรกิจ / กลุ่มอุตสาหกรรม",
    placeholder: "เช่น อาหาร, แพทย์, เทคฯ",
    hint: {
      topic: "ข้อมูลสรุป (Executive Summary)",
      keyword: "หมวดธุรกิจ, กลุ่มอุตสาหกรรม",
    },
  },
];

function HintText({ hint }: { hint: Hint }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      หัวข้อ:{" "}
      <Link underline="hover" color="primary.main">
        {hint.topic}
      </Link>
      {hint.sheet ? (
        <>
          &nbsp;|&nbsp;<b>Sheet:</b>{" "}
          <Link underline="hover" color="primary.main">
            {hint.sheet}
          </Link>
        </>
      ) : null}
      &nbsp;|&nbsp;<b>Keyword:</b>{" "}
      <Box component="span" sx={{ color: "error.main" }}>
        {hint.keyword}
      </Box>
    </Typography>
  );
}

function placeholderExample(placeholder: string) {
  return placeholder.replace(/^เช่น\s*/, "").trim();
}

// Add thousand separators while preserving partial decimal input ("5.", "5.4").
// Empty input passes through unchanged so the user can clear the field.
function formatThousands(raw: string): string {
  if (!raw) return raw;
  const cleaned = raw.replace(/,/g, "");
  // Allow optional leading "-", digits, and at most one trailing "."
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return raw;
  const [intPart, decPart] = cleaned.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

function FactorBar({ factor }: { factor: FactorAnalysis }) {
  const w = factor.winProb;
  const fillColor = w >= 55 ? "#16a34a" : w >= 45 ? "#f59e0b" : "#dc2626";
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box sx={{ width: 130, textAlign: "right", pr: 1 }}>
        <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
          {factor.label}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, position: "relative", height: 18 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            bgcolor: "#f1f5f9",
            borderRadius: 1,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(100, Math.max(0, w))}%`,
            bgcolor: fillColor,
            borderRadius: 1,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: -2,
            bottom: -2,
            borderLeft: "1px dashed #94a3b8",
          }}
        />
      </Box>
      <Box sx={{ width: 54, textAlign: "right" }}>
        <Typography
          variant="body2"
          sx={{ fontSize: 12, fontWeight: 700, color: fillColor }}
        >
          {w.toFixed(1)}%
        </Typography>
      </Box>
    </Stack>
  );
}

function ConclusionOutput({
  factors,
  score,
  warnings,
  eyPeerGroup,
}: {
  factors: FactorAnalysis[];
  score: ReturnType<typeof computeIpoScore>;
  warnings: string[];
  eyPeerGroup: string | null;
}) {
  const sortedByWin = [...factors]
    .filter((f) => f.value != null)
    .sort((a, b) => a.winProb - b.winProb);

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          p: 1.75,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
          Conclusion (IPO Score: {score.score.toFixed(2)}/1)
        </Typography>
        <Typography variant="body2" sx={{ fontSize: 13, mt: 0.25 }}>
          <b>คำแนะนำ:</b> {score.thaiRecommendation}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: 13 }}>
          <b>แนวโน้ม:</b> {score.thaiTrend}
        </Typography>
        {eyPeerGroup ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            * Earnings Yield วิเคราะห์เทียบกลุ่ม: <b>{eyPeerGroup}</b>
          </Typography>
        ) : null}
      </Box>

      {warnings.length > 0 ? (
        <Box
          sx={{
            borderRadius: 2,
            border: "1px solid",
            borderColor: "warning.light",
            bgcolor: "#fffbeb",
            p: 1.5,
          }}
        >
          {warnings.map((w, i) => (
            <Typography key={i} variant="body2" color="warning.main" sx={{ fontSize: 12 }}>
              ⚠ {w}
            </Typography>
          ))}
        </Box>
      ) : null}

      {sortedByWin.length > 0 ? (
        <Box
          sx={{
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            p: 1.75,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, fontSize: 13 }}>
            ภาพรวมโอกาสเปิดบวกรายปัจจัย
          </Typography>
          <Stack spacing={0.75}>
            {sortedByWin.map((f) => (
              <FactorBar key={f.key} factor={f} />
            ))}
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 0.5 }}
          >
            (เส้นประ = เกณฑ์กึ่งกลาง 50%)
          </Typography>
        </Box>
      ) : null}

      {sortedByWin.length > 0 ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: 13 }}>
            รายละเอียดสถิติรายปัจจัย
          </Typography>
          <Table
            size="small"
            sx={{
              "& td, & th": {
                fontSize: 12,
                py: 0.5,
                borderBottom: "1px solid #e2e8f0",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell align="right">ปัจจัย</TableCell>
                <TableCell align="right">ค่า</TableCell>
                <TableCell align="center">เกณฑ์</TableCell>
                <TableCell align="right">ผลตอบแทนเฉลี่ย</TableCell>
                <TableCell align="right">โอกาสเปิด (บวก/ลบ)</TableCell>
                <TableCell align="right">เป็นสถิติที่มักพบในกลุ่ม</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {factors
                .filter((f) => f.value != null)
                .map((f) => (
                  <TableRow key={f.key}>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {f.label}
                    </TableCell>
                    <TableCell align="right">{f.valueDisplay}</TableCell>
                    <TableCell align="center">
                      <Box
                        component="span"
                        sx={{
                          px: 0.75,
                          py: 0.125,
                          borderRadius: 0.5,
                          fontWeight: 700,
                          fontSize: 11,
                          bgcolor:
                            f.tier === "สูง"
                              ? "#dcfce7"
                              : f.tier === "ต่ำ"
                                ? "#fee2e2"
                                : f.tier === "ไม่มีหุ้นเดิม"
                                  ? "#e0e7ff"
                                  : "#fef3c7",
                        }}
                      >
                        {f.tier}
                      </Box>
                      {f.bucketSize > 0 ? (
                        <Box
                          component="span"
                          sx={{
                            ml: 0.5,
                            fontSize: 10,
                            color: "text.secondary",
                          }}
                        >
                          n={f.bucketSize}
                        </Box>
                      ) : null}
                    </TableCell>
                    <TableCell align="right">
                      {f.meanReturn != null ? `${f.meanReturn.toFixed(2)}%` : "-"}
                    </TableCell>
                    <TableCell align="right">
                      บวก {f.bullProb.toFixed(0)}% / ลบ {f.bearProb.toFixed(0)}%
                    </TableCell>
                    <TableCell align="right">
                      {f.bestReturnTier ?? "-"} แนวโน้ม {f.bestReturnProb.toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}
    </Stack>
  );
}

export default function FundamentalAnalysis() {
  const { fundamental, setFundamentalField, resetFundamental } = useAnalysis();
  const values = fundamental.raw;
  const computed = fundamental.computed;

  const result = React.useMemo(
    () => computeFundamentalFactors(computed, values),
    [computed, values],
  );
  const factors = result.factors;
  const ipoScore = React.useMemo(() => computeIpoScore(factors), [factors]);
  const hasAnyFactor = factors.some((f) => f.value != null);

  const hasMetrics = React.useMemo(
    () => Object.values(computed).some((v) => v != null),
    [computed],
  );

  const handleChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFundamentalField(key, e.target.value);
  };

  // Numeric fields get thousand-separator formatting on display + strip commas on change.
  // Sector is a free-text field so we leave it untouched.
  const handleNumericChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFundamentalField(key, e.target.value.replace(/,/g, ""));
  };

  return (
    <SectionCard
      title="วิเคราะห์ปัจจัยหุ้นพื้นฐาน"
      subtitle="กรอกข้อมูลพื้นฐานจาก Filing เพื่อคำนวณตัวชี้วัดสำคัญของ IPO"
      icon={<InsightsRoundedIcon fontSize="small" />}
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
            {FIELDS.map((f) => (
              <LabeledField
                key={f.key}
                label={f.label}
                hint={
                  <>
                    <HintText hint={f.hint} />
                    <ReferenceLink
                      label="ตัวอย่าง"
                      example={{
                        value: placeholderExample(f.placeholder),
                        excerpt: `${f.label}: ${placeholderExample(f.placeholder)}`,
                        source: "Filing 56-1 (ตัวอย่างการดึงข้อมูล)",
                        note: "ใช้ค่าเพื่อทดลองได้ทันที แล้วแทนด้วยข้อมูลจริงภายหลัง",
                      }}
                    />
                  </>
                }
              >
                <TextField
                  size="small"
                  fullWidth
                  value={
                    f.key === "sector"
                      ? values[f.key] ?? ""
                      : formatThousands(values[f.key] ?? "")
                  }
                  onChange={
                    f.key === "sector" ? handleChange(f.key) : handleNumericChange(f.key)
                  }
                  placeholder={f.placeholder}
                  slotProps={
                    f.adornment
                      ? {
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">{f.adornment}</InputAdornment>
                            ),
                          },
                        }
                      : undefined
                  }
                />
              </LabeledField>
            ))}
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2, pl: { md: "196px" } }}>
            <Button variant="outlined" color="inherit" onClick={resetFundamental}>
              Reset
            </Button>
          </Stack>
        </Box>

        {hasAnyFactor ? (
          <ConclusionOutput
            factors={factors}
            score={ipoScore}
            warnings={result.warnings}
            eyPeerGroup={result.eyPeerGroup}
          />
        ) : null}

        <CollapseBlock
          title="สรุปตัวชี้วัดที่คำนวณได้"
          subtitle="พับไว้ก่อนเพื่อโฟกัสการกรอกข้อมูลให้ครบ"
          chipLabel={hasMetrics ? "อัปเดตแล้ว" : "รอข้อมูล"}
          defaultExpanded={false}
        >
          {hasMetrics ? (
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
              }}
            >
              <MetricPill
                label="Market Cap"
                value={computed.marketCap != null ? computed.marketCap.toLocaleString() : "-"}
                tone="default"
              />
              <MetricPill
                label="Cost Ratio"
                value={computed.costRatio != null ? `${computed.costRatio.toFixed(2)}%` : "-"}
                tone="neutral"
              />
              <MetricPill
                label="Net Proceeds Ratio"
                value={
                  computed.netProceedsRatio != null
                    ? `${computed.netProceedsRatio.toFixed(2)}%`
                    : "-"
                }
                tone="positive"
              />
              <MetricPill
                label="New Shares %"
                value={computed.newPct != null ? `${computed.newPct.toFixed(2)}%` : "-"}
                tone="neutral"
              />
              <MetricPill
                label="ROE"
                value={computed.roe != null ? `${computed.roe.toFixed(2)}%` : "-"}
                tone={computed.roe != null && computed.roe >= 10 ? "positive" : "negative"}
              />
              <MetricPill
                label="D/E"
                value={computed.de != null ? computed.de.toFixed(2) : "-"}
                tone={computed.de != null && computed.de <= 1.5 ? "positive" : "negative"}
              />
              <MetricPill
                label="P/E"
                value={computed.pe != null ? computed.pe.toFixed(2) : "-"}
                tone="default"
              />
              <MetricPill
                label="P/BV"
                value={computed.pbv != null ? computed.pbv.toFixed(2) : "-"}
                tone="default"
              />
              <MetricPill
                label="Total Shares"
                value={computed.totalShares != null ? computed.totalShares.toLocaleString() : "-"}
                tone="neutral"
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              กรอกข้อมูลด้านบน ระบบจะคำนวณตัวชี้วัดให้ทันที
            </Typography>
          )}
        </CollapseBlock>
      </Stack>
    </SectionCard>
  );
}
