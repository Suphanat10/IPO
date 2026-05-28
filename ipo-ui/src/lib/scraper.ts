import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { runBuild } from "./builder";
import { query } from "./db";

// ---------------------------------------------------------------------------
// Config (mirrors Python env vars with same defaults)
// ---------------------------------------------------------------------------

const SEC_WORKERS = Number(process.env.SCRAPER_SEC_WORKERS ?? 6);
const SEC_DOC_WORKERS = Number(process.env.SCRAPER_SEC_DOC_WORKERS ?? 6);
const SET_TIMEOUT = Number(process.env.SCRAPER_SET_TIMEOUT ?? 20) * 1000;
const SEC_PAGE_TIMEOUT = Number(process.env.SCRAPER_SEC_PAGE_TIMEOUT ?? 30) * 1000;
const SEC_DOC_TIMEOUT = Number(process.env.SCRAPER_SEC_DOC_TIMEOUT ?? 45) * 1000;
const SEC_FS_TIMEOUT = Number(process.env.SCRAPER_SEC_FS_TIMEOUT ?? 120) * 1000;
const SEC_FS_MAX_BYTES = Number(process.env.SCRAPER_SEC_FS_MAX_BYTES ?? 0);
const SEC_DOC_RETRIES = Number(process.env.SCRAPER_SEC_DOC_RETRIES ?? 1);
const SEC_RETRY_SLEEP_MS = Number(process.env.SCRAPER_SEC_RETRY_SLEEP_SECONDS ?? 0.5) * 1000;
const SEC_DOC_CACHE_ENABLED = !["0", "false", "no"].includes(
  String(process.env.SCRAPER_SEC_DOC_CACHE ?? "1").toLowerCase(),
);
const SEC_DOC_CACHE_TTL_MS =
  Number(process.env.SCRAPER_SEC_DOC_CACHE_TTL_HOURS ?? 168) * 60 * 60 * 1000;
const SEC_PAGE_CACHE_TTL_MS =
  Number(process.env.SCRAPER_SEC_PAGE_CACHE_TTL_MINUTES ?? 30) * 60 * 1000;
const SEC_PAGE_MODE = normalizeSecPageMode(process.env.SCRAPER_SEC_PAGE_MODE);
const SEC_DOC_MODE = normalizeSecDocMode(process.env.SCRAPER_SEC_DOC_MODE);
const SEC_DOC_MIN_FIELDS = Number(process.env.SCRAPER_SEC_DOC_MIN_FIELDS ?? 8);
const SEC_FS_PARSE_WORKERS = Math.max(1, Number(process.env.SCRAPER_SEC_FS_PARSE_WORKERS ?? 1));
const SEC_DOC_PARSER_VERSION = "financials-v6";
const PROGRESS_LOG_EVERY = Math.max(1, Number(process.env.SCRAPER_PROGRESS_LOG_EVERY ?? 5));
const DB_UPSERT_WORKERS = Math.max(1, Number(process.env.SCRAPER_DB_UPSERT_WORKERS ?? 3));
const BUILD_AFTER_SCRAPE = !["0", "false", "no"].includes(
  String(process.env.SCRAPER_BUILD_AFTER_UPSERT ?? "1").toLowerCase(),
);

const SET_BASE = "https://www.set.or.th";
const SET_PAGE = `${SET_BASE}/th/listing/ipo/upcoming-ipo/set`;
const SET_API = `${SET_BASE}/api/set/ipo/upcoming`;
const SEC_CACHE_ROOT = path.join(process.cwd(), "scripts", "output", ".cache");
const SEC_DOC_CACHE_DIR = path.join(SEC_CACHE_ROOT, "sec-docs");
const SEC_PAGE_CACHE_DIR = path.join(SEC_CACHE_ROOT, "sec-pages");

const SET_API_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Referer: SET_PAGE,
};

// Mirrors Python's _sec_request_headers() — required to bypass SEC WAF rejection.
const SEC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const SEC_REQUEST_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": SEC_USER_AGENT,
};

// Chrome 131 cipher suite order — makes Node.js TLS fingerprint resemble Chrome
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

interface FilingSection {
  title: string;
  url: string;
  seq: number;
}

