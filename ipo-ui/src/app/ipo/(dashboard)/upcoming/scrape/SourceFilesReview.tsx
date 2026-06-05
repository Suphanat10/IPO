"use client";

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import {
  AdminPanel,
  AdminStatusPill,
  adminColors,
} from "../../../components/AdminPrimitives";

type SourceEvidence = {
  field_name: string;
  extracted_value: unknown;
  source_text: string;
  source_file?: string | null;
  sheet_name?: string | null;
  row_number?: number | null;
  column_name?: string | null;
  parser?: string | null;
};

type SourceFileRow = {
  id: number;
  symbol: string;
  sec_trans_id: string | null;
  source_url: string | null;
  file_name: string | null;
  file_kind: string | null;
  byte_size: number | null;
  sheet_names: string[] | null;
  recognized_sheets: string[] | null;
  unknown_sheets: string[] | null;
  extracted_fields: Record<string, unknown> | null;
  extracted_evidence: Record<string, SourceEvidence> | null;
  data_status: string | null;
  validation_status: string | null;
  validation_messages: string[] | null;
  status: string;
  review_reason: string | null;
  detected_at: string;
};

function formatBytes(bytes: number | null) {
  if (bytes == null) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatValue(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const FIELD_LABELS: Record<string, { label: string; hint: string }> = {
  revenue_latest: { label: "รายได้ล่าสุด", hint: "Revenue latest" },
  revenue_prev: { label: "รายได้ปีก่อน", hint: "Revenue previous" },
  net_income_latest: { label: "กำไรสุทธิล่าสุด", hint: "Net income latest" },
  net_income_prev: { label: "กำไรสุทธิปีก่อน", hint: "Net income previous" },
  total_assets: { label: "สินทรัพย์รวม", hint: "Total assets" },
  total_liabilities: { label: "หนี้สินรวม", hint: "Total liabilities" },
  total_equity: { label: "ส่วนของผู้ถือหุ้น", hint: "Total equity" },
  offered_shares: { label: "หุ้นเสนอขาย", hint: "Offered shares" },
  offered_ratio_pct: { label: "สัดส่วนเสนอขาย", hint: "Offered ratio" },
  gross_proceeds: { label: "มูลค่าระดมทุน", hint: "Gross proceeds" },
  total_expense: { label: "ค่าใช้จ่ายรวม", hint: "Total expense" },
  existing_shares_pct: { label: "สัดส่วนหุ้นเดิม", hint: "Existing shares" },
  executive_total_pct: { label: "ผู้บริหารถือรวม", hint: "Executive total" },
};

function formatFieldValue(key: string, value: unknown) {
  const formatted = formatValue(value);
  if (formatted === "-") return formatted;
  if (key.endsWith("_pct")) return `${formatted}%`;
  if (key === "offered_shares") return `${formatted} หุ้น`;
  return formatted;
}

function statusTone(status: string | null): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "imported" || status === "passed") return "success";
  if (status === "needs_review" || status === "skipped") return "warning";
  if (status === "error" || status === "failed") return "danger";
  if (status === "new" || status === "changed") return "info";
  return "neutral";
}

// Thai labels for the status pills so reviewers don't need to read the raw
// English machine values. Each map covers one status dimension; unknown values
// fall back to the raw string via `thaiStatus`.
const WORKFLOW_STATUS_TH: Record<string, string> = {
  imported: "นำเข้าแล้ว",
  needs_review: "รอตรวจสอบ",
  no_data: "ไม่มีข้อมูล",
  unchanged: "ไม่เปลี่ยนแปลง",
  skipped: "ข้าม (ตรงกับฐานข้อมูล)",
  error: "ผิดพลาด",
};

const DATA_STATUS_TH: Record<string, string> = {
  new: "ข้อมูลใหม่",
  changed: "มีการเปลี่ยนแปลง",
  unchanged: "ไม่เปลี่ยนแปลง",
};

const VALIDATION_STATUS_TH: Record<string, string> = {
  passed: "ไฟล์มีโครงสร้างตามรูปแบบที่กำหนด",
  failed: "ไม่ผ่านการตรวจ",
  skipped: "ข้ามการตรวจ",
};

