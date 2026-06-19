"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  COMPLETENESS_FIELDS,
  detectCsvTypes,
  detectSchema,
  IMPORT_CSV_MAX_FILE_BYTES,
  IMPORT_CSV_MAX_ROWS,
  IMPORT_PREVIEW_MAX_BODY_BYTES,
  num,
  parseCSV,
  schemaForCombined,
  type CsvType,
  type DetectedSchema,
  type SupportedCsvType,
} from "@/lib/csv-import";
import {
  ADMIN_RADIUS,
  adminColors,
  adminPanelSx,
  adminTableSx,
} from "../../components/AdminPrimitives";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PreviewRow {
  row_index: number;
  symbol: string;
  action: "new" | "update" | "skip" | "error";
  missing_fields: string[];
  errors: string[];
  normalized: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
  changed_fields: string[];
}

interface PreviewResponse {
  type: CsvType;
  summary: {
    total: number;
    new: number;
    update: number;
    skip: number;
    error: number;
    incomplete: number;
  };
  rows: PreviewRow[];
}

interface ImportItem {
  id: string;
  fileName: string;
  fileSize: number;
  rows: Record<string, string>[];
  schema: DetectedSchema;
  preview: PreviewResponse | null;
  error: string | null;
  autoCheck: AutoCheckResult | null;
  // Set when the file is a combined CSV (base + financials + sector in one file).
  // Holds the detected sections and, after preview, each section's own rows so
  // commit can split the single UI item back into per-type commit payloads.
  combinedTypes?: SupportedCsvType[];
  combinedParts?: Partial<Record<SupportedCsvType, PreviewRow[]>>;
}

interface CommitRun {
  fileName: string;
  type: CsvType;
  inserted: number;
  updated: number;
  skipped: number;
  sync_id: number;
}

interface CommitSummary {
  inserted: number;
  updated: number;
  skipped: number;
  runs: CommitRun[];
}

interface AutoCheckRow {
  index: number;
  symbol: string;
  missingFields: string[];
  completeness: number;
  autoStatus: string | null;
  warnings: string[];
  hasData: boolean;
}

interface AutoCheckResult {
  rows: AutoCheckRow[];
  totalRows: number;
  completeRows: number;
  incompleteRows: number;
  emptyRows: number;
  avgCompleteness: number;
  fieldCoverage: Record<string, number>;
}

// ──────────────────────────────────────────────
// Constants + helpers
// ──────────────────────────────────────────────

const TYPE_ORDER: Record<CsvType, number> = {
  base: 0,
  financials: 1,
  sector: 2,
  fa_norm: 3,
  combined: 4,
  unknown: 5,
};

const ALL_FIELDS: Record<string, string[]> = {
  base: [
    "symbol", "company_name", "ipo_price", "close_d1", "open_d1", "high_d1", "low_d1",
    "close_d2", "close_d3", "close_d4", "close_d5",
    "close_1w", "close_1m", "close_3m", "close_6m",
    "first_trade_date", "fa_persons", "fa_companies",
    "lead_underwriters_norm", "co_underwriters_norm",
  ],
  financials: [
    "symbol", "gross_proceeds", "total_expense", "offered_shares", "offered_ratio_pct",
    "existing_shares_pct", "executive_total_pct", "total_assets", "total_liabilities",
    "total_equity", "revenue_latest", "revenue_prev", "net_income_latest", "net_income_prev",
  ],
  sector: ["symbol", "Market", "Industry Group (กลุ่มอุตสาหกรรม)", "Sector (หมวดธุรกิจ)"],
  fa_norm: ["fa_companies", "fa_company_norm"],
};

function rowKey(itemId: string, rowIndex: number) {
  return `${itemId}:${rowIndex}`;
}

function isSupportedType(type: CsvType): type is SupportedCsvType {
  return type === "base" || type === "financials" || type === "sector" || type === "fa_norm";
}

const COMBINED_ORDER: SupportedCsvType[] = ["base", "financials", "sector"];

function isSelectable(row: PreviewRow) {
  return row.action === "new" || row.action === "update";
}

