"use client";

import * as React from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { Conclusion } from "../lib/ipoAnalytics";

function fmtPct(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(v)) return "-";
  return `${v.toFixed(dec)}%`;
}

function fmtNum(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(v)) return "N/A";
  return v.toFixed(dec);
}

export default function ConclusionView({
  header,
  conclusion,
}: {
  header: React.ReactNode;
  conclusion: Conclusion;
}) {
  if (!conclusion.found) {
    return (
      <Box sx={{ p: 1.75, fontFamily: "monospace", fontSize: 13 }}>
        <Box sx={{ mb: 1 }}>{header}</Box>
        <Box sx={{ color: "warning.main", fontWeight: 700 }}>
          ไม่พบข้อมูลในฐานข้อมูล
        </Box>
      </Box>
    );
  }

  const { summary, risk, decision, decisionLabel, sampleSize, holding,
    horizon, day12, tpD1, tpD2, recommendation, warningLowSample, drawdown } = conclusion;

  return (
    <Stack spacing={2} sx={{ fontFamily: "monospace", fontSize: 13 }}>
      <Box>
        {header}
        <Box sx={{ mt: 1, color: "text.secondary", fontSize: 12 }}>
          จากสถิติ IPO ย้อนหลัง{conclusion.modeDesc ? ` (${conclusion.modeDesc})` : ""}
        </Box>
      </Box>

      <Box>
        <Box>- หุ้นตัวนี้มีโอกาสขึ้นในวันแรก ≈ <b>{fmtPct(summary?.prob_close_above_ipo)}</b></Box>
        <Box>- ผลตอบแทนเฉลี่ยวันแรก ≈ <b>{fmtPct(summary?.avg_return_close_d1)}</b></Box>
        <Box>- โอกาสขาดทุนเกิน -20% ≈ <b>{fmtPct(risk?.downside_freq_20)}</b></Box>
        {risk?.risk_reward != null ? (
          <Box>- Risk / Reward Ratio: <b>{fmtNum(risk.risk_reward)}</b></Box>
        ) : null}
        <Box>- จำนวน IPO ที่ใช้วิเคราะห์: <b>{sampleSize}</b></Box>
        <Box
          sx={{
            mt: 0.75,
            color: decision === "BUY" ? "success.main" : "error.main",
            fontWeight: 700,
          }}
        >
          - {decisionLabel} (Score: {(conclusion.score * 100).toFixed(2)} / 100)
        </Box>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: 12 }}>
          Average Return (%)
        </Typography>
        <Table size="small" sx={{ "& td, & th": { fontSize: 11.5, py: 0.5 } }}>
          <TableHead>
            <TableRow>
              {holding.map((h) => (
                <TableCell key={h.label} align="right" sx={{ fontWeight: 700 }}>
                  {h.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              {holding.map((h, i) => (
                <TableCell
                  key={i}
                  align="right"
                  sx={{
                    color:
                      h.value == null
                        ? "text.secondary"
                        : h.value >= 0
                          ? "success.main"
                          : "error.main",
                  }}
                >
                  {fmtNum(h.value)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
        {horizon ? (
          <Box sx={{ mt: 0.75 }}>- ช่วงที่ผลตอบแทนเฉลี่ยสูงสุด: <b>{horizon.best_period}</b></Box>
        ) : null}
      </Box>

      {day12 ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: 12 }}>
            Day1 vs Day2
          </Typography>
          <Box>- ค่าเฉลี่ยรวม 2 วัน: <b>{fmtPct(day12.avg_two)}</b></Box>
          <Box>- Day1 เกินค่าเฉลี่ย: <b>{fmtPct(day12.d1_above)}</b></Box>
          <Box>- Day2 เกินค่าเฉลี่ย: <b>{fmtPct(day12.d2_above)}</b></Box>
          <Box>- สัดส่วนหุ้น IPO ที่ผลตอบแทนวันที่ 2 สูงกว่าวันแรก: <b>{fmtPct(day12.continuation)}</b></Box>
        </Box>
      ) : null}

      {tpD1.length > 0 ? (
        <Box>
          <Table size="small" sx={{ "& td, & th": { fontSize: 11.5, py: 0.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell align="right" sx={{ fontWeight: 700 }}>Target (%)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Hit Rate Day1 (%)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Hit Rate Day2 (%)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Expected Value Day1</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Expected Value Day2</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tpD1.map((row, i) => {
                const d2 = tpD2[i];
                return (
                  <TableRow key={row.target}>
                    <TableCell sx={{ color: "text.secondary" }}>{i}</TableCell>
                    <TableCell align="right">{row.target}</TableCell>
                    <TableCell align="right">{fmtNum(row.hitRate, 1)}</TableCell>
                    <TableCell align="right">{fmtNum(d2?.hitRate, 1)}</TableCell>
                    <TableCell align="right">{fmtNum(row.ev, 1)}</TableCell>
                    <TableCell align="right">{fmtNum(d2?.ev, 1)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      ) : null}

      {recommendation.length > 0 ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: 12 }}>
            Analysis Summary
          </Typography>
          {recommendation.map((line, i) => (
            <Box key={i}>- {line}</Box>
          ))}
        </Box>
      ) : null}

      {warningLowSample ? (
        <Box sx={{ color: "warning.main" }}>
          หมายเหตุ: Sample Size ต่ำ อาจมีความผันผวนสูง (ควรใช้ความระมัดระวังในการอ้างอิงสถิติ)
        </Box>
      ) : null}

      {drawdown && (drawdown.mean != null || drawdown.median != null) ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: 13, fontFamily: "monospace" }}>
            Intraday Drawdown:
          </Typography>
          <Box>- Average Drawdown ≈ <b>{fmtPct(drawdown.mean)}</b></Box>
          <Box>- Median ≈ <b>{fmtPct(drawdown.median)}</b></Box>
          <Box>- 75% ของหุ้นย่อไม่เกิน ≈ <b>{fmtPct(drawdown.p75)}</b></Box>
          <Box>- 90% ของหุ้นย่อไม่เกิน ≈ <b>{fmtPct(drawdown.p90)}</b></Box>
        </Box>
      ) : null}
    </Stack>
  );
}
