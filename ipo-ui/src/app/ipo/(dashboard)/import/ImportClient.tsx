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
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  COMPLETENESS_FIELDS,
  detectSchema,
  num,
  parseCSV,
  type CsvType,
  type DetectedSchema,
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
  unknown: 4,
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

function isSupportedType(type: CsvType): type is Exclude<CsvType, "unknown"> {
  return type === "base" || type === "financials" || type === "sector" || type === "fa_norm";
}

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
        warnings: [type === "fa_norm" ? "fa_companies ว่าง" : "symbol ว่าง"],
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
        autoStatus = "upcoming (ข้อมูลน้อย)";
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
      color={type === "unknown" ? "error" : type === "fa_norm" ? "warning" : "primary"}
      label={type}
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
          Auto-check: {item.fileName}
        </Typography>
        <SchemaChip type={item.schema.type} />
        <Chip
          size="small"
          label={`ครบ ${ac.completeRows}`}
          sx={{ bgcolor: "#dcfce7", color: "#047857", fontWeight: 700, height: 22, fontSize: 11 }}
        />
        <Chip
          size="small"
          label={`ไม่ครบ ${ac.incompleteRows}`}
          sx={{ bgcolor: "#fef3c7", color: "#92400e", fontWeight: 700, height: 22, fontSize: 11 }}
        />
        {ac.emptyRows > 0 && (
          <Chip
            size="small"
            label={`ว่าง ${ac.emptyRows}`}
            sx={{ bgcolor: "#ffe4e6", color: "#be123c", fontWeight: 700, height: 22, fontSize: 11 }}
          />
        )}
        <Chip
          size="small"
          label={`เฉลี่ย ${pct(ac.avgCompleteness)}`}
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
              Field coverage (% ของ row ที่มีข้อมูล)
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
              ตรวจสอบรายแถว ({ac.rows.filter((r) => r.missingFields.length > 0 || r.warnings.length > 0).length} มีปัญหา)
            </Typography>
          </Stack>
          <Collapse in={showRows}>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader sx={adminTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Completeness</TableCell>
                    {item.schema.type === "base" && <TableCell>Auto Status</TableCell>}
                    <TableCell>Missing</TableCell>
                    <TableCell>Warnings</TableCell>
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
                ซ่อน {ac.rows.filter((r) => r.missingFields.length === 0 && r.warnings.length === 0 && r.hasData).length} แถวที่ข้อมูลครบ
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
          ข้อมูลดิบ: {item.fileName}
        </Typography>
        <Chip size="small" label={`${item.rows.length} rows × ${item.schema.headers.length} cols`} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? "ย่อ" : `แสดงเพิ่ม (${Math.min(100, item.rows.length)} rows)`}
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
            แสดง {displayRows.length} จาก {item.rows.length} แถว
          </Typography>
        </Box>
      )}
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
      setError("ไม่พบไฟล์ CSV ที่รองรับ");
      return;
    }

    const parsedItems: ImportItem[] = [];
    const parseErrors: string[] = [];

    for (const [index, file] of files.entries()) {
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          parseErrors.push(`${file.name}: CSV ว่างหรือ parse ไม่ได้`);
          continue;
        }

        const headers = Object.keys(rows[0]);
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
      } catch (err) {
        parseErrors.push(`${file.name}: ${(err as Error).message ?? String(err)}`);
      }
    }

    setItems(parsedItems);
    if (parseErrors.length > 0) setError(parseErrors.join("\n"));
  }

  async function runPreview() {
    if (items.length === 0) {
      setError("ยังไม่ได้เลือกไฟล์ CSV");
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

    try {
      for (const item of queue) {
        const type = item.schema.type;
        if (!isSupportedType(type)) {
          item.error = "ตรวจไม่พบ schema ของไฟล์นี้";
          continue;
        }

        const res = await fetch("/api/ipo/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            rows: item.rows,
            pending_parent_symbols: Array.from(pendingParentSymbols),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`${item.fileName}: ${data.error ?? "Preview failed"}`);

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

    const work = queue
      .map((item) => ({
        item,
        rows: item.preview?.rows.filter((row) => selected.has(rowKey(item.id, row.row_index))) ?? [],
      }))
      .filter(({ rows }) => rows.length > 0);

    if (work.length === 0) {
      setError("ยังไม่ได้เลือกแถวที่จะบันทึก");
      return;
    }

    setCommitBusy(true);
    setError(null);
    setCommitted(null);

    try {
      const payload = work
        .filter(({ item }) => item.preview && isSupportedType(item.preview.type))
        .map(({ item, rows }) => ({
          fileName: item.fileName,
          type: item.preview!.type,
          rows: rows.map((row) => ({
            symbol: row.symbol,
            action: row.action,
            normalized: row.normalized,
          })),
        }));

      const res = await fetch("/api/ipo/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
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
        title: "บันทึกเสร็จสิ้น",
        html: `Inserted: <b>${inserted}</b> &middot; Updated: <b>${updated}</b> &middot; Skipped: <b>${skipped}</b>`,
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
            ? `เลือกแล้ว ${items.length} ไฟล์`
            : "ลาก/วางไฟล์ CSV หลายไฟล์ที่นี่ หรือคลิกเลือก"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ระบบจะพรีวิวและบันทึกตามลำดับ base.csv → financials.csv → df_sector.csv
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
          บันทึกเสร็จ {committed.runs.length} ไฟล์ — inserted: {committed.inserted}, updated: {committed.updated},
          skipped: {committed.skipped}. Validation ถูก re-run แล้ว
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
              ไฟล์ที่เลือก
            </Typography>
            <Chip size="small" label={`${items.length} files`} />
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              disabled={previewBusy || items.length === 0}
              onClick={runPreview}
              startIcon={previewBusy ? <CircularProgress size={16} /> : null}
            >
              {previewBusy ? "กำลังพรีวิว..." : "Preview batch"}
            </Button>
            <Button onClick={reset} disabled={previewBusy || commitBusy}>
              Reset
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
                    label={`ครบ ${item.autoCheck.completeRows}/${item.autoCheck.totalRows}`}
                    sx={{
                      fontWeight: 700,
                      bgcolor: item.autoCheck.completeRows === item.autoCheck.totalRows ? "#dcfce7" : "#fef3c7",
                      color: item.autoCheck.completeRows === item.autoCheck.totalRows ? "#047857" : "#92400e",
                    }}
                  />
                ) : null}
                {item.schema.missing.length > 0 ? (
                  <Typography variant="caption" color="warning.main">
                    missing cols: {item.schema.missing.slice(0, 4).join(", ")}
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
                  <span>Auto-check & ข้อมูลดิบ</span>
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
                  <span>DB Preview & Commit</span>
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
                    Batch summary
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
                    {commitBusy ? "กำลังบันทึก..." : `Commit ${selectedCount} row(s)`}
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
                        Preview: {item.fileName}
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
                        label={<Typography variant="caption">เลือกทั้งหมดในไฟล์นี้</Typography>}
                      />
                    </Stack>
                    <TableContainer sx={{ maxHeight: 520 }}>
                      <Table size="small" stickyHeader sx={adminTableSx}>
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox" />
                            <TableCell>#</TableCell>
                            <TableCell>Symbol</TableCell>
                            <TableCell>Action</TableCell>
                            <TableCell>Completeness</TableCell>
                            <TableCell>Changes</TableCell>
                            <TableCell>Missing</TableCell>
                            <TableCell>Errors</TableCell>
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
                                      ครบ
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
                          แสดง 500 แถวแรกจากทั้งหมด {item.preview.rows.length} (แถวที่เหลือยังถูก commit ตามที่เลือก)
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
