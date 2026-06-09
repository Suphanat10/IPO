"use client";

import * as React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { AdminPanel, AdminStatusPill, adminColors } from "../../components/AdminPrimitives";
import { openInOfficeViewer, openSourceFileViewer } from "@/app/lib/secFileViewer";

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
  extracted_fields: Record<string, unknown> | null;
  extracted_evidence: Record<string, SourceEvidence> | null;
  data_status: string | null;
  validation_status: string | null;
  validation_messages: string[] | null;
  status: string;
  review_reason: string | null;
  detected_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  gross_proceeds: "เงินระดมทุน / Gross proceeds",
  total_expense: "ค่าใช้จ่ายรวม / Total expense",
  offered_shares: "หุ้นเสนอขาย / Offered shares",
  offered_ratio_pct: "สัดส่วนเสนอขาย / Offered ratio",
  existing_shares_pct: "ผู้ถือหุ้นเดิม / Existing shares",
  executive_total_pct: "ผู้บริหารถือรวม / Executive total",
  total_assets: "สินทรัพย์รวม / Total assets",
  total_liabilities: "หนี้สินรวม / Total liabilities",
  total_equity: "ส่วนของผู้ถือหุ้น / Total equity",
  revenue_latest: "รายได้ล่าสุด / Revenue latest",
  revenue_prev: "รายได้ปีก่อน / Revenue prev",
  net_income_latest: "กำไรล่าสุด / Net income latest",
  net_income_prev: "กำไรปีก่อน / Net income prev",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

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

function formatFieldValue(key: string, value: unknown) {
  const formatted = formatValue(value);
  if (formatted === "-") return formatted;
  if (key.endsWith("_pct")) return `${formatted}%`;
  return formatted;
}

function statusTone(status: string | null): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "imported" || status === "passed") return "success";
  if (status === "needs_review" || status === "skipped") return "warning";
  if (status === "error" || status === "failed") return "danger";
  if (status === "new" || status === "changed") return "info";
  return "neutral";
}

function workflowLabel(status: string | null) {
  if (status === "imported") return "นำเข้าแล้ว";
  if (status === "needs_review") return "รอตรวจสอบ";
  if (status === "no_data") return "ไม่มีข้อมูล";
  if (status === "unchanged") return "ไม่เปลี่ยนแปลง";
  if (status === "error") return "ผิดพลาด";
  return status ?? "-";
}

function dataStatusLabel(status: string | null) {
  if (status === "new") return "ข้อมูลใหม่";
  if (status === "changed") return "มีการเปลี่ยนแปลง";
  if (status === "unchanged") return "ไม่เปลี่ยนแปลง";
  return status ?? "-";
}

function evidenceMeta(evidence?: SourceEvidence) {
  if (!evidence) return "";
  const parts: string[] = [];
  if (evidence.sheet_name) parts.push(`sheet ${evidence.sheet_name}`);
  if (evidence.row_number != null) parts.push(`row ${evidence.row_number}`);
  if (evidence.column_name) parts.push(`col ${evidence.column_name}`);
  return parts.join(" · ");
}

