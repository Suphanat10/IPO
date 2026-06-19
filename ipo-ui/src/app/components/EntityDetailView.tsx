"use client";

import * as React from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import {
  filterByCompany,
  filterByPerson,
  filterByPersonAndCompany,
  filterByLead,
  filterByCos,
  filterByLeadAndCos,
} from "../lib/ipoAnalytics";
import {
  useSummary,
  useRawIpo,
  useLeadCo,
  useIpoDetails,
} from "../lib/ipoDataClient";
import type { IpoDetailRow } from "../lib/mockData";
import type { SummaryRow } from "../lib/types";

type Mode = "person" | "company" | "matched" | "lead" | "co" | "leadco";

function fmtPct(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(v)) return "None";
  return `${v.toFixed(dec)}%`;
}
function fmtNum(v: number | null | undefined, dec = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(dec);
}

const monoSx = { fontFamily: "monospace", fontSize: 13 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ ...monoSx, fontWeight: 700, mb: 0.5 }}>{title}</Typography>
      <Box sx={monoSx}>{children}</Box>
    </Box>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Box sx={{ minWidth: 80 }}>{k}</Box>
      <Box>: {v}</Box>
    </Box>
  );
}

function buildDetails(
  symbols: string[],
  bySymbol: Map<string, IpoDetailRow>,
): IpoDetailRow[] {
  return symbols
    .map((sym) => bySymbol.get(sym))
    .filter((r): r is IpoDetailRow => r != null);
}

function _avg(xs: Array<number | null>): number {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}
function _pct(xs: Array<number | null>): number {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  return v.length ? (v.filter((x) => x > 0).length / v.length) * 100 : 0;
}
function _max(xs: Array<number | null>): number {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  return v.length ? Math.max(...v) : 0;
}
function _min(xs: Array<number | null>): number {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)) as number[];
  return v.length ? Math.min(...v) : 0;
}

/** Build a SummaryRow from raw IpoDetailRow[] (used when no pre-aggregated summary exists). */
function buildSummaryFromDetails(name: string, ds: IpoDetailRow[]): SummaryRow {
  return {
    name,
    ipo_count: ds.length,
    prob_open_above_ipo: _pct(ds.map((d) => d.return_open_d1)),
    prob_high_above_ipo: _pct(ds.map((d) => d.return_high_d1)),
    prob_low_above_ipo: _pct(ds.map((d) => d.return_low_d1)),
    prob_close_above_ipo: _pct(ds.map((d) => d.return_close_d1)),
    avg_return_open_d1: _avg(ds.map((d) => d.return_open_d1)),
    avg_return_high_d1: _avg(ds.map((d) => d.return_high_d1)),
    avg_return_low_d1: _avg(ds.map((d) => d.return_low_d1)),
    avg_return_close_d1: _avg(ds.map((d) => d.return_close_d1)),
    best_return_d1: _max(ds.map((d) => d.return_close_d1)),
    worst_return_d1: _min(ds.map((d) => d.return_close_d1)),
    avg_intraday_range_d1: _avg(ds.map((d) => d.intraday_range_d1)),
    avg_return_1W: _avg(ds.map((d) => d.return_1W)),
    avg_return_1M: _avg(ds.map((d) => d.return_1M)),
    avg_return_3M: _avg(ds.map((d) => d.return_3M)),
    avg_return_6M: _avg(ds.map((d) => d.return_6M)),
    max_return_week: _max(ds.map((d) => d.return_1W)),
    min_return_week: _min(ds.map((d) => d.return_1W)),
    prob_close_d5_above_ipo: 0,
  };
}