interface DocFinancials {
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

interface SecData {
  fa_person?: string;
  fa_company_sec?: string;
  financial_periods_available?: string[];
  doc_financials?: Partial<DocFinancials>;
}

type SecDocMode = "missing" | "full" | "skip";
type SecPageMode = "missing" | "full";

interface ExistingIpoSnapshot {
  symbol: string;
  doc_field_count: number;
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

const DOC_FINANCIAL_COLUMNS = [
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
// Utility: Thai number parsing
// ---------------------------------------------------------------------------

function parseThaiNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,\-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
  const val = Number(cleaned);
  return Number.isFinite(val) ? val : null;
}

function parseThaiPct(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/%/g, "").replace(/ร้อยละ/g, "").trim();
  return parseThaiNumber(cleaned);
}

const THAI_NUMBER_TOKEN = String.raw`-?\d[\d\s,]*(?:\s*\.\s*\d+)?`;

function normalizeDocText(text: string): string {
  return (text ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function moneyValuesInText(text: string): number[] {
  const values: number[] = [];
  const moneyRegex = new RegExp(`(${THAI_NUMBER_TOKEN})\\s*(ล้านบาท|บาท)`, "g");
  for (const match of text.matchAll(moneyRegex)) {
    let val = parseThaiNumber(match[1].replace(/ /g, ""));
    if (val === null) continue;
    if (match[2] === "ล้านบาท") val *= 1_000_000;
    if (Math.abs(val) >= 1_000) values.push(val);
  }
  return values;
}

function firstMoneyNearKeywords(
  text: string,
  keywords: string[],
  window = 800,
): number | null {
  for (const keyword of keywords) {
    const idx = text.indexOf(keyword);
    if (idx === -1) continue;
    const values = moneyValuesInText(text.slice(idx, idx + window));
    if (values.length > 0) return values[0];
  }
  return null;
}

function firstPct(text: string): number | null {
  const patterns = [
    new RegExp(`ร้อยละ\\s*(${THAI_NUMBER_TOKEN})`),
    new RegExp(`(${THAI_NUMBER_TOKEN})\\s*%`),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const val = parseThaiPct(match[1].replace(/ /g, ""));
    if (val !== null && val >= 0 && val <= 100) return val;
  }
  return null;
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

let fsParseActive = 0;
const fsParseQueue: (() => void)[] = [];

async function withFsParseSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (fsParseActive >= SEC_FS_PARSE_WORKERS) {
    await new Promise<void>((resolve) => fsParseQueue.push(resolve));
  }
  fsParseActive += 1;
  try {
    return await fn();
  } finally {
    fsParseActive -= 1;
    fsParseQueue.shift()?.();
  }
}

// ---------------------------------------------------------------------------
// Utility: fetch with timeout + retries
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSecDocMode(value: string | undefined): SecDocMode {
  const normalized = String(value ?? "missing").toLowerCase();
  if (["full", "always", "all"].includes(normalized)) return "full";
  if (["skip", "off", "false", "0", "none"].includes(normalized)) return "skip";
  return "missing";
}

function normalizeSecPageMode(value: string | undefined): SecPageMode {
  const normalized = String(value ?? "missing").toLowerCase();
  if (["full", "always", "all"].includes(normalized)) return "full";
  return "missing";
}

function cacheKey(...parts: string[]): string {
  return crypto.createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 20);
}

async function loadTextCache(
  filePath: string,
  ttlMs: number,
  allowStale = false,
): Promise<string | null> {
  if (!SEC_DOC_CACHE_ENABLED) return null;
  try {
    const stat = await fs.stat(filePath);
    if (!allowStale && ttlMs > 0 && Date.now() - stat.mtimeMs > ttlMs) return null;
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function saveTextCache(filePath: string, text: string): Promise<void> {
  if (!SEC_DOC_CACHE_ENABLED) return;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(`${filePath}.tmp`, text, "utf8");
    await fs.rename(`${filePath}.tmp`, filePath);
  } catch {
    // Cache is opportunistic; scraping should not fail because cache writes fail.
  }
}

async function loadJsonCache<T extends Record<string, unknown>>(
  filePath: string,
  ttlMs: number,
): Promise<T | null> {
  const text = await loadTextCache(filePath, ttlMs);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveJsonCache(
  filePath: string,
  data: Record<string, unknown>,
): Promise<void> {
  await saveTextCache(filePath, JSON.stringify(data));
}

function secPageCachePath(transId: string): string {
  return path.join(SEC_PAGE_CACHE_DIR, `${transId}.html`);
}

function secDocCachePath(
  transId: string,
  urls: Record<string, string | null>,
): string {
  const parts = [
    SEC_DOC_PARSER_VERSION,
    transId,
    ...Object.entries(urls).sort().map(([k, v]) => `${k}=${v ?? ""}`),
  ];
  return path.join(SEC_DOC_CACHE_DIR, `${transId}_${cacheKey(...parts)}.json`);
}

function countDocFinancialFields(data: Partial<DocFinancials>): number {
  return DOC_FINANCIAL_COLUMNS.reduce(
    (count, column) => count + (data[column as keyof DocFinancials] != null ? 1 : 0),
    0,
  );
}

function isSecRejectionText(text: string | null | undefined): boolean {
  if (!text) return false;
  const lowered = text.toLowerCase();
  return lowered.includes("request rejected") || lowered.includes("requested url was rejected");
}

function isValidSecPageHtml(text: string | null | undefined): boolean {
  if (!text || isSecRejectionText(text)) return false;
  return text.includes("RadGrid1") || text.includes("IPOSGetFile.aspx") || text.includes("ContentPlaceHolder1_RadGrid1");
}

async function fetchBuffer(
  url: string,
  timeout: number,
  retries: number = 0,
): Promise<Buffer | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const buf = await httpsGetBuffer(url, {
        headers: SEC_REQUEST_HEADERS,
        timeout,
      });
      if (buf) return buf;
    } catch {
      // fall through to retry
    }
    if (attempt < retries) await sleep(SEC_RETRY_SLEEP_MS);
  }
  return null;
}

// ---------------------------------------------------------------------------
// SET API fetcher
// ---------------------------------------------------------------------------

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

function httpsGetBuffer(
  url: string,
  opts: { headers?: Record<string, string>; timeout?: number; maxRedirects?: number } = {},
): Promise<Buffer | null> {
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
        const maxRedir = opts.maxRedirects ?? 5;
        if (
          maxRedir > 0 &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = new URL(res.headers.location, url).href;
          const extraCookies = extractSetCookieValues(res.headers);
          const mergedHeaders = { ...opts.headers };
          if (extraCookies.length > 0) {
            const prev = mergedHeaders["Cookie"] ?? "";
            mergedHeaders["Cookie"] = [prev, extraCookies.join("; ")].filter(Boolean).join("; ");
          }
          httpsGetBuffer(redirectUrl, { ...opts, headers: mergedHeaders, maxRedirects: maxRedir - 1 })
            .then(resolve)
            .catch(reject);
          res.resume();
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
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
// SEC filing index parser
// ---------------------------------------------------------------------------

function extractTransId(filingUrl: string | undefined): string | null {
  if (!filingUrl) return null;
  const m = filingUrl.match(/TransID=(\d+)/);
  return m ? m[1] : null;
}

function parseFilingIndex(html: string): FilingSection[] {
  const sections: FilingSection[] = [];
  const rowPattern =
    /<tr[^>]*id="ctl00_ContentPlaceHolder1_RadGrid1_ctl00__\d+"[^>]*>([\s\S]*?)<\/tr>/g;

  let trMatch;
  while ((trMatch = rowPattern.exec(html)) !== null) {
    const trHtml = trMatch[1];

    const firstTd = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (!firstTd) continue;
    const title = firstTd[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;?/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;

    const fileUrlPattern =
      /window\.open\(&#39;(https:\/\/market\.sec\.or\.th\/public\/ipos\/IPOSGetFile\.aspx\?[^']*?)&#39;\)/g;
    let bestUrl: string | null = null;
    let fileMatch: RegExpExecArray | null;
    while ((fileMatch = fileUrlPattern.exec(trHtml)) !== null) {
      bestUrl = fileMatch[1].replace(/&amp;/g, "&");
    }
    if (!bestUrl) continue;

    const seqMatch = bestUrl.match(/TransFileSeq=(\d+)/);
    const seq = seqMatch ? Number(seqMatch[1]) : -1;

    sections.push({ title, url: bestUrl, seq });
  }

  return sections;
}

function findSectionUrl(
  sections: FilingSection[],
  ...keywords: string[]
): string | null {
  for (const sec of sections) {
    if (keywords.some((kw) => sec.title.includes(kw))) return sec.url;
  }
  return null;
}

function findLatestAnnualFsUrl(sections: FilingSection[]): string | null {
  const fsSections: [number, string][] = [];
  for (const sec of sections) {
    if (!sec.title.includes("งบการเงิน")) continue;
    if (/ไตรมาส/.test(sec.title)) continue;
    const yearMatch = sec.title.match(/(\d{4})/);
    if (yearMatch) fsSections.push([Number(yearMatch[1]), sec.url]);
  }
  if (fsSections.length === 0) return null;
  fsSections.sort((a, b) => b[0] - a[0]);
  return fsSections[0][1];
}

// ---------------------------------------------------------------------------
// DOCX / ZIP utilities
// ---------------------------------------------------------------------------

function extractDocxTextIfDocx(content: Buffer): string | null {
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b)
    return null;
  try {
    const zip = new AdmZip(content);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    const xml = entry.getData().toString("utf-8");
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(
      (m) => m[1],
    );
    return texts.join(" ");
  } catch {
    return null;
  }
}

function isXlsxWorkbook(content: Buffer): boolean {
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b)
    return false;
  try {
    const zip = new AdmZip(content);
    return zip.getEntries().some((e) => e.entryName === "xl/workbook.xml");
  } catch {
    return false;
  }
}

type FsZipInspection =
  | { kind: "docx" }
  | { kind: "xlsx-in-zip"; xlsx: Buffer }
  | { kind: "none" };

function inspectFsZip(content: Buffer): FsZipInspection {
  let zip: AdmZip;
  try {
    zip = new AdmZip(content);
  } catch {
    return { kind: "none" };
  }
  const entries = zip.getEntries();
  if (entries.some((e) => e.entryName === "word/document.xml")) {
    return { kind: "docx" };
  }
  for (const entry of entries) {
    if (!/\.(xlsx|xlsm|xls)$/i.test(entry.entryName)) continue;
    const data = entry.getData();
    if (isXlsxWorkbook(data)) return { kind: "xlsx-in-zip", xlsx: data };
  }
  return { kind: "none" };
}

function extractXlsxFromZip(content: Buffer): Buffer | null {
  try {
    const zip = new AdmZip(content);
    const excelEntries = zip.getEntries().filter((e) =>
      /\.(xlsx|xlsm|xls)$/i.test(e.entryName),
    );
    for (const entry of excelEntries) {
      const data = entry.getData();
      if (isXlsxWorkbook(data)) return data;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SEC document parsers (text-based, ported from Python regex)
// ---------------------------------------------------------------------------

function parseSubscriptionReport(text: string): Partial<DocFinancials> {
  const result: Partial<DocFinancials> = {};
  text = normalizeDocText(text);

  const gross = firstMoneyNearKeywords(text, [
    "ประมาณการจำนวนเงิน",
    "จำนวนเงินค่าหุ้น",
    "มูลค่าการเสนอขาย",
    "มูลค่ารวมของหุ้น",
  ]);
  if (gross !== null) result.gross_proceeds = gross;

  const expense = firstMoneyNearKeywords(text, [
    "รวมค่าใช้จ่าย",
    "รวมค่าใช้จ่ายทั้งสิ้น",
    "ประมาณการค่าใช้จ่าย",
  ]);
  if (expense !== null) result.total_expense = expense;

  return result;
}

function parseSecuritiesOffering(text: string): Partial<DocFinancials> {
  const result: Partial<DocFinancials> = {};
  text = normalizeDocText(text);

  const shareKws = [
    "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย",
    "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
    "จำนวนหุ้นที่เสนอขาย",
  ];
  for (const kw of shareKws) {
    const idx = text.indexOf(kw);
    if (idx === -1) continue;
    const nearby = text.slice(idx, idx + 1000);
    const m = nearby.match(new RegExp(`(${THAI_NUMBER_TOKEN})\\s*หุ้น`));
    if (m) {
      const val = parseThaiNumber(m[1].replace(/ /g, ""));
      if (val && val > 100) {
        result.offered_shares = Math.round(val);
        break;
      }
    }
  }

  let ratioText = text;
  for (const sectionKw of [
    "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย",
    "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
  ]) {
    const idx = text.indexOf(sectionKw);
    if (idx !== -1) {
      ratioText = text.slice(idx, idx + 1500);
      break;
    }
  }

  const ratioKws = ["คิดเป็นร้อยละ", "ร้อยละ"];
  for (const kw of ratioKws) {
    const idx = ratioText.indexOf(kw);
    if (idx === -1) continue;
    const val = firstPct(ratioText.slice(idx, idx + 300));
    if (val !== null && val > 0 && val <= 100) {
      result.offered_ratio_pct = val;
      break;
    }
  }

  let existingContextFound = false;
  const existingKws = ["หุ้นเดิม", "หุ้นสามัญเดิม", "ผู้ถือหุ้นเดิม"];
  for (const kw of existingKws) {
    const matches = [...text.matchAll(new RegExp(kw, "g"))];
    for (const match of matches) {
      const nearby = text.slice(match.index!, match.index! + 500);
      if (nearby.includes("เสนอขาย") || nearby.includes("จำหน่าย")) {
        existingContextFound = true;
      }
      const val = firstPct(nearby);
      if (val !== null && val > 0 && val <= 100) {
        result.existing_shares_pct = val;
        break;
      }
    }
    if (result.existing_shares_pct !== undefined) break;
  }
  if (
    result.existing_shares_pct === undefined &&
    result.offered_shares !== undefined &&
    !existingContextFound
  ) {
    result.existing_shares_pct = 0;
  }

  return result;
}

function parseShareholderInfo(text: string): Partial<DocFinancials> {
  const result: Partial<DocFinancials> = {};
  text = normalizeDocText(text);

  const sectionKws = [
    "รายชื่อผู้ถือหุ้น",
    "โครงสร้างการถือหุ้น",
    "ผู้ถือหุ้นรายใหญ่",
  ];
  for (const kw of sectionKws) {
    const idx = text.indexOf(kw);
    if (idx === -1) continue;
    const nearby = text.slice(idx, idx + 5000);

    // Strategy 1: find "รวมกลุ่ม" row
    const groupMatch = nearby.match(
      new RegExp(`รวมกลุ่ม[^\\d]*[\\d,\\s]+\\s+(${THAI_NUMBER_TOKEN})\\s+[\\d,\\s]+\\s+(${THAI_NUMBER_TOKEN})`),
    );
    if (groupMatch) {
      const val = parseThaiPct(groupMatch[2].replace(/ /g, ""));
      if (val !== null && val > 0 && val < 100) {
        result.executive_total_pct = val;
        break;
      }
    }

    // Strategy 2: first real shareholder row with before/after IPO percentage.
    const rowPattern = new RegExp(
      `(?<name>(?:\\d+\\.\\s*)?[^\\d]{3,120}?)\\s+` +
        `(?<sharesBefore>[\\d,\\s]+|-)\\s+(?<pctBefore>${THAI_NUMBER_TOKEN})\\s+` +
        `(?<sharesAfter>[\\d,\\s]+|-)\\s+(?<pctAfter>${THAI_NUMBER_TOKEN})`,
      "g",
    );
    for (const rowMatch of nearby.matchAll(rowPattern)) {
      const name = (rowMatch.groups?.name ?? "").replace(/\s+/g, " ").trim();
      if (["เสนอขาย", "ประชาชนทั่วไป", "IPO", "รวม"].some((skip) => name.includes(skip))) {
        continue;
      }
      const val = parseThaiPct((rowMatch.groups?.pctAfter ?? "").replace(/ /g, ""));
      if (val !== null && val > 0 && val < 100) {
        result.executive_total_pct = val;
        break;
      }
    }
    if (result.executive_total_pct !== undefined) break;

    // Strategy 3: explicit % near ผู้บริหาร
    const execMatch = nearby.match(
      new RegExp(`(?:ผู้บริหาร|กรรมการ|ผู้ถือหุ้นรายใหญ่).*?(${THAI_NUMBER_TOKEN})\\s*%`),
    );
    if (execMatch) {
      const val = parseThaiPct(execMatch[1].replace(/ /g, ""));
      if (val !== null && val > 0 && val <= 100) {
        result.executive_total_pct = val;
        break;
      }
    }

    // Strategy 4: "รวม" row with numeric percentages
    const totalMatch = nearby.match(
      new RegExp(`รวม(?:ทั้งหมด|กลุ่ม|ผู้ถือหุ้น)[^\\d]*([\\d][\\d,\\s]*[\\d])\\s+(${THAI_NUMBER_TOKEN})\\s+([\\d][\\d,\\s]*[\\d])\\s+(${THAI_NUMBER_TOKEN})`),
    );
    if (totalMatch) {
      const val = parseThaiPct(totalMatch[4].replace(/ /g, ""));
      if (val !== null && val > 0 && val < 100) {
        result.executive_total_pct = val;
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Excel financial parser
// ---------------------------------------------------------------------------

type LabelMatcher = string | RegExp;

interface IndexedSheetRow {
  cells: Map<number, string>;
  columns: number[];
}

interface XlsxSheetInfo {
  name: string;
  path: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCharCode(Number.parseInt(dec, 10)),
    )
    .replace(/_x000D_/g, " ");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getXmlAttr(tag: string, attr: string): string | null {
  const escaped = escapeRegex(attr);
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}=(["'])(.*?)\\1`));
  return match ? decodeXmlEntities(match[2]) : null;
}

function extractXmlTextNodes(xml: string): string {
  const parts: string[] = [];
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(xml)) !== null) {
    parts.push(decodeXmlEntities(match[1]));
  }
  return parts.join("");
}

function getZipText(zip: AdmZip, entryName: string): string | null {
  const entry = zip.getEntry(entryName.replace(/^\/+/, ""));
  if (!entry) return null;
  return entry.getData().toString("utf-8");
}

function resolveXlsxTargetPath(target: string): string {
  const clean = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.startsWith("xl/")) return path.posix.normalize(clean);
  return path.posix.normalize(`xl/${clean}`);
}

function parseXlsxWorkbookSheets(zip: AdmZip): XlsxSheetInfo[] {
  const workbookXml = getZipText(zip, "xl/workbook.xml");
  const relsXml = getZipText(zip, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) return [];

  const relTargets = new Map<string, string>();
  const relPattern = /<Relationship\b[^>]*>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relPattern.exec(relsXml)) !== null) {
    const id = getXmlAttr(relMatch[0], "Id");
    const target = getXmlAttr(relMatch[0], "Target");
    if (id && target) relTargets.set(id, resolveXlsxTargetPath(target));
  }

  const sheets: XlsxSheetInfo[] = [];
  const sheetPattern = /<sheet\b[^>]*>/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetPattern.exec(workbookXml)) !== null) {
    const tag = sheetMatch[0];
    const name = getXmlAttr(tag, "name");
    const relId = getXmlAttr(tag, "r:id");
    if (!name || !relId) continue;
    const sheetPath = relTargets.get(relId);
    if (sheetPath && zip.getEntry(sheetPath)) {
      sheets.push({ name, path: sheetPath });
    }
  }
  return sheets;
}

function parseXlsxSharedStrings(zip: AdmZip): string[] {
  const xml = getZipText(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  const strings: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null) {
    strings.push(extractXmlTextNodes(match[1]));
  }
  return strings;
}

function columnNumberFromCellRef(ref: string | null): number | null {
  if (!ref) return null;
  const letters = ref.match(/[A-Z]+/i)?.[0];
  if (!letters) return null;
  let col = 0;
  for (const ch of letters.toUpperCase()) {
    col = col * 26 + ch.charCodeAt(0) - 64;
  }
  return col > 0 ? col : null;
}

function extractXlsxCellText(
  cellAttrs: string,
  cellXml: string,
  sharedStrings: string[],
): string {
  const type = getXmlAttr(cellAttrs, "t");
  if (type === "inlineStr") return extractXmlTextNodes(cellXml).trim();

  const value = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (value == null) return extractXmlTextNodes(cellXml).trim();
  const decoded = decodeXmlEntities(value).trim();
  if (type === "s") {
    const idx = Number.parseInt(decoded, 10);
    return Number.isFinite(idx) ? (sharedStrings[idx] ?? "") : "";
  }
  return decoded;
}

function parseXlsxSheetRows(
  zip: AdmZip,
  sheet: XlsxSheetInfo,
  sharedStrings: string[],
): IndexedSheetRow[] {
  const xml = getZipText(zip, sheet.path);
  if (!xml) return [];
  const rows: IndexedSheetRow[] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const cells = new Map<number, string>();
    let cellMatch: RegExpExecArray | null;
    cellPattern.lastIndex = 0;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const colNumber = columnNumberFromCellRef(getXmlAttr(cellMatch[1], "r"));
      if (!colNumber) continue;
      const text = extractXlsxCellText(cellMatch[1], cellMatch[2], sharedStrings).trim();
      if (text) cells.set(colNumber, text);
    }
    if (cells.size > 0) {
      rows.push({
        cells,
        columns: [...cells.keys()].sort((a, b) => a - b),
      });
    }
  }
  return rows;
}

function compileLabelMatchers(
  keywordPatterns: string[],
  regex = false,
): LabelMatcher[] {
  return regex ? keywordPatterns.map((pattern) => new RegExp(pattern, "i")) : keywordPatterns;
}

function sheetLabelMatches(cellText: string, matchers: LabelMatcher[]): boolean {
  const normalized = cellText.replace(/\s+/g, " ").trim();
  for (const matcher of matchers) {
    if (matcher instanceof RegExp) {
      if (matcher.test(normalized)) return true;
    } else if (normalized.includes(matcher)) {
      return true;
    }
  }
  return false;
}

function numbersToRight(
  row: IndexedSheetRow,
  colNumber: number,
  maxOffset: number,
  maxValues: number,
): number[] {
  const values: number[] = [];
  for (let offset = 1; offset <= maxOffset; offset++) {
    const raw = row.cells.get(colNumber + offset);
    if (raw == null) continue;
    const val = parseThaiNumber(raw);
    if (val !== null) {
      values.push(val);
      if (values.length >= maxValues) break;
    }
  }
  return values;
}

function rowMatchesExclusions(row: IndexedSheetRow, exclusions: string[]): boolean {
  if (exclusions.length === 0) return false;
  for (const colNumber of row.columns) {
    const text = (row.cells.get(colNumber) ?? "").replace(/\s+/g, " ").trim();
    for (const ex of exclusions) {
      if (text.includes(ex)) return true;
    }
  }
  return false;
}

function findValueInRows(
  rows: IndexedSheetRow[],
  keywordPatterns: string[],
  regex = false,
  exclusions: string[] = [],
): number | null {
  const matchers = compileLabelMatchers(keywordPatterns, regex);
  for (const row of rows) {
    if (rowMatchesExclusions(row, exclusions)) continue;
    for (const colNumber of row.columns) {
      if (!sheetLabelMatches(row.cells.get(colNumber) ?? "", matchers)) continue;
      const values = numbersToRight(row, colNumber, 7, 1);
      if (values.length > 0) return values[0];
      break;
    }
  }
  return null;
}

function findTwoPeriodValuesInRows(
  rows: IndexedSheetRow[],
  keywordPatterns: string[],
  regex = false,
  exclusions: string[] = [],
): [number | null, number | null] {
  const matchers = compileLabelMatchers(keywordPatterns, regex);
  for (const row of rows) {
    if (rowMatchesExclusions(row, exclusions)) continue;
    for (const colNumber of row.columns) {
      if (!sheetLabelMatches(row.cells.get(colNumber) ?? "", matchers)) continue;
      const values = numbersToRight(row, colNumber, 9, 2);
      if (values.length >= 2) return [values[0], values[1]];
      if (values.length === 1) return [values[0], null];
      break;
    }
  }
  return [null, null];
}

function parseBsSheet(rows: IndexedSheetRow[], log: LogCollector): Partial<DocFinancials> {
  const result: Partial<DocFinancials> = {};

  const assets = findValueInRows(rows, [
    "^รวมสินทรัพย์$",
    "^สินทรัพย์รวม$",
    "^Total assets$",
  ], true);
  if (assets !== null) {
    result.total_assets = assets;
    log.log(`    total_assets = ${assets}`);
  }

  const liabilities = findValueInRows(rows, [
    "^รวมหนี้สิน$",
    "^หนี้สินรวม$",
    "^Total liabilities$",
  ], true);
  if (liabilities !== null) {
    result.total_liabilities = liabilities;
    log.log(`    total_liabilities = ${liabilities}`);
  }

  const equity = findValueInRows(rows, [
    "^รวมส่วนของผู้ถือหุ้น.*$",
    "^รวมส่วนของเจ้าของ.*$",
    "^ส่วนของผู้ถือหุ้นรวม$",
    "^ส่วนของเจ้าของรวม$",
    "^Total equity$",
    "^Total shareholders.*equity$",
    "^Total shareholders.*$",
  ], true);
  if (equity !== null) {
    result.total_equity = equity;
    log.log(`    total_equity = ${equity}`);
  } else if (assets !== null && liabilities !== null && assets >= liabilities) {
    result.total_equity = assets - liabilities;
    log.log(`    total_equity = ${result.total_equity} (assets - liabilities)`);
  }

  return result;
}

function parsePlSheet(rows: IndexedSheetRow[], log: LogCollector): Partial<DocFinancials> {
  const result: Partial<DocFinancials> = {};

  const [revLatest, revPrev] = findTwoPeriodValuesInRows(rows, [
    "^รวมรายได้$",
    "^รายได้รวม$",
    "^Total revenue$",
    "^Total income$",
  ], true);
  if (revLatest !== null) {
    result.revenue_latest = revLatest;
    log.log(`    revenue_latest = ${revLatest}`);
  }
  if (revPrev !== null) {
    result.revenue_prev = revPrev;
    log.log(`    revenue_prev = ${revPrev}`);
  }

  const [niLatest, niPrev] = findTwoPeriodValuesInRows(rows, [
    "^กำไรสุทธิสำหรับปี$",
    "^กำไรสำหรับปี$",
    "^กำไร\\(ขาดทุน\\)สำหรับปี$",
    "^กำไร\\s*\\(?\\s*ขาดทุน\\s*\\)?\\s*สำหรับปี.*$",
    "^กำไร.*สำหรับปี.*$",
    "^กำไรสุทธิ.*$",
    "^Net income$",
    "^Profit for the year$",
    "^Net profit$",
  ], true, [
    "กำไรขั้นต้น",
    "กำไรจากการดำเนินงาน",
    "กำไรก่อน",
    "เบ็ดเสร็จ",
    "ต่อหุ้น",
  ]);
  if (niLatest !== null) {
    result.net_income_latest = niLatest;
    log.log(`    net_income_latest = ${niLatest}`);
  }
  if (niPrev !== null) {
    result.net_income_prev = niPrev;
    log.log(`    net_income_prev = ${niPrev}`);
  }

  return result;
}

async function parseFinancialExcel(
  content: Buffer,
  log: LogCollector,
  assumeXlsxWorkbook = false,
): Promise<Partial<DocFinancials>> {
  const result: Partial<DocFinancials> = {};

  let zip: AdmZip;
  try {
    zip = new AdmZip(content);
  } catch (e) {
    log.warn(`Failed to open Excel: ${e}`);
    return result;
  }

  if (!zip.getEntry("xl/workbook.xml")) {
    if (!assumeXlsxWorkbook) {
      const nested = extractXlsxFromZip(content);
      if (nested) return parseFinancialExcel(nested, log, true);
    }
    log.warn("Failed to open Excel: workbook.xml not found");
    return result;
  }

  const sheets = parseXlsxWorkbookSheets(zip);
  const sheetNames = sheets.map((sheet) => sheet.name);
  log.log(`    Excel sheets: ${sheetNames.join(", ")}`);
  if (sheets.length === 0) return result;

  let sharedStrings: string[] | null = null;
  const rowsForSheet = (sheet: XlsxSheetInfo) => {
    sharedStrings ??= parseXlsxSharedStrings(zip);
    return parseXlsxSheetRows(zip, sheet, sharedStrings);
  };

  // Balance Sheet
  let bsSheets = sheets.filter((sheet) => sheet.name.trim().toLowerCase() === "bs");
  if (bsSheets.length === 0) {
    bsSheets = sheets.filter((sheet) =>
      /^BS\b|balance|งบแสดงฐานะ|ฐานะการเงิน|สินทรัพย์|หนี้สิน/i.test(sheet.name),
    );
  }
  for (const bs of bsSheets) {
    const parsed = parseBsSheet(rowsForSheet(bs), log);
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in result)) {
        (result as Record<string, number>)[key] = value as number;
      }
    }
    if (result.total_assets !== undefined && result.total_liabilities !== undefined && result.total_equity !== undefined) {
      break;
    }
  }

  // Profit & Loss
  const plSheet =
    sheets.find((sheet) => sheet.name.trim().toLowerCase() === "pl") ??
    sheets.find((sheet) =>
      /IS|CI|profit|loss|income|งบกำไร|กำไรขาดทุน|รายได้|เบ็ดเสร็จ/i.test(
        sheet.name,
      ),
    );
  if (plSheet) {
    Object.assign(result, parsePlSheet(rowsForSheet(plSheet), log));
  }

  return result;
}