function fileSizeLabel(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function isEmpty(v: string | undefined | null): boolean {
  if (v == null) return true;
  const s = v.trim();
  return !s || s === "nan" || s === "NaN" || s === "";
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

const WHITE_CHIP_SX = {
  color: "#fff",
  fontWeight: 700,
  "& .MuiChip-label": { color: "#fff" },
} as const;

// ──────────────────────────────────────────────
// Client-side auto-check logic
// ──────────────────────────────────────────────

function runAutoCheck(rows: Record<string, string>[], type: CsvType): AutoCheckResult | null {
  if (!isSupportedType(type)) return null;
  const fields = COMPLETENESS_FIELDS[type];
  const allFields = ALL_FIELDS[type] ?? [];
  const fieldCoverage: Record<string, number> = {};

  for (const f of allFields) {
    if (f === "symbol") continue;
    fieldCoverage[f] = 0;
  }

  const checkRows: AutoCheckRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const keyField = type === "fa_norm" ? (raw.fa_companies ?? "").trim() : (raw.symbol ?? "").trim();
    if (!keyField) {
      checkRows.push({
        index: i,
        symbol: "",
        missingFields: [],
        completeness: 0,
        autoStatus: null,
        warnings: [type === "fa_norm" ? "fa_companies ว่าง / empty" : "symbol ว่าง / empty"],
        hasData: false,
      });
      continue;
    }

    const missingFields: string[] = [];
    const warnings: string[] = [];
    let filledCount = 0;
    let totalCount = 0;

    if (type === "base") {
      const checkFields = [
        "company_name", "ipo_price", "close_d1", "open_d1", "high_d1", "low_d1",
        "first_trade_date", "fa_companies", "lead_underwriters_norm",
      ];
      for (const f of checkFields) {
        totalCount++;
        if (isEmpty(raw[f])) {
          if (fields.includes(f.replace("first_trade_date", "listing_date")
            .replace("lead_underwriters_norm", "lead_uw"))) {
            missingFields.push(f);
          }
        } else {
          filledCount++;
          if (f in fieldCoverage) fieldCoverage[f]++;
        }
      }
    } else if (type === "financials") {
      for (const f of allFields) {
        if (f === "symbol") continue;
        totalCount++;
        if (isEmpty(raw[f])) {
          if (fields.includes(f)) missingFields.push(f);
        } else {
          filledCount++;
          if (f in fieldCoverage) fieldCoverage[f]++;
        }
      }

      const grossProceeds = num(raw.gross_proceeds);
      const totalExpense = num(raw.total_expense);
      if (grossProceeds != null && totalExpense != null && totalExpense > grossProceeds) {
        warnings.push("total_expense > gross_proceeds");
      }
      const totalAssets = num(raw.total_assets);
      const totalLiabilities = num(raw.total_liabilities);
      const totalEquity = num(raw.total_equity);
      if (totalAssets != null && totalLiabilities != null && totalEquity != null) {
        const diff = Math.abs(totalAssets - totalLiabilities - totalEquity);
        if (diff > 1) {
          warnings.push("assets ≠ liabilities + equity");
        }
      }
    } else if (type === "sector") {
      for (const f of allFields) {
        if (f === "symbol") continue;
        totalCount++;
        if (isEmpty(raw[f]) || raw[f]?.trim() === "-") {
          if (fields.includes(f === "Market" ? "market" :
            f.includes("Industry") ? "industry" : "sector")) {
            missingFields.push(f);
          }
        } else {
          filledCount++;
          if (f in fieldCoverage) fieldCoverage[f]++;
        }
      }
    } else if (type === "fa_norm") {
      totalCount = 2;
      if (!isEmpty(raw.fa_companies)) { filledCount++; if ("fa_companies" in fieldCoverage) fieldCoverage["fa_companies"]++; }
      else missingFields.push("fa_companies");
      if (!isEmpty(raw.fa_company_norm)) { filledCount++; if ("fa_company_norm" in fieldCoverage) fieldCoverage["fa_company_norm"]++; }
      else missingFields.push("fa_company_norm");
    }

    const completeness = totalCount > 0 ? (filledCount / totalCount) * 100 : 0;
    const allDataEmpty = filledCount === 0;

    let autoStatus: string | null = null;
    if (type === "base") {
      const hasPrice = !isEmpty(raw.ipo_price);
      const hasClose = !isEmpty(raw.close_d1);
      const hasDate = !isEmpty(raw.first_trade_date);
      if (hasPrice && hasClose && hasDate) {
        autoStatus = "listed";
      } else if (hasPrice && !hasClose) {
        autoStatus = "upcoming";
      } else if (!hasPrice && !hasClose) {
        autoStatus = "upcoming (ข้อมูลน้อย / sparse)";
      } else {
        autoStatus = "listed";
      }
    }

    checkRows.push({
      index: i,
      symbol: keyField,
      missingFields,
      completeness,
      autoStatus,
      warnings,
      hasData: !allDataEmpty,
    });
  }

  for (const f of Object.keys(fieldCoverage)) {
    fieldCoverage[f] = rows.length > 0 ? (fieldCoverage[f] / rows.length) * 100 : 0;
  }

  const completeRows = checkRows.filter((r) => r.missingFields.length === 0 && r.hasData).length;
  const incompleteRows = checkRows.filter((r) => r.missingFields.length > 0 && r.hasData).length;
  const emptyRows = checkRows.filter((r) => !r.hasData).length;
  const avgCompleteness =
    checkRows.length > 0
      ? checkRows.reduce((sum, r) => sum + r.completeness, 0) / checkRows.length
      : 0;

  return {
    rows: checkRows,
    totalRows: checkRows.length,
    completeRows,
    incompleteRows,
    emptyRows,
    avgCompleteness,
    fieldCoverage,
  };
}

// Merge per-section auto-checks (base/financials/sector) of a combined CSV into
// one result: per-row completeness is averaged, missing fields/warnings unioned.
function runCombinedAutoCheck(
  rows: Record<string, string>[],
  types: SupportedCsvType[],
): AutoCheckResult | null {
  const subs = types
    .map((t) => runAutoCheck(rows, t))
    .filter((ac): ac is AutoCheckResult => ac != null);
  if (subs.length === 0) return null;

  const baseAc = types.includes("base") ? runAutoCheck(rows, "base") : null;

  const checkRows: AutoCheckRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    let compSum = 0;
    let compCount = 0;
    const missingFields: string[] = [];
    const warnings: string[] = [];
    let hasData = false;
    for (const ac of subs) {
      const r = ac.rows[i];
      if (!r) continue;
      compSum += r.completeness;
      compCount++;
      missingFields.push(...r.missingFields);
      warnings.push(...r.warnings);
      if (r.hasData) hasData = true;
    }
    checkRows.push({
      index: i,
      symbol: (rows[i].symbol ?? "").trim(),
      missingFields,
      completeness: compCount > 0 ? compSum / compCount : 0,
      autoStatus: baseAc?.rows[i]?.autoStatus ?? null,
      warnings,
      hasData,
    });
  }

  const fieldCoverage: Record<string, number> = {};
  for (const ac of subs) Object.assign(fieldCoverage, ac.fieldCoverage);

  const completeRows = checkRows.filter((r) => r.missingFields.length === 0 && r.hasData).length;
  const incompleteRows = checkRows.filter((r) => r.missingFields.length > 0 && r.hasData).length;
  const emptyRows = checkRows.filter((r) => !r.hasData).length;
  const avgCompleteness =
    checkRows.length > 0 ? checkRows.reduce((s, r) => s + r.completeness, 0) / checkRows.length : 0;

  return {
    rows: checkRows,
    totalRows: checkRows.length,
    completeRows,
    incompleteRows,
    emptyRows,
    avgCompleteness,
    fieldCoverage,
  };
}

