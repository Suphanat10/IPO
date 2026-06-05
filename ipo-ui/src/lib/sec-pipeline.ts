import {
  extractSecFiling,
  extractTransId,
  type SecFileExtraction,
  type SecLogger,
} from "./sec-extractor";

/**
 * Wrap a logger so every line is tagged with the symbol. The extractor's
 * per-file lines ("SEC docs: FS size = …", "total_assets = …") carry no symbol,
 * so when several filings run concurrently their lines interleave and look like
 * one company's numbers contradicting itself. Tagging makes each line
 * attributable to the filing that produced it.
 */
function symbolTaggedLogger(log: SecLogger, symbol: string): SecLogger {
  const tag = (msg: string) => `[SEC] ${symbol} |${msg}`;
  return {
    log: (msg) => log.log(tag(msg)),
    warn: (msg) => log.warn(tag(msg)),
    error: (msg) => log.error(tag(msg)),
  };
}
import {
  recordSecSourceFile,
  getLatestShaForTransId,
  getIpoFinancials,
  importFsFinancials,
  validateFsFinancials,
  type FsFinancialFields,
  type SecSourceDataStatus,
  type SecSourceValidationStatus,
} from "./sec-source-files";

// ---------------------------------------------------------------------------
// SEC pipeline orchestrator.
//
// For each target IPO with a filing URL:
//   1. extract every related file (Excel/CSV/prose) with full evidence,
//   2. drop the file entirely (record nothing) when every extracted value
//      already matches ipo_financials — nothing new to stage or review,
//   3. detect new / changed / unchanged via content_sha256,
//   4. stage each file into sec_source_files (metadata + evidence only),
//   5. auto-import into ipo_financials ONLY when the file's format is valid
//      and sanity validation passed,
//   6. everything else is parked as needs_review for the manual dashboard.
//
// No number is ever written to ipo_financials without its evidence first being
// persisted in sec_source_files (extracted_evidence / final_fields).
// ---------------------------------------------------------------------------

export interface SecPipelineTarget {
  ipoId: number;
  symbol: string;
  filingUrl: string;
}

export interface SecPipelineSummary {
  filingsProcessed: number;
  filesStaged: number;
  autoImported: number;
  needsReview: number;
  noData: number;
  unchanged: number;
  /** Files dropped without recording because every extracted value matched the DB. */
  skipped: number;
  errors: number;
}

/** Per-IPO rollup, attached to each scrape_run_items.scraped_data.sec. */
export interface SecTargetSummary {
  files: number;
  auto_imported: number;
  imported_fields: string[];
  needs_review: number;
  no_data: number;
  unchanged: number;
  skipped: number;
  errors: number;
}

export interface SecTargetResult extends SecTargetSummary {
  ipoId: number;
  symbol: string;
}

function emptyTargetSummary(): SecTargetSummary {
  return {
    files: 0,
    auto_imported: 0,
    imported_fields: [],
    needs_review: 0,
    no_data: 0,
    unchanged: 0,
    skipped: 0,
    errors: 0,
  };
}

/**
 * How many filings to extract/stage concurrently. Each filing is mostly
 * network-bound (downloading several SEC documents), so overlapping a handful
 * of them collapses the wall-clock time without hammering the SEC server.
 */
const DEFAULT_CONCURRENCY = 4;

function pipelineConcurrency(): number {
  const raw = Number(process.env.SEC_PIPELINE_CONCURRENCY);
  return Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : DEFAULT_CONCURRENCY;
}

