import https from "node:https";
import { runBuild } from "./builder";
import { query } from "./db";
import {
  runSecPipeline,
  type SecPipelineTarget,
  type SecTargetResult,
} from "./sec-pipeline";

const SEC_PIPELINE_ENABLED = !["0", "false", "no"].includes(
  String(process.env.SEC_PIPELINE_ENABLED ?? "1").toLowerCase(),
);

// ---------------------------------------------------------------------------
// Config (mirrors Python env vars with same defaults)
// ---------------------------------------------------------------------------

const SET_TIMEOUT = Number(process.env.SCRAPER_SET_TIMEOUT ?? 20) * 1000;
const DB_UPSERT_WORKERS = Math.max(1, Number(process.env.SCRAPER_DB_UPSERT_WORKERS ?? 3));
const BUILD_AFTER_SCRAPE = !["0", "false", "no"].includes(
  String(process.env.SCRAPER_BUILD_AFTER_UPSERT ?? "1").toLowerCase(),
);

const SET_BASE = "https://www.set.or.th";
const SET_PAGE = `${SET_BASE}/th/listing/ipo/upcoming-ipo/set`;
const SET_API = `${SET_BASE}/api/set/ipo/upcoming`;

const SET_API_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Referer: SET_PAGE,
};

// Chrome 131 cipher suite order — makes Node.js TLS fingerprint resemble Chrome
// so the SET Incapsula WAF does not reject requests.
const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawSetIpo {
  symbol: string;
  nameEn?: string;
  nameTh?: string;
  market?: string;
  industry?: string;
  sector?: string;
  status?: string;
  firstTradeDate?: string;
  ipoPrice?: number;
  par?: number;
  noOfIPO?: string;
  financialAdvisors?: string[];
  underwriters?: string[];
  filingUrl?: string;
  executiveSummaryUrl?: string;
  businessDescription?: string;
  pe?: number;
  marketCap?: number;
  issuedSize?: number;
}

interface TransformedRecord {
  ipo: Record<string, unknown>;
  financials: Record<string, unknown> | null;
  secMeta: Record<string, unknown>;
}

interface UpsertSummary {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

class LogCollector {
  private chunks: string[] = [];
  log(msg: string) {
    this.chunks.push(msg);
    console.log(`[scraper] ${msg}`);
  }
  warn(msg: string) {
    this.chunks.push(`WARN: ${msg}`);
    console.warn(`[scraper] ${msg}`);
  }
  error(msg: string) {
    this.chunks.push(`ERROR: ${msg}`);
    console.error(`[scraper] ${msg}`);
  }
  getExcerpt(maxLen = 8000): string {
    return this.chunks.join("\n").slice(-maxLen);
  }
}

// ---------------------------------------------------------------------------
// Utility: concurrency limiter
// ---------------------------------------------------------------------------

async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, tasks.length));

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// httpsGet: Node.js built-in HTTPS client with Chrome TLS + cookie support
// Zero external dependencies — avoids ESM/bundler issues on Vercel.
// ---------------------------------------------------------------------------

const _httpsAgent = new https.Agent({
  ciphers: CHROME_CIPHERS,
  minVersion: "TLSv1.2",
  keepAlive: true,
});

const CHROME_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

