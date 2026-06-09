"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  CircularProgress,
  Grid,
  Paper,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { toDateOnly } from "@/lib/date-format";
import type {
  IpoRow,
  IpoFinancialsRow,
  IpoFieldEvidence,
} from "@/lib/admin/types";
import { type IpoSectionKey } from "@/lib/admin/ipo-sections";
import { openSourceFileViewer, openInOfficeViewer } from "@/app/lib/secFileViewer";
import { useDropdownOptions } from "@/app/lib/useDropdownOptions";
import { adminColors, adminPanelSx } from "../../components/AdminPrimitives";

type FormState = Partial<IpoRow> & {
  financials?: Partial<IpoFinancialsRow>;
};

function arrToInput(arr: string[] | null | undefined): string {
  return (arr ?? []).join("\n");
}

function inputToArr(s: string): string[] | null {
  const parts = s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

type FinancialNumberKey = Exclude<keyof IpoFinancialsRow, "ipo_id" | "updated_at">;

const FINANCIAL_FIELD_GROUPS: {
  title: string;
  fields: { key: FinancialNumberKey; label: string }[];
}[] = [
  {
    title: "โครงสร้างเสนอขาย / Offering",
    fields: [
      { key: "gross_proceeds", label: "เงินระดมทุน / Gross proceeds" },
      { key: "total_expense", label: "ค่าใช้จ่ายรวม / Total expense" },
      { key: "offered_shares", label: "หุ้นเสนอขาย / Offered shares" },
    ],
  },
  {
    title: "สัดส่วนผู้ถือหุ้น / Ownership",
    fields: [
      { key: "offered_ratio_pct", label: "สัดส่วนเสนอขาย % / Offered ratio" },
      { key: "existing_shares_pct", label: "ผู้ถือหุ้นเดิม % / Existing" },
      { key: "executive_total_pct", label: "ผู้บริหาร % / Executive" },
    ],
  },
  {
    title: "ฐานะการเงิน / Balance sheet",
    fields: [
      { key: "total_assets", label: "สินทรัพย์รวม / Total assets" },
      { key: "total_liabilities", label: "หนี้สินรวม / Total liabilities" },
      { key: "total_equity", label: "ส่วนของผู้ถือหุ้น / Total equity" },
    ],
  },
  {
    title: "ผลประกอบการ / Profit and loss",
    fields: [
      { key: "revenue_latest", label: "รายได้ล่าสุด / Revenue latest" },
      { key: "revenue_prev", label: "รายได้ปีก่อน / Revenue prev" },
      { key: "net_income_latest", label: "กำไรล่าสุด / Net income latest" },
      { key: "net_income_prev", label: "กำไรปีก่อน / Net income prev" },
    ],
  },
];

const FINANCIAL_FIELD_LABELS = Object.fromEntries(
  FINANCIAL_FIELD_GROUPS.flatMap((group) =>
    group.fields.map((field) => [field.key, field.label] as const),
  ),
) as Record<FinancialNumberKey, string>;

const FINANCIAL_FIELD_KEYS = new Set<FinancialNumberKey>(
  FINANCIAL_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key)),
);

type SecSourceEvidence = IpoFieldEvidence & {
  field_name?: string;
  extracted_value?: unknown;
  extraction_method?: string | null;
};

type SecSourceFileRow = {
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
  extracted_evidence: Record<string, SecSourceEvidence> | null;
  data_status: string | null;
  validation_status: string | null;
  validation_messages: string[] | null;
  status: string;
  review_reason: string | null;
  detected_at: string;
};

