import { query, buildInsert, buildUpsert, buildUpdate } from "./db";
import {
  extractSecSourceFile,
  type SecFileExtraction,
  type SecLogger,
} from "./sec-extractor";

// ---------------------------------------------------------------------------
// SEC source-file staging registry (metadata only).
// Records each financial-statement file downloaded from ก.ล.ต. with its
// format/column inspection, new/changed detection, and validation outcome.
// Mirrors the schema in db/migrations/0015_sec_source_files.sql.
// ---------------------------------------------------------------------------

export type SecSourceFileStatus =
  | "imported"
  | "needs_review"
  | "unchanged"
  | "no_data"
  | "error";

export type SecSourceDataStatus = "new" | "changed" | "unchanged";

export type SecSourceValidationStatus = "passed" | "failed" | "skipped";

/** Numeric fields the financial-statement parser can produce. */
export interface FsFinancialFields {
  gross_proceeds?: number;
  total_expense?: number;
  offered_shares?: number;
  offered_ratio_pct?: number;
  existing_shares_pct?: number;
  executive_total_pct?: number;
  total_assets?: number;
  total_liabilities?: number;
  total_equity?: number;
  revenue_latest?: number;
  revenue_prev?: number;
  net_income_latest?: number;
  net_income_prev?: number;
}

export interface SecSourceEvidence {
  field_name: string;
  extracted_value: unknown;
  source_text: string;
  source_file?: string | null;
  sheet_name?: string | null;
  row_number?: number | null;
  column_name?: string | null;
  /** How the value was located: e.g. "xlsx-row-scan", "xlsx-derived", "regex-keyword". */
  extraction_method?: string | null;
  parser?: string | null;
}

export interface SecSourceFileInsert {
  run_id?: string | null;
  symbol: string;
  ipo_id?: number | null;
  sec_trans_id?: string | null;
  trans_file_seq?: number | null;
  source_url?: string | null;
  file_name?: string | null;
  file_kind?: string | null;
  byte_size?: number | null;
  content_sha256?: string | null;
  sheet_names?: string[] | null;
  recognized_sheets?: string[] | null;
  unknown_sheets?: string[] | null;
  format_ok?: boolean | null;
  extracted_fields?: Record<string, unknown> | null;
  extracted_evidence?: Record<string, SecSourceEvidence> | null;
  data_status?: SecSourceDataStatus | null;
  validation_status?: SecSourceValidationStatus | null;
  validation_messages?: string[] | null;
  status: SecSourceFileStatus;
  review_reason?: string | null;
  // Review / import gating (mirrors db/migrations/0017_sec_review_workflow.sql).
  review_action?: "approved" | "rejected" | "edited" | null;
  final_fields?: Record<string, unknown> | null;
  imported?: boolean | null;
  imported_at?: string | null;
  import_method?: "auto" | "manual" | null;
}

export interface SecSourceFileRow {
  id: number;
  run_id: string | null;
  symbol: string;
  ipo_id: number | null;
  sec_trans_id: string | null;
  trans_file_seq: number | null;
  source_url: string | null;
  file_name: string | null;
  file_kind: string | null;
  byte_size: number | null;
  content_sha256: string | null;
  sheet_names: string[] | null;
  recognized_sheets: string[] | null;
  unknown_sheets: string[] | null;
  format_ok: boolean | null;
  extracted_fields: Record<string, unknown> | null;
  extracted_evidence: Record<string, SecSourceEvidence> | null;
  data_status: SecSourceDataStatus | null;
  validation_status: SecSourceValidationStatus | null;
  validation_messages: string[] | null;
  status: SecSourceFileStatus;
  review_reason: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  detected_at: string;
}

/**
 * Insert a sec_source_files row. Best-effort: never throws — staging metadata
 * must never break the scrape itself.
 */