function thaiStatus(map: Record<string, string>, value: string | null): string {
  if (!value) return "-";
  return map[value] ?? value;
}

const FIELD_ORDER = [
  "revenue_latest",
  "revenue_prev",
  "net_income_latest",
  "net_income_prev",
  "total_assets",
  "total_liabilities",
  "total_equity",
  "offered_shares",
  "offered_ratio_pct",
  "gross_proceeds",
  "total_expense",
  "existing_shares_pct",
  "executive_total_pct",
];

function orderedFieldEntries(fields: Record<string, unknown> | null) {
  const entries = Object.entries(fields ?? {});
  const rank = new Map(FIELD_ORDER.map((key, index) => [key, index]));
  return entries.sort(([a], [b]) => {
    const aRank = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

/** Source-location line — only shown when there is real sheet/row/col data. */
function EvidenceMeta({ evidence }: { evidence: SourceEvidence }) {
  const parts: string[] = [];
  if (evidence.sheet_name) parts.push(`sheet ${evidence.sheet_name}`);
  if (evidence.row_number != null) parts.push(`row ${evidence.row_number}`);
  if (evidence.column_name) parts.push(`col ${evidence.column_name}`);
  if (parts.length === 0) return null;
  return (
    <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mt: 0.5 }}>
      {parts.join(" · ")}
    </Typography>
  );
}

function ChipList({
  values,
  bg,
  fg,
  border,
}: {
  values: string[] | null;
  bg: string;
  fg: string;
  border: string;
}) {
  if (!values || values.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {values.map((value, index) => (
        <Chip
          key={`${value}-${index}`}
          size="small"
          label={value}
          sx={{
            height: 20,
            borderRadius: "7px",
            fontSize: 11,
            fontWeight: 700,
            bgcolor: bg,
            color: fg,
            border: `1px solid ${border}`,
            "& .MuiChip-label": { px: 0.85 },
          }}
        />
      ))}
    </Stack>
  );
}

function ExtractedFields({
  fields,
  evidence,
}: {
  fields: Record<string, unknown> | null;
  evidence: Record<string, SourceEvidence> | null;
}) {
  const entries = orderedFieldEntries(fields);
  if (entries.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: adminColors.muted }}>
        ยังไม่มีค่าที่ดึงได้
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        overflow: "hidden",
        border: "1px solid #dbe4ef",
        borderRadius: "8px",
        bgcolor: "#ffffff",
      }}
    >
      {entries.slice(0, 12).map(([key, value]) => {
        const fieldEvidence = evidence?.[key];
        const label = FIELD_LABELS[key];
        return (
          <Box
            key={key}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(170px, 0.9fr) minmax(136px, 0.55fr) minmax(0, 1.6fr)",
              },
              gap: { xs: 0.6, md: 1.5 },
              alignItems: "center",
              px: { xs: 1.25, md: 1.5 },
              py: { xs: 1.1, md: 1.2 },
              borderTop: "1px solid #eef2f7",
              "&:first-of-type": { borderTop: 0 },
              "&:hover": { bgcolor: "#f8fbff" },
            }}
          >
            <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                aria-hidden
                sx={{
                  width: 3,
                  height: 28,
                  borderRadius: 99,
                  bgcolor: fieldEvidence?.source_text ? adminColors.blue : "#cbd5e1",
                  flexShrink: 0,
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    color: adminColors.text,
                    fontSize: 13,
                    fontWeight: 850,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label?.label ?? key}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.1,
                    color: adminColors.muted,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label?.hint ?? key}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ minWidth: 0, textAlign: { xs: "left", md: "right" } }}>
              <Typography
                sx={{
                  color: adminColors.text,
                  fontWeight: 900,
                  fontSize: { xs: 16, md: 15 },
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatFieldValue(key, value)}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
              sx={{
                color: fieldEvidence?.source_text ? adminColors.text : adminColors.muted,
                display: "-webkit-box",
                fontSize: 12,
                lineHeight: 1.5,
                overflow: "hidden",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
              }}
            >
              {fieldEvidence?.source_text ?? "ไม่มีหลักฐานแถวต้นทางใน run นี้"}
              </Typography>
              {fieldEvidence ? <EvidenceMeta evidence={fieldEvidence} /> : null}
            </Box>
          </Box>
        );
      })}
      {entries.length > 12 ? (
        <Box sx={{ px: 1.5, py: 1, borderTop: "1px solid #eef2f7", bgcolor: "#f8fafc" }}>
          <Chip
            size="small"
            label={`อีก +${entries.length - 12} รายการ`}
            sx={{ height: 22, borderRadius: "7px", fontSize: 11, fontWeight: 800 }}
          />
        </Box>
      ) : null}
    </Box>
  );
}