function isFinancialField(key: string): key is FinancialNumberKey {
  return FINANCIAL_FIELD_KEYS.has(key as FinancialNumberKey);
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatSourceValue(value: unknown) {
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

function statusChipTone(status: string | null) {
  if (status === "imported" || status === "passed") {
    return { color: "#047857", bgcolor: "#dcfce7", borderColor: "#bbf7d0" };
  }
  if (status === "needs_review" || status === "skipped") {
    return { color: "#92400e", bgcolor: "#fef3c7", borderColor: "#fde68a" };
  }
  if (status === "error" || status === "failed") {
    return { color: "#be123c", bgcolor: "#ffe4e6", borderColor: "#fecdd3" };
  }
  return { color: "#1e3a5c", bgcolor: "#eef4fb", borderColor: "#d7e2ee" };
}

function workflowLabel(status: string | null) {
  if (status === "imported") return "นำเข้าแล้ว / Imported";
  if (status === "needs_review") return "รอตรวจสอบ / Needs review";
  if (status === "no_data") return "ไม่มีข้อมูล / No data";
  if (status === "unchanged") return "ไม่เปลี่ยนแปลง / Unchanged";
  if (status === "error") return "ผิดพลาด / Error";
  return status ?? "-";
}

function dataStatusLabel(status: string | null) {
  if (status === "new") return "ข้อมูลใหม่ / New";
  if (status === "changed") return "มีการเปลี่ยนแปลง / Changed";
  if (status === "unchanged") return "ไม่เปลี่ยนแปลง / Unchanged";
  return status ?? "-";
}

function evidenceMeta(evidence?: IpoFieldEvidence) {
  if (!evidence) return "";
  const parts: string[] = [];
  if (evidence.sheet_name) parts.push(`sheet ${evidence.sheet_name}`);
  if (evidence.row_number != null) parts.push(`row ${evidence.row_number}`);
  if (evidence.column_name) parts.push(`col ${evidence.column_name}`);
  return parts.join(" · ");
}

function sectionEntries(file: SecSourceFileRow, section: IpoSectionKey) {
  const entries = Object.entries(file.extracted_fields ?? {}).filter(([key]) => {
    if (section === "financials") return isFinancialField(key);
    return false;
  });
  return entries.sort(([a], [b]) => {
    if (isFinancialField(a) && isFinancialField(b)) {
      const aIndex = Object.keys(FINANCIAL_FIELD_LABELS).indexOf(a);
      const bIndex = Object.keys(FINANCIAL_FIELD_LABELS).indexOf(b);
      return aIndex - bIndex;
    }
    return a.localeCompare(b);
  });
}

function initialSourceDraft(file: SecSourceFileRow, section: IpoSectionKey) {
  const draft: Record<string, string> = {};
  for (const [key, value] of sectionEntries(file, section)) {
    if (typeof value === "number" && Number.isFinite(value)) draft[key] = String(value);
  }
  return draft;
}

function numericFieldsFromDraft(draft: Record<string, string>) {
  const fields: Partial<Record<FinancialNumberKey, number>> = {};
  for (const [key, raw] of Object.entries(draft)) {
    const num = Number(raw);
    if (isFinancialField(key) && raw !== "" && Number.isFinite(num)) {
      fields[key] = num;
    }
  }
  return fields;
}

function numericFieldsFromSource(file: SecSourceFileRow, section: IpoSectionKey) {
  const fields: Partial<Record<FinancialNumberKey, number>> = {};
  for (const [key, value] of sectionEntries(file, section)) {
    if (isFinancialField(key) && typeof value === "number" && Number.isFinite(value)) {
      fields[key] = value;
    }
  }
  return fields;
}

/** Source proof for a field, pulled from the SEC extraction evidence. */
function EvidenceCaption({
  evidence,
  dense = false,
  reserveSpace = false,
}: {
  evidence?: IpoFieldEvidence;
  dense?: boolean;
  reserveSpace?: boolean;
}) {
  if (!evidence?.source_text) {
    return reserveSpace ? <Box sx={{ minHeight: dense ? 34 : 0 }} /> : null;
  }

  const loc: string[] = [];
  if (evidence.sheet_name) loc.push(`sheet ${evidence.sheet_name}`);
  if (evidence.row_number != null) loc.push(`row ${evidence.row_number}`);
  if (evidence.column_name) loc.push(`col ${evidence.column_name}`);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "16px minmax(0, 1fr)",
        columnGap: 0.75,
        alignItems: "start",
        minHeight: dense ? 34 : undefined,
      }}
    >
      <DescriptionRoundedIcon sx={{ color: "#94a3b8", fontSize: 15, mt: "2px" }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: adminColors.text,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: dense ? 1 : 2,
            overflow: "hidden",
            lineHeight: 1.35,
            fontSize: dense ? 11 : undefined,
          }}
          title={evidence.source_text}
        >
          {evidence.source_text}
        </Typography>
        {loc.length > 0 ? (
          <Typography
            variant="caption"
            sx={{
              color: adminColors.muted,
              display: "block",
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: dense ? 10.5 : undefined,
            }}
            title={loc.join(" · ")}
          >
            {loc.join(" · ")}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

function FinancialNumField(props: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  evidence?: IpoFieldEvidence;
  reserveEvidence?: boolean;
}) {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        p: 0.75,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: adminColors.borderSoft,
        bgcolor: "#fbfdff",
        transition: "border-color 120ms ease, background-color 120ms ease",
        "&:focus-within": {
          borderColor: "#38bdf8",
          bgcolor: "#ffffff",
        },
      }}
    >
      <TextField
        size="small"
        fullWidth
        label={props.label}
        type="number"
        slotProps={{ htmlInput: { step: "any", inputMode: "decimal" } }}
        value={props.value ?? ""}
        onChange={(e) => {
          const t = e.target.value;
          props.onChange(t === "" ? null : Number(t));
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            bgcolor: "#ffffff",
            borderRadius: "8px",
          },
          "& .MuiInputBase-input": {
            color: adminColors.text,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 650,
          },
          "& .MuiInputLabel-root": {
            color: adminColors.muted,
          },
        }}
      />
      <EvidenceCaption evidence={props.evidence} dense reserveSpace={props.reserveEvidence} />
    </Box>
  );
}