export default function EntityDetailView({
  mode,
  person,
  company,
  lead,
  coList,
}: {
  mode: Mode;
  person?: string;
  company?: string;
  lead?: string;
  coList?: string[];
}) {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const summaryState = useSummary();
  const rawIpoState = useRawIpo();
  const leadCoState = useLeadCo();
  const ipoDetailsState = useIpoDetails();
  const summaryData = summaryState.data;
  const rawIpoData = rawIpoState.data;
  const leadCoData = leadCoState.data;
  const detailsBySymbol = React.useMemo(() => {
    const m = new Map<string, IpoDetailRow>();
    for (const d of ipoDetailsState.data?.ipoDetails ?? []) m.set(d.symbol, d);
    return m;
  }, [ipoDetailsState.data]);

  const { rows, label, summary } = React.useMemo(() => {
    if (mode === "person" && person) {
      const rows = filterByPerson(person);
      const summary =
        summaryData?.faPersons.find((r) => r.name === person) ?? null;
      return { rows, label: `FA Person: ${person}`, summary };
    }
    if (mode === "company" && company) {
      const rows = filterByCompany(company);
      const summary =
        summaryData?.faCompanies.find((r) => r.name === company) ?? null;
      return { rows, label: `FA Company: ${company}`, summary };
    }
    if (mode === "matched" && person && company) {
      const rows = filterByPersonAndCompany(person, company);
      return {
        rows,
        label: `FA Person: ${person} | FA Company: ${company}`,
        summary: null as SummaryRow | null,
      };
    }
    if (mode === "lead" && lead) {
      const rows = filterByLead(lead);
      return { rows, label: `Lead: ${lead}`, summary: null as SummaryRow | null };
    }
    if (mode === "co" && coList && coList.length > 0) {
      const rows = filterByCos(coList);
      return {
        rows,
        label: `Co: ${coList.join(", ")}`,
        summary: null as SummaryRow | null,
      };
    }
    if (mode === "leadco" && lead && coList && coList.length > 0) {
      const rows = filterByLeadAndCos(lead, coList);
      return {
        rows,
        label: `Lead: ${lead} | Co: ${coList.join(", ")}`,
        summary: null as SummaryRow | null,
      };
    }
    return { rows: [], label: "", summary: null as SummaryRow | null };
  }, [mode, person, company, lead, coList, summaryData, rawIpoData, leadCoData]);

  const details = React.useMemo(
    () => buildDetails(rows.map((r) => r.sym), detailsBySymbol),
    [rows, detailsBySymbol],
  );

  // Use pre-aggregated summary when available, otherwise compute from filtered details.
  // NOTE: must be called before any early return — React requires a stable hook order.
  const effectiveSummary = React.useMemo(
    () => summary ?? buildSummaryFromDetails(label, details),
    [summary, label, details],
  );

  const dataError =
    rawIpoState.error || leadCoState.error || ipoDetailsState.error;
  if (
    rawIpoState.loading ||
    leadCoState.loading ||
    ipoDetailsState.loading ||
    dataError
  ) {
    return (
      <Box sx={monoSx}>
        <Box>{label}</Box>
        <Box sx={{ color: dataError ? "error.main" : "text.secondary", mt: 1 }}>
          {dataError
            ? "โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง"
            : "กำลังโหลดข้อมูล…"}
        </Box>
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={monoSx}>
        <Box>{label}</Box>
        <Box sx={{ color: "warning.main", fontWeight: 700, mt: 1 }}>
          ไม่พบข้อมูลในฐานข้อมูล
        </Box>
      </Box>
    );
  }

  const isFA = mode === "person" || mode === "company" || mode === "matched";

  const probDisplay = {
    open: effectiveSummary.prob_open_above_ipo,
    high: effectiveSummary.prob_high_above_ipo,
    low: effectiveSummary.prob_low_above_ipo,
    close: effectiveSummary.prob_close_above_ipo,
  };
  const avgDisplay = {
    open: effectiveSummary.avg_return_open_d1,
    high: effectiveSummary.avg_return_high_d1,
    low: effectiveSummary.avg_return_low_d1,
    close: effectiveSummary.avg_return_close_d1,
  };
  const postDisplay = {
    w1: effectiveSummary.avg_return_1W,
    m1: effectiveSummary.avg_return_1M,
    m3: effectiveSummary.avg_return_3M,
    m6: effectiveSummary.avg_return_6M,
  };
  const worstDisplay = effectiveSummary.worst_return_d1;
  const ipoCount = effectiveSummary.ipo_count;

  return (
    <Stack spacing={2}>
      <Box sx={monoSx}>
        <Box sx={{ fontWeight: 700 }}>{label}</Box>
        <Box>จำนวน IPO: {ipoCount}</Box>
      </Box>

      <Section title="Probability (Day 1)">
        <KV k="Open > IPO" v={`≈ ${fmtPct(probDisplay.open)}`} />
        <KV k="High > IPO" v={`≈ ${fmtPct(probDisplay.high)}`} />
        <KV k="Low > IPO" v={`≈ ${fmtPct(probDisplay.low)}`} />
        <KV k="Close > IPO" v={`≈ ${fmtPct(probDisplay.close)}`} />
      </Section>

      <Section title="Average Return (Day 1)">
        <KV k="Open" v={fmtPct(avgDisplay.open)} />
        <KV k="High" v={fmtPct(avgDisplay.high)} />
        <KV k="Low" v={fmtPct(avgDisplay.low)} />
        <KV k="Close" v={fmtPct(avgDisplay.close)} />
        <Box sx={{ mt: 0.5 }}>Worst Return (Day 1): {fmtPct(worstDisplay)}</Box>
      </Section>

      <Section title="Post-IPO Performance (Average Return)">
        <KV k="1 Week" v={fmtPct(postDisplay.w1)} />
        <KV k="1 Month" v={fmtPct(postDisplay.m1)} />
        <KV k="3 Months" v={fmtPct(postDisplay.m3)} />
        <KV k="6 Months" v={fmtPct(postDisplay.m6)} />
      </Section>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            "& td, & th": { fontFamily: "monospace", fontSize: 11.5, py: 0.5, whiteSpace: "nowrap" },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>
                {mode === "lead" || mode === "leadco"
                  ? "lead_underwriter"
                  : mode === "co"
                    ? "co_underwriter"
                    : mode === "person"
                      ? "fa_persons"
                      : "fa_companies"}
              </TableCell>
              <TableCell align="right">ipo_count</TableCell>
              <TableCell align="right">prob_close_above_ipo</TableCell>
              <TableCell align="right">prob_high_above_ipo</TableCell>
              <TableCell align="right">prob_low_above_ipo</TableCell>
              <TableCell align="right">prob_open_above_ipo</TableCell>
              <TableCell align="right">best_return_d1</TableCell>
              <TableCell align="right">worst_return_d1</TableCell>
              <TableCell align="right">avg_return_open_d1</TableCell>
              <TableCell align="right">avg_return_high_d1</TableCell>
              <TableCell align="right">avg_return_low_d1</TableCell>
              <TableCell align="right">avg_return_close_d1</TableCell>
              <TableCell align="right">avg_intraday_range_d1</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>{effectiveSummary.name}</TableCell>
              <TableCell align="right">{effectiveSummary.ipo_count}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.prob_close_above_ipo, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.prob_high_above_ipo, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.prob_low_above_ipo, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.prob_open_above_ipo, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.best_return_d1, 1)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.worst_return_d1, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.avg_return_open_d1, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.avg_return_high_d1, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.avg_return_low_d1, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.avg_return_close_d1, 2)}</TableCell>
              <TableCell align="right">{fmtNum(effectiveSummary.avg_intraday_range_d1, 2)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box>
        <Typography sx={{ ...monoSx, fontWeight: 700, mb: 0.5 }}>
          IPO detail
          {mode === "matched" ? " (matched)" : ""}
          {mode === "lead" ? " (Lead)" : ""}
          {mode === "co" ? " (Co)" : ""}
          {mode === "leadco" ? " (Lead-Co)" : ""}
        </Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table
            size="small"
            sx={{
              "& td, & th": { fontFamily: "monospace", fontSize: 11.5, py: 0.5, whiteSpace: "nowrap" },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>symbol</TableCell>
                {isFA && <TableCell>fa_persons</TableCell>}
                {isFA && <TableCell>fa_companies</TableCell>}
                <TableCell align="right">ipo_price</TableCell>
                <TableCell align="right">open_d1</TableCell>
                <TableCell align="right">high_d1</TableCell>
                <TableCell align="right">low_d1</TableCell>
                <TableCell align="right">close_d1</TableCell>
                <TableCell align="right">return_open_d1</TableCell>
                <TableCell align="right">return_high_d1</TableCell>
                <TableCell align="right">return_low_d1</TableCell>
                <TableCell align="right">return_close_d1</TableCell>
                <TableCell align="right">intraday_range_d1</TableCell>
                <TableCell align="right">close_1W</TableCell>
                <TableCell align="right">close_1M</TableCell>
                <TableCell align="right">close_3M</TableCell>
                <TableCell align="right">close_6M</TableCell>
                <TableCell align="right">return_1W</TableCell>
                <TableCell align="right">return_1M</TableCell>
                <TableCell align="right">return_3M</TableCell>
                <TableCell align="right">return_6M</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {details
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((d) => (
                <TableRow key={d.symbol}>
                  <TableCell>{d.symbol}</TableCell>
                  {isFA && <TableCell>{d.fa_persons || "—"}</TableCell>}
                  {isFA && <TableCell>{d.fa_companies || "—"}</TableCell>}
                  <TableCell align="right">{fmtNum(d.ipo_price, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.open_d1, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.high_d1, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.low_d1, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.close_d1, 2)}</TableCell>
                  <ReturnCell value={d.return_open_d1} />
                  <ReturnCell value={d.return_high_d1} />
                  <ReturnCell value={d.return_low_d1} />
                  <ReturnCell value={d.return_close_d1} />
                  <ReturnCell value={d.intraday_range_d1} />
                  <TableCell align="right">{fmtNum(d.close_1W, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.close_1M, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.close_3M, 2)}</TableCell>
                  <TableCell align="right">{fmtNum(d.close_6M, 2)}</TableCell>
                  <ReturnCell value={d.return_1W} />
                  <ReturnCell value={d.return_1M} />
                  <ReturnCell value={d.return_3M} />
                  <ReturnCell value={d.return_6M} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={details.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
          labelRowsPerPage="แถวต่อหน้า:"
          sx={{ "& .MuiTablePagination-toolbar": { fontFamily: "monospace", fontSize: 12 } }}
        />
      </Box>

    </Stack>
  );
}

function ReturnCell({ value }: { value: number | null }) {
  return (
    <TableCell
      align="right"
      sx={{
        color:
          value == null
            ? "text.secondary"
            : value >= 0
              ? "success.main"
              : "error.main",
      }}
    >
      {fmtNum(value, 2)}
    </TableCell>
  );
}