function httpsGet(
  url: string,
  opts: {
    headers?: Record<string, string>;
    timeout?: number;
    maxRedirects?: number;
  } = {},
): Promise<{ statusCode: number; headers: Record<string, string | string[]>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        port: parsed.port || 443,
        agent: _httpsAgent,
        headers: { ...CHROME_HEADERS, ...opts.headers },
        timeout: opts.timeout ?? 30_000,
      },
      (res) => {
        // Follow redirects (up to maxRedirects)
        const maxRedir = opts.maxRedirects ?? 5;
        if (
          maxRedir > 0 &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = new URL(res.headers.location, url).href;
          // Carry forward any set-cookie from redirect response
          const extraCookies = extractSetCookieValues(res.headers);
          const mergedHeaders = { ...opts.headers };
          if (extraCookies.length > 0) {
            const prev = mergedHeaders["Cookie"] ?? "";
            mergedHeaders["Cookie"] = [prev, extraCookies.join("; ")]
              .filter(Boolean)
              .join("; ");
          }
          httpsGet(redirectUrl, {
            ...opts,
            headers: mergedHeaders,
            maxRedirects: maxRedir - 1,
          })
            .then(resolve)
            .catch(reject);
          res.resume(); // drain this response
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[]>,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

function extractSetCookieValues(
  headers: Record<string, string | string[] | undefined>,
): string[] {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((c) => c.split(";")[0]).filter(Boolean);
}

async function fetchUpcomingIpos(log: LogCollector): Promise<RawSetIpo[]> {
  // 1. Visit SET page to get Incapsula WAF cookies
  let cookies = "";
  try {
    const pageResp = await httpsGet(SET_PAGE, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      },
      timeout: SET_TIMEOUT,
    });
    const setCookies = extractSetCookieValues(pageResp.headers);
    cookies = setCookies.join("; ");
    if (cookies) log.log(`SET page: got ${setCookies.length} cookies`);
    else log.warn("SET page: no cookies received");
  } catch (e) {
    log.warn(`SET page visit failed: ${e}`);
  }

  // 2. Fetch both markets in parallel using cookies from step 1
  async function fetchMarket(type: string): Promise<RawSetIpo[]> {
    const url = `${SET_API}?type=${type}&lang=th`;
    const resp = await httpsGet(url, {
      headers: {
        ...SET_API_HEADERS,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      timeout: SET_TIMEOUT,
    });
    if (resp.statusCode !== 200)
      throw new Error(`SET API (${type}) returned ${resp.statusCode}`);
    const data = JSON.parse(resp.body);
    const items = Array.isArray(data) ? data : data?.data ?? [];
    log.log(`SET API (${type}): ${items.length} IPOs`);
    return items;
  }

  const results = await Promise.allSettled([
    fetchMarket("SET"),
    fetchMarket("mai"),
  ]);

  const all: RawSetIpo[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else log.warn(`SET API failed: ${r.reason}`);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Transform SET data → DB schema
// ---------------------------------------------------------------------------

function extractTransId(filingUrl: string | undefined): string | null {
  if (!filingUrl) return null;
  const m = filingUrl.match(/TransID=(\d+)/);
  return m ? m[1] : null;
}

function parseOfferedShares(noOfIPO: string | null | undefined): number | null {
  if (!noOfIPO) return null;
  // SET's noOfIPO is usually a bare grouped number ("52,769,000") but can arrive
  // with a unit or label ("52,769,000 หุ้น", "IPO 52,769,000 shares") or a stray
  // non-breaking space. Pull the first grouped-number run anywhere in the string
  // rather than anchoring at the start, then strip separators.
  const m = noOfIPO.match(/\d[\d,\s]*(?:\.\d+)?/);
  if (!m) return null;
  const val = Number(m[0].replace(/[,\s]/g, ""));
  return Number.isFinite(val) && val > 0 ? val : null;
}

function transformIpo(raw: RawSetIpo): TransformedRecord | null {
  const symbol = (raw.symbol ?? "").trim().toUpperCase();
  if (!symbol) return null;

  const faCompanies = raw.financialAdvisors ?? [];
  const leadUw = raw.underwriters ?? [];

  let listingDate: string | null = null;
  if (raw.firstTradeDate) {
    try {
      listingDate = raw.firstTradeDate.split("T")[0];
    } catch {
      listingDate = raw.firstTradeDate;
    }
  }

  const ipo: Record<string, unknown> = {
    symbol,
    company_name: raw.nameEn ?? raw.nameTh,
    company_name_th: raw.nameTh,
    market: raw.market,
    industry: raw.industry,
    sector: raw.sector,
    status: "upcoming",
    filing_status: raw.status,
    business_description: raw.businessDescription,
    listing_date: listingDate,
    ipo_price: raw.ipoPrice,
    par_value: raw.par,
    fa_companies: faCompanies.length
      ? faCompanies.map((c) => c.replace(/\xa0/g, " ").trim())
      : null,
    lead_uw: leadUw.length
      ? leadUw.map((u) => u.replace(/\xa0/g, " ").trim())
      : null,
    source: "set_api_scraper",
  };

  // Remove null/undefined values
  for (const key of Object.keys(ipo)) {
    if (ipo[key] == null) delete ipo[key];
  }

  const financials: Record<string, unknown> = {};
  const offeredShares = parseOfferedShares(raw.noOfIPO);
  if (offeredShares) financials.offered_shares = offeredShares;

  const finOfferedShares = Number(financials.offered_shares);
  const ipoPrice = Number(raw.ipoPrice);
  if (
    Number.isFinite(finOfferedShares) &&
    finOfferedShares > 0 &&
    Number.isFinite(ipoPrice) &&
    ipoPrice > 0
  ) {
    financials.gross_proceeds = finOfferedShares * ipoPrice;
  }

  const secMeta: Record<string, unknown> = {
    filing_url: raw.filingUrl,
    sec_trans_id: extractTransId(raw.filingUrl),
    executive_summary_url: raw.executiveSummaryUrl,
    par_value: raw.par,
    pe_ratio: raw.pe,
    market_cap: raw.marketCap,
    issued_size: raw.issuedSize,
  };
  for (const key of Object.keys(secMeta)) {
    if (secMeta[key] == null) delete secMeta[key];
  }

  return {
    ipo,
    financials: Object.keys(financials).length > 0 ? financials : null,
    secMeta,
  };
}

// ---------------------------------------------------------------------------
// DB upsert
// ---------------------------------------------------------------------------

function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  if (!before) {
    for (const [k, v] of Object.entries(after)) {
      if (v != null && k !== "updated_at") diff[k] = { before: null, after: v };
    }
    return diff;
  }
  for (const [k, v] of Object.entries(after)) {
    if (k === "updated_at" || k === "id") continue;
    const prev = before[k];
    if (!valuesEqual(prev, v)) diff[k] = { before: prev, after: v };
  }
  return diff;
}

function normalizeComparable(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(normalizeComparable);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const left = normalizeComparable(a);
  const right = normalizeComparable(b);
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
}

async function upsertToPostgres(
  records: TransformedRecord[],
  runId: string | null,
  log: LogCollector,
): Promise<{ summary: UpsertSummary; secTargets: SecPipelineTarget[] }> {
  const summary: UpsertSummary = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  if (records.length === 0) return { summary, secTargets: [] };

  const ipoColumns = [
    "symbol",
    "company_name",
    "company_name_th",
    "market",
    "industry",
    "sector",
    "status",
    "listing_date",
    "ipo_price",
    "par_value",
    "fa_persons",
    "fa_companies",
    "lead_uw",
    "co_uws",
    "business_description",
    "filing_status",
    "source",
  ];
  const finColumns = [
    "ipo_id",
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

  // Pre-fetch existing rows
  const symbols = records.map((r) => r.ipo.symbol as string);
  const beforeMap = new Map<string, Record<string, unknown>>();
  try {
    const existing = await query<Record<string, unknown>>(
      "SELECT * FROM ipos WHERE symbol = ANY($1)",
      [symbols],
    );
    for (const row of existing) beforeMap.set(row.symbol as string, row);
    log.log(`Pre-fetched ${beforeMap.size} existing rows`);
  } catch (e) {
    log.warn(`Failed to pre-fetch existing rows: ${e}`);
  }

  log.log(`Upserting ${records.length} records (${DB_UPSERT_WORKERS} workers)...`);
  const t0 = Date.now();

  type UpsertRecordResult = {
    action: keyof UpsertSummary;
    symbol: string;
    ipoId?: string;
    diff: Record<string, { before: unknown; after: unknown }>;
    rec: TransformedRecord;
    error?: string;
  };

  const upsertTasks = records.map((rec) => async (): Promise<UpsertRecordResult> => {
    const ipoData = { ...rec.ipo };
    const symbol = ipoData.symbol as string;

    try {
      const before = beforeMap.get(symbol) ?? null;
      const diff = computeDiff(before, ipoData);

      const action =
        before === null ? "inserted" : Object.keys(diff).length > 0 ? "updated" : "unchanged";

      let ipoId = before?.id as string | undefined;
      const fin = rec.financials;

      if (action !== "unchanged") {
        ipoData.updated_at = new Date().toISOString();
        const colsPresent = [...ipoColumns.filter((c) => c in ipoData), "updated_at"];
        const vals = colsPresent.map((c) => ipoData[c]);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
        const colNames = colsPresent.map((c) => `"${c}"`).join(", ");
        const updateSet = colsPresent
          .filter((c) => c !== "symbol")
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");

        if (fin) {
          const finCols = finColumns.filter((c) => c !== "ipo_id" && c in fin);
          const finVals = finCols.map((c) => fin[c]);
          const finValPh = finVals.map((_, i) => `$${vals.length + i + 1}`).join(", ");
          const finCn = ["ipo_id", ...finCols].map((c) => `"${c}"`).join(", ");
          const finUp = finCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
          const finSelect = finCols.length > 0
            ? `SELECT id, ${finValPh} FROM upserted`
            : `SELECT id FROM upserted`;
          const sql = `WITH upserted AS (
              INSERT INTO ipos (${colNames}) VALUES (${placeholders})
              ON CONFLICT (symbol) DO UPDATE SET ${updateSet}
              RETURNING id
            ), fin AS (
              INSERT INTO ipo_financials (${finCn})
              ${finSelect}
              ${finCols.length > 0 ? `ON CONFLICT (ipo_id) DO UPDATE SET ${finUp}` : `ON CONFLICT (ipo_id) DO NOTHING`}
              RETURNING ipo_id
            )
            SELECT id FROM upserted`;
          const rows = await query<{ id: string }>(sql, [...vals, ...finVals]);
          ipoId = rows[0]?.id;
        } else {
          const rows = await query<{ id: string }>(
            `INSERT INTO ipos (${colNames}) VALUES (${placeholders})
             ON CONFLICT (symbol) DO UPDATE SET ${updateSet}
             RETURNING id`,
            vals,
          );
          ipoId = rows[0]?.id;
        }
      } else if (fin && ipoId) {
        const finCols = finColumns.filter((c) => c !== "ipo_id" && c in fin);
        if (finCols.length > 0) {
          const finVals = [ipoId, ...finCols.map((c) => fin[c])];
          const finPh = finVals.map((_, i) => `$${i + 1}`).join(", ");
          const finCn = ["ipo_id", ...finCols].map((c) => `"${c}"`).join(", ");
          const finUp = finCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
          await query(
            `INSERT INTO ipo_financials (${finCn}) VALUES (${finPh})
             ON CONFLICT (ipo_id) DO UPDATE SET ${finUp}`,
            finVals,
          );
        }
      }

      log.log(`  [DB] ${action}: ${symbol}`);
      return { action: action as keyof UpsertSummary, symbol, ipoId, diff, rec };
    } catch (e) {
      log.error(`  [DB] failed to upsert ${symbol}: ${e}`);
      return { action: "failed", symbol, diff: {}, rec, error: String(e) };
    }
  });

  const upsertSettled = await withConcurrency(upsertTasks, DB_UPSERT_WORKERS);
  const runItems: UpsertRecordResult[] = [];
  for (const item of upsertSettled) {
    if (item.status === "fulfilled") {
      summary[item.value.action]++;
      runItems.push(item.value);
    } else {
      log.error(`  [DB] upsert worker failed: ${item.reason}`);
      summary.failed++;
    }
  }

  // Bulk-insert scrape_run_items in a single round-trip.
  if (runId && runItems.length > 0) {
    try {
      const cols = ["run_id", "symbol", "ipo_id", "action", "diff", "scraped_data", "error_message"];
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];
      for (const it of runItems) {
        const base = values.length;
        rowPlaceholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
        );
        values.push(
          runId,
          it.symbol,
          it.ipoId ?? null,
          it.action,
          Object.keys(it.diff).length > 0 ? JSON.stringify(it.diff) : null,
          JSON.stringify(it.rec),
          it.error ?? null,
        );
      }
      await query(
        `INSERT INTO scrape_run_items (${cols.map((c) => `"${c}"`).join(", ")})
         VALUES ${rowPlaceholders.join(", ")}`,
        values,
      );
    } catch (e) {
      log.warn(`  [DB] bulk scrape_run_items insert failed: ${e}`);
    }
  }

  log.log(`DB upsert done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Build SEC pipeline targets: IPOs we have an id + filing URL for.
  const secTargets: SecPipelineTarget[] = [];
  for (const it of runItems) {
    const filingUrl = it.rec.secMeta?.filing_url;
    if (it.ipoId && typeof filingUrl === "string" && filingUrl) {
      secTargets.push({
        ipoId: Number(it.ipoId),
        symbol: it.symbol,
        filingUrl,
      });
    }
  }

  return { summary, secTargets };
}

async function finalizeRun(
  runId: string,
  summary: UpsertSummary,
  totalFetched: number,
  status: string,
  errorMessage?: string,
): Promise<void> {
  try {
    await query(
      `UPDATE scrape_runs SET
        status = $1, finished_at = now(),
        duration_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int,
        total_fetched = $2,
        inserted_count = $3, updated_count = $4,
        unchanged_count = $5, failed_count = $6,
        error_message = $7
       WHERE id = $8`,
      [
        status,
        totalFetched,
        summary.inserted,
        summary.updated,
        summary.unchanged,
        summary.failed,
        errorMessage ?? null,
        runId,
      ],
    );
  } catch (e) {
    console.warn("[scraper] Failed to finalize scrape_runs:", e);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runScraper(runId: string): Promise<void> {
  const log = new LogCollector();
  const emptySummary: UpsertSummary = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  try {
    log.log("=".repeat(60));
    log.log(
      `Upcoming IPO Scraper — ${new Date().toISOString().slice(0, 16)} (Node.js)`,
    );
    log.log("=".repeat(60));

    // 1. Fetch from SET
    const rawIpos = await fetchUpcomingIpos(log);
    log.log(`Total upcoming IPOs fetched: ${rawIpos.length}`);
    await updateLogExcerpt(runId, log.getExcerpt());

    if (rawIpos.length === 0) {
      log.log("No upcoming IPOs found. Done.");
      await finalizeRun(runId, emptySummary, 0, "success");
      await updateLogExcerpt(runId, log.getExcerpt());
      return;
    }

    // 2. Transform
    const records: TransformedRecord[] = [];
    for (const ipo of rawIpos) {
      const rec = transformIpo(ipo);
      if (rec) records.push(rec);
    }

    // 3. Upsert to DB
    const { summary, secTargets } = await upsertToPostgres(records, runId, log);

    // 3b. SEC filing pipeline: download → validate → extract (with evidence)
    // → stage into sec_source_files → auto-import format/validation-passing
    // financials, park the rest for manual review. Best-effort: never aborts the scrape.
    if (SEC_PIPELINE_ENABLED && secTargets.length > 0) {
      // Flush now so the UI shows the SEC step has started (it can take a
      // while: each filing downloads & parses several documents).
      await updateLogExcerpt(runId, log.getExcerpt());
      try {
        const { perTarget } = await runSecPipeline(secTargets, {
          runId,
          log,
          onProgress: () => updateLogExcerpt(runId, log.getExcerpt()),
        });
        await attachSecSummaries(runId, perTarget, log);
      } catch (e) {
        log.warn(`SEC pipeline skipped/failed: ${e}`);
      }
      await updateLogExcerpt(runId, log.getExcerpt());
    }

    // 4. Rebuild public data so /api/ipo-data sees the scraped financials.
    if (BUILD_AFTER_SCRAPE) {
      try {
        log.log("Rebuilding ipo.json from database...");
        const buildResult = await runBuild();
        log.log(
          `ipo.json rebuilt in ${(buildResult.duration / 1000).toFixed(1)}s (${buildResult.artifactSize ?? 0} bytes)`,
        );
      } catch (e) {
        log.warn(`ipo.json rebuild skipped/failed: ${e}`);
      }
    }

    // 5. Finalize
    const status = summary.failed === 0 ? "success" : "partial";
    await finalizeRun(runId, summary, rawIpos.length, status);
    await updateLogExcerpt(runId, log.getExcerpt());

    log.log(
      `Done. inserted=${summary.inserted} updated=${summary.updated} unchanged=${summary.unchanged} failed=${summary.failed}`,
    );
  } catch (exc) {
    log.error(`Scraper failed: ${exc}`);
    await finalizeRun(
      runId,
      emptySummary,
      0,
      "failed",
      exc instanceof Error ? exc.message : String(exc),
    );
    await updateLogExcerpt(runId, log.getExcerpt());
    throw exc;
  }
}

async function updateLogExcerpt(
  runId: string,
  excerpt: string,
): Promise<void> {
  try {
    await query("UPDATE scrape_runs SET log_excerpt = $1 WHERE id = $2", [
      excerpt,
      runId,
    ]);
  } catch {
    // best-effort
  }
}

/**
 * Merge each IPO's SEC-pipeline rollup into the matching scrape_run_items row
 * under scraped_data.sec, so the run-item detail view shows what the SEC step
 * did (auto-imported fields, review/no_data counts) alongside the SET data.
 * Best-effort: never throws.
 */
async function attachSecSummaries(
  runId: string,
  perTarget: SecTargetResult[],
  log: LogCollector,
): Promise<void> {
  for (const t of perTarget) {
    const { ipoId, symbol, ...sec } = t;
    try {
      await query(
        `UPDATE scrape_run_items
           SET scraped_data = jsonb_set(
             COALESCE(scraped_data, '{}'::jsonb), '{sec}', $1::jsonb, true)
         WHERE run_id = $2 AND ipo_id = $3`,
        [JSON.stringify(sec), runId, ipoId],
      );
    } catch (e) {
      log.warn(`  [SEC] failed to attach summary for ${symbol}: ${e}`);
    }
  }
}