export async function recordSecSourceFile(
  row: SecSourceFileInsert,
): Promise<void> {
  try {
    const data: Record<string, unknown> = { ...row };
    if (row.extracted_fields !== undefined && row.extracted_fields !== null) {
      data.extracted_fields = JSON.stringify(row.extracted_fields);
    }
    if (row.extracted_evidence !== undefined && row.extracted_evidence !== null) {
      data.extracted_evidence = JSON.stringify(row.extracted_evidence);
    }
    if (row.final_fields !== undefined && row.final_fields !== null) {
      data.final_fields = JSON.stringify(row.final_fields);
    }
    const { text, values } = buildInsert("sec_source_files", data);
    await query(text, values);
  } catch (err) {
    console.error("[sec-source-files] Failed to record source file:", err);
  }
}

/** Numeric columns that exist on ipo_financials and may be imported. */
const IPO_FINANCIAL_COLUMNS: (keyof FsFinancialFields)[] = [
  "gross_proceeds",
  "total_expense",
  "offered_shares",
  "offered_ratio_pct",
  "existing_shares_pct",
  "executive_total_pct",
  "total_assets",
  "total_liabilities",
  "total_equity",
  "revenue_latest",
  "revenue_prev",
  "net_income_latest",
  "net_income_prev",
];

/**
 * Upsert validated financial fields into ipo_financials. Only writes the
 * recognized numeric columns that are present (non-null/finite) in `fields`.
 * Returns the list of columns actually written. Throws on DB error so callers
 * can decide whether to mark the source file as error/needs_review.
 */
export async function importFsFinancials(
  ipoId: number,
  fields: FsFinancialFields,
): Promise<(keyof FsFinancialFields)[]> {
  const data: Record<string, unknown> = { ipo_id: ipoId };
  const written: (keyof FsFinancialFields)[] = [];
  for (const col of IPO_FINANCIAL_COLUMNS) {
    const v = fields[col];
    if (typeof v === "number" && Number.isFinite(v)) {
      data[col] = v;
      written.push(col);
    }
  }
  if (written.length === 0) return [];
  const { text, values } = buildUpsert("ipo_financials", data, "ipo_id", written);
  await query(text, values);
  return written;
}

/**
 * Return the most recent recorded sha256 for a TransID, used to decide whether
 * a freshly downloaded file is new / changed / unchanged.
 */
export async function getLatestShaForTransId(
  transId: string,
): Promise<string | null> {
  try {
    const rows = await query<{ content_sha256: string | null }>(
      `SELECT content_sha256 FROM sec_source_files
       WHERE sec_trans_id = $1 AND content_sha256 IS NOT NULL
       ORDER BY detected_at DESC LIMIT 1`,
      [transId],
    );
    return rows[0]?.content_sha256 ?? null;
  } catch (err) {
    console.error("[sec-source-files] Failed to read latest sha:", err);
    return null;
  }
}

/**
 * Read the currently-stored financial values for an IPO. Used by the pipeline
 * to skip staging files whose extracted numbers already match the database.
 * Returns null when no ipo_financials row exists yet. Never throws.
 */