// ---------------------------------------------------------------------------
// SEC filing scraper
// ---------------------------------------------------------------------------

function parseTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    if (cells.length === 0) continue;
    const cleaned = cells
      .map((c) =>
        c[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;?/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((c) => c && c !== ":");
    if (cleaned.length > 0) rows.push(cleaned);
  }
  return rows;
}

async function scrapeSecFiling(
  filingUrl: string,
  log: LogCollector,
  skipDocs = false,
): Promise<SecData> {
  if (!filingUrl) return {};

  try {
    const transId = extractTransId(filingUrl);
    const cachePath = transId ? secPageCachePath(transId) : null;
    let text = cachePath ? await loadTextCache(cachePath, SEC_PAGE_CACHE_TTL_MS) : null;

    if (text && isValidSecPageHtml(text) && transId) {
      log.log(`  SEC page: cache hit for TransID=${transId}`);
    } else {
      if (text && transId) {
        log.warn(`  SEC page: ignoring invalid cache for TransID=${transId}`);
        text = null;
      }
      const resp = await httpsGet(filingUrl, {
        headers: SEC_REQUEST_HEADERS,
        timeout: SEC_PAGE_TIMEOUT,
      });
      if (resp.statusCode !== 200) {
        log.warn(`SEC page ${filingUrl} returned ${resp.statusCode}`);
        if (cachePath) {
          const stale = await loadTextCache(cachePath, SEC_PAGE_CACHE_TTL_MS, true);
          if (stale && isValidSecPageHtml(stale) && transId) {
            log.warn(`  SEC page: using stale cache for TransID=${transId}`);
            text = stale;
          }
        }
        if (!text) return {};
      } else {
        text = resp.body;
        if (!isValidSecPageHtml(text)) {
          log.warn(`SEC page ${filingUrl} returned invalid response (${resp.statusCode})`);
          if (cachePath) {
            const stale = await loadTextCache(cachePath, SEC_PAGE_CACHE_TTL_MS, true);
            if (stale && isValidSecPageHtml(stale) && transId) {
              log.warn(`  SEC page: using stale cache for TransID=${transId}`);
              text = stale;
            } else {
              return {};
            }
          } else {
            return {};
          }
        } else if (cachePath) {
          await saveTextCache(cachePath, text);
        }
      }
    }

    if (!text) return {};
    const result: SecData = {};

    // FA person + company
    const rows = parseTableRows(text);
    for (const row of rows) {
      const joined = row.join(" ");
      if (joined.includes("ที่ปรึกษาทางการเงิน")) {
        const val = row[row.length - 1] || "";
        if (val.includes("/")) {
          const parts = val.split("/").map((p) => p.trim());
          result.fa_company_sec = parts[0];
          const faPerson = parts[1];
          if (faPerson && faPerson !== "N.A." && faPerson !== "-") {
            result.fa_person = faPerson;
            log.log(`  SEC: FA person = ${faPerson}`);
          }
        } else {
          result.fa_company_sec = val;
        }
        break;
      }
    }

    // Financial periods
    const finPeriods = [
      ...text.matchAll(/\[ส่วนที่ 3\] - งบการเงิน\s+([^<]+)/g),
    ];
    if (finPeriods.length > 0) {
      result.financial_periods_available = finPeriods.map((m) => m[1].trim());
      log.log(`  SEC: found ${finPeriods.length} financial periods`);
    }

    // Deep document scraping
    if (!skipDocs) {
      if (transId) {
        result.doc_financials = await scrapeSecDocuments(transId, text, log);
      }
    } else if (transId) {
      log.log(`  SEC docs: skipped for TransID=${transId}`);
    }

    return result;
  } catch (e) {
    log.warn(`SEC scrape failed for ${filingUrl}: ${e}`);
    return {};
  }
}