function hasNumericFields(fields: Record<string, unknown>): boolean {
  return Object.values(fields).some(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
}

/**
 * True when EVERY numeric field this file extracted already exists in the DB
 * with an equal value. Such a file adds nothing to ipo_financials, so the
 * pipeline drops it without recording. A tiny tolerance absorbs float
 * representation noise only — values must otherwise match exactly.
 */
function extractedFieldsMatchDb(
  extracted: FsFinancialFields,
  db: FsFinancialFields,
): boolean {
  let compared = 0;
  for (const [key, ev] of Object.entries(extracted)) {
    if (typeof ev !== "number" || !Number.isFinite(ev)) continue;
    compared++;
    const dv = db[key as keyof FsFinancialFields];
    if (typeof dv !== "number" || !Number.isFinite(dv)) return false;
    if (Math.abs(ev - dv) > Math.max(1e-6, Math.abs(ev) * 1e-6)) return false;
  }
  return compared > 0;
}

async function detectDataStatus(
  transId: string | null,
  sha: string,
): Promise<SecSourceDataStatus> {
  if (!transId) return "new";
  const prev = await getLatestShaForTransId(transId);
  if (!prev) return "new";
  return prev === sha ? "unchanged" : "changed";
}

/** Process a single extracted file: detect change, stage, and maybe import. */
async function processFile(
  target: SecPipelineTarget,
  runId: string | null,
  secTransId: string | null,
  file: SecFileExtraction,
  log: SecLogger,
  summary: SecPipelineSummary,
  targetSummary: SecTargetSummary,
): Promise<void> {
  const fields = file.fields as FsFinancialFields;

  // Skip entirely (record nothing) when every value this file extracted already
  // matches ipo_financials — re-staging would add no new information.
  if (hasNumericFields(file.fields)) {
    const dbFields = await getIpoFinancials(target.ipoId);
    if (dbFields && extractedFieldsMatchDb(fields, dbFields)) {
      summary.skipped++;
      targetSummary.skipped++;
      log.log(
        `  [SEC] ${target.symbol} ${file.file_name ?? file.source_url}: matches DB, skipped (not recorded)`,
      );
      return;
    }
  }

  const dataStatus = await detectDataStatus(secTransId, file.content_sha256);

  // Re-run sanity validation against the financial-field shape so the staging
  // row's validation result is consistent with the import gate below.
  const sanity = hasNumericFields(file.fields)
    ? validateFsFinancials(fields)
    : { ok: true, messages: [] as string[] };
  const validationMessages = [
    ...file.validation_messages,
    ...sanity.messages,
  ];
  const validationStatus: SecSourceValidationStatus =
    file.validation_status === "failed" || !sanity.ok
      ? "failed"
      : file.validation_status;

  const base = {
    run_id: runId,
    symbol: target.symbol,
    ipo_id: target.ipoId,
    sec_trans_id: secTransId,
    trans_file_seq: file.trans_file_seq,
    source_url: file.source_url,
    file_name: file.file_name,
    file_kind: file.file_kind,
    byte_size: file.byte_size,
    content_sha256: file.content_sha256,
    sheet_names: file.sheet_names,
    recognized_sheets: file.recognized_sheets,
    unknown_sheets: file.unknown_sheets,
    format_ok: file.format_ok,
    extracted_fields: file.fields,
    extracted_evidence: file.evidence,
    data_status: dataStatus,
    validation_status: validationStatus,
    validation_messages: validationMessages,
  };

  summary.filesStaged++;
  targetSummary.files++;

  // Unchanged files: nothing to import, just record for the version trail.
  if (dataStatus === "unchanged") {
    await recordSecSourceFile({
      ...base,
      status: "unchanged",
      review_reason: null,
    });
    summary.unchanged++;
    targetSummary.unchanged++;
    log.log(`  [SEC] ${target.symbol} ${file.file_name ?? file.source_url}: unchanged`);
    return;
  }

  // Files we couldn't pull any numbers from (e.g. prose docs that aren't a
  // financial statement) have nothing to import or review — park them as
  // no_data so they stay traceable but never clutter the review queue.
  if (!hasNumericFields(file.fields)) {
    await recordSecSourceFile({
      ...base,
      status: "no_data",
      review_reason: file.format_ok
        ? "no numeric fields extracted"
        : "unrecognized format; no numeric fields extracted",
    });
    summary.noData++;
    targetSummary.no_data++;
    log.log(`  [SEC] ${target.symbol} ${file.file_name ?? file.source_url}: no_data`);
    return;
  }

  const importable =
    file.format_ok &&
    validationStatus === "passed" &&
    hasNumericFields(file.fields);

  if (importable) {
    try {
      const written = await importFsFinancials(target.ipoId, fields);
      await recordSecSourceFile({
        ...base,
        status: "imported",
        review_reason: null,
        imported: true,
        imported_at: new Date().toISOString(),
        import_method: "auto",
        final_fields: fields as Record<string, unknown>,
      });
      summary.autoImported++;
      targetSummary.auto_imported++;
      for (const f of written) {
        if (!targetSummary.imported_fields.includes(f)) {
          targetSummary.imported_fields.push(f);
        }
      }
      log.log(
        `  [SEC] ${target.symbol} ${file.file_name ?? file.source_url}: auto-imported ${written.length} field(s)`,
      );
    } catch (err) {
      await recordSecSourceFile({
        ...base,
        status: "error",
        review_reason: `Auto-import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      summary.errors++;
      targetSummary.errors++;
      log.error(`  [SEC] ${target.symbol} auto-import failed: ${err}`);
    }
    return;
  }

  // Not importable → needs human review. Explain why.
  const reasons: string[] = [];
  if (!file.format_ok) reasons.push("unrecognized format/columns");
  if (validationStatus === "failed") reasons.push("sanity validation failed");

  await recordSecSourceFile({
    ...base,
    status: "needs_review",
    review_reason: reasons.join("; ") || "requires review",
  });
  summary.needsReview++;
  targetSummary.needs_review++;
  log.log(
    `  [SEC] ${target.symbol} ${file.file_name ?? file.source_url}: needs_review (${reasons.join("; ")})`,
  );
}

/**
 * Run the SEC extraction + staging + gated-import pipeline for a batch of IPOs.
 * Best-effort per filing: a failure on one filing never aborts the rest.
 */
export async function runSecPipeline(
  targets: SecPipelineTarget[],
  opts: {
    runId?: string | null;
    log: SecLogger;
    /** Called after each filing so callers can flush progress to the UI. */
    onProgress?: (done: number, total: number) => void | Promise<void>;
  },
): Promise<{ summary: SecPipelineSummary; perTarget: SecTargetResult[] }> {
  const { runId = null, log, onProgress } = opts;
  const summary: SecPipelineSummary = {
    filingsProcessed: 0,
    filesStaged: 0,
    autoImported: 0,
    needsReview: 0,
    noData: 0,
    unchanged: 0,
    skipped: 0,
    errors: 0,
  };
  const perTarget: SecTargetResult[] = [];
  const concurrency = pipelineConcurrency();

  log.log(
    `[SEC] pipeline start: ${targets.length} filing(s), concurrency=${concurrency}`,
  );

  // Extract + stage one filing. Files within a filing are processed
  // sequentially so per-TransID change detection (sha ordering) stays correct;
  // separate filings run concurrently via the worker pool below.
  async function processTarget(target: SecPipelineTarget): Promise<void> {
    if (!target.filingUrl) return;
    log.log(`[SEC] ${target.symbol}: fetching filing...`);
    const targetSummary = emptyTargetSummary();
    try {
      const result = await extractSecFiling(
        target.filingUrl,
        symbolTaggedLogger(log, target.symbol),
      );
      summary.filingsProcessed++;
      const secTransId = extractTransId(target.filingUrl);
      for (const file of result.files) {
        await processFile(target, runId, secTransId, file, log, summary, targetSummary);
      }
    } catch (err) {
      summary.errors++;
      targetSummary.errors++;
      log.error(`[SEC] filing failed for ${target.symbol}: ${err}`);
    }
    perTarget.push({ ipoId: target.ipoId, symbol: target.symbol, ...targetSummary });
  }

  // Bounded worker pool: each worker pulls the next target off a shared cursor
  // until the queue drains. JS is single-threaded, so the shared `summary` /
  // `cursor` mutations are safe between awaits (no real parallel writes).
  let cursor = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      await processTarget(target);
      done++;
      if (onProgress) await onProgress(done, targets.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length || 1) }, () =>
      worker(),
    ),
  );

  log.log(
    `[SEC] pipeline done: staged=${summary.filesStaged} auto=${summary.autoImported} review=${summary.needsReview} no_data=${summary.noData} unchanged=${summary.unchanged} skipped=${summary.skipped} errors=${summary.errors}`,
  );
  return { summary, perTarget };
}