// Open a SEC source file via our same-origin unzip proxy: xlsx is rendered as an
// HTML table, docx as a readable page. Same-origin so it works on localhost,
// ngrok and production alike — no external Office viewer (which can't reach those).
function openSourceFileViewer(sourceUrl: string | null) {
  if (!sourceUrl) return;
  const url = `/api/ipo/upcoming/source-files/view?url=${encodeURIComponent(sourceUrl)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// Open via the Microsoft Office Online viewer instead, pointed at our proxy's
// raw bytes. Renders xlsx/docx with full Office fidelity, but only works when the
// app is on a public URL Microsoft can fetch (i.e. a real deploy, not localhost).
function openInOfficeViewer(sourceUrl: string | null) {
  if (!sourceUrl) return;
  const proxy = `${window.location.origin}/api/ipo/upcoming/source-files/view?raw=1&url=${encodeURIComponent(
    sourceUrl,
  )}`;
  const viewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(proxy)}`;
  window.open(viewer, "_blank", "noopener,noreferrer");
}

function SourceFileLinks({ files }: { files: SourceFileRow[] }) {
  const linkedFiles = files.filter((file) => file.source_url);
  if (linkedFiles.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: adminColors.muted }}>
        ไม่มีลิงก์ไฟล์ต้นฉบับ / No original file links.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gap: 0.75,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(180px, 1fr))" },
      }}
    >
      {linkedFiles.map((file, index) => (
        <Box
          key={file.id}
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 0.5,
            minWidth: 0,
            p: 0.35,
            border: "1px solid #dbe4ef",
            borderRadius: "8px",
            bgcolor: "#ffffff",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
          }}
        >
          <Button
            onClick={() => openSourceFileViewer(file.source_url)}
            size="small"
            variant="text"
            startIcon={<OpenInNewRoundedIcon />}
            sx={{
              flex: 1,
              justifyContent: "flex-start",
              minWidth: 0,
              px: 0.75,
              textTransform: "none",
              color: adminColors.text,
              "& .MuiButton-startIcon": { flexShrink: 0 },
            }}
          >
            <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
              <Typography component="span" variant="caption" sx={{ display: "block", fontWeight: 850, lineHeight: 1.2 }}>
                {index + 1}. {file.file_kind ?? "file"}
              </Typography>
              <Typography component="span" variant="caption" sx={{ display: "block", color: adminColors.muted, lineHeight: 1.2 }}>
                {file.file_name ?? file.sec_trans_id ?? "-"}
              </Typography>
            </Box>
          </Button>
          <Button
            onClick={() => openInOfficeViewer(file.source_url)}
            size="small"
            variant="text"
            title="เปิดด้วย Office viewer (ใช้ได้เมื่อ deploy เป็น public URL)"
            sx={{
              minWidth: 0,
              px: 0.8,
              textTransform: "none",
              flexShrink: 0,
              color: adminColors.muted,
              borderLeft: "1px solid #edf2f7",
              borderRadius: 0,
            }}
          >
            Office
          </Button>
        </Box>
      ))}
    </Box>
  );
}