// Merge per-section previews of a combined CSV into one preview table (one row
// per symbol). Keeps each section's rows so commit can split them back apart.
function mergeCombinedPreview(
  parts: { type: SupportedCsvType; data: PreviewResponse }[],
): { merged: PreviewResponse; partsByType: Partial<Record<SupportedCsvType, PreviewRow[]>> } {
  const byType = new Map<SupportedCsvType, Map<number, PreviewRow>>();
  const partsByType: Partial<Record<SupportedCsvType, PreviewRow[]>> = {};
  const allIdx = new Set<number>();
  for (const { type, data } of parts) {
    byType.set(type, new Map(data.rows.map((r) => [r.row_index, r])));
    partsByType[type] = data.rows;
    data.rows.forEach((r) => allIdx.add(r.row_index));
  }

  const mergedRows: PreviewRow[] = [];
  [...allIdx]
    .sort((a, b) => a - b)
    .forEach((idx) => {
      const subRows = COMBINED_ORDER.map((t) => byType.get(t)?.get(idx)).filter(
        (r): r is PreviewRow => r != null,
      );
      const baseRow = byType.get("base")?.get(idx) ?? null;

      let symbol = "";
      const normalized: Record<string, unknown> = {};
      let current: Record<string, unknown> | null = null;
      const changed: string[] = [];
      const missing: string[] = [];
      const errors: string[] = [];
      for (const r of subRows) {
        if (r.symbol) symbol = r.symbol;
        if (r.normalized) Object.assign(normalized, r.normalized);
        if (r.current) current = { ...(current ?? {}), ...r.current };
        changed.push(...r.changed_fields);
        missing.push(...r.missing_fields);
        errors.push(...r.errors);
      }

      const anyError = subRows.some((r) => r.action === "error");
      const action: PreviewRow["action"] = anyError
        ? "error"
        : baseRow?.action === "new"
          ? "new"
          : subRows.some((r) => r.action === "new" || r.action === "update")
            ? "update"
            : "skip";

      mergedRows.push({
        row_index: idx,
        symbol,
        action,
        missing_fields: [...new Set(missing)],
        errors: [...new Set(errors)],
        normalized: Object.keys(normalized).length > 0 ? normalized : null,
        current,
        changed_fields: [...new Set(changed)],
      });
    });

  const summary: PreviewResponse["summary"] = {
    total: mergedRows.length,
    new: mergedRows.filter((r) => r.action === "new").length,
    update: mergedRows.filter((r) => r.action === "update").length,
    skip: mergedRows.filter((r) => r.action === "skip").length,
    error: mergedRows.filter((r) => r.action === "error").length,
    incomplete: mergedRows.filter((r) => r.missing_fields.length > 0).length,
  };

  return { merged: { type: "combined", summary, rows: mergedRows }, partsByType };
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function ActionChip({ a }: { a: PreviewRow["action"] }) {
  const map = {
    new: { color: "success" as const, label: "NEW" },
    update: { color: "primary" as const, label: "UPDATE" },
    skip: { color: "default" as const, label: "SKIP" },
    error: { color: "error" as const, label: "ERROR" },
  };
  const m = map[a];
  return (
    <Chip
      size="small"
      color={m.color}
      label={m.label}
      sx={{
        fontWeight: 700,
        minWidth: 64,
        ...(m.color === "default" ? {} : WHITE_CHIP_SX),
      }}
    />
  );
}

function SchemaChip({ type }: { type: CsvType }) {
  return (
    <Chip
      size="small"
      color={
        type === "unknown"
          ? "error"
          : type === "fa_norm"
            ? "warning"
            : type === "combined"
              ? "secondary"
              : "primary"
      }
      label={type === "combined" ? "combined (base+financials+sector)" : type}
      sx={WHITE_CHIP_SX}
    />
  );
}

function CompletenessBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "#059669" : value >= 50 ? "#d97706" : value >= 1 ? "#dc2626" : "#94a3b8";
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 80 }}>
      <LinearProgress
        variant="determinate"
        value={value}
        sx={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: "#e2e8f0",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 },
        }}
      />
      <Typography variant="caption" sx={{ fontWeight: 700, color, minWidth: 32, textAlign: "right" }}>
        {pct(value)}
      </Typography>
    </Stack>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "listed"
      ? { bg: "#dcfce7", fg: "#047857", border: "#bbf7d0" }
      : status.startsWith("upcoming")
        ? { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" }
        : { bg: "#e2e8f0", fg: "#475569", border: "#cbd5e1" };
  return (
    <Chip
      size="small"
      label={status}
      sx={{
        height: 22,
        fontSize: 11,
        fontWeight: 700,
        bgcolor: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
    />
  );
}

function FieldCoveragePanel({ coverage }: { coverage: Record<string, number> }) {
  const entries = Object.entries(coverage).sort((a, b) => a[1] - b[1]);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 1 }}>
      {entries.map(([field, pctVal]) => (
        <Stack key={field} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, minWidth: 140, fontFamily: "monospace", fontSize: 11 }}
          >
            {field}
          </Typography>
          <CompletenessBar value={pctVal} />
        </Stack>
      ))}
    </Box>
  );
}