function orderedFieldEntries(fields: Record<string, unknown> | null) {
  const rank = new Map(FIELD_ORDER.map((key, index) => [key, index]));
  return Object.entries(fields ?? {}).sort(([a], [b]) => {
    const aRank = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

function SourceFileCard({
  file,
  busy,
  onApprove,
  onReject,
  onResolve,
  onEdit,
}: {
  file: SourceFileRow;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onResolve: () => void;
  onEdit: () => void;
}) {
  const entries = orderedFieldEntries(file.extracted_fields);
  const alreadyImported = file.status === "imported";
  const sheets = file.recognized_sheets?.length ? file.recognized_sheets : file.sheet_names;

  return (
    <Box
      sx={{
        border: "1px solid #dbe4ef",
        borderRadius: "8px",
        bgcolor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          p: 1.25,
          bgcolor: "#f8fafc",
          borderBottom: "1px solid #edf2f7",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mb: 0.75 }}>
            <AdminStatusPill label={file.file_kind ?? "file"} tone="neutral" />
            <AdminStatusPill label={workflowLabel(file.status)} tone={statusTone(file.status)} />
            {file.data_status ? (
              <AdminStatusPill label={dataStatusLabel(file.data_status)} tone={statusTone(file.data_status)} />
            ) : null}
          </Stack>
          <Typography sx={{ color: adminColors.text, fontWeight: 850, fontSize: 14 }}>
            {file.file_name ?? file.sec_trans_id ?? `Source file #${file.id}`}
          </Typography>
          <Typography variant="caption" sx={{ color: adminColors.muted }}>
            TransID {file.sec_trans_id ?? "-"} · {formatBytes(file.byte_size)}
            {sheets?.length ? ` · ${sheets.join(", ")}` : ""}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
          {file.source_url ? (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNewRoundedIcon />}
                onClick={() => openSourceFileViewer(file.source_url)}
              >
                เปิดไฟล์
              </Button>
              <Button size="small" variant="outlined" onClick={() => openInOfficeViewer(file.source_url)}>
                Office
              </Button>
            </>
          ) : null}
          {alreadyImported ? (
            <Button
              size="small"
              variant="contained"
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
              disabled={busy}
              onClick={onResolve}
            >
              ตรวจแล้ว / Verified
            </Button>
          ) : (
            <>
              <Button
                size="small"
                variant="contained"
                startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
                disabled={busy}
                onClick={onApprove}
              >
                อนุมัติ / Approve
              </Button>
              <Button size="small" variant="outlined" startIcon={<EditRoundedIcon />} disabled={busy} onClick={onEdit}>
                แก้ไข
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<CancelRoundedIcon />}
                disabled={busy}
                onClick={onReject}
              >
                ปฏิเสธ
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      {file.review_reason || file.validation_messages?.length ? (
        <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid #edf2f7", bgcolor: "#fff7ed" }}>
          <Typography variant="caption" sx={{ color: "#92400e", fontWeight: 700 }}>
            {file.review_reason ?? file.validation_messages?.join(" · ")}
          </Typography>
        </Box>
      ) : null}

      {entries.length === 0 ? (
        <Box sx={{ p: 1.5 }}>
          <Typography variant="body2" sx={{ color: adminColors.muted }}>
            ยังไม่มีค่าที่ scraper ดึงได้ / No extracted fields.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={0} sx={{ borderTop: "1px solid #edf2f7" }}>
          {entries.map(([key, value]) => {
            const evidence = file.extracted_evidence?.[key];
            return (
              <Grid key={key} size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 1.25,
                    minHeight: 116,
                    borderRight: { md: "1px solid #edf2f7" },
                    borderBottom: "1px solid #edf2f7",
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", gap: 1 }}>
                    <Typography sx={{ color: adminColors.text, fontSize: 13, fontWeight: 850 }}>
                      {FIELD_LABELS[key] ?? key}
                    </Typography>
                    <Typography
                      sx={{
                        color: adminColors.text,
                        fontSize: 14,
                        fontWeight: 900,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatFieldValue(key, value)}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{
                      color: evidence?.source_text ? adminColors.text : adminColors.muted,
                      mt: 0.75,
                      // Full evidence (so the matched figure is always visible);
                      // cap height and scroll instead of clamping to 2 lines.
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 120,
                      overflowY: "auto",
                    }}
                    title={evidence?.source_text}
                  >
                    {evidence?.source_text ?? "ไม่มีหลักฐานแถวต้นทาง"}
                  </Typography>
                  {evidenceMeta(evidence) ? (
                    <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mt: 0.35 }}>
                      {evidenceMeta(evidence)}
                    </Typography>
                  ) : null}
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

export default function IpoSecSourceFilesPanel({ ipoId }: { ipoId: number }) {
  const [rows, setRows] = React.useState<SourceFileRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [editRow, setEditRow] = React.useState<SourceFileRow | null>(null);
  const [editValues, setEditValues] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = `/api/ipo/upcoming/source-files?ipoId=${ipoId}&resolved=false`;
      const [reviewRes, importedRes] = await Promise.all([
        fetch(`${base}&status=needs_review`, { cache: "no-store" }),
        fetch(`${base}&status=imported`, { cache: "no-store" }),
      ]);
      const [reviewJson, importedJson] = await Promise.all([reviewRes.json(), importedRes.json()]);
      if (!reviewRes.ok) throw new Error(reviewJson?.error ?? "Failed to load SEC source files");
      if (!importedRes.ok) throw new Error(importedJson?.error ?? "Failed to load SEC source files");
      const merged = [...(reviewJson.files ?? []), ...(importedJson.files ?? [])] as SourceFileRow[];
      merged.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
      setRows(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [ipoId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function review(id: number, action: "approved" | "rejected" | "edited", fields?: Record<string, number>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fields }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to submit review");
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function resolve(id: number) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${id}/resolve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to mark verified");
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      subtitle="ตรวจไฟล์ต้นฉบับและค่าที่ scraper ดึงได้สำหรับ IPO รายการนี้ / Review source files and extracted values for this IPO."
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
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: adminColors.rose }}>
            {error}
          </Typography>
        </Box>
      ) : null}

      {loading ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
          <CircularProgress size={26} />
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: "center" }}>
          <Typography variant="body2" sx={{ color: adminColors.muted }}>
            ไม่มีไฟล์ ก.ล.ต. จาก scraper ที่ต้องตรวจสอบสำหรับ IPO นี้ / No SEC scraper files awaiting review for this IPO.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((row) => (
            <SourceFileCard
              key={row.id}
              file={row}
              busy={busy === row.id}
              onApprove={() => void review(row.id, "approved")}
              onReject={() => void review(row.id, "rejected")}
              onResolve={() => void resolve(row.id)}
              onEdit={() => openEdit(row)}
            />
          ))}
        </Stack>
      )}

      <Dialog open={editRow !== null} onClose={() => setEditRow(null)} maxWidth="sm" fullWidth>
        <DialogTitle>แก้ไขค่าก่อนนำเข้า / Edit before import</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {Object.keys(editValues).length === 0 ? (
              <Typography variant="body2" sx={{ color: adminColors.muted }}>
                ไม่มี field ตัวเลขให้แก้ไข / No numeric fields to edit.
              </Typography>
            ) : (
              Object.entries(editValues).map(([key, value]) => (
                <TextField
                  key={key}
                  label={FIELD_LABELS[key] ?? key}
                  value={value}
                  size="small"
                  type="number"
                  fullWidth
                  onChange={(event) => setEditValues((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>ยกเลิก / Cancel</Button>
          <Button
            variant="contained"
            disabled={Object.keys(editValues).length === 0}
            onClick={() => void submitEdit()}
          >
            บันทึก + นำเข้า / Save & Import
          </Button>
        </DialogActions>
      </Dialog>
    </AdminPanel>
  );
}