async function scrapeSecDocuments(
  transId: string,
  filingHtml: string,
  log: LogCollector,
): Promise<Partial<DocFinancials>> {
  const result: Partial<DocFinancials> = {};

  const sections = parseFilingIndex(filingHtml);
  if (sections.length === 0) {
    log.warn(`  SEC docs: no sections found for TransID=${transId}`);
    return result;
  }
  log.log(
    `  SEC docs: found ${sections.length} sections for TransID=${transId}`,
  );

  const subUrl = findSectionUrl(
    sections,
    "การจอง การจำหน่าย และการจัดสรร",
    "การจอง",
  );
  const secUrl = findSectionUrl(
    sections,
    "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
    "รายละเอียดของหลักทรัพย์",
  );
  const structUrl = findSectionUrl(sections, "โครงสร้างและการดำเนินงาน");
  const appendixUrl = findSectionUrl(
    sections,
    "รายละเอียดเกี่ยวกับกรรมการ",
    "เอกสารแนบ 1",
  );
  const fsUrl = findLatestAnnualFsUrl(sections);
  const docUrls = {
    subscription: subUrl,
    securities: secUrl,
    structure: structUrl,
    appendix_executive: appendixUrl,
    financialStatements: fsUrl,
  };
  const cachePath = secDocCachePath(transId, docUrls);
  const cached = await loadJsonCache<Partial<DocFinancials>>(cachePath, SEC_DOC_CACHE_TTL_MS);
  if (cached) {
    const cachedFieldCount = countDocFinancialFields(cached);
    if (cachedFieldCount >= SEC_DOC_MIN_FIELDS) {
      log.log(`  SEC docs: cache hit for TransID=${transId} (${cachedFieldCount} fields)`);
      return cached;
    }
    log.warn(
      `  SEC docs: ignoring partial cache for TransID=${transId} (${cachedFieldCount}/${SEC_DOC_MIN_FIELDS} fields)`,
    );
  }

  // Build parallel fetch tasks for text-based documents
  type TextTask = {
    name: string;
    url: string;
    parser: (text: string) => Partial<DocFinancials>;
  };
  const textTasks: TextTask[] = [];
  if (subUrl)
    textTasks.push({
      name: "subscription",
      url: subUrl,
      parser: parseSubscriptionReport,
    });
  if (secUrl)
    textTasks.push({
      name: "securities",
      url: secUrl,
      parser: parseSecuritiesOffering,
    });
  if (structUrl)
    textTasks.push({
      name: "structure",
      url: structUrl,
      parser: parseShareholderInfo,
    });
  if (appendixUrl && appendixUrl !== structUrl)
    textTasks.push({
      name: "appendix_executive",
      url: appendixUrl,
      parser: parseShareholderInfo,
    });

  type DocTaskResult = {
    name: string;
    parsed: Partial<DocFinancials>;
    failed: boolean;
  };
  const tasks: (() => Promise<DocTaskResult>)[] = [];

  for (const task of textTasks) {
    tasks.push(async () => {
      log.log(`  SEC docs: fetching ${task.name}...`);
      const buf = await fetchBuffer(task.url, SEC_DOC_TIMEOUT, SEC_DOC_RETRIES);
      if (!buf) return { name: task.name, parsed: {}, failed: true };
      let text: string;
      const docxText = extractDocxTextIfDocx(buf);
      if (docxText !== null) {
        text = docxText;
      } else {
        text = buf
          .toString("utf-8")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ");
      }
      if (!text) return { name: task.name, parsed: {}, failed: true };
      return { name: task.name, parsed: task.parser(text), failed: false };
    });
  }

  if (fsUrl) {
    tasks.push(async () => {
      log.log("  SEC docs: fetching Financial Statements...");
      const buf = await fetchBuffer(fsUrl, SEC_FS_TIMEOUT, SEC_DOC_RETRIES);
      if (!buf) return { name: "fs", parsed: {}, failed: true };
      log.log(`  SEC docs: FS size = ${buf.length} bytes`);
      if (SEC_FS_MAX_BYTES > 0 && buf.length > SEC_FS_MAX_BYTES) {
        log.warn(
          `  SEC docs: Financial Statements skipped; ${buf.length} bytes exceeds SCRAPER_SEC_FS_MAX_BYTES=${SEC_FS_MAX_BYTES}`,
        );
        return { name: "fs", parsed: {}, failed: true };
      }
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        const inspected = inspectFsZip(buf);
        if (inspected.kind === "docx") {
          log.log("  SEC docs: FS is DOCX, skipping (need Excel)");
          return { name: "fs", parsed: {}, failed: false };
        }
        if (inspected.kind === "xlsx-in-zip" && inspected.xlsx) {
          return {
            name: "fs",
            parsed: await withFsParseSlot(() => parseFinancialExcel(inspected.xlsx!, log, true)),
            failed: false,
          };
        }
      }
      return {
        name: "fs",
        parsed: await withFsParseSlot(() => parseFinancialExcel(buf, log)),
        failed: false,
      };
    });
  }

  const settled = await withConcurrency(tasks, SEC_DOC_WORKERS);
  let fetchFailed = false;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (r.value.failed) fetchFailed = true;
      for (const [key, value] of Object.entries(r.value.parsed)) {
        if (value != null && !(key in result)) {
          (result as Record<string, number>)[key] = value as number;
        }
      }
    } else {
      fetchFailed = true;
      log.warn(`  SEC docs: parallel fetch failed: ${r.reason}`);
    }
  }

  const extractedFieldCount = countDocFinancialFields(result);
  if (Object.keys(result).length > 0) {
    log.log(
      `  SEC docs: extracted ${extractedFieldCount} financial fields from documents`,
    );
    if (fetchFailed) {
      log.warn(`  SEC docs: not caching partial result for TransID=${transId}`);
    } else if (extractedFieldCount < SEC_DOC_MIN_FIELDS) {
      log.warn(
        `  SEC docs: not caching incomplete financials for TransID=${transId} (${extractedFieldCount}/${SEC_DOC_MIN_FIELDS} fields)`,
      );
    } else {
      await saveJsonCache(cachePath, result as Record<string, unknown>);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transform SET data → DB schema
// ---------------------------------------------------------------------------

function parseOfferedShares(noOfIPO: string | null | undefined): number | null {
  if (!noOfIPO) return null;
  const m = noOfIPO.replace(/ /g, "").match(/^([\d,]+)/);
  if (!m) return null;
  const val = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(val) ? val : null;
}

function transformIpo(
  raw: RawSetIpo,
  secData: SecData,
): TransformedRecord | null {
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

  const faPerson = secData.fa_person;
  const faPersonsList = faPerson ? [faPerson] : null;

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
    fa_persons: faPersonsList,
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

  const docFin = secData.doc_financials ?? {};
  const finFields = [
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
  ] as const;
  for (const field of finFields) {
    const val = docFin[field];
    if (val != null) financials[field] = val;
  }

  const finOfferedShares = Number(financials.offered_shares);
  const ipoPrice = Number(raw.ipoPrice);
  if (
    financials.gross_proceeds == null &&
    Number.isFinite(finOfferedShares) &&
    finOfferedShares > 0 &&
    Number.isFinite(ipoPrice) &&
    ipoPrice > 0
  ) {
    financials.gross_proceeds = finOfferedShares * ipoPrice;
  }

  const totalAssets = Number(financials.total_assets);
  const totalLiabilities = Number(financials.total_liabilities);
  if (
    financials.total_equity == null &&
    Number.isFinite(totalAssets) &&
    Number.isFinite(totalLiabilities) &&
    totalAssets >= totalLiabilities
  ) {
    financials.total_equity = totalAssets - totalLiabilities;
  }

  const secMeta: Record<string, unknown> = {
    filing_url: raw.filingUrl,
    sec_trans_id: extractTransId(raw.filingUrl),
    executive_summary_url: raw.executiveSummaryUrl,
    par_value: raw.par,
    pe_ratio: raw.pe,
    market_cap: raw.marketCap,
    issued_size: raw.issuedSize,
    financial_periods: secData.financial_periods_available,
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
): Promise<UpsertSummary> {
  const summary: UpsertSummary = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  if (records.length === 0) return summary;

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

  // Sync relationship tables only when IPO core rows changed.
  if (summary.inserted + summary.updated > 0) {
    try {
      const syncRows = await query<{ action: string; count: string }>(
        "SELECT * FROM sync_underwriters_from_ipos()",
      );
      for (const row of syncRows) {
        log.log(`  [DB] sync ${row.action}=${row.count}`);
      }
    } catch (e) {
      log.warn(`  [DB] relation sync skipped: ${e}`);
    }
  } else {
    log.log("  [DB] relation sync skipped: no IPO core changes");
  }

  log.log(`DB upsert done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return summary;
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

async function fetchExistingIpoSnapshots(
  symbols: string[],
  log: LogCollector,
): Promise<Map<string, ExistingIpoSnapshot>> {
  const snapshots = new Map<string, ExistingIpoSnapshot>();
  if (symbols.length === 0) return snapshots;

  const docFieldExpr = DOC_FINANCIAL_COLUMNS.map(
    (column) => `(f.${column} IS NOT NULL)::int`,
  ).join(" + ");

  try {
    const rows = await query<ExistingIpoSnapshot>(
      `SELECT i.symbol, COALESCE(${docFieldExpr}, 0)::int AS doc_field_count
       FROM ipos i
       LEFT JOIN ipo_financials f ON f.ipo_id = i.id
       WHERE i.symbol = ANY($1)`,
      [symbols],
    );
    for (const row of rows) {
      snapshots.set(row.symbol, {
        symbol: row.symbol,
        doc_field_count: Number(row.doc_field_count ?? 0),
      });
    }
    log.log(`Pre-fetched ${snapshots.size} existing IPO snapshots for SEC doc strategy`);
  } catch (e) {
    log.warn(`Failed to pre-fetch IPO snapshots; SEC docs will use ${SEC_DOC_MODE} fallback: ${e}`);
  }

  return snapshots;
}

function shouldScrapeSecDocs(
  symbol: string,
  existingSnapshots: Map<string, ExistingIpoSnapshot>,
): boolean {
  if (SEC_DOC_MODE === "full") return true;
  if (SEC_DOC_MODE === "skip") return false;

  const existing = existingSnapshots.get(symbol);
  if (!existing) return true;
  return Number(existing.doc_field_count ?? 0) < SEC_DOC_MIN_FIELDS;
}

function shouldScrapeSecPage(
  symbol: string,
  existingSnapshots: Map<string, ExistingIpoSnapshot>,
  scrapeDocs: boolean,
): boolean {
  if (SEC_PAGE_MODE === "full") return true;
  if (scrapeDocs) return true;
  return !existingSnapshots.has(symbol);
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

    const existingSnapshots = await fetchExistingIpoSnapshots(
      rawIpos.map((ipo) => ipo.symbol).filter((symbol): symbol is string => Boolean(symbol)),
      log,
    );

    // 2. Scrape SEC filings in parallel
    const secTargets = rawIpos
      .filter((ipo) => ipo.filingUrl)
      .map((ipo) => ({
        symbol: ipo.symbol ?? "?",
        url: ipo.filingUrl!,
      }));

    const secDataMap = new Map<string, SecData>();
    if (secTargets.length > 0) {
      let secCompleted = 0;
      let lastLogFlushAt = 0;
      log.log(
        `Scraping ${secTargets.length} SEC filings (${SEC_WORKERS} workers, pages=${SEC_PAGE_MODE}, docs=${SEC_DOC_MODE})...`,
      );
      const secTasks = secTargets.map(
        ({ symbol, url }) =>
          async (): Promise<[string, SecData]> => {
            const started = Date.now();
            const scrapeDocs = shouldScrapeSecDocs(symbol, existingSnapshots);
            const scrapePage = shouldScrapeSecPage(symbol, existingSnapshots, scrapeDocs);
            try {
              if (!scrapePage) {
                return [symbol, {}];
              }
              return [symbol, await scrapeSecFiling(url, log, !scrapeDocs)];
            } finally {
              secCompleted += 1;
              log.log(
                `SEC ${symbol}: done in ${((Date.now() - started) / 1000).toFixed(1)}s (${secCompleted}/${secTargets.length}, ${scrapePage ? (scrapeDocs ? "deep" : "shallow") : "skipped"})`,
              );
              const now = Date.now();
              const isFinal = secCompleted === secTargets.length;
              if (
                isFinal ||
                secCompleted % PROGRESS_LOG_EVERY === 0 ||
                now - lastLogFlushAt >= 10_000
              ) {
                lastLogFlushAt = now;
                await updateLogExcerpt(runId, log.getExcerpt());
              }
            }
          },
      );

      const settled = await withConcurrency(secTasks, SEC_WORKERS);
      for (const r of settled) {
        if (r.status === "fulfilled") {
          const [sym, data] = r.value;
          secDataMap.set(sym, data);
        } else {
          log.warn(`SEC scrape failed: ${r.reason}`);
        }
      }
      log.log("SEC scraping done");
    }

    // 3. Transform
    const records: TransformedRecord[] = [];
    for (const ipo of rawIpos) {
      const symbol = ipo.symbol ?? "?";
      const rec = transformIpo(ipo, secDataMap.get(symbol) ?? {});
      if (rec) records.push(rec);
    }

    // 4. Upsert to DB
    const summary = await upsertToPostgres(records, runId, log);

    // 5. Rebuild public data so /api/ipo-data sees the scraped financials.
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

    // 6. Finalize
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