function AutoCheckPanel({ item }: { item: ImportItem }) {
  const [showRows, setShowRows] = React.useState(false);
  const [showCoverage, setShowCoverage] = React.useState(false);
  const ac = item.autoCheck;
  if (!ac) return null;

  return (
    <Paper sx={{ ...adminPanelSx, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          p: 2,
          bgcolor: adminColors.panelAlt,
          borderBottom: "1px solid",
          borderColor: adminColors.borderSoft,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <WarningAmberRoundedIcon fontSize="small" sx={{ color: adminColors.amber }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          ตรวจสอบอัตโนมัติ / Auto-check: {item.fileName}
        </Typography>
        <SchemaChip type={item.schema.type} />
        <Chip
          size="small"
          label={`ครบ / Complete ${ac.completeRows}`}
          sx={{ bgcolor: "#dcfce7", color: "#047857", fontWeight: 700, height: 22, fontSize: 11 }}
        />
        <Chip
          size="small"
          label={`ไม่ครบ / Incomplete ${ac.incompleteRows}`}
          sx={{ bgcolor: "#fef3c7", color: "#92400e", fontWeight: 700, height: 22, fontSize: 11 }}
        />
        {ac.emptyRows > 0 && (
          <Chip
            size="small"
            label={`ว่าง / Empty ${ac.emptyRows}`}
            sx={{ bgcolor: "#ffe4e6", color: "#be123c", fontWeight: 700, height: 22, fontSize: 11 }}
          />
        )}
        <Chip
          size="small"
          label={`เฉลี่ย / Avg ${pct(ac.avgCompleteness)}`}
          sx={{ fontWeight: 700, height: 22, fontSize: 11 }}
        />
      </Stack>

      <Box sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          {/* Field coverage toggle */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", cursor: "pointer" }}
            onClick={() => setShowCoverage(!showCoverage)}
          >
            <IconButton size="small">
              <ExpandMoreRoundedIcon
                fontSize="small"
                sx={{
                  transform: showCoverage ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 200ms",
                }}
              />
            </IconButton>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              ความครอบคลุมของแต่ละฟิลด์ (% แถวที่มีข้อมูล) / Field coverage (% of rows with data)
            </Typography>
          </Stack>
          <Collapse in={showCoverage}>
            <Box sx={{ pl: 4.5 }}>
              <FieldCoveragePanel coverage={ac.fieldCoverage} />
            </Box>
          </Collapse>

          {/* Per-row check toggle */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", cursor: "pointer" }}
            onClick={() => setShowRows(!showRows)}
          >
            <IconButton size="small">
              <ExpandMoreRoundedIcon
                fontSize="small"
                sx={{
                  transform: showRows ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 200ms",
                }}
              />
            </IconButton>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              ตรวจสอบรายแถว / Per-row check ({ac.rows.filter((r) => r.missingFields.length > 0 || r.warnings.length > 0).length} มีปัญหา / issues)
            </Typography>
          </Stack>
          <Collapse in={showRows}>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader sx={adminTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>สัญลักษณ์ / Symbol</TableCell>
                    <TableCell>ความครบถ้วน / Completeness</TableCell>
                    {item.schema.type === "base" && <TableCell>สถานะอัตโนมัติ / Auto Status</TableCell>}
                    <TableCell>ข้อมูลที่ขาด / Missing</TableCell>
                    <TableCell>คำเตือน / Warnings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ac.rows
                    .filter((r) => r.missingFields.length > 0 || r.warnings.length > 0 || !r.hasData)
                    .slice(0, 200)
                    .map((row) => (
                      <TableRow key={row.index}>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {row.index + 2}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {row.symbol || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <CompletenessBar value={row.completeness} />
                        </TableCell>
                        {item.schema.type === "base" && (
                          <TableCell>
                            {row.autoStatus ? <StatusChip status={row.autoStatus} /> : "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          {row.missingFields.length === 0 ? (
                            <Typography variant="caption" color="success.main">ครบ</Typography>
                          ) : (
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, maxWidth: 300 }}>
                              {row.missingFields.map((f) => (
                                <Chip
                                  key={f}
                                  size="small"
                                  label={f}
                                  sx={{ height: 20, fontSize: 10, bgcolor: "#fef3c7", color: "#92400e" }}
                                />
                              ))}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.warnings.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          ) : (
                            <Stack spacing={0.25}>
                              {row.warnings.map((w, wi) => (
                                <Typography key={wi} variant="caption" color="warning.main">
                                  {w}
                                </Typography>
                              ))}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
            {ac.rows.filter((r) => r.missingFields.length === 0 && r.warnings.length === 0 && r.hasData).length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", p: 1.5 }}>
                ซ่อน {ac.rows.filter((r) => r.missingFields.length === 0 && r.warnings.length === 0 && r.hasData).length} แถวที่ข้อมูลครบ / Hidden {ac.rows.filter((r) => r.missingFields.length === 0 && r.warnings.length === 0 && r.hasData).length} complete rows
              </Typography>
            )}
          </Collapse>
        </Stack>
      </Box>
    </Paper>
  );
}

function RawDataPreview({ item }: { item: ImportItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const headers = item.schema.headers.slice(0, 20);
  const displayRows = item.rows.slice(0, expanded ? 100 : 10);

  return (
    <Paper sx={{ ...adminPanelSx, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          p: 2,
          bgcolor: adminColors.panelAlt,
          borderBottom: "1px solid",
          borderColor: adminColors.borderSoft,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          ข้อมูลดิบ / Raw data: {item.fileName}
        </Typography>
        <Chip size="small" label={`${item.rows.length} rows × ${item.schema.headers.length} cols`} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? "ย่อ / Collapse" : `แสดงเพิ่ม / Show more (${Math.min(100, item.rows.length)} rows)`}
        </Button>
      </Stack>
      <TableContainer sx={{ maxHeight: 420 }}>
        <Table size="small" stickyHeader sx={adminTableSx}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 40 }}>#</TableCell>
              {headers.map((h) => (
                <TableCell key={h} sx={{ minWidth: 100, maxWidth: 180 }}>
                  <Tooltip title={h} arrow>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {h}
                    </Typography>
                  </Tooltip>
                </TableCell>
              ))}
              {item.schema.headers.length > 20 && (
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    +{item.schema.headers.length - 20} cols
                  </Typography>
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayRows.map((row, i) => {
              const acRow = item.autoCheck?.rows[i];
              return (
                <TableRow key={i} hover>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{i + 2}</Typography>
                  </TableCell>
                  {headers.map((h) => {
                    const val = row[h] ?? "";
                    const isMissing = isEmpty(val) || val.trim() === "-";
                    const isReqMissing = isMissing && acRow?.missingFields.some(
                      (mf) => mf === h || h.toLowerCase().includes(mf.toLowerCase()),
                    );
                    return (
                      <TableCell
                        key={h}
                        sx={{
                          maxWidth: 180,
                          bgcolor: isReqMissing ? "#fef3c7" : isMissing ? "#f8fafc" : undefined,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            color: isMissing ? "#94a3b8" : "#1e293b",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}
                        >
                          {isMissing ? "—" : val}
                        </Typography>
                      </TableCell>
                    );
                  })}
                  {item.schema.headers.length > 20 && <TableCell />}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {item.rows.length > displayRows.length && (
        <Box sx={{ p: 1.5, textAlign: "center", borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">
            แสดง {displayRows.length} จาก {item.rows.length} แถว / Showing {displayRows.length} of {item.rows.length} rows
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// ──────────────────────────────────────────────
// Supported-files guide
// ──────────────────────────────────────────────

type GuideEntry = {
  type: CsvType;
  title: string;
  desc: string;
  required: string[];
  columns: string[];
  notes: string[];
};

const FORMAT_GUIDE: GuideEntry[] = [
  {
    type: "base",
    title: "ข้อมูลหลัก IPO / Base",
    desc: "ข้อมูลหุ้น + ราคา IPO + ราคาวันแรก (D1) ถึง 6 เดือน + ที่ปรึกษาการเงิน (FA) และผู้จัดจำหน่าย",
    required: ["symbol"],
    columns: ALL_FIELDS.base,
    notes: [
      "วันที่ใช้รูปแบบ YYYY-MM-DD เช่น 2025-10-03",
      "คอลัมน์ fa_persons / fa_companies / lead_underwriters_norm / co_underwriters_norm เป็นลิสต์ เช่น ['บริษัทหลักทรัพย์ ก จำกัด', 'บริษัทหลักทรัพย์ ข จำกัด'] หรือเว้นว่างได้",
      "ถ้า first_trade_date ว่าง = ยังไม่กำหนดวันเทรด (ระบบจะไม่เปลี่ยนสถานะของหุ้นเดิม)",
    ],
  },
  {
    type: "financials",
    title: "งบการเงิน / Financials",
    desc: "งบการเงินและโครงสร้างการเสนอขายหุ้น (ตัวเลขล้วน)",
    required: ["symbol"],
    columns: ALL_FIELDS.financials,
    notes: [
      "ต้องมีข้อมูล base ของ symbol นั้นในระบบก่อน (หรือใส่ base มาในชุดเดียวกัน)",
      "ช่องที่ไม่มีข้อมูลเว้นว่างได้",
    ],
  },
  {
    type: "sector",
    title: "ตลาด & หมวดธุรกิจ / Sector",
    desc: "ตลาด (SET/mai), กลุ่มอุตสาหกรรม และหมวดธุรกิจ",
    required: ["symbol"],
    columns: ALL_FIELDS.sector,
    notes: ["ใช้ '-' หรือเว้นว่างได้ถ้ายังไม่มีข้อมูล"],
  },
  {
    type: "fa_norm",
    title: "แมปชื่อ FA / FA normalization",
    desc: "จับคู่ชื่อ FA แบบดิบจากเอกสาร → ชื่อมาตรฐานที่ใช้ในระบบ",
    required: ["fa_companies", "fa_company_norm"],
    columns: ALL_FIELDS.fa_norm,
    notes: ["ไฟล์นี้ไม่ต้องมีคอลัมน์ symbol"],
  },
  {
    type: "combined",
    title: "ไฟล์รวม / Combined",
    desc: "รวม base + financials + sector ไว้ในไฟล์เดียว (มีคอลัมน์ของ ≥ 2 ประเภท)",
    required: ["symbol"],
    columns: [],
    notes: [
      "ระบบจะตรวจจับเองและแสดงเป็นรายการเดียว แล้วแยกบันทึกตามลำดับ base → financials → sector ให้อัตโนมัติ",
    ],
  },
];

function ColumnChips({ columns, required }: { columns: string[]; required: string[] }) {
  const reqSet = new Set(required);
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {columns.map((col) => {
        const isReq = reqSet.has(col);
        return (
          <Chip
            key={col}
            size="small"
            label={isReq ? `${col} *` : col}
            sx={{
              height: 20,
              fontSize: 10.5,
              fontFamily: "monospace",
              bgcolor: isReq ? "#dbeafe" : "#f1f5f9",
              color: isReq ? "#1e40af" : "#475569",
              fontWeight: isReq ? 800 : 600,
            }}
          />
        );
      })}
    </Stack>
  );
}

function FormatGuide() {
  const [open, setOpen] = React.useState(false);
  return (
    <Paper sx={{ ...adminPanelSx, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", p: 2, cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuBookRoundedIcon fontSize="small" sx={{ color: adminColors.accent }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1 }}>
          รองรับไฟล์อะไรบ้าง & รูปแบบเป็นอย่างไร / Supported files &amp; formats
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {open ? "ซ่อน / Hide" : "ดูคำอธิบาย / Show"}
        </Typography>
        <ExpandMoreRoundedIcon
          fontSize="small"
          sx={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }}
        />
      </Stack>
      <Collapse in={open}>
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            ระบบตรวจจับชนิดไฟล์อัตโนมัติจากหัวคอลัมน์ (ไม่ต้องตั้งชื่อไฟล์เฉพาะ) — คอลัมน์ที่มี <b>*</b> = จำเป็น / File type is auto-detected from column headers; <b>*</b> = required.
          </Typography>
          <Stack spacing={1.5}>
            {FORMAT_GUIDE.map((g) => (
              <Box
                key={g.type}
                sx={{
                  border: "1px solid",
                  borderColor: adminColors.borderSoft,
                  borderRadius: `${ADMIN_RADIUS}px`,
                  p: 1.5,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap" }}>
                  <SchemaChip type={g.type} />
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                    {g.title}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: g.columns.length ? 1 : 0.5 }}>
                  {g.desc}
                </Typography>
                {g.columns.length > 0 && <ColumnChips columns={g.columns} required={g.required} />}
                {g.notes.length > 0 && (
                  <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                    {g.notes.map((n, i) => (
                      <Typography key={i} component="li" variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {n}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

function emptySummary(): PreviewResponse["summary"] {
  return { total: 0, new: 0, update: 0, skip: 0, error: 0, incomplete: 0 };
}

function addSummary(
  acc: PreviewResponse["summary"],
  next: PreviewResponse["summary"],
): PreviewResponse["summary"] {
  return {
    total: acc.total + next.total,
    new: acc.new + next.new,
    update: acc.update + next.update,
    skip: acc.skip + next.skip,
    error: acc.error + next.error,
    incomplete: acc.incomplete + next.incomplete,
  };
}

export default function ImportClient() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [items, setItems] = React.useState<ImportItem[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [commitBusy, setCommitBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [committed, setCommitted] = React.useState<CommitSummary | null>(null);
  const [activeTab, setActiveTab] = React.useState(0);

  const selectedCount = selected.size;
  const hasPreview = items.some((item) => item.preview);
  const hasAutoCheck = items.some((item) => item.autoCheck);
  const aggregateSummary = items.reduce((acc, item) => {
    return item.preview ? addSummary(acc, item.preview.summary) : acc;
  }, emptySummary());

  function reset() {
    setItems([]);
    setSelected(new Set());
    setError(null);
    setCommitted(null);
    setActiveTab(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => {
      return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    });

    reset();
    if (files.length === 0) {
      setError("ไม่พบไฟล์ CSV ที่รองรับ / No supported CSV files found");
      return;
    }

    const parsedItems: ImportItem[] = [];
    const parseErrors: string[] = [];

    for (const [index, file] of files.entries()) {
      try {
        if (file.size > IMPORT_CSV_MAX_FILE_BYTES) {
          parseErrors.push(
            `${file.name}: file too large (${fileSizeLabel(file.size)}). Limit is ${fileSizeLabel(IMPORT_CSV_MAX_FILE_BYTES)}.`,
          );
          continue;
        }

        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          parseErrors.push(`${file.name}: CSV ว่างหรือ parse ไม่ได้ / empty or unparseable CSV`);
          continue;
        }
        if (rows.length > IMPORT_CSV_MAX_ROWS) {
          parseErrors.push(
            `${file.name}: too many rows (${rows.length}). Limit is ${IMPORT_CSV_MAX_ROWS}.`,
          );
          continue;
        }

        const headers = Object.keys(rows[0]);
        const detectedTypes = detectCsvTypes(headers);

        if (detectedTypes.length >= 2) {
          // Combined CSV (base + financials + sector in one file): keep it as a
          // single item. Each section is normalized from its own columns at
          // preview time and the item is split back into per-type payloads only
          // at commit (base → financials → sector so parent IPO rows exist first).
          const combinedTypes = COMBINED_ORDER.filter((t) => detectedTypes.includes(t));
          parsedItems.push({
            id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
            fileName: file.name,
            fileSize: file.size,
            rows,
            schema: schemaForCombined(headers, combinedTypes),
            preview: null,
            error: null,
            autoCheck: runCombinedAutoCheck(rows, combinedTypes),
            combinedTypes,
          });
        } else {
          const schema = detectSchema(headers);
          const autoCheck = isSupportedType(schema.type) ? runAutoCheck(rows, schema.type) : null;

          parsedItems.push({
            id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
            fileName: file.name,
            fileSize: file.size,
            rows,
            schema,
            preview: null,
            error: null,
            autoCheck,
          });
        }
      } catch (err) {
        parseErrors.push(`${file.name}: ${(err as Error).message ?? String(err)}`);
      }
    }

    setItems(parsedItems);
    if (parseErrors.length > 0) setError(parseErrors.join("\n"));
  }

  async function runPreview() {
    if (items.length === 0) {
      setError("ยังไม่ได้เลือกไฟล์ CSV / No CSV files selected");
      return;
    }

    setPreviewBusy(true);
    setError(null);
    setCommitted(null);

    const nextItems: ImportItem[] = items.map((item) => ({
      ...item,
      preview: null,
      error: null,
    }));
    const queue = [...nextItems].sort((a, b) => {
      const order = TYPE_ORDER[a.schema.type] - TYPE_ORDER[b.schema.type];
      return order === 0 ? a.fileName.localeCompare(b.fileName) : order;
    });
    const initialSelected = new Set<string>();
    const pendingParentSymbols = new Set<string>();

    const previewType = async (type: SupportedCsvType, rows: Record<string, string>[]) => {
      if (rows.length > IMPORT_CSV_MAX_ROWS) {
        throw new Error(`Too many rows (${rows.length}). Limit is ${IMPORT_CSV_MAX_ROWS}.`);
      }
      const payload = JSON.stringify({
        type,
        rows,
        pending_parent_symbols: Array.from(pendingParentSymbols),
      });
      const payloadBytes = new TextEncoder().encode(payload).byteLength;
      if (payloadBytes > IMPORT_PREVIEW_MAX_BODY_BYTES) {
        throw new Error(
          `Preview payload too large (${fileSizeLabel(payloadBytes)}). Limit is ${fileSizeLabel(IMPORT_PREVIEW_MAX_BODY_BYTES)}.`,
        );
      }

      const res = await fetch("/api/ipo/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      return data as PreviewResponse;
    };

    try {
      for (const item of queue) {
        if (item.combinedTypes && item.combinedTypes.length > 0) {
          // Preview each section in order (base first so its symbols become
          // pending parents for financials/sector), then merge into one table.
          const parts: { type: SupportedCsvType; data: PreviewResponse }[] = [];
          for (const t of COMBINED_ORDER.filter((t) => item.combinedTypes!.includes(t))) {
            const data = await previewType(t, item.rows);
            parts.push({ type: t, data });
            if (t === "base") {
              data.rows.forEach((row) => {
                if (row.action !== "error" && row.symbol) {
                  pendingParentSymbols.add(row.symbol.toUpperCase());
                }
              });
            }
          }
          const { merged, partsByType } = mergeCombinedPreview(parts);
          item.preview = merged;
          item.combinedParts = partsByType;
          merged.rows.forEach((row) => {
            if (isSelectable(row)) initialSelected.add(rowKey(item.id, row.row_index));
          });
          continue;
        }

        const type = item.schema.type;
        if (!isSupportedType(type)) {
          item.error = "ตรวจไม่พบ schema ของไฟล์นี้ / Schema not detected for this file";
          continue;
        }

        let data: PreviewResponse;
        try {
          data = await previewType(type, item.rows);
        } catch (err) {
          throw new Error(`${item.fileName}: ${(err as Error).message}`);
        }

        item.preview = data;
        data.rows.forEach((row: PreviewRow) => {
          if (isSelectable(row)) initialSelected.add(rowKey(item.id, row.row_index));
          if (type === "base" && row.action !== "error" && row.symbol) {
            pendingParentSymbols.add(row.symbol.toUpperCase());
          }
        });
      }

      setItems(nextItems);
      setSelected(initialSelected);
      setActiveTab(1);
    } catch (err) {
      setItems(nextItems);
      setSelected(initialSelected);
      setError((err as Error).message ?? String(err));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function runCommit() {
    const queue = [...items]
      .filter((item) => item.preview)
      .sort((a, b) => {
        const order = TYPE_ORDER[a.schema.type] - TYPE_ORDER[b.schema.type];
        return order === 0 ? a.fileName.localeCompare(b.fileName) : order;
      });

    type CommitPayloadItem = {
      fileName: string;
      type: SupportedCsvType;
      rows: { symbol: string; action: PreviewRow["action"]; normalized: Record<string, unknown> | null }[];
    };

    const payload: CommitPayloadItem[] = [];
    for (const item of queue) {
      if (item.combinedTypes && item.combinedParts) {
        // Split the single combined item back into per-section commit payloads.
        for (const t of item.combinedTypes) {
          const subRows = (item.combinedParts[t] ?? []).filter(
            (row) => selected.has(rowKey(item.id, row.row_index)) && isSelectable(row),
          );
          if (subRows.length > 0) {
            payload.push({
              fileName: `${item.fileName} [${t}]`,
              type: t,
              rows: subRows.map((row) => ({
                symbol: row.symbol,
                action: row.action,
                normalized: row.normalized,
              })),
            });
          }
        }
        continue;
      }
      if (item.preview && isSupportedType(item.preview.type)) {
        const rows = item.preview.rows.filter(
          (row) => selected.has(rowKey(item.id, row.row_index)) && isSelectable(row),
        );
        if (rows.length > 0) {
          payload.push({
            fileName: item.fileName,
            type: item.preview.type,
            rows: rows.map((row) => ({
              symbol: row.symbol,
              action: row.action,
              normalized: row.normalized,
            })),
          });
        }
      }
    }

    if (payload.length === 0) {
      setError("ยังไม่ได้เลือกแถวที่จะบันทึก / No rows selected to commit");
      return;
    }

    const oversizedItem = payload.find((item) => item.rows.length > IMPORT_CSV_MAX_ROWS);
    if (oversizedItem) {
      setError(`${oversizedItem.fileName}: too many rows (${oversizedItem.rows.length}). Limit is ${IMPORT_CSV_MAX_ROWS}.`);
      return;
    }

    const commitPayload = JSON.stringify({ items: payload });
    const commitPayloadBytes = new TextEncoder().encode(commitPayload).byteLength;
    if (commitPayloadBytes > IMPORT_PREVIEW_MAX_BODY_BYTES) {
      setError(
        `Commit payload too large (${fileSizeLabel(commitPayloadBytes)}). Limit is ${fileSizeLabel(IMPORT_PREVIEW_MAX_BODY_BYTES)}.`,
      );
      return;
    }

    setCommitBusy(true);
    setError(null);
    setCommitted(null);

    try {
      const res = await fetch("/api/ipo/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: commitPayload,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Commit failed");

      const runs: CommitRun[] = (data.runs ?? payload.map((item) => ({
        fileName: item.fileName,
        type: item.type,
        inserted: 0,
        updated: 0,
        skipped: 0,
        sync_id: data.sync_id,
      }))) as CommitRun[];
      const inserted = Number(data.inserted ?? runs.reduce((sum, run) => sum + run.inserted, 0));
      const updated = Number(data.updated ?? runs.reduce((sum, run) => sum + run.updated, 0));
      const skipped = Number(data.skipped ?? runs.reduce((sum, run) => sum + run.skipped, 0));

      setCommitted({ inserted, updated, skipped, runs });
      router.refresh();
      await Swal.fire({
        title: "บันทึกเสร็จสิ้น / Commit completed",
        html: `เพิ่มใหม่ / Inserted: <b>${inserted}</b> &middot; อัปเดต / Updated: <b>${updated}</b> &middot; ข้าม / Skipped: <b>${skipped}</b>`,
        icon: "success",
        timer: 2500,
        showConfirmButton: false,
      });
      reset();
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setCommitBusy(false);
    }
  }

  function toggleRow(itemId: string, rowIndex: number) {
    const key = rowKey(itemId, rowIndex);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleItem(item: ImportItem, checked: boolean) {
    if (!item.preview) return;
    setSelected((current) => {
      const next = new Set(current);
      item.preview?.rows.forEach((row) => {
        const key = rowKey(item.id, row.row_index);
        if (!isSelectable(row)) return;
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  }

  function selectableCount(item: ImportItem) {
    return item.preview?.rows.filter(isSelectable).length ?? 0;
  }

  function selectedForItem(item: ImportItem) {
    return item.preview?.rows.filter((row) => selected.has(rowKey(item.id, row.row_index))).length ?? 0;
  }

  return (
    <Stack spacing={2}>
      {/* Supported files & format guide */}
      <FormatGuide />

      {/* Drop zone */}
      <Paper
        sx={{
          ...adminPanelSx,
          p: 3,
          border: "2px dashed",
          borderColor: items.length > 0 ? adminColors.accent : adminColors.border,
          bgcolor: items.length > 0 ? "#f0f9ff" : "#ffffff",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 120ms ease, background-color 120ms ease",
          "&:hover": {
            borderColor: adminColors.accent,
            bgcolor: "#f8fbff",
          },
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
          }}
        />
        <UploadFileRoundedIcon fontSize="large" color={items.length > 0 ? "primary" : "action"} />
        <Typography variant="body1" sx={{ mt: 1, fontWeight: 800 }}>
          {items.length > 0
            ? `เลือกแล้ว ${items.length} ไฟล์ / ${items.length} file(s) selected`
            : "ลาก/วางไฟล์ CSV ที่นี่ หรือคลิกเลือก / Drag & drop CSV files here, or click to choose"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ระบบจะพรีวิวและบันทึกตามลำดับ base → financials → sector / Files are previewed and committed in order: base → financials → sector
          <Box component="span" sx={{ display: "block", mt: 0.5 }}>
            รองรับไฟล์รวม (base + financials + sector ในไฟล์เดียว) — ระบบจะแยกส่วนให้อัตโนมัติ / Combined files (base + financials + sector in one CSV) are auto-split into sections
          </Box>
        </Typography>
      </Paper>

      {error ? (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ borderRadius: `${ADMIN_RADIUS}px`, whiteSpace: "pre-line" }}
        >
          {error}
        </Alert>
      ) : null}

      {committed ? (
        <Alert severity="success" sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
          บันทึกสำเร็จ / Committed {committed.runs.length} ไฟล์ (files) — เพิ่มใหม่ / inserted: {committed.inserted}, อัปเดต / updated: {committed.updated},
          ข้าม / skipped: {committed.skipped}. Validation ถูกรันใหม่แล้ว / Validation has been re-run
          <Box component="span" sx={{ display: "block", mt: 0.5 }}>
            {committed.runs.map((run) => `${run.fileName}: sync_jobs #${run.sync_id}`).join(", ")}
          </Box>
        </Alert>
      ) : null}

      {/* File info + actions */}
      {items.length > 0 ? (
        <Paper sx={{ ...adminPanelSx, p: 2 }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              ไฟล์ที่เลือก / Selected files
            </Typography>
            <Chip size="small" label={`${items.length} files`} />
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              disabled={previewBusy || items.length === 0}
              onClick={runPreview}
              startIcon={previewBusy ? <CircularProgress size={16} /> : null}
            >
              {previewBusy ? "กำลังพรีวิว... / Previewing..." : "พรีวิว / Preview batch"}
            </Button>
            <Button onClick={reset} disabled={previewBusy || commitBusy}>
              ล้าง / Reset
            </Button>
          </Stack>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {items.map((item) => (
              <Stack
                key={item.id}
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "center",
                  borderTop: "1px solid",
                  borderColor: "divider",
                  pt: 1,
                  flexWrap: "wrap",
                  gap: 0.75,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 180 }}>
                  {item.fileName}
                </Typography>
                <SchemaChip type={item.schema.type} />
                <Chip size="small" label={`${item.rows.length} rows`} />
                <Chip size="small" label={fileSizeLabel(item.fileSize)} />
                {item.schema.type !== "unknown" ? (
                  <Chip size="small" label={`matched ${item.schema.matched.length} cols`} />
                ) : null}
                {item.autoCheck ? (
                  <Chip
                    size="small"
                    label={`ครบ / Complete ${item.autoCheck.completeRows}/${item.autoCheck.totalRows}`}
                    sx={{
                      fontWeight: 700,
                      bgcolor: item.autoCheck.completeRows === item.autoCheck.totalRows ? "#dcfce7" : "#fef3c7",
                      color: item.autoCheck.completeRows === item.autoCheck.totalRows ? "#047857" : "#92400e",
                    }}
                  />
                ) : null}
                {item.schema.missing.length > 0 ? (
                  <Typography variant="caption" color="warning.main">
                    คอลัมน์ที่ขาด / missing cols: {item.schema.missing.slice(0, 4).join(", ")}
                    {item.schema.missing.length > 4 ? ` +${item.schema.missing.length - 4}` : ""}
                  </Typography>
                ) : null}
                {item.error ? (
                  <Typography variant="caption" color="error">
                    {item.error}
                  </Typography>
                ) : null}
              </Stack>
            ))}
          </Stack>
        </Paper>
      ) : null}

      {/* Tabs: Auto-check / DB Preview */}
      {items.length > 0 && (hasAutoCheck || hasPreview) ? (
        <Box>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{
              mb: 2,
              "& .MuiTab-root": { fontWeight: 700, textTransform: "none", fontSize: 13 },
            }}
          >
            <Tab
              label={
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <span>ตรวจสอบอัตโนมัติ &amp; ข้อมูลดิบ / Auto-check &amp; Raw data</span>
                  {hasAutoCheck && (
                    <Chip
                      size="small"
                      label={items.reduce((n, it) => n + (it.autoCheck?.incompleteRows ?? 0), 0) || "✓"}
                      sx={{
                        height: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: items.every((it) => (it.autoCheck?.incompleteRows ?? 0) === 0)
                          ? "#dcfce7"
                          : "#fef3c7",
                        color: items.every((it) => (it.autoCheck?.incompleteRows ?? 0) === 0)
                          ? "#047857"
                          : "#92400e",
                      }}
                    />
                  )}
                </Stack>
              }
            />
            <Tab
              label={
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <span>พรีวิว DB &amp; บันทึก / DB Preview &amp; Commit</span>
                  {hasPreview && (
                    <Chip
                      size="small"
                      label={`${aggregateSummary.new + aggregateSummary.update} changes`}
                      sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                    />
                  )}
                </Stack>
              }
              disabled={!hasPreview}
            />
          </Tabs>

          {/* Tab 0: Auto-check + raw data */}
          {activeTab === 0 && (
            <Stack spacing={2}>
              {items.map((item) =>
                item.autoCheck ? <AutoCheckPanel key={`ac-${item.id}`} item={item} /> : null,
              )}
              {items.map((item) => (
                <RawDataPreview key={`raw-${item.id}`} item={item} />
              ))}
            </Stack>
          )}

          {/* Tab 1: DB preview + commit */}
          {activeTab === 1 && hasPreview && (
            <Stack spacing={2}>
              {/* Batch summary */}
              <Paper sx={{ ...adminPanelSx, p: 2 }}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    สรุปทั้งหมด / Batch summary
                  </Typography>
                  <Chip size="small" label={`${aggregateSummary.total} rows`} />
                  <Chip size="small" color="success" label={`${aggregateSummary.new} NEW`} sx={WHITE_CHIP_SX} />
                  <Chip size="small" color="primary" label={`${aggregateSummary.update} UPDATE`} sx={WHITE_CHIP_SX} />
                  <Chip size="small" label={`${aggregateSummary.skip} SKIP`} />
                  <Chip size="small" color="error" label={`${aggregateSummary.error} ERROR`} sx={WHITE_CHIP_SX} />
                  <Chip size="small" color="warning" label={`${aggregateSummary.incomplete} incomplete`} sx={WHITE_CHIP_SX} />
                  <Box sx={{ flex: 1 }} />
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={commitBusy || selectedCount === 0}
                    onClick={runCommit}
                    startIcon={commitBusy ? <CircularProgress size={16} /> : <CheckCircleIcon />}
                    sx={{
                      "&.Mui-disabled": {
                        bgcolor: "#e2e8f0",
                        color: "#475569",
                      },
                    }}
                  >
                    {commitBusy ? "กำลังบันทึก... / Committing..." : `บันทึก / Commit ${selectedCount} row(s)`}
                  </Button>
                </Stack>
                {commitBusy ? <LinearProgress sx={{ mt: 1.5 }} /> : null}
              </Paper>

              {/* Per-file preview tables */}
              {items.map((item) => {
                if (!item.preview) return null;
                const selectedRows = selectedForItem(item);
                const itemSelectable = selectableCount(item);

                return (
                  <Paper key={`${item.id}-preview`} sx={{ ...adminPanelSx, overflow: "hidden" }}>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems: "center",
                        p: 2,
                        borderBottom: "1px solid",
                        borderColor: adminColors.borderSoft,
                        flexWrap: "wrap",
                        gap: 1,
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        พรีวิว / Preview: {item.fileName}
                      </Typography>
                      <SchemaChip type={item.preview.type} />
                      <Chip size="small" label={`${item.preview.summary.total} rows`} />
                      <Chip size="small" color="success" label={`${item.preview.summary.new} NEW`} sx={WHITE_CHIP_SX} />
                      <Chip size="small" color="primary" label={`${item.preview.summary.update} UPDATE`} sx={WHITE_CHIP_SX} />
                      <Chip size="small" label={`${item.preview.summary.skip} SKIP`} />
                      <Chip size="small" color="error" label={`${item.preview.summary.error} ERROR`} sx={WHITE_CHIP_SX} />
                      <Chip size="small" color="warning" label={`${item.preview.summary.incomplete} incomplete`} sx={WHITE_CHIP_SX} />
                      <Box sx={{ flex: 1 }} />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={itemSelectable > 0 && selectedRows === itemSelectable}
                            indeterminate={selectedRows > 0 && selectedRows < itemSelectable}
                            onChange={(e) => toggleItem(item, e.target.checked)}
                          />
                        }
                        label={<Typography variant="caption">เลือกทั้งหมดในไฟล์นี้ / Select all in this file</Typography>}
                      />
                    </Stack>
                    <TableContainer sx={{ maxHeight: 520 }}>
                      <Table size="small" stickyHeader sx={adminTableSx}>
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox" />
                            <TableCell>#</TableCell>
                            <TableCell>สัญลักษณ์ / Symbol</TableCell>
                            <TableCell>การทำงาน / Action</TableCell>
                            <TableCell>ความครบถ้วน / Completeness</TableCell>
                            <TableCell>การเปลี่ยนแปลง / Changes</TableCell>
                            <TableCell>ข้อมูลที่ขาด / Missing</TableCell>
                            <TableCell>ข้อผิดพลาด / Errors</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {item.preview.rows.slice(0, 500).map((row) => {
                            const disabled = !isSelectable(row);
                            const key = rowKey(item.id, row.row_index);
                            const acRow = item.autoCheck?.rows[row.row_index];
                            return (
                              <TableRow key={key} hover selected={selected.has(key)}>
                                <TableCell padding="checkbox">
                                  <Checkbox
                                    size="small"
                                    disabled={disabled}
                                    checked={selected.has(key)}
                                    onChange={() => toggleRow(item.id, row.row_index)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption" color="text.secondary">
                                    {row.row_index + 2}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {row.symbol || "—"}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <ActionChip a={row.action} />
                                </TableCell>
                                <TableCell>
                                  <CompletenessBar value={acRow?.completeness ?? 0} />
                                </TableCell>
                                <TableCell>
                                  {row.changed_fields.length === 0 ? (
                                    <Typography variant="caption" color="text.secondary">
                                      —
                                    </Typography>
                                  ) : (
                                    <Tooltip
                                      arrow
                                      title={
                                        <Box sx={{ fontFamily: "monospace", fontSize: 11 }}>
                                          {row.changed_fields.map((field) => (
                                            <Box key={field}>
                                              {field}: {JSON.stringify((row.current ?? {})[field] ?? null)} →{" "}
                                              {JSON.stringify((row.normalized ?? {})[field] ?? null)}
                                            </Box>
                                          ))}
                                        </Box>
                                      }
                                    >
                                      <Stack
                                        direction="row"
                                        spacing={0.5}
                                        sx={{ flexWrap: "wrap", gap: 0.5, maxWidth: 320 }}
                                      >
                                        {row.changed_fields.slice(0, 4).map((field) => (
                                          <Chip
                                            key={field}
                                            size="small"
                                            label={field}
                                            sx={{ height: 20, fontSize: 10, bgcolor: "#dbeafe", color: "#1e40af" }}
                                          />
                                        ))}
                                        {row.changed_fields.length > 4 ? (
                                          <Chip
                                            size="small"
                                            label={`+${row.changed_fields.length - 4}`}
                                            sx={{ height: 20, fontSize: 10 }}
                                          />
                                        ) : null}
                                      </Stack>
                                    </Tooltip>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.missing_fields.length === 0 ? (
                                    <Typography variant="caption" color="success.main">
                                      ครบ / Complete
                                    </Typography>
                                  ) : (
                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, maxWidth: 280 }}>
                                      {row.missing_fields.map((field) => (
                                        <Chip
                                          key={field}
                                          size="small"
                                          label={field}
                                          sx={{ height: 20, fontSize: 10, bgcolor: "#fef3c7", color: "#92400e" }}
                                        />
                                      ))}
                                    </Stack>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.errors.length === 0 ? (
                                    <Typography variant="caption" color="text.secondary">
                                      —
                                    </Typography>
                                  ) : (
                                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                      <ErrorOutlineIcon color="error" fontSize="small" />
                                      <Typography variant="caption" color="error">
                                        {row.errors[0]}
                                      </Typography>
                                    </Stack>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {item.preview.rows.length > 500 ? (
                      <Box sx={{ p: 1.5, textAlign: "center", borderTop: "1px solid", borderColor: "divider" }}>
                        <Typography variant="caption" color="text.secondary">
                          แสดง 500 แถวแรกจากทั้งหมด {item.preview.rows.length} (แถวที่เหลือยังถูกบันทึกตามที่เลือกไว้) / Showing first 500 of {item.preview.rows.length} rows (remaining rows still commit if selected)
                        </Typography>
                      </Box>
                    ) : null}
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Box>
      ) : null}
    </Stack>
  );
}