export async function getIpoFinancials(
  ipoId: number,
): Promise<FsFinancialFields | null> {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT ${IPO_FINANCIAL_COLUMNS.join(", ")}
         FROM ipo_financials WHERE ipo_id = $1`,
      [ipoId],
    );
    if (rows.length === 0) return null;
    const out: FsFinancialFields = {};
    for (const col of IPO_FINANCIAL_COLUMNS) {
      // pg returns NUMERIC columns as strings and DOUBLE PRECISION as numbers;
      // coerce both so the comparison is numeric.
      const num = Number(rows[0][col]);
      if (rows[0][col] != null && Number.isFinite(num)) out[col] = num;
    }
    return out;
  } catch (err) {
    console.error("[sec-source-files] Failed to read ipo_financials:", err);
    return null;
  }
}

export interface GetSecSourceFilesOpts {
  ipoId?: number;
  status?: SecSourceFileStatus;
  resolved?: boolean;
  limit?: number;
}

export async function getSecSourceFiles(
  opts: GetSecSourceFilesOpts = {},
): Promise<SecSourceFileRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.ipoId !== undefined) {
    params.push(opts.ipoId);
    conditions.push(`ipo_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    conditions.push(`status = $${params.length}`);
  }
  if (opts.resolved !== undefined) {
    params.push(opts.resolved);
    conditions.push(`resolved = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  params.push(limit);
  return query<SecSourceFileRow>(
    `SELECT * FROM sec_source_files
     ${where}
     ORDER BY detected_at DESC
     LIMIT $${params.length}`,
    params,
  );
}

export type SecReviewAction = "approved" | "rejected" | "edited";

export interface ReviewSourceFileResult {
  id: number;
  review_action: SecReviewAction;
  imported: boolean;
  imported_fields: string[];
}

export interface ReprocessSourceFileResult {
  id: number;
  status: SecSourceFileStatus;
  data_status: SecSourceDataStatus;
  validation_status: SecSourceValidationStatus;
  review_reason: string | null;
  imported: boolean;
  imported_fields: string[];
  file: SecSourceFileRow;
  logs: string[];
}

function sourceFileHasNumericFields(fields: Record<string, unknown>): boolean {
  return Object.values(fields).some(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
}

function buildReprocessLogger(): SecLogger & { lines: string[] } {
  const lines: string[] = [];
  const push = (level: string, msg: string) => {
    lines.push(`${level}: ${msg}`);
    if (lines.length > 60) lines.shift();
  };
  return {
    lines,
    log: (msg) => push("log", msg),
    warn: (msg) => push("warn", msg),
    error: (msg) => push("error", msg),
  };
}

function mergedValidation(file: SecFileExtraction): {
  status: SecSourceValidationStatus;
  messages: string[];
} {
  const fields = file.fields as FsFinancialFields;
  const sanity = sourceFileHasNumericFields(file.fields)
    ? validateFsFinancials(fields)
    : { ok: true, messages: [] as string[] };
  const messages = Array.from(new Set([...file.validation_messages, ...sanity.messages]));
  return {
    status: file.validation_status === "failed" || !sanity.ok ? "failed" : file.validation_status,
    messages,
  };
}

function reprocessReviewReason(
  file: SecFileExtraction,
  validationStatus: SecSourceValidationStatus,
  hasNumbers: boolean,
  canImport: boolean,
  extractionValid: boolean,
): string | null {
  if (!hasNumbers) {
    return file.review_reason ?? "no numeric fields extracted";
  }
  if (canImport) return null;
  const reasons: string[] = [];
  if (!file.format_ok) reasons.push("unrecognized format/columns");
  if (validationStatus === "failed") reasons.push("sanity validation failed");
  if (reasons.length > 0) return reasons.join("; ");
  // Nothing wrong with the data — it is simply awaiting confirmation.
  return extractionValid ? AWAITING_CONFIRMATION_REASON : "requires review";
}

export async function reprocessSourceFile(
  id: number,
): Promise<ReprocessSourceFileResult> {
  const rows = await query<SecSourceFileRow>(
    "SELECT * FROM sec_source_files WHERE id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error(`Source file ${id} not found`);
  if (!row.source_url) throw new Error(`Source file ${id} has no source_url`);

  const log = buildReprocessLogger();
  const file = await extractSecSourceFile(row.source_url, log);
  if (!file) throw new Error(`Could not re-extract source file ${id}`);

  const fields = file.fields as FsFinancialFields;
  const hasNumbers = sourceFileHasNumericFields(file.fields);
  const validation = mergedValidation(file);
  const dataStatus: SecSourceDataStatus =
    row.content_sha256 && row.content_sha256 === file.content_sha256 ? "unchanged" : "changed";

  let imported = false;
  let importedFields: string[] = [];
  let status: SecSourceFileStatus = hasNumbers ? "needs_review" : "no_data";
  const extractionValid = isAutoImportable({
    formatOk: file.format_ok,
    validationStatus: validation.status,
    hasNumericFields: hasNumbers,
  });
  // Reprocess re-extracts (refreshing values + evidence); it does NOT count as
  // a confirmation. So it only writes to ipo_financials when hands-off import is
  // explicitly enabled — otherwise the refreshed file stays staged for the user
  // to confirm via Approve.
  const canAutoImport = row.ipo_id !== null && secAutoImportEnabled() && extractionValid;

  if (canAutoImport) {
    importedFields = await importFsFinancials(row.ipo_id!, fields);
    imported = true;
    status = "imported";
  }

  const reviewReason = reprocessReviewReason(
    file,
    validation.status,
    hasNumbers,
    canAutoImport,
    extractionValid,
  );
  const now = new Date().toISOString();
  const { text, values } = buildUpdate(
    "sec_source_files",
    {
      source_url: file.source_url,
      file_name: file.file_name,
      file_kind: file.file_kind,
      byte_size: file.byte_size,
      content_sha256: file.content_sha256,
      trans_file_seq: file.trans_file_seq,
      sheet_names: file.sheet_names,
      recognized_sheets: file.recognized_sheets,
      unknown_sheets: file.unknown_sheets,
      format_ok: file.format_ok,
      extracted_fields: JSON.stringify(file.fields),
      extracted_evidence: JSON.stringify(file.evidence),
      data_status: dataStatus,
      validation_status: validation.status,
      validation_messages: validation.messages,
      status,
      review_reason: reviewReason,
      final_fields: imported ? JSON.stringify(fields) : null,
      imported,
      imported_at: imported ? now : null,
      import_method: imported ? "auto" : null,
      review_action: null,
      resolved: false,
      resolved_by: null,
      resolved_at: null,
      detected_at: now,
    },
    "id = $1",
    [id],
  );
  await query(text, values);

  const updatedRows = await query<SecSourceFileRow>(
    "SELECT * FROM sec_source_files WHERE id = $1",
    [id],
  );
  const updated = updatedRows[0];
  if (!updated) throw new Error(`Source file ${id} disappeared after reprocess`);

  return {
    id,
    status,
    data_status: dataStatus,
    validation_status: validation.status,
    review_reason: reviewReason,
    imported,
    imported_fields: importedFields,
    file: updated,
    logs: log.lines,
  };
}

/**
 * Apply a manual review decision to a staged source file.
 *
 * - approved: import the originally-extracted fields into ipo_financials.
 * - edited:   import the reviewer-supplied `fields` instead (audited in final_fields).
 * - rejected: leave ipo_financials untouched; just close out the review.
 *
 * Every path records who/when (resolved_by, resolved_at) for the audit trail.
 * Throws on bad input or DB error so the route can surface a 4xx/5xx.
 */
export async function reviewSourceFile(
  id: number,
  action: SecReviewAction,
  opts: { fields?: FsFinancialFields; reviewer?: string | null } = {},
): Promise<ReviewSourceFileResult> {
  const rows = await query<SecSourceFileRow>(
    "SELECT * FROM sec_source_files WHERE id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error(`Source file ${id} not found`);

  const reviewer = opts.reviewer ?? null;
  const now = new Date().toISOString();

  if (action === "rejected") {
    const { text, values } = buildUpdate(
      "sec_source_files",
      {
        review_action: "rejected",
        imported: false,
        resolved: true,
        resolved_by: reviewer,
        resolved_at: now,
      },
      "id = $1",
      [id],
    );
    await query(text, values);
    return { id, review_action: "rejected", imported: false, imported_fields: [] };
  }

  // approved | edited → import into ipo_financials.
  if (!row.ipo_id) {
    throw new Error(`Source file ${id} has no ipo_id; cannot import`);
  }
  const finalFields: FsFinancialFields =
    action === "edited"
      ? opts.fields ?? {}
      : (row.extracted_fields as FsFinancialFields) ?? {};

  const written = await importFsFinancials(row.ipo_id, finalFields);

  const { text, values } = buildUpdate(
    "sec_source_files",
    {
      review_action: action,
      final_fields: JSON.stringify(finalFields),
      imported: true,
      imported_at: now,
      import_method: "manual",
      status: "imported",
      resolved: true,
      resolved_by: reviewer,
      resolved_at: now,
    },
    "id = $1",
    [id],
  );
  await query(text, values);
  return { id, review_action: action, imported: true, imported_fields: written };
}

/**
 * Decide whether a staged source file may be auto-imported into ipo_financials
 * WITHOUT human review.
 *
 * A file qualifies when it carries at least one numeric field, its format was
 * recognized, and sanity validation did not FAIL. Crucially, `"skipped"` counts
 * as acceptable: prose offering documents (DOCX/HTML) have no accounting
 * identity to check, so the extractor marks them `"skipped"` instead of
 * `"passed"`. The old gate required `=== "passed"`, which silently parked every
 * prose-only field — offered_shares, offered_ratio_pct, gross_proceeds,
 * total_expense, executive_total_pct — in `needs_review` forever. The values
 * were extracted correctly but never reached ipo_financials, so the UI showed
 * them as missing (e.g. PETPAL's "หุ้นเสนอขาย / Offered shares").
 *
 * This is intentionally generic: it keys off the validation outcome, never off
 * a specific symbol or file.
 */
export function isAutoImportable(args: {
  formatOk: boolean;
  validationStatus: SecSourceValidationStatus;
  hasNumericFields: boolean;
}): boolean {
  return (
    args.hasNumericFields &&
    args.formatOk &&
    (args.validationStatus === "passed" || args.validationStatus === "skipped")
  );
}

/**
 * Whether the SEC pipeline may write extracted values straight into the live
 * `ipo_financials` table.
 *
 * OFF by default: scraped figures are staged in `sec_source_files` as
 * `needs_review` (with full evidence) and only reach the production financials
 * after a human confirms them in the review UI — nothing from the scraper hits
 * the main database unverified. Set `SEC_PIPELINE_AUTO_IMPORT=1` (or true/yes/on)
 * to opt back into hands-off importing.
 *
 * `isAutoImportable()` still decides whether an extraction is VALID/complete
 * enough to import; this flag decides whether that import happens automatically
 * or waits for confirmation.
 */
export function secAutoImportEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.SEC_PIPELINE_AUTO_IMPORT ?? "0").toLowerCase(),
  );
}

/**
 * Review reason for a file whose values are valid and complete, but which is
 * held in needs_review because auto-import is disabled — it is waiting for a
 * human to confirm it into the production financials, not flagged for an error.
 */
export const AWAITING_CONFIRMATION_REASON =
  "รอยืนยันก่อนนำเข้าฐานข้อมูลหลัก / awaiting confirmation before import";

/**
 * Lightweight sanity validation of parsed financial-statement numbers.
 * NOTE: this only fails on clear inconsistencies (bad accounting identity,
 * impossible negatives) — NOT on missing fields. Missing data is handled
 * separately by the completeness / run_validations() system.
 */
export function validateFsFinancials(fields: FsFinancialFields): {
  ok: boolean;
  messages: string[];
} {
  const messages: string[] = [];
  const {
    total_assets,
    total_liabilities,
    total_equity,
    revenue_latest,
    offered_shares,
  } = fields;

  // Accounting identity: assets ≈ liabilities + equity (1% tolerance).
  if (
    typeof total_assets === "number" &&
    typeof total_liabilities === "number" &&
    typeof total_equity === "number"
  ) {
    const expected = total_liabilities + total_equity;
    const tolerance = Math.max(1, Math.abs(total_assets) * 0.01);
    if (Math.abs(total_assets - expected) > tolerance) {
      messages.push(
        `Accounting identity off: total_assets=${total_assets} but liabilities+equity=${expected}`,
      );
    }
  }

  // Values that must never be negative.
  if (typeof total_assets === "number" && total_assets < 0) {
    messages.push(`total_assets is negative (${total_assets})`);
  }
  if (typeof total_equity === "number" && total_equity < -Math.abs(total_assets ?? 0)) {
    messages.push(`total_equity is implausibly negative (${total_equity})`);
  }
  if (typeof revenue_latest === "number" && revenue_latest < 0) {
    messages.push(`revenue_latest is negative (${revenue_latest})`);
  }
  if (typeof offered_shares === "number" && offered_shares <= 0) {
    messages.push(`offered_shares must be positive (${offered_shares})`);
  }

  return { ok: messages.length === 0, messages };
}