function FinancialFields({
  financials,
  evidence,
  onPatch,
}: {
  financials?: Partial<IpoFinancialsRow>;
  evidence: Record<string, IpoFieldEvidence>;
  onPatch: (key: FinancialNumberKey, value: number | null) => void;
}) {
  return (
    <Stack spacing={2.25}>
      {FINANCIAL_FIELD_GROUPS.map((group, index) => {
        const groupHasEvidence = group.fields.some((field) => evidence[field.key]?.source_text);
        return (
          <Box
            key={group.title}
            sx={{
              pt: index === 0 ? 0 : 2.25,
              borderTop: index === 0 ? 0 : "1px solid",
              borderColor: adminColors.borderSoft,
            }}
          >
            <Typography
              variant="overline"
              sx={{
                display: "block",
                color: adminColors.accent,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0,
                lineHeight: 1.4,
                mb: 1,
              }}
            >
              {group.title}
            </Typography>
            <Grid container spacing={1.5} sx={{ alignItems: "stretch" }}>
              {group.fields.map((field) => (
                <Grid key={field.key} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <FinancialNumField
                    label={field.label}
                    value={financials?.[field.key]}
                    onChange={(value) => onPatch(field.key, value)}
                    evidence={evidence[field.key]}
                    reserveEvidence={groupHasEvidence}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        );
      })}
    </Stack>
  );
}

function NumField(props: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: string;
  evidence?: IpoFieldEvidence;
}) {
  return (
    <Stack spacing={0.5}>
      <TextField
        size="small"
        fullWidth
        label={props.label}
        type="number"
        slotProps={{ htmlInput: { step: props.step ?? "any" } }}
        value={props.value ?? ""}
        onChange={(e) => {
          const t = e.target.value;
          props.onChange(t === "" ? null : Number(t));
        }}
      />
      {props.evidence ? <EvidenceCaption evidence={props.evidence} /> : null}
    </Stack>
  );
}

function IpoAccordionPanel({
  title,
  subtitle,
  action,
  children,
  defaultExpanded = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const bodyId = React.useId();
  const headerId = `${bodyId}-header`;

  return (
    <Paper
      sx={[
        adminPanelSx,
        {
          overflow: "hidden",
          transition: "border-color 160ms ease, box-shadow 160ms ease",
          borderColor: expanded ? "rgba(2,132,199,0.28)" : adminColors.border,
          "&:hover": {
            boxShadow: "0 5px 16px rgba(10,25,41,0.08), 0 1px 2px rgba(10,25,41,0.04)",
          },
        },
      ]}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.25}
        sx={{
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          px: { xs: 1.25, md: 1.5 },
          py: { xs: 1, md: 1.15 },
          bgcolor: expanded ? "#f8fbff" : adminColors.panelAlt,
        }}
      >
        <Box
          component="button"
          type="button"
          id={headerId}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((value) => !value)}
          sx={{
            display: "grid",
            gridTemplateColumns: "34px minmax(0, 1fr)",
            gap: 1.25,
            alignItems: "center",
            minWidth: 0,
            width: "100%",
            m: 0,
            p: 0,
            border: 0,
            bgcolor: "transparent",
            color: "inherit",
            cursor: "pointer",
            font: "inherit",
            textAlign: "left",
            borderRadius: "8px",
            "&:focus-visible": {
              outline: "2px solid #38bdf8",
              outlineOffset: "3px",
            },
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: "8px",
              display: "grid",
              placeItems: "center",
              bgcolor: expanded ? "#e0f2fe" : "#eef2f7",
              color: expanded ? adminColors.blue : adminColors.muted,
              transition: "background-color 160ms ease, color 160ms ease",
              "& svg": {
                transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 160ms ease",
              },
            }}
          >
            <KeyboardArrowDownRoundedIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                color: adminColors.text,
                fontWeight: 850,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </Typography>
            {subtitle ? (
              <Typography
                variant="caption"
                sx={{
                  color: adminColors.muted,
                  display: "block",
                  lineHeight: 1.45,
                  mt: 0.15,
                }}
              >
                {subtitle}
              </Typography>
            ) : null}
          </Box>
        </Box>
        {action ? (
          <Box
            sx={{
              flexShrink: 0,
              display: "flex",
              justifyContent: { xs: "flex-start", sm: "flex-end" },
              pl: { xs: 5.75, sm: 0 },
            }}
          >
            {action}
          </Box>
        ) : null}
      </Stack>
      <Collapse in={expanded} timeout={180} unmountOnExit>
        <Box
          id={bodyId}
          role="region"
          aria-labelledby={headerId}
          sx={{
            p: { xs: 2, md: 2.5 },
            borderTop: "1px solid",
            borderColor: adminColors.borderSoft,
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}

function SourceStatusChip({ label, status }: { label: React.ReactNode; status: string | null }) {
  const tone = statusChipTone(status);
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 24,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: tone.borderColor,
        bgcolor: tone.bgcolor,
        color: tone.color,
        fontWeight: 800,
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}

function SectionSourceFileCard({
  file,
  section,
  draft,
  busy,
  onDraftChange,
  onApprove,
  onImportEdited,
  onReject,
  onResolve,
  onReprocess,
}: {
  file: SecSourceFileRow;
  section: IpoSectionKey;
  draft: Record<string, string>;
  busy: boolean;
  onDraftChange: (key: string, value: string) => void;
  onApprove: () => void;
  onImportEdited: () => void;
  onReject: () => void;
  onResolve: () => void;
  onReprocess: () => void;
}) {
  const entries = sectionEntries(file, section);
  const alreadyImported = file.status === "imported";
  const sheets = file.recognized_sheets?.length ? file.recognized_sheets : file.sheet_names;
  const editableCount = Object.keys(draft).length;

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: alreadyImported ? "#bbf7d0" : "#dbe4ef",
        borderRadius: "8px",
        bgcolor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1}
        sx={{
          alignItems: { xs: "stretch", lg: "center" },
          justifyContent: "space-between",
          p: 1.25,
          bgcolor: alreadyImported ? "#f0fdf4" : "#f8fafc",
          borderBottom: "1px solid #edf2f7",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mb: 0.75 }}>
            <SourceStatusChip label={file.file_kind ?? "SEC file"} status={file.file_kind} />
            <SourceStatusChip label={workflowLabel(file.status)} status={file.status} />
            {file.data_status ? (
              <SourceStatusChip label={dataStatusLabel(file.data_status)} status={file.data_status} />
            ) : null}
            {file.validation_status ? (
              <SourceStatusChip label={file.validation_status} status={file.validation_status} />
            ) : null}
          </Stack>
          <Typography
            sx={{
              color: adminColors.text,
              fontSize: 14,
              fontWeight: 850,
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={file.file_name ?? undefined}
          >
            {file.file_name ?? file.sec_trans_id ?? `Source file #${file.id}`}
          </Typography>
          <Typography variant="caption" sx={{ color: adminColors.muted, display: "block", mt: 0.25 }}>
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
                sx={{ textTransform: "none" }}
              >
                เปิดไฟล์ / Open
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => openInOfficeViewer(file.source_url)}
                sx={{ textTransform: "none" }}
              >
                Office
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <RefreshRoundedIcon />}
                disabled={busy}
                onClick={onReprocess}
                title="ดาวน์โหลดเอกสาร ก.ล.ต. แล้วดึงค่า + หลักฐานใหม่ด้วย parser ล่าสุด"
                sx={{ textTransform: "none" }}
              >
                ดึงใหม่ / Reprocess
              </Button>
            </>
          ) : null}
          {alreadyImported ? (
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
              disabled={busy}
              onClick={onResolve}
              sx={{ textTransform: "none" }}
            >
              ตรวจแล้ว / Verified
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {file.review_reason || file.validation_messages?.length ? (
        <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid #edf2f7", bgcolor: "#fff7ed" }}>
          <Typography variant="caption" sx={{ color: "#92400e", fontWeight: 700 }}>
            {file.review_reason ?? file.validation_messages?.join(" · ")}
          </Typography>
        </Box>
      ) : null}

      <Grid container spacing={0}>
        {entries.map(([key, value]) => {
          const evidenceForField = file.extracted_evidence?.[key];
          const label = isFinancialField(key) ? FINANCIAL_FIELD_LABELS[key] : key;
          const editable = !alreadyImported && key in draft;
          return (
            <Grid key={key} size={{ xs: 12, md: 6, xl: 4 }}>
              <Box
                sx={{
                  minHeight: 148,
                  p: 1.25,
                  borderRight: { md: "1px solid #edf2f7" },
                  borderBottom: "1px solid #edf2f7",
                  bgcolor: editable ? "#ffffff" : "#fbfdff",
                }}
              >
                <Stack spacing={0.85}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                    <Typography sx={{ color: adminColors.text, fontSize: 13, fontWeight: 850, lineHeight: 1.35 }}>
                      {label}
                    </Typography>
                    <Typography
                      sx={{
                        color: adminColors.text,
                        fontSize: 13,
                        fontWeight: 900,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isFinancialField(key) && key.endsWith("_pct")
                        ? `${formatSourceValue(value)}%`
                        : formatSourceValue(value)}
                    </Typography>
                  </Stack>
                  {editable ? (
                    <TextField
                      size="small"
                      type="number"
                      fullWidth
                      label="แก้ค่าที่จะนำเข้า / Edit import value"
                      value={draft[key] ?? ""}
                      slotProps={{ htmlInput: { step: "any", inputMode: "decimal" } }}
                      onChange={(event) => onDraftChange(key, event.target.value)}
                    />
                  ) : null}
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{
                      color: evidenceForField?.source_text ? adminColors.text : adminColors.muted,
                      // Show the full evidence (so the matched figure is always
                      // visible) instead of clamping to 2–3 lines; cap the height
                      // and scroll long passages so cards keep a sane size.
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 132,
                      overflowY: "auto",
                      lineHeight: 1.4,
                    }}
                    title={evidenceForField?.source_text}
                  >
                    {evidenceForField?.source_text ?? "ไม่มีหลักฐานแถวต้นทาง / No source row evidence"}
                  </Typography>
                  {evidenceMeta(evidenceForField) ? (
                    <Typography variant="caption" sx={{ color: adminColors.muted, display: "block" }}>
                      {evidenceMeta(evidenceForField)}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {!alreadyImported ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{
            justifyContent: "flex-end",
            p: 1.25,
            bgcolor: "#ffffff",
          }}
        >
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={onReject}
            color="error"
            sx={{ textTransform: "none" }}
          >
            ไม่ใช้ไฟล์นี้ / Reject
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={busy || editableCount === 0}
            onClick={onImportEdited}
            sx={{ textTransform: "none" }}
          >
            นำค่าที่แก้เข้า / Save edited
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
            disabled={busy}
            onClick={onApprove}
            sx={{ textTransform: "none" }}
          >
            ใช้ค่าจาก Scraper / Import
          </Button>
        </Stack>
      ) : null}
    </Box>
  );
}

function SectionSourceFilesReview({
  ipoId,
  section,
  onApplyFinancialFields,
}: {
  ipoId: number;
  section: IpoSectionKey;
  onApplyFinancialFields: (fields: Partial<Record<FinancialNumberKey, number>>) => void;
}) {
  const [rows, setRows] = React.useState<SecSourceFileRow[]>([]);
  const [drafts, setDrafts] = React.useState<Record<number, Record<string, string>>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);

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

      const merged = [...(reviewJson.files ?? []), ...(importedJson.files ?? [])] as SecSourceFileRow[];
      const scoped = merged
        .filter((row) => sectionEntries(row, section).length > 0)
        .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
      const nextDrafts: Record<number, Record<string, string>> = {};
      for (const row of scoped) {
        nextDrafts[row.id] = initialSourceDraft(row, section);
      }
      setRows(scoped);
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [ipoId, section]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function review(
    row: SecSourceFileRow,
    action: "approved" | "rejected" | "edited",
    fields?: Partial<Record<FinancialNumberKey, number>>,
  ) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${row.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fields }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to submit review");

      if (action !== "rejected" && fields) {
        onApplyFinancialFields(fields);
      }
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function resolve(row: SecSourceFileRow) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${row.id}/resolve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to mark verified");
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Re-download the SEC document and re-extract it with the latest parser. This
   * regenerates the evidence (so a previously-truncated source_text shows the
   * full matched figure) and keeps the file staged for confirmation — it does
   * NOT write to the main database unless hands-off auto-import is enabled. Use
   * the Approve button to confirm the values into the production financials.
   * Reloads the list afterwards; if auto-import is on and it imported, the
   * values are pushed into the form too.
   */
  async function reprocess(row: SecSourceFileRow) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/upcoming/source-files/${row.id}/reprocess`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to reprocess");
      if (json?.imported && json?.file) {
        const applied = numericFieldsFromSource(json.file as SecSourceFileRow, section);
        if (Object.keys(applied).length > 0) onApplyFinancialFields(applied);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          border: "1px solid #dbe4ef",
          borderRadius: "8px",
          bgcolor: "#f8fafc",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <CircularProgress size={18} />
        <Typography variant="body2" sx={{ color: adminColors.muted }}>
          กำลังโหลดไฟล์ ก.ล.ต. จาก scraper / Loading SEC scraper files...
        </Typography>
      </Box>
    );
  }

  if (!error && rows.length === 0) return null;

  return (
    <Box
      sx={{
        mb: 2,
        border: "1px solid #c7e0f4",
        borderRadius: "8px",
        bgcolor: "#f8fbff",
        overflow: "hidden",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          px: 1.5,
          py: 1.25,
          borderBottom: rows.length > 0 ? "1px solid #dbeafe" : 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: adminColors.text, fontWeight: 900, fontSize: 14 }}>
            ไฟล์ ก.ล.ต. จาก Scraper ในหมวดนี้ / SEC scraper data for this section
          </Typography>
          <Typography variant="caption" sx={{ color: adminColors.muted }}>
            แก้ค่าที่ scraper ดึงมาในกล่องนี้ แล้วนำเข้าได้ทันที / Edit extracted values here, then import.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          disabled={loading}
          onClick={() => void load()}
          sx={{ textTransform: "none" }}
        >
          รีเฟรช / Refresh
        </Button>
      </Stack>

      {error ? (
        <Box sx={{ px: 1.5, py: 1, bgcolor: "#fff1f2", borderTop: "1px solid #fecdd3" }}>
          <Typography variant="body2" sx={{ color: adminColors.rose }}>
            {error}
          </Typography>
        </Box>
      ) : null}

      {rows.length > 0 ? (
        <Stack spacing={1.25} sx={{ p: 1.25 }}>
          {rows.map((row) => {
            const draft = drafts[row.id] ?? {};
            return (
              <SectionSourceFileCard
                key={row.id}
                file={row}
                section={section}
                draft={draft}
                busy={busy === row.id}
                onDraftChange={(key, value) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [row.id]: { ...(prev[row.id] ?? {}), [key]: value },
                  }))
                }
                onApprove={() => void review(row, "approved", numericFieldsFromSource(row, section))}
                onImportEdited={() => void review(row, "edited", numericFieldsFromDraft(draft))}
                onReject={() => void review(row, "rejected")}
                onResolve={() => void resolve(row)}
                onReprocess={() => void reprocess(row)}
              />
            );
          })}
        </Stack>
      ) : null}
    </Box>
  );
}

export default function IpoForm({
  ipo,
  financials,
  isNew,
  evidence = {},
}: {
  ipo: Partial<IpoRow>;
  financials?: Partial<IpoFinancialsRow> | null;
  isNew?: boolean;
  evidence?: Record<string, IpoFieldEvidence>;
}) {
  const router = useRouter();
  const { underwriters } = useDropdownOptions();
  const [state, setState] = React.useState<FormState>({
    ...ipo,
    listing_date: toDateOnly(ipo.listing_date) || null,
    financials: financials ?? {},
  });
  const [busy, setBusy] = React.useState(false);

  const canVerify = !isNew && ipo.id != null && state.status === "upcoming";
  const ipoId = Number(ipo.id);
  const canReviewSourceFiles = canVerify && Number.isInteger(ipoId);

  function patch<K extends keyof IpoRow>(key: K, value: IpoRow[K] | null) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function patchFin<K extends keyof IpoFinancialsRow>(
    key: K,
    value: IpoFinancialsRow[K] | null,
  ) {
    setState((s) => ({ ...s, financials: { ...(s.financials ?? {}), [key]: value } }));
  }

  function applyFinancialFields(fields: Partial<Record<FinancialNumberKey, number>>) {
    setState((s) => ({ ...s, financials: { ...(s.financials ?? {}), ...fields } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const confirm = await Swal.fire({
      title: isNew ? "สร้าง IPO ใหม่?" : `บันทึกการแก้ไข`,
      text: isNew
        ? `ชื่อย่อ "${state.symbol}" จะถูกเพิ่มเข้าฐานข้อมูล`
        : "ระบบจะบันทึกการเปลี่ยนแปลงลงฐานข้อมูลทันที",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: isNew ? "สร้าง" : "บันทึก",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#0284c7",
    });
    if (!confirm.isConfirmed) return;

    setBusy(true);

    // Show loading overlay (blocking) while we save
    Swal.fire({
      title: isNew ? "กำลังสร้าง / Creating…" : "กำลังบันทึก / Saving…",
      html: `<span style="color:#475569">${isNew ? "สร้าง" : "อัปเดต"} <b>${state.symbol ?? ""}</b> ลงฐานข้อมูล</span>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const method = isNew ? "POST" : "PATCH";
      const url = isNew ? "/api/ipo/ipos" : `/api/ipo/ipos/${ipo.id}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      const data = await res.json();

      Swal.close();
      await Swal.fire({
        title: isNew ? "สร้างสำเร็จ" : "บันทึกสำเร็จ",
        text: isNew
          ? `IPO "${state.symbol}" ถูกสร้างเรียบร้อยแล้ว`
          : `IPO "${state.symbol}" ถูกอัปเดตแล้ว`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      if (isNew && data.id) {
        router.push(`/ipo/ipos/${data.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      Swal.close();
      const message = err instanceof Error ? err.message : String(err);
      await Swal.fire({
        title: "เกิดข้อผิดพลาด",
        text: message,
        icon: "error",
        confirmButtonText: "ตกลง",
        confirmButtonColor: "#be123c",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2.5}>
        <IpoAccordionPanel
          title="ข้อมูลหลัก / Identity"
          subtitle="ข้อมูลการเข้าตลาดที่ใช้ในระบบ admin / Core listing information used across the admin console"
          defaultExpanded
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                required
                label="ชื่อย่อ / Symbol"
                value={state.symbol ?? ""}
                onChange={(e) => patch("symbol", e.target.value.toUpperCase())}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                select
                label="สถานะ / Status"
                value={state.status ?? "listed"}
                onChange={(e) => patch("status", e.target.value as IpoRow["status"])}
              >
                <MenuItem value="upcoming">IPO กำลังจะเข้า</MenuItem>
                <MenuItem value="listed">จดทะเบียนแล้ว / Listed</MenuItem>
                <MenuItem value="cancelled">ยกเลิก / Cancelled</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="วันที่เข้าเทรด / Listing date"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={state.listing_date ?? ""}
                onChange={(e) => patch("listing_date", e.target.value || null)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <NumField
                label="ราคา IPO / IPO price"
                value={state.ipo_price}
                onChange={(v) => patch("ipo_price", v)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="ตลาด / Market"
                value={state.market ?? ""}
                onChange={(e) => patch("market", e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="กลุ่มอุตสาหกรรม / Industry"
                value={state.industry ?? ""}
                onChange={(e) => patch("industry", e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="หมวดธุรกิจ / Sector"
                value={state.sector ?? ""}
                onChange={(e) => patch("sector", e.target.value)}
              />
            </Grid>
          </Grid>
        </IpoAccordionPanel>

        <IpoAccordionPanel
          title="FA และผู้จัดจำหน่าย / FA and underwriters"
          subtitle="กรอก 1 รายการต่อ 1 บรรทัด / Enter one person or company per line"
          defaultExpanded={false}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                label="บุคคล FA / FA persons"
                value={arrToInput(state.fa_persons)}
                onChange={(e) => patch("fa_persons", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                label="บริษัท FA / FA companies"
                value={arrToInput(state.fa_companies)}
                onChange={(e) => patch("fa_companies", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={underwriters}
                value={state.lead_uw ?? []}
                onChange={(_e, v) => patch("lead_uw", v.length ? v : null)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="ผู้จัดจำหน่ายหลัก / Lead underwriter"
                    placeholder="พิมพ์ชื่อ Lead Underwriter"
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={underwriters}
                value={state.co_uws ?? []}
                onChange={(_e, v) => patch("co_uws", v.length ? v : null)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="ผู้จัดจำหน่ายร่วม / Co-underwriters"
                    placeholder="พิมพ์ชื่อ Co-Underwriter"
                  />
                )}
              />
            </Grid>
          </Grid>
        </IpoAccordionPanel>

        <IpoAccordionPanel
          title="ราคาวันแรก / Day-1 prices"
          subtitle="ผลการซื้อขายวันแรก / First trading day performance"
          defaultExpanded={false}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="เปิด / Open" value={state.open_d1} onChange={(v) => patch("open_d1", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="สูงสุด / High" value={state.high_d1} onChange={(v) => patch("high_d1", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="ต่ำสุด / Low" value={state.low_d1} onChange={(v) => patch("low_d1", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="ปิด / Close" value={state.close_d1} onChange={(v) => patch("close_d1", v)} />
            </Grid>
          </Grid>
        </IpoAccordionPanel>

        <IpoAccordionPanel
          title="ราคาปิดหลัง IPO / Post-IPO closes"
          subtitle="ราคาปิดหลังเข้าตลาด / Closing prices after listing"
          defaultExpanded={false}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D2" value={state.close_d2} onChange={(v) => patch("close_d2", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D3" value={state.close_d3} onChange={(v) => patch("close_d3", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D4" value={state.close_d4} onChange={(v) => patch("close_d4", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D5" value={state.close_d5} onChange={(v) => patch("close_d5", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="1W" value={state.close_1w} onChange={(v) => patch("close_1w", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="1M" value={state.close_1m} onChange={(v) => patch("close_1m", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="3M" value={state.close_3m} onChange={(v) => patch("close_3m", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="6M" value={state.close_6m} onChange={(v) => patch("close_6m", v)} />
            </Grid>
          </Grid>
        </IpoAccordionPanel>

        <IpoAccordionPanel
          title="ข้อมูลการเงิน / Financials"
          subtitle="โครงสร้างเสนอขายและงบการเงินล่าสุด / Offering structure and latest financial statements"
          defaultExpanded={false}
        >
          {canReviewSourceFiles ? (
            <SectionSourceFilesReview
              ipoId={ipoId}
              section="financials"
              onApplyFinancialFields={applyFinancialFields}
            />
          ) : null}
          <FinancialFields
            financials={state.financials}
            evidence={evidence}
            onPatch={(key, value) => patchFin(key, value)}
          />
        </IpoAccordionPanel>

        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={busy}>
            {busy ? "กำลังบันทึก... / Saving..." : isNew ? "สร้าง IPO / Create IPO" : "บันทึกการแก้ไข / Save changes"}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