function FileCard({
  row,
  busy,
  onApprove,
  onEdit,
  onReject,
  onResolve,
}: {
  row: SourceFileRow;
  busy: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  onResolve: () => void;
}) {
  const alreadyImported = row.status === "imported";
  const sheets = row.recognized_sheets?.length ? row.recognized_sheets : row.sheet_names;
  const validationMessages = Array.from(new Set(row.validation_messages ?? []));
  const fieldCount = Object.keys(row.extracted_fields ?? {}).length;
  return (
    <Box
      sx={{
        border: "1px solid #dbe4ef",
        borderRadius: "8px",
        bgcolor: "#ffffff",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          px: { xs: 1.25, md: 1.5 },
          py: 1,
          bgcolor: "#f8fafc",
          borderBottom: "1px solid #edf2f7",
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
          <AdminStatusPill
            label={row.file_kind ?? "unknown"}
            tone={row.file_kind === "docx" ? "warning" : "neutral"}
          />
          <AdminStatusPill label={thaiStatus(WORKFLOW_STATUS_TH, row.status)} tone={statusTone(row.status)} />
          {row.data_status ? (
            <AdminStatusPill label={thaiStatus(DATA_STATUS_TH, row.data_status)} tone={statusTone(row.data_status)} />
          ) : null}
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label={`${fieldCount} รายการ`}
          sx={{
            height: 22,
            borderRadius: "7px",
            fontSize: 11,
            fontWeight: 800,
            bgcolor: "#eef4fb",
            color: "#1e3a5c",
            "& .MuiChip-label": { px: 0.9 },
          }}
        />
        <Typography variant="caption" sx={{ color: adminColors.muted }}>
          {row.file_name ?? row.sec_trans_id ?? "-"} · {formatBytes(row.byte_size)}
        </Typography>
        {row.source_url ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography
              component="button"
              type="button"
              onClick={() => openSourceFileViewer(row.source_url)}
              variant="caption"
              sx={{
                color: adminColors.blue,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 0.25,
                cursor: "pointer",
                border: 0,
                background: "none",
                p: 0,
                font: "inherit",
              }}
            >
              <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
              เปิดในแอป
            </Typography>
            <Typography
              component="button"
              type="button"
              onClick={() => openInOfficeViewer(row.source_url)}
              variant="caption"
              sx={{
                color: adminColors.muted,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 0.25,
                cursor: "pointer",
                border: 0,
                background: "none",
                p: 0,
                font: "inherit",
              }}
            >
              <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
              Office
            </Typography>
          </Stack>
        ) : null}
      </Box>

      {/* Body */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 280px" },
          gap: { xs: 1.25, md: 1.5 },
          alignItems: "start",
          p: { xs: 1.25, md: 1.5 },
          bgcolor: "#fbfdff",
        }}
      >
        {sheets && sheets.length > 0 ? (
          <Box sx={{ gridColumn: { xs: "1", md: "1" } }}>
            <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mb: 0.5 }}>
              Sheets:
            </Typography>
            <ChipList values={sheets} bg="#eef4fb" fg="#1e3a5c" border="#d7e2ee" />
            {row.unknown_sheets && row.unknown_sheets.length > 0 ? (
              <Box sx={{ mt: 0.5 }}>
                <ChipList values={row.unknown_sheets} bg="#fef3c7" fg="#92400e" border="#fde68a" />
              </Box>
            ) : null}
          </Box>
        ) : null}

        <ExtractedFields fields={row.extracted_fields} evidence={row.extracted_evidence} />

        {/* Validation / reason */}
        <Box
          sx={{
            gridColumn: { xs: "1", md: "2" },
            gridRow: { md: "1 / span 2" },
            border: "1px solid #dbe4ef",
            borderRadius: "8px",
            bgcolor: "#ffffff",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 1,
            m: { md: 0 },
            minHeight: { md: "100%" },
            p: 1.25,
          }}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="caption" sx={{ color: adminColors.muted, fontWeight: 850, textTransform: "uppercase" }}>
              ผลตรวจสอบ / Review
            </Typography>
            <Typography variant="caption" sx={{ color: adminColors.muted }}>
              {new Date(row.detected_at).toLocaleString()}
            </Typography>
          </Stack>
          {row.validation_status ? (
            <AdminStatusPill label={thaiStatus(VALIDATION_STATUS_TH, row.validation_status)} tone={statusTone(row.validation_status)} />
          ) : null}
          <Typography variant="caption" sx={{ color: adminColors.text }}>
            {row.review_reason ?? "-"}
          </Typography>
          {validationMessages.length > 0 ? (
            <Box
              component="ul"
              sx={{
                m: 0,
                pl: 2,
                width: "100%",
                maxHeight: 116,
                overflow: "auto",
              }}
            >
              {validationMessages.map((message, index) => (
                <Typography key={`${message}-${index}`} component="li" variant="caption" sx={{ color: adminColors.rose }}>
                  {message}
                </Typography>
              ))}
            </Box>
          ) : null}
          <Divider sx={{ my: 0.25 }} />
          <Stack direction="column" spacing={0.8}>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
              disabled={busy}
              onClick={alreadyImported ? onResolve : onApprove}
              sx={{
                width: "100%",
                bgcolor: adminColors.text,
                boxShadow: "0 2px 8px rgba(10,25,41,0.18)",
                "&:hover": { bgcolor: "#132f4c" },
              }}
            >
              {alreadyImported ? "ตรวจแล้ว / Verified" : "อนุมัติ / Approve"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditRoundedIcon />}
              disabled={busy}
              onClick={onEdit}
              sx={{ width: "100%" }}
            >
              แก้ไข / Edit
            </Button>
            {alreadyImported ? null : (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<CancelRoundedIcon />}
                disabled={busy}
                onClick={onReject}
                sx={{ width: "100%" }}
              >
                ปฏิเสธ / Reject
              </Button>
            )}
          </Stack>
        </Box>

        {/* Actions */}
        <Stack
          direction="column"
          spacing={1}
          sx={{
            display: "none",
            gridColumn: { xs: "1", md: "2" },
            justifyContent: "flex-end",
            flexWrap: "wrap",
            borderLeft: { md: "1px solid #dbe4ef" },
            pl: { md: 1.5 },
          }}
        >
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
            disabled={busy}
            onClick={alreadyImported ? onResolve : onApprove}
            sx={{
              width: "100%",
              bgcolor: adminColors.text,
              boxShadow: "0 2px 8px rgba(10,25,41,0.18)",
              "&:hover": { bgcolor: "#132f4c" },
            }}
          >
            {alreadyImported ? "ตรวจแล้ว / Verified" : "อนุมัติ / Approve"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditRoundedIcon />}
            disabled={busy}
            onClick={onEdit}
            sx={{ width: "100%" }}
          >
            แก้ไข / Edit
          </Button>
          {alreadyImported ? null : (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<CancelRoundedIcon />}
              disabled={busy}
              onClick={onReject}
              sx={{ width: "100%" }}
            >
              ปฏิเสธ / Reject
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

export default function SourceFilesReview() {
  const [rows, setRows] = React.useState<SourceFileRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [editRow, setEditRow] = React.useState<SourceFileRow | null>(null);
  const [editValues, setEditValues] = React.useState<Record<string, string>>({});
  const [openSymbols, setOpenSymbols] = React.useState<Set<string>>(() => new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Pull both the manual-review queue AND the auto-imported financial-statement
      // files (status=imported, still unresolved) so reviewers can see and verify
      // the financial figures the scraper wrote to ipo_financials, not just the
      // prospectus fields parked for review.
      const [reviewRes, importedRes] = await Promise.all([
        fetch("/api/ipo/upcoming/source-files?status=needs_review&resolved=false", {
          cache: "no-store",
        }),
        fetch("/api/ipo/upcoming/source-files?status=imported&resolved=false", {
          cache: "no-store",
        }),
      ]);
      const [reviewJson, importedJson] = await Promise.all([
        reviewRes.json(),
        importedRes.json(),
      ]);
      if (!reviewRes.ok) throw new Error(reviewJson?.error ?? "Failed to load SEC source files");
      if (!importedRes.ok) throw new Error(importedJson?.error ?? "Failed to load SEC source files");
      const merged: SourceFileRow[] = [
        ...(reviewJson.files ?? []),
        ...(importedJson.files ?? []),
      ];
      // Keep most-recent-first so the per-symbol "latest TransID" grouping below
      // selects the newest filing version.
      merged.sort(
        (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
      );
      setRows(merged);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Group files under their company so reviewers start from a clean stock list,
  // then expand one symbol to inspect every unresolved source file for it.
  // Insertion order of the API response (most-recent first) is kept.
  const groups = React.useMemo(() => {
    const map = new Map<string, SourceFileRow[]>();
    for (const row of rows) {
      const list = map.get(row.symbol);
      if (list) list.push(row);
      else map.set(row.symbol, [row]);
    }
    return Array.from(map.entries());
  }, [rows]);

  function toggleSymbol(symbol: string) {
    setOpenSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  async function review(
    id: number,
    action: "approved" | "rejected" | "edited",
    fields?: Record<string, number>,
  ) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fields }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Failed to submit review");
      }
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Mark an already auto-imported file as verified (numbers checked against the
  // SEC source). Closes it out of the queue without re-importing.
  async function resolve(id: number) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${id}/resolve`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Failed to mark verified");
      }
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openEdit(row: SourceFileRow) {
    const initial: Record<string, string> = {};
    for (const [key, value] of Object.entries(row.extracted_fields ?? {})) {
      if (typeof value === "number") initial[key] = String(value);
    }
    setEditValues(initial);
    setEditRow(row);
  }

  async function submitEdit() {
    if (!editRow) return;
    const fields: Record<string, number> = {};
    for (const [key, raw] of Object.entries(editValues)) {
      const num = Number(raw);
      if (raw !== "" && Number.isFinite(num)) fields[key] = num;
    }
    const id = editRow.id;
    setEditRow(null);
    await review(id, "edited", fields);
  }

  return (
    <AdminPanel
      title="ไฟล์ ก.ล.ต. จาก Scraper ที่ต้องตรวจสอบ / SEC files from Scraper"
      subtitle="แสดงค่าที่ scraper ดึงได้ (รวมตัวเลขงบการเงินที่นำเข้าอัตโนมัติแล้ว) พร้อมแถว/ประโยคต้นทางที่ใช้ parse เพื่อตรวจเทียบกับไฟล์ ก.ล.ต. ก่อนกดตรวจแล้ว"
      action={
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          onClick={() => void load()}
          disabled={loading}
        >
          รีเฟรช / Refresh
        </Button>
      }
    >
      {error ? (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ color: adminColors.rose }}>
            {error}
          </Typography>
        </Box>
      ) : null}

      {loading ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : groups.length === 0 ? (
        <Box sx={{ py: 5, textAlign: "center" }}>
          <Typography variant="body2" sx={{ color: adminColors.muted }}>
            ไม่มีไฟล์จาก scraper ที่ต้องตรวจสอบตอนนี้ / No scraper SEC files awaiting review.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.25}>
          {groups.map(([symbol, files]) => {
            const isOpen = openSymbols.has(symbol);
            const transIds = Array.from(
              new Set(files.map((file) => file.sec_trans_id).filter(Boolean)),
            );
            const reviewCount = files.filter((file) => file.status === "needs_review").length;
            const importedCount = files.filter((file) => file.status === "imported").length;
            const openableFileCount = files.filter((file) => file.source_url).length;

            return (
            <Box
              key={symbol}
              sx={{
                pt: 2,
                borderTop: "1px solid #dbe4ef",
                "&:first-of-type": {
                  pt: 0,
                  borderTop: 0,
                },
              }}
            >
              {/* Company header */}
              <Box
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => toggleSymbol(symbol)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSymbol(symbol);
                  }
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  mb: 1,
                  flexWrap: "wrap",
                  gap: 1,
                  px: { xs: 1.25, md: 1.5 },
                  py: 1.25,
                  border: "1px solid",
                  borderColor: isOpen ? "#b8cbe0" : "#dbe4ef",
                  borderLeft: "4px solid",
                  borderLeftColor: isOpen ? adminColors.blue : "#dbe4ef",
                  borderRadius: "8px",
                  bgcolor: isOpen ? "#f8fbff" : "#ffffff",
                  boxShadow: isOpen ? "0 2px 8px rgba(15,23,42,0.07)" : "0 1px 2px rgba(15,23,42,0.04)",
                  cursor: "pointer",
                  outline: "none",
                  transition: "border-color 120ms ease, background-color 120ms ease",
                  "&:hover": {
                    borderColor: "#b8cbe0",
                    borderLeftColor: adminColors.blue,
                    bgcolor: "#f8fbff",
                  },
                  "&:focus-visible": {
                    borderColor: adminColors.blue,
                    boxShadow: "0 0 0 3px rgba(2,132,199,0.16)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "8px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: isOpen ? "#dbeafe" : "#eef4fb",
                    color: "#1e3a5c",
                    flexShrink: 0,
                  }}
                >
                  <ExpandMoreRoundedIcon
                    sx={{
                      fontSize: 22,
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 140ms ease",
                    }}
                  />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "baseline", flexWrap: "wrap", gap: 0.65 }}
                  >
                    <Typography sx={{ fontWeight: 850, fontSize: 18, color: adminColors.text, lineHeight: 1.1 }}>
                      {symbol}
                    </Typography>
                    {transIds.length > 0 ? (
                      <Typography variant="caption" sx={{ color: adminColors.muted }}>
                        {transIds.length === 1 ? `TransID ${transIds[0]}` : `${transIds.length} TransIDs`}
                      </Typography>
                    ) : null}
                  </Stack>
                  <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mt: 0.35 }}>
                    กดเพื่อดูข้อมูล / Expand details · เปิดไฟล์ต้นฉบับได้ {openableFileCount}/{files.length} ไฟล์
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={`${files.length} ไฟล์ / files`}
                  sx={{
                    height: 22,
                    borderRadius: "7px",
                    fontSize: 11,
                    fontWeight: 800,
                    bgcolor: "#eef4fb",
                    color: "#1e3a5c",
                    "& .MuiChip-label": { px: 0.9 },
                  }}
                />
                {reviewCount > 0 ? (
                  <AdminStatusPill label={`รอตรวจสอบ ${reviewCount}`} tone="warning" />
                ) : null}
                {importedCount > 0 ? (
                  <AdminStatusPill label={`นำเข้าแล้ว ${importedCount}`} tone="success" />
                ) : null}
              </Box>

              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <Box sx={{ pt: 0.25 }}>
                  <Box
                    sx={{
                      mb: 1,
                      px: { xs: 1.25, md: 1.5 },
                      py: 1,
                      border: "1px solid #dbe4ef",
                      borderRadius: "8px",
                      bgcolor: "#f8fafc",
                    }}
                  >
                    <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mb: 0.75 }}>
                      ไฟล์ต้นฉบับทั้งหมด / Original files
                    </Typography>
                    <SourceFileLinks files={files} />
                  </Box>

                  <Stack spacing={1.25}>
                    {files.map((row) => (
                      <FileCard
                        key={row.id}
                        row={row}
                        busy={busy === row.id}
                        onApprove={() => void review(row.id, "approved")}
                        onEdit={() => openEdit(row)}
                        onReject={() => void review(row.id, "rejected")}
                        onResolve={() => void resolve(row.id)}
                      />
                    ))}
                  </Stack>
                </Box>
              </Collapse>
            </Box>
            );
          })}
        </Stack>
      )}

      <Dialog open={editRow !== null} onClose={() => setEditRow(null)} maxWidth="sm" fullWidth>
        <DialogTitle>แก้ไขค่าก่อนนำเข้า / Edit before import — {editRow?.symbol}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mb: 1.5 }}>
            ปรับค่าตัวเลขที่จะนำเข้าฐานข้อมูล เว้นว่างเพื่อไม่นำเข้า field นั้น /
            Adjust the numeric values to import; clear a field to skip it.
          </Typography>
          <Stack spacing={1.5}>
            {Object.keys(editValues).length === 0 ? (
              <Typography variant="body2" sx={{ color: adminColors.muted }}>
                ไม่มี field ตัวเลขให้แก้ไข / No numeric fields to edit.
              </Typography>
            ) : (
              Object.entries(editValues).map(([key, value]) => (
                <TextField
                  key={key}
                  label={key}
                  value={value}
                  size="small"
                  type="number"
                  fullWidth
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>ยกเลิก / Cancel</Button>
          <Button
            variant="contained"
            color="success"
            disabled={Object.keys(editValues).length === 0}
            onClick={() => void submitEdit()}
          >
            บันทึก + นำเข้า / Save &amp; Import
          </Button>
        </DialogActions>
      </Dialog>
    </AdminPanel>
  );
}
