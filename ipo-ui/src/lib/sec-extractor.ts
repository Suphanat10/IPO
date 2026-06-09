import https from "node:https";
import crypto from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import type { SecSourceEvidence } from "./sec-source-files";

// ---------------------------------------------------------------------------
// SEC extraction engine.
//
// Downloads the documents linked from a ก.ล.ต. (market.sec.or.th) filing
// index and extracts financial fields WITH evidence (source text / sheet /
// row / column / extraction_method) for every value. It performs
// NO database writes and NO import decisions — it returns structured per-file
// results that sec-pipeline.ts stages and (conditionally) imports.
//
// Supported file formats (phase 1): Excel (.xlsx, incl. nested in .zip) and
// CSV for financial statements; DOCX / HTML for the prose offering docs.
// ---------------------------------------------------------------------------

const SEC_DOC_TIMEOUT = Number(process.env.SCRAPER_SEC_DOC_TIMEOUT ?? 45) * 1000;
const SEC_PAGE_TIMEOUT = Number(process.env.SCRAPER_SEC_PAGE_TIMEOUT ?? 30) * 1000;
// FS Excel files are ~1 MB and normally download in a few seconds; a 60s cap
// fails a hung/throttled download fast instead of holding the whole run open
// for up to ~240s (the old 120s × 2 attempts). Retries default to 0 — a server
// that is hanging rarely recovers on an immediate retry, and the next scheduled
// run (twice daily) re-attempts anyway. Both are still overridable via env.
const SEC_FS_TIMEOUT = Number(process.env.SCRAPER_SEC_FS_TIMEOUT ?? 60) * 1000;
const SEC_FS_MAX_BYTES = Number(process.env.SCRAPER_SEC_FS_MAX_BYTES ?? 0);
const SEC_DOC_RETRIES = Number(process.env.SCRAPER_SEC_DOC_RETRIES ?? 0);
const SEC_RETRY_SLEEP_MS = Number(process.env.SCRAPER_SEC_RETRY_SLEEP_SECONDS ?? 0.5) * 1000;
const SEC_PARSER_VERSION = "financials-v10";

const SEC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const SEC_REQUEST_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": SEC_USER_AGENT,
};

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

// ---------------------------------------------------------------------------
// Logger contract (matches scraper's LogCollector)
// ---------------------------------------------------------------------------

export interface SecLogger {
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocFinancials {
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

export const DOC_FINANCIAL_COLUMNS: (keyof DocFinancials)[] = [
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

/** Result of extracting a single downloaded document/file. */
export interface SecFileExtraction {
  source_url: string;
  file_name: string | null;
  /** xlsx | xlsx-in-zip | csv | docx | html | unknown */
  file_kind: string;
  byte_size: number;
  content_sha256: string;
  trans_file_seq: number | null;
  sheet_names: string[] | null;
  recognized_sheets: string[] | null;
  unknown_sheets: string[] | null;
  format_ok: boolean;
  fields: Partial<DocFinancials>;
  evidence: Record<string, SecSourceEvidence>;
  validation_status: "passed" | "failed" | "skipped";
  validation_messages: string[];
  /** Set when the file cannot be auto-imported as-is (bad format/validation). */
  review_reason: string | null;
}

export interface SecFilingResult {
  fa_person?: string;
  fa_company_sec?: string;
  financial_periods_available?: string[];
  files: SecFileExtraction[];
}

// ---------------------------------------------------------------------------
// HTTP helpers (SEC-tuned)
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGet(
  url: string,
  opts: { headers?: Record<string, string>; timeout?: number; maxRedirects?: number } = {},
): Promise<{ statusCode: number; body: string }> {
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
          httpsGet(redirectUrl, { ...opts, maxRedirects: maxRedir - 1 })
            .then(resolve)
            .catch(reject);
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
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
          httpsGetBuffer(redirectUrl, { ...opts, maxRedirects: maxRedir - 1 })
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

async function fetchBuffer(url: string, timeout: number, retries = 0): Promise<Buffer | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const buf = await httpsGetBuffer(url, { headers: SEC_REQUEST_HEADERS, timeout });
      if (buf) return buf;
    } catch {
      // retry
    }
    if (attempt < retries) await sleep(SEC_RETRY_SLEEP_MS);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Thai number parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Thai/Western grouped number into a JS number. Tolerant of the noise
 * that survives scraping: thousands separators (`52,769,000`), stray spaces from
 * a line break that `normalizeDocText` collapsed (`52, 769, 000`), currency or
 * unit words, etc. Returns null when there is no real number (e.g. a lone "-").
 */
export function parseThaiNumber(text: string): number | null {
  if (!text) return null;
  // Drop everything except digits, separators and a sign, then remove the
  // grouping commas/spaces so "52, 769,000" -> "52769000".
  const cleaned = text.replace(/[^\d.,\-\s]/g, "").replace(/[,\s]/g, "");
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
  return (text ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function snippet(text: string, start: number, len = 220): string {
  return text.slice(start, start + len).trim();
}

interface TextHit {
  value: number;
  sourceText: string;
}

function moneyValuesInText(text: string): { value: number; index: number }[] {
  const values: { value: number; index: number }[] = [];
  const moneyRegex = new RegExp(`(${THAI_NUMBER_TOKEN})\\s*(ล้านบาท|บาท)`, "g");
  for (const match of text.matchAll(moneyRegex)) {
    let val = parseThaiNumber(match[1].replace(/ /g, ""));
    if (val === null) continue;
    if (match[2] === "ล้านบาท") val *= 1_000_000;
    if (Math.abs(val) >= 1_000) values.push({ value: val, index: match.index ?? 0 });
  }
  return values;
}

/** First money value near any keyword, with the surrounding sentence as evidence. */
function moneyNearKeywords(text: string, keywords: string[], window = 800): TextHit | null {
  for (const keyword of keywords) {
    const idx = text.indexOf(keyword);
    if (idx === -1) continue;
    const region = text.slice(idx, idx + window);
    const values = moneyValuesInText(region);
    if (values.length > 0) {
      return { value: values[0].value, sourceText: snippet(region, 0) };
    }
  }
  return null;
}

function firstPctHit(text: string): TextHit | null {
  const patterns = [
    new RegExp(`ร้อยละ\\s*(${THAI_NUMBER_TOKEN})`),
    new RegExp(`(${THAI_NUMBER_TOKEN})\\s*%`),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const val = parseThaiPct(match[1].replace(/ /g, ""));
    if (val !== null && val >= 0 && val <= 100) {
      const at = match.index ?? 0;
      return { value: val, sourceText: snippet(text, Math.max(0, at - 60)) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filing index parser
// ---------------------------------------------------------------------------

interface FilingSection {
  title: string;
  url: string;
  seq: number;
}

export function extractTransId(filingUrl: string | undefined): string | null {
  if (!filingUrl) return null;
  const m = filingUrl.match(/TransID=(\d+)/);
  return m ? m[1] : null;
}

function transFileSeqFromUrl(url: string): number | null {
  const m = url.match(/TransFileSeq=(\d+)/i);
  return m ? Number(m[1]) : null;
}

function fileNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const fn = u.searchParams.get("FileName") ?? u.searchParams.get("filename");
    if (fn) return decodeURIComponent(fn);
  } catch {
    /* ignore */
  }
  return null;
}

function isSecRejectionText(text: string | null | undefined): boolean {
  if (!text) return false;
  const lowered = text.toLowerCase();
  return lowered.includes("request rejected") || lowered.includes("requested url was rejected");
}

function isValidSecPageHtml(text: string | null | undefined): boolean {
  if (!text || isSecRejectionText(text)) return false;
  return (
    text.includes("RadGrid1") ||
    text.includes("IPOSGetFile.aspx") ||
    text.includes("ContentPlaceHolder1_RadGrid1")
  );
}

function bufferLooksLikeSecRejection(buf: Buffer): boolean {
  if (buf.length > 8192) return false;
  return isSecRejectionText(buf.toString("utf-8"));
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

    const seq = transFileSeqFromUrl(bestUrl) ?? -1;
    sections.push({ title, url: bestUrl, seq });
  }
  return sections;
}

function findSectionUrl(sections: FilingSection[], ...keywords: string[]): string | null {
  for (const sec of sections) {
    if (keywords.some((kw) => sec.title.includes(kw))) return sec.url;
  }
  return null;
}

function findLatestAnnualFsUrl(sections: FilingSection[]): string | null {
  // Only the FY 2569 / 2568 annual statements are acceptable. If a filing
  // carries neither, return null so no financial statement is extracted.
  const fsSections: { comparableYear: number; url: string }[] = [];
  for (const sec of sections) {
    if (!sec.title.includes("งบการเงิน")) continue;
    if (/ไตรมาส/.test(sec.title)) continue;
    const yearMatch = sec.title.match(/(\d{4})/);
    if (!yearMatch) continue;
    const cmpYear = comparableYear(Number(yearMatch[1]));
    if (!PREFERRED_LATEST_PERIOD_YEARS.includes(cmpYear)) continue;
    fsSections.push({ comparableYear: cmpYear, url: sec.url });
  }
  if (fsSections.length === 0) return null;
  fsSections.sort((a, b) => b.comparableYear - a.comparableYear);
  return fsSections[0].url;
}

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

// ---------------------------------------------------------------------------
// DOCX / ZIP utilities
// ---------------------------------------------------------------------------

function extractDocxTextIfDocx(content: Buffer): string | null {
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b) return null;
  try {
    const zip = new AdmZip(content);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    const xml = entry.getData().toString("utf-8");
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map((m) => m[1]);
    return texts.join(" ");
  } catch {
    return null;
  }
}

function isXlsxWorkbook(content: Buffer): boolean {
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b) return false;
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
  if (entries.some((e) => e.entryName === "word/document.xml")) return { kind: "docx" };
  for (const entry of entries) {
    if (!/\.(xlsx|xlsm|xls)$/i.test(entry.entryName)) continue;
    const data = entry.getData();
    if (isXlsxWorkbook(data)) return { kind: "xlsx-in-zip", xlsx: data };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// In-browser viewing support
//
// SEC serves financial statements as a .zip (Content-Disposition: attachment)
// with the .xlsx nested inside, so the browser can only download — never open —
// the raw URL. This helper downloads the file and returns the inner Office
// document's bytes so the view-proxy route can serve it inline for the Office
// Online viewer. NO database access; read-only.
// ---------------------------------------------------------------------------

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type SecOfficeFileForView =
  | { ok: true; bytes: Buffer; contentType: string; filename: string }
  | { ok: false; status: number; message: string };

export async function fetchSecOfficeFileForView(
  url: string,
): Promise<SecOfficeFileForView> {
  const buf = await fetchBuffer(url, SEC_FS_TIMEOUT, SEC_DOC_RETRIES);
  if (!buf) {
    return { ok: false, status: 502, message: "ดาวน์โหลดไฟล์จาก ก.ล.ต. ไม่สำเร็จ" };
  }
  if (bufferLooksLikeSecRejection(buf)) {
    return { ok: false, status: 502, message: "SEC rejected the source-file request." };
  }
  // A bare .xlsx download is itself a zip whose top level has xl/workbook.xml.
  if (isXlsxWorkbook(buf)) {
    return {
      ok: true,
      bytes: buf,
      contentType: XLSX_CONTENT_TYPE,
      filename: "financial-statement.xlsx",
    };
  }
  const inspected = inspectFsZip(buf);
  if (inspected.kind === "xlsx-in-zip") {
    return {
      ok: true,
      bytes: inspected.xlsx,
      contentType: XLSX_CONTENT_TYPE,
      filename: "financial-statement.xlsx",
    };
  }
  if (inspected.kind === "docx") {
    // The whole download is the .docx (a zip with word/document.xml).
    return {
      ok: true,
      bytes: buf,
      contentType: DOCX_CONTENT_TYPE,
      filename: "document.docx",
    };
  }
  return {
    ok: false,
    status: 415,
    message: "ไฟล์ต้นทางไม่ใช่ xlsx หรือ docx ที่เปิดดูได้",
  };
}

// ---------------------------------------------------------------------------
// Indexed rows abstraction — shared by Excel and CSV parsers
// ---------------------------------------------------------------------------

interface IndexedSheetRow {
  sheetName: string;
  rowNumber: number;
  cells: Map<number, string>;
  columns: number[];
}

interface XlsxSheetInfo {
  name: string;
  path: string;
}

interface ParsedNumberEvidence {
  value: number;
  sourceText: string;
  sheetName: string;
  rowNumber: number;
  columnNumber: number;
}

interface FinancialParseResult {
  fields: Partial<DocFinancials>;
  evidence: Record<string, SecSourceEvidence>;
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
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number.parseInt(dec, 10)))
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
  while ((match = textPattern.exec(xml)) !== null) parts.push(decodeXmlEntities(match[1]));
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
    if (sheetPath && zip.getEntry(sheetPath)) sheets.push({ name, path: sheetPath });
  }
  return sheets;
}

function parseXlsxSharedStrings(zip: AdmZip): string[] {
  const xml = getZipText(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  const strings: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null) strings.push(extractXmlTextNodes(match[1]));
  return strings;
}

function columnNumberFromCellRef(ref: string | null): number | null {
  if (!ref) return null;
  const letters = ref.match(/[A-Z]+/i)?.[0];
  if (!letters) return null;
  let col = 0;
  for (const ch of letters.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col > 0 ? col : null;
}

function columnNameFromNumber(colNumber: number): string {
  let n = colNumber;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label || String(colNumber);
}

/**
 * Build evidence text for a single extracted value: the row's label / text
 * cells plus only the cell that was actually extracted. Other numeric columns
 * (e.g. the comparative previous-year period) are intentionally dropped so the
 * evidence reflects the one value we keep — not the whole row. When the period
 * year is known it is appended in Buddhist Era so reviewers can see which year
 * (e.g. พ.ศ. 2569 / 2568) the value was taken from.
 */
function rowEvidenceText(row: IndexedSheetRow, valueColumn: number, beYear?: number): string {
  const parts: string[] = [];
  for (const column of row.columns) {
    const cell = row.cells.get(column)?.replace(/\s+/g, " ").trim();
    if (!cell) continue;
    if (column === valueColumn) {
      parts.push(beYear ? `${cell} (พ.ศ. ${beYear})` : cell);
    } else if (parseThaiNumber(cell) === null) {
      // Keep label / descriptive cells; drop other numeric (period / note) columns.
      parts.push(cell);
    }
  }
  return parts.join(" | ");
}

function evidenceFromParsedNumber(
  fieldName: keyof DocFinancials,
  parsed: ParsedNumberEvidence,
  extractionMethod: string,
): SecSourceEvidence {
  return {
    field_name: fieldName,
    extracted_value: parsed.value,
    source_text: parsed.sourceText,
    sheet_name: parsed.sheetName,
    row_number: parsed.rowNumber,
    column_name: columnNameFromNumber(parsed.columnNumber),
    extraction_method: extractionMethod,
    parser: SEC_PARSER_VERSION,
  };
}

function extractXlsxCellText(cellAttrs: string, cellXml: string, sharedStrings: string[]): string {
  const type = getXmlAttr(cellAttrs, "t");
  if (type === "inlineStr") return extractXmlTextNodes(cellXml).trim();
  const value = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (value == null) return extractXmlTextNodes(cellXml).trim();
  const decoded = decodeXmlEntities(value).trim();
  if (type === "s") {
    const idx = Number.parseInt(decoded, 10);
    return Number.isFinite(idx) ? sharedStrings[idx] ?? "" : "";
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
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const cells = new Map<number, string>();
    let cellMatch: RegExpExecArray | null;
    cellPattern.lastIndex = 0;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const colNumber = columnNumberFromCellRef(getXmlAttr(cellMatch[1], "r"));
      if (!colNumber) continue;
      const text = extractXlsxCellText(cellMatch[1], cellMatch[2] ?? "", sharedStrings).trim();
      if (text) cells.set(colNumber, text);
    }
    if (cells.size > 0) {
      rows.push({
        sheetName: sheet.name,
        rowNumber: Number(getXmlAttr(rowMatch[0], "r")) || rows.length + 1,
        cells,
        columns: [...cells.keys()].sort((a, b) => a - b),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CSV parsing → IndexedSheetRow[]
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function parseCsvRows(content: Buffer, sheetName = "CSV"): IndexedSheetRow[] {
  // Strip a UTF-8 BOM if present.
  let text = content.toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\r|\n/);
  const rows: IndexedSheetRow[] = [];
  lines.forEach((line, idx) => {
    if (line.trim() === "") return;
    const cellValues = parseCsvLine(line);
    const cells = new Map<number, string>();
    cellValues.forEach((value, colIdx) => {
      const trimmed = value.replace(/\s+/g, " ").trim();
      if (trimmed) cells.set(colIdx + 1, trimmed);
    });
    if (cells.size > 0) {
      rows.push({
        sheetName,
        rowNumber: idx + 1,
        cells,
        columns: [...cells.keys()].sort((a, b) => a - b),
      });
    }
  });
  return rows;
}

function looksLikeCsv(content: Buffer): boolean {
  // Not a zip (xlsx/docx start with PK), and contains commas + newlines.
  if (content.length >= 2 && content[0] === 0x50 && content[1] === 0x4b) return false;
  const head = content.subarray(0, 4096).toString("utf-8");
  return head.includes(",") && /\r?\n/.test(head);
}

// ---------------------------------------------------------------------------
// Statement-row matchers
// ---------------------------------------------------------------------------

type LabelMatcher = string | RegExp;

function compileLabelMatchers(keywordPatterns: string[], regex = false): LabelMatcher[] {
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

function parsedNumbersToRight(
  row: IndexedSheetRow,
  colNumber: number,
  maxOffset: number,
  maxValues: number,
): ParsedNumberEvidence[] {
  const values: ParsedNumberEvidence[] = [];
  for (let offset = 1; offset <= maxOffset; offset++) {
    const targetColumn = colNumber + offset;
    const raw = row.cells.get(targetColumn);
    if (raw == null) continue;
    const val = parseThaiNumber(raw);
    if (val !== null) {
      values.push({
        value: val,
        sourceText: rowEvidenceText(row, targetColumn),
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        columnNumber: targetColumn,
      });
      if (values.length >= maxValues) break;
    }
  }
  return values;
}

type PeriodColumn = {
  columnNumber: number;
  rawYear: number;
  comparableYear: number;
};

type PeriodColumns = {
  latest: PeriodColumn;
};

const PREFERRED_LATEST_PERIOD_YEARS = [
  2026, // BE 2569
  2025, // BE 2568
];

function extractPeriodYear(text: string): number | null {
  const matches = text.match(/\b(?:25\d{2}|20\d{2}|19\d{2})\b/g);
  if (!matches) return null;
  for (const match of matches) {
    const year = Number(match);
    if (
      Number.isInteger(year) &&
      ((year >= 2400 && year <= 2600) || (year >= 1900 && year <= 2100))
    ) {
      return year;
    }
  }
  return null;
}

function comparableYear(year: number): number {
  return year >= 2400 ? year - 543 : year;
}

function pickPeriodColumns(years: PeriodColumn[]): PeriodColumns | null {
  if (years.length === 0) return null;
  const sorted = [...years].sort((a, b) => {
    if (b.comparableYear !== a.comparableYear) return b.comparableYear - a.comparableYear;
    return a.columnNumber - b.columnNumber;
  });
  // The latest period must be FY 2569 / 2568. Anything older is skipped (no
  // fallback to the newest available year) so stale figures are never pulled.
  const latest = PREFERRED_LATEST_PERIOD_YEARS.map((year) =>
    sorted.find((period) => period.comparableYear === year),
  ).find((period): period is PeriodColumn => period !== undefined);
  if (!latest) return null;
  return { latest };
}

// "ok"       → period header found with an acceptable FY 2569/2568 column
// "rejected" → period header found, but its years are all older → skip field
// "none"     → no period header at all → caller may use the legacy fallback
type PeriodLookup =
  | { status: "ok"; columns: PeriodColumns }
  | { status: "rejected" }
  | { status: "none" };

function findPeriodColumnsForRow(
  rows: IndexedSheetRow[],
  targetRow: IndexedSheetRow,
  labelColumn: number,
): PeriodLookup {
  // Financial statements often have spacer/note columns between the latest
  // and previous periods. Lock onto the header years first, then read those
  // exact columns instead of taking the first two numeric cells to the right.
  const candidateRows = rows
    .filter((row) => row.rowNumber < targetRow.rowNumber)
    .sort((a, b) => b.rowNumber - a.rowNumber);

  for (const row of candidateRows) {
    const byYear = new Map<number, PeriodColumn>();
    for (const columnNumber of row.columns) {
      if (columnNumber <= labelColumn) continue;
      const raw = row.cells.get(columnNumber);
      if (!raw) continue;
      const rawYear = extractPeriodYear(raw);
      if (rawYear === null) continue;
      const yearKey = comparableYear(rawYear);
      const existing = byYear.get(yearKey);
      if (!existing || columnNumber < existing.columnNumber) {
        byYear.set(yearKey, {
          columnNumber,
          rawYear,
          comparableYear: yearKey,
        });
      }
    }

    // The nearest year-bearing row above the data row IS the period header.
    if (byYear.size === 0) continue;
    const picked = pickPeriodColumns([...byYear.values()]);
    return picked ? { status: "ok", columns: picked } : { status: "rejected" };
  }

  return { status: "none" };
}

function parsedNumberAtColumn(
  row: IndexedSheetRow,
  columnNumber: number,
  beYear?: number,
): ParsedNumberEvidence | null {
  const raw = row.cells.get(columnNumber);
  if (raw == null) return null;
  const value = parseThaiNumber(raw);
  if (value === null) return null;
  return {
    value,
    sourceText: rowEvidenceText(row, columnNumber, beYear),
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    columnNumber,
  };
}

function rowMatchesExclusions(row: IndexedSheetRow, exclusions: string[]): boolean {
  if (exclusions.length === 0) return false;
  for (const colNumber of row.columns) {
    const text = (row.cells.get(colNumber) ?? "").replace(/\s+/g, " ").trim();
    for (const ex of exclusions) if (text.includes(ex)) return true;
  }
  return false;
}

function findValueInRows(
  rows: IndexedSheetRow[],
  keywordPatterns: string[],
  regex = false,
  exclusions: string[] = [],
): ParsedNumberEvidence | null {
  const matchers = compileLabelMatchers(keywordPatterns, regex);
  for (const row of rows) {
    if (rowMatchesExclusions(row, exclusions)) continue;
    for (const colNumber of row.columns) {
      if (!sheetLabelMatches(row.cells.get(colNumber) ?? "", matchers)) continue;
      const lookup = findPeriodColumnsForRow(rows, row, colNumber);
      if (lookup.status === "ok") {
        const beYear = lookup.columns.latest.comparableYear + 543;
        const value = parsedNumberAtColumn(row, lookup.columns.latest.columnNumber, beYear);
        if (value !== null) return value;
        break;
      }
      // Period header exists but its years are not FY 2569/2568 → skip this
      // label and keep scanning; never grab an arbitrary adjacent number.
      if (lookup.status === "rejected") break;
      const values = parsedNumbersToRight(row, colNumber, 7, 1);
      if (values.length > 0) return values[0];
      break;
    }
  }
  return null;
}

function parseBsSheet(rows: IndexedSheetRow[], log: SecLogger): FinancialParseResult {
  const result: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};

  const assets = findValueInRows(rows, ["^รวมสินทรัพย์$", "^สินทรัพย์รวม$", "^Total assets$"], true);
  if (assets !== null) {
    result.total_assets = assets.value;
    evidence.total_assets = evidenceFromParsedNumber("total_assets", assets, "xlsx-row-scan");
    log.log(`    total_assets = ${assets.value}`);
  }

  const liabilities = findValueInRows(
    rows,
    ["^รวมหนี้สิน$", "^หนี้สินรวม$", "^Total liabilities$"],
    true,
  );
  if (liabilities !== null) {
    result.total_liabilities = liabilities.value;
    evidence.total_liabilities = evidenceFromParsedNumber(
      "total_liabilities",
      liabilities,
      "xlsx-row-scan",
    );
    log.log(`    total_liabilities = ${liabilities.value}`);
  }

  const equity = findValueInRows(
    rows,
    [
      "^รวมส่วนของผู้ถือหุ้น.*$",
      "^รวมส่วนของเจ้าของ.*$",
      "^ส่วนของผู้ถือหุ้นรวม$",
      "^ส่วนของเจ้าของรวม$",
      "^Total equity$",
      "^Total shareholders.*equity$",
      "^Total shareholders.*$",
    ],
    true,
  );
  if (equity !== null) {
    result.total_equity = equity.value;
    evidence.total_equity = evidenceFromParsedNumber("total_equity", equity, "xlsx-row-scan");
    log.log(`    total_equity = ${equity.value}`);
  } else if (assets !== null && liabilities !== null && assets.value >= liabilities.value) {
    result.total_equity = assets.value - liabilities.value;
    evidence.total_equity = {
      field_name: "total_equity",
      extracted_value: result.total_equity,
      source_text: `Derived from total_assets (${assets.value}) and total_liabilities (${liabilities.value}). Asset row: ${assets.sourceText}. Liability row: ${liabilities.sourceText}`,
      sheet_name: assets.sheetName,
      row_number: assets.rowNumber,
      column_name: columnNameFromNumber(assets.columnNumber),
      extraction_method: "xlsx-derived",
      parser: SEC_PARSER_VERSION,
    };
    log.log(`    total_equity = ${result.total_equity} (assets - liabilities)`);
  }

  return { fields: result, evidence };
}

function parsePlSheet(rows: IndexedSheetRow[], log: SecLogger): FinancialParseResult {
  const result: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};

  const revLatest = findValueInRows(
    rows,
    ["^รวมรายได้$", "^รายได้รวม$", "^Total revenue$", "^Total income$"],
    true,
  );
  if (revLatest !== null) {
    result.revenue_latest = revLatest.value;
    evidence.revenue_latest = evidenceFromParsedNumber("revenue_latest", revLatest, "xlsx-row-scan");
    log.log(`    revenue_latest = ${revLatest.value}`);
  }

  const niLatest = findValueInRows(
    rows,
    [
      "^กำไรสุทธิสำหรับปี$",
      "^กำไรสำหรับปี$",
      "^กำไร\\(ขาดทุน\\)สำหรับปี$",
      "^กำไร\\s*\\(?\\s*ขาดทุน\\s*\\)?\\s*สำหรับปี.*$",
      "^กำไร.*สำหรับปี.*$",
      "^กำไรสุทธิ.*$",
      "^Net income$",
      "^Profit for the year$",
      "^Net profit$",
    ],
    true,
    ["กำไรขั้นต้น", "กำไรจากการดำเนินงาน", "กำไรก่อน", "เบ็ดเสร็จ", "ต่อหุ้น"],
  );
  if (niLatest !== null) {
    result.net_income_latest = niLatest.value;
    evidence.net_income_latest = evidenceFromParsedNumber(
      "net_income_latest",
      niLatest,
      "xlsx-row-scan",
    );
    log.log(`    net_income_latest = ${niLatest.value}`);
  }

  return { fields: result, evidence };
}

function isBsSheetName(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (t === "bs" || t === "fs") return true;
  return /^BS\b|^BS_|^FS\b|^FS_|balance|งบแสดงฐานะ|ฐานะการเงิน|สินทรัพย์|หนี้สิน/i.test(name);
}

function isPlSheetName(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (t === "pl") return true;
  return /^PL\b|^PL_|IS|CI|profit|loss|income|งบกำไร|กำไรขาดทุน|รายได้|เบ็ดเสร็จ/i.test(name);
}

function fsSheetRank(name: string): number {
  const t = name.toLowerCase();
  if (t.includes("conso")) return 0;
  if (t.includes("only")) return 2;
  return 1;
}

function plSheetRank(name: string): number {
  const t = name.trim().toLowerCase();
  const isComprehensive = /^sci\b|^sci_|^ci\b|^ci_|เบ็ดเสร็จ/.test(t);
  const kindRank = isComprehensive ? 10 : 0;
  return kindRank + fsSheetRank(name);
}

interface FsWorkbookInspection {
  sheetNames: string[];
  recognizedSheets: string[];
  unknownSheets: string[];
  formatOk: boolean;
}

function inspectSheetNames(sheetNames: string[]): FsWorkbookInspection {
  const recognizedSheets: string[] = [];
  const unknownSheets: string[] = [];
  for (const name of sheetNames) {
    if (isBsSheetName(name) || isPlSheetName(name)) recognizedSheets.push(name);
    else unknownSheets.push(name);
  }
  return {
    sheetNames,
    recognizedSheets,
    unknownSheets,
    formatOk: recognizedSheets.length > 0,
  };
}

function mergeFields(
  into: Partial<DocFinancials>,
  intoEvidence: Record<string, SecSourceEvidence>,
  from: FinancialParseResult,
  overwrite: boolean,
) {
  for (const [key, value] of Object.entries(from.fields)) {
    if (overwrite || !(key in into)) {
      (into as Record<string, number>)[key] = value as number;
      if (from.evidence[key]) intoEvidence[key] = from.evidence[key];
    }
  }
}

/** Parse an Excel workbook buffer for BS + PL figures with evidence. */
function parseFinancialExcelBuffer(zip: AdmZip, log: SecLogger): FinancialParseResult {
  const result: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};

  const sheets = parseXlsxWorkbookSheets(zip);
  if (sheets.length === 0) return { fields: result, evidence };
  log.log(`    Excel sheets: ${sheets.map((s) => s.name).join(", ")}`);

  let sharedStrings: string[] | null = null;
  const rowsForSheet = (sheet: XlsxSheetInfo) => {
    sharedStrings ??= parseXlsxSharedStrings(zip);
    return parseXlsxSheetRows(zip, sheet, sharedStrings);
  };

  let bsSheets = sheets.filter((sheet) => sheet.name.trim().toLowerCase() === "bs");
  if (bsSheets.length === 0) bsSheets = sheets.filter((sheet) => isBsSheetName(sheet.name));
  bsSheets = [...bsSheets].sort((a, b) => fsSheetRank(a.name) - fsSheetRank(b.name));
  for (const bs of bsSheets) {
    mergeFields(result, evidence, parseBsSheet(rowsForSheet(bs), log), false);
    if (
      result.total_assets !== undefined &&
      result.total_liabilities !== undefined &&
      result.total_equity !== undefined
    )
      break;
  }

  const plSheet =
    sheets.find((sheet) => sheet.name.trim().toLowerCase() === "pl") ??
    sheets
      .filter((sheet) => isPlSheetName(sheet.name))
      .sort((a, b) => plSheetRank(a.name) - plSheetRank(b.name))[0];
  if (plSheet) mergeFields(result, evidence, parsePlSheet(rowsForSheet(plSheet), log), true);

  return { fields: result, evidence };
}

// ---------------------------------------------------------------------------
// Prose document parsers (evidence-bearing)
// ---------------------------------------------------------------------------

function evidenceFromTextHit(
  fieldName: keyof DocFinancials,
  hit: TextHit,
  sourceUrl: string,
): SecSourceEvidence {
  return {
    field_name: fieldName,
    extracted_value: hit.value,
    source_text: hit.sourceText,
    source_file: sourceUrl,
    sheet_name: null,
    row_number: null,
    column_name: null,
    extraction_method: "regex-keyword",
    parser: SEC_PARSER_VERSION,
  };
}

function parseSubscriptionReport(text: string, sourceUrl: string): FinancialParseResult {
  const fields: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};
  const norm = normalizeDocText(text);

  const gross = moneyNearKeywords(norm, [
    "ประมาณการจำนวนเงิน",
    "จำนวนเงินค่าหุ้น",
    "มูลค่าการเสนอขาย",
    "มูลค่ารวมของหุ้น",
  ]);
  if (gross) {
    fields.gross_proceeds = gross.value;
    evidence.gross_proceeds = evidenceFromTextHit("gross_proceeds", gross, sourceUrl);
  }

  const expense = moneyNearKeywords(norm, [
    "รวมค่าใช้จ่าย",
    "รวมค่าใช้จ่ายทั้งสิ้น",
    "ประมาณการค่าใช้จ่าย",
  ]);
  if (expense) {
    fields.total_expense = expense.value;
    evidence.total_expense = evidenceFromTextHit("total_expense", expense, sourceUrl);
  }

  return { fields, evidence };
}

// Section headers / inline labels (Thai + English) that introduce the number of
// offered shares. Kept generic so every IPO filing is covered — never keyed to a
// specific symbol. Order matters: more specific section headers come first.
const OFFERED_SHARES_SECTION_KWS = [
  "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย",
  "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
  "จำนวนหุ้นสามัญที่เสนอขาย",
  "จำนวนหุ้นที่เสนอขาย",
  "Offered shares",
  "Number of shares offered",
  "Number of offered shares",
  "shares offered",
];

// Inline labels for the colon-style fallback ("จำนวนหุ้นที่เสนอขาย : 52,769,000").
const OFFERED_SHARES_LABELS = [
  "จำนวนหุ้นสามัญที่เสนอขายทั้งหมด",
  "จำนวนหุ้นสามัญที่เสนอขาย",
  "จำนวนหุ้นที่เสนอขายทั้งหมด",
  "จำนวนหุ้นที่เสนอขาย",
  "Number of offered shares",
  "Number of shares offered",
  "Offered shares",
];

// Unit that follows a share count: Thai "หุ้น" or English "share(s)".
const SHARE_UNIT = String.raw`(?:หุ้น|shares?)`;

/**
 * Locate the offered-share count in a (normalized) offering document, in Thai or
 * English, tolerating commas/spaces inside the number and the count + unit
 * landing on different scraped lines (normalizeDocText has already joined them).
 *
 * Two passes, most reliable first:
 *   1. Inside an offering section, the first "<number> หุ้น|shares".
 *   2. A bare number immediately after an offered-shares label (with optional
 *      ":" ) — for filings that omit the trailing unit word.
 */
function findOfferedShares(norm: string): TextHit | null {
  const unitRe = new RegExp(`(${THAI_NUMBER_TOKEN})\\s*${SHARE_UNIT}`, "i");
  for (const kw of OFFERED_SHARES_SECTION_KWS) {
    const idx = norm.indexOf(kw);
    if (idx === -1) continue;
    const nearby = norm.slice(idx, idx + 1000);
    const m = nearby.match(unitRe);
    if (m) {
      const val = parseThaiNumber(m[1]);
      if (val !== null && val > 100) {
        // Anchor the evidence on the matched number (with a short lead-in for
        // context) so the reviewer actually SEES the figure. The section header
        // can sit far (>220 chars) from the number, so starting the snippet at
        // the header would cut off before the value ever appears.
        const at = Math.max(0, (m.index ?? 0) - 80);
        return { value: Math.round(val), sourceText: snippet(nearby, at) };
      }
    }
  }

  for (const label of OFFERED_SHARES_LABELS) {
    const labelRe = new RegExp(
      `${escapeRegex(label)}\\s*[:：]?\\s*(${THAI_NUMBER_TOKEN})`,
      "i",
    );
    const m = norm.match(labelRe);
    if (m) {
      const val = parseThaiNumber(m[1]);
      if (val !== null && val > 100) {
        return { value: Math.round(val), sourceText: snippet(norm, m.index ?? 0) };
      }
    }
  }
  return null;
}

export function parseSecuritiesOffering(
  text: string,
  sourceUrl: string,
): FinancialParseResult {
  const fields: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};
  const norm = normalizeDocText(text);

  const offered = findOfferedShares(norm);
  if (offered) {
    fields.offered_shares = offered.value;
    evidence.offered_shares = evidenceFromTextHit("offered_shares", offered, sourceUrl);
  }

  // Ownership ratio of the offering, anchored to a ratio keyword (Thai or
  // English) so we never grab an unrelated percentage elsewhere in the section.
  let ratioText = norm;
  for (const sectionKw of OFFERED_SHARES_SECTION_KWS) {
    const idx = norm.indexOf(sectionKw);
    if (idx !== -1) {
      ratioText = norm.slice(idx, idx + 1500);
      break;
    }
  }
  for (const kw of ["คิดเป็นร้อยละ", "ร้อยละ", "representing", "equivalent to"]) {
    const idx = ratioText.indexOf(kw);
    if (idx === -1) continue;
    const hit = firstPctHit(ratioText.slice(idx, idx + 300));
    if (hit && hit.value > 0 && hit.value <= 100) {
      fields.offered_ratio_pct = hit.value;
      evidence.offered_ratio_pct = evidenceFromTextHit(
        "offered_ratio_pct",
        hit,
        sourceUrl,
      );
      break;
    }
  }

  return { fields, evidence };
}

function parseShareholderInfo(text: string, sourceUrl: string): FinancialParseResult {
  const fields: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};
  const norm = normalizeDocText(text);

  const sectionKws = ["รายชื่อผู้ถือหุ้น", "โครงสร้างการถือหุ้น", "ผู้ถือหุ้นรายใหญ่"];
  for (const kw of sectionKws) {
    const idx = norm.indexOf(kw);
    if (idx === -1) continue;
    const nearby = norm.slice(idx, idx + 5000);
    const execMatch = nearby.match(
      new RegExp(`(?:ผู้บริหาร|กรรมการ|ผู้ถือหุ้นรายใหญ่).*?(${THAI_NUMBER_TOKEN})\\s*%`),
    );
    if (execMatch) {
      const val = parseThaiPct(execMatch[1].replace(/ /g, ""));
      if (val !== null && val > 0 && val <= 100) {
        fields.executive_total_pct = val;
        evidence.executive_total_pct = evidenceFromTextHit(
          "executive_total_pct",
          { value: val, sourceText: snippet(nearby, Math.max(0, (execMatch.index ?? 0) - 40)) },
          sourceUrl,
        );
        break;
      }
    }
  }

  return { fields, evidence };
}

export function parseAnyTextDoc(text: string, sourceUrl: string): FinancialParseResult {
  const fields: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};
  mergeFields(fields, evidence, parseSubscriptionReport(text, sourceUrl), false);
  mergeFields(fields, evidence, parseSecuritiesOffering(text, sourceUrl), false);
  mergeFields(fields, evidence, parseShareholderInfo(text, sourceUrl), false);
  return { fields, evidence };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateFinancials(fields: Partial<DocFinancials>): {
  ok: boolean;
  messages: string[];
} {
  const messages: string[] = [];
  const { total_assets, total_liabilities, total_equity, revenue_latest, offered_shares } = fields;

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
  if (typeof total_assets === "number" && total_assets < 0)
    messages.push(`total_assets is negative (${total_assets})`);
  if (typeof total_equity === "number" && total_equity < -Math.abs(total_assets ?? 0))
    messages.push(`total_equity is implausibly negative (${total_equity})`);
  if (typeof revenue_latest === "number" && revenue_latest < 0)
    messages.push(`revenue_latest is negative (${revenue_latest})`);
  if (typeof offered_shares === "number" && offered_shares <= 0)
    messages.push(`offered_shares must be positive (${offered_shares})`);

  return { ok: messages.length === 0, messages };
}

function attachSourceFile(
  evidence: Record<string, SecSourceEvidence>,
  sourceUrl: string,
): Record<string, SecSourceEvidence> {
  return Object.fromEntries(
    Object.entries(evidence).map(([field, item]) => [
      field,
      { ...item, source_file: item.source_file ?? sourceUrl },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Per-file extraction
// ---------------------------------------------------------------------------

function emptyFileExtraction(
  url: string,
  buf: Buffer | null,
  fileKind: string,
  reviewReason: string | null,
): SecFileExtraction {
  return {
    source_url: url,
    file_name: fileNameFromUrl(url),
    file_kind: fileKind,
    byte_size: buf?.length ?? 0,
    content_sha256: buf ? crypto.createHash("sha256").update(buf).digest("hex") : "",
    trans_file_seq: transFileSeqFromUrl(url),
    sheet_names: null,
    recognized_sheets: null,
    unknown_sheets: null,
    format_ok: false,
    fields: {},
    evidence: {},
    validation_status: "skipped",
    validation_messages: [],
    review_reason: reviewReason,
  };
}

/** Download + extract a financial-statement file (Excel or CSV). */
async function extractFsFile(url: string, log: SecLogger): Promise<SecFileExtraction | null> {
  log.log("  SEC docs: fetching Financial Statements...");
  const buf = await fetchBuffer(url, SEC_FS_TIMEOUT, SEC_DOC_RETRIES);
  if (!buf) return null;
  if (bufferLooksLikeSecRejection(buf)) {
    log.warn("  SEC docs: source file request was rejected by SEC");
    return null;
  }
  log.log(`  SEC docs: FS size = ${buf.length} bytes`);
  if (SEC_FS_MAX_BYTES > 0 && buf.length > SEC_FS_MAX_BYTES) {
    log.warn(`  SEC docs: FS skipped; ${buf.length} bytes exceeds SCRAPER_SEC_FS_MAX_BYTES`);
    return emptyFileExtraction(url, buf, "too-large", "File exceeds size limit");
  }

  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const transFileSeq = transFileSeqFromUrl(url);

  // Resolve workbook / CSV rows.
  let workbookZip: AdmZip | null = null;
  let csvRows: IndexedSheetRow[] | null = null;
  let fileKind = "unknown";

  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const inspected = inspectFsZip(buf);
    if (inspected.kind === "docx") {
      fileKind = "docx";
    } else if (inspected.kind === "xlsx-in-zip") {
      fileKind = "xlsx-in-zip";
      try {
        workbookZip = new AdmZip(inspected.xlsx);
      } catch {
        workbookZip = null;
      }
    } else if (isXlsxWorkbook(buf)) {
      fileKind = "xlsx";
      workbookZip = new AdmZip(buf);
    }
  } else if (looksLikeCsv(buf)) {
    fileKind = "csv";
    csvRows = parseCsvRows(buf);
  }

  const base = emptyFileExtraction(url, buf, fileKind, null);
  base.content_sha256 = sha256;
  base.trans_file_seq = transFileSeq;

  // No parseable financial content → quarantine for review.
  if (!workbookZip && !csvRows) {
    base.review_reason =
      fileKind === "docx"
        ? "Financial statements provided as DOCX, not a parseable table"
        : "Downloaded file is not a recognized Excel or CSV workbook";
    log.warn(`  SEC docs: FS needs review (${fileKind}) — ${base.review_reason}`);
    return base;
  }

  // Sheet-name / column inspection.
  const sheetNames = workbookZip
    ? parseXlsxWorkbookSheets(workbookZip).map((s) => s.name)
    : ["CSV"];
  const inspection = workbookZip ? inspectSheetNames(sheetNames) : inspectCsvColumns(csvRows!);
  base.sheet_names = inspection.sheetNames;
  base.recognized_sheets = inspection.recognizedSheets;
  base.unknown_sheets = inspection.unknownSheets;
  base.format_ok = inspection.formatOk;

  if (!inspection.formatOk) {
    base.review_reason = `No recognized BS/PL content (found: ${sheetNames.join(", ") || "none"})`;
    log.warn(`  SEC docs: FS needs review — ${base.review_reason}`);
    return base;
  }

  // Parse values + evidence.
  const parsed = workbookZip
    ? parseFinancialExcelBuffer(workbookZip, log)
    : parseCsvFinancials(csvRows!, log);
  base.fields = parsed.fields;
  base.evidence = attachSourceFile(parsed.evidence, url);

  const validation = validateFinancials(parsed.fields);
  base.validation_status = validation.ok ? "passed" : "failed";
  base.validation_messages = validation.messages;
  if (!validation.ok) {
    base.review_reason = "Financial values failed sanity validation";
    log.warn(`  SEC docs: FS validation failed — ${validation.messages.join("; ")}`);
  }

  return base;
}

function inspectCsvColumns(rows: IndexedSheetRow[]): FsWorkbookInspection {
  // A CSV is "recognized" when it contains at least one BS or PL label row.
  const labelMatchers = [
    "รวมสินทรัพย์",
    "สินทรัพย์รวม",
    "Total assets",
    "รวมรายได้",
    "รายได้รวม",
    "Total revenue",
    "กำไรสุทธิ",
  ];
  const matched = rows.some((r) =>
    r.columns.some((c) => {
      const text = r.cells.get(c) ?? "";
      return labelMatchers.some((m) => text.includes(m));
    }),
  );
  return {
    sheetNames: ["CSV"],
    recognizedSheets: matched ? ["CSV"] : [],
    unknownSheets: matched ? [] : ["CSV"],
    formatOk: matched,
  };
}

function parseCsvFinancials(rows: IndexedSheetRow[], log: SecLogger): FinancialParseResult {
  const result: Partial<DocFinancials> = {};
  const evidence: Record<string, SecSourceEvidence> = {};
  mergeFields(result, evidence, parseBsSheet(rows, log), false);
  mergeFields(result, evidence, parsePlSheet(rows, log), true);
  return { fields: result, evidence };
}

/** Download + extract a prose document (offering / shareholder reports). */
async function extractTextDoc(
  url: string,
  parser: (text: string, sourceUrl: string) => FinancialParseResult,
  log: SecLogger,
): Promise<SecFileExtraction | null> {
  const buf = await fetchBuffer(url, SEC_DOC_TIMEOUT, SEC_DOC_RETRIES);
  if (!buf) return null;
  if (bufferLooksLikeSecRejection(buf)) {
    log.warn("  SEC docs: source document request was rejected by SEC");
    return null;
  }

  const docxText = extractDocxTextIfDocx(buf);
  const fileKind = docxText !== null ? "docx" : "html";
  const text =
    docxText !== null
      ? docxText
      : buf.toString("utf-8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!text) return null;

  const parsed = parser(text, url);
  // Per-document extraction log: which fields were found (and which were not),
  // so a reviewer can tell from the run log whether e.g. offered_shares was
  // pulled out of this prose doc before any import decision.
  const extractedKeys = Object.keys(parsed.fields);
  if (extractedKeys.length > 0) {
    const desc = extractedKeys
      .map((k) => `${k}=${(parsed.fields as Record<string, number>)[k]}`)
      .join(", ");
    log.log(`  SEC docs: extracted ${desc} from ${fileNameFromUrl(url) ?? url}`);
  } else {
    log.warn(`  SEC docs: no fields extracted from ${fileNameFromUrl(url) ?? url}`);
  }

  const base = emptyFileExtraction(url, buf, fileKind, null);
  base.content_sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  base.format_ok = true; // prose docs are always "readable"
  base.fields = parsed.fields;
  base.evidence = attachSourceFile(parsed.evidence, url);
  base.validation_status = "skipped"; // accounting identity does not apply to prose extraction
  if (Object.keys(parsed.fields).length === 0) {
    base.review_reason = "No fields extracted from document";
  }
  return base;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function extractSecSourceFile(
  sourceUrl: string,
  log: SecLogger,
): Promise<SecFileExtraction | null> {
  const fsResult = await extractFsFile(sourceUrl, log);
  if (!fsResult) return null;

  if (
    fsResult.file_kind !== "docx" &&
    fsResult.file_kind !== "html" &&
    fsResult.file_kind !== "unknown"
  ) {
    return fsResult;
  }

  const textResult = await extractTextDoc(sourceUrl, parseAnyTextDoc, log);
  if (!textResult) return fsResult;
  if (Object.keys(textResult.fields).length > 0) return textResult;
  return fsResult;
}

export async function extractSecFiling(
  filingUrl: string,
  log: SecLogger,
): Promise<SecFilingResult> {
  const empty: SecFilingResult = { files: [] };
  if (!filingUrl) return empty;

  const transId = extractTransId(filingUrl);
  let pageHtml: string;
  try {
    const resp = await httpsGet(filingUrl, {
      headers: SEC_REQUEST_HEADERS,
      timeout: SEC_PAGE_TIMEOUT,
    });
    if (resp.statusCode !== 200 || !isValidSecPageHtml(resp.body)) {
      log.warn(`SEC page ${filingUrl} returned invalid response (${resp.statusCode})`);
      return empty;
    }
    pageHtml = resp.body;
  } catch (e) {
    log.warn(`SEC page fetch failed for ${filingUrl}: ${e}`);
    return empty;
  }

  const result: SecFilingResult = { files: [] };

  // FA person + company from the index table.
  for (const row of parseTableRows(pageHtml)) {
    if (row.join(" ").includes("ที่ปรึกษาทางการเงิน")) {
      const val = row[row.length - 1] || "";
      if (val.includes("/")) {
        const parts = val.split("/").map((p) => p.trim());
        result.fa_company_sec = parts[0];
        const faPerson = parts[1];
        if (faPerson && faPerson !== "N.A." && faPerson !== "-") result.fa_person = faPerson;
      } else {
        result.fa_company_sec = val;
      }
      break;
    }
  }

  // Financial periods available.
  const finPeriods = [...pageHtml.matchAll(/\[ส่วนที่ 3\] - งบการเงิน\s+([^<]+)/g)];
  if (finPeriods.length > 0) {
    result.financial_periods_available = finPeriods.map((m) => m[1].trim());
  }

  const sections = parseFilingIndex(pageHtml);
  if (sections.length === 0) {
    log.warn(`  SEC docs: no sections found for TransID=${transId}`);
    return result;
  }
  log.log(`  SEC docs: found ${sections.length} sections for TransID=${transId}`);

  const subUrl = findSectionUrl(sections, "การจอง การจำหน่าย และการจัดสรร", "การจอง");
  const secUrl = findSectionUrl(
    sections,
    "รายละเอียดของหลักทรัพย์ที่เสนอขาย",
    "รายละเอียดของหลักทรัพย์",
  );
  const structUrl = findSectionUrl(sections, "โครงสร้างและการดำเนินงาน");
  const appendixUrl = findSectionUrl(sections, "รายละเอียดเกี่ยวกับกรรมการ", "เอกสารแนบ 1");
  const fsUrl = findLatestAnnualFsUrl(sections);

  const tasks: Promise<SecFileExtraction | null>[] = [];
  if (subUrl) tasks.push(extractTextDoc(subUrl, parseSubscriptionReport, log));
  if (secUrl) tasks.push(extractTextDoc(secUrl, parseSecuritiesOffering, log));
  if (structUrl) tasks.push(extractTextDoc(structUrl, parseShareholderInfo, log));
  if (appendixUrl && appendixUrl !== structUrl)
    tasks.push(extractTextDoc(appendixUrl, parseShareholderInfo, log));
  if (fsUrl) tasks.push(extractFsFile(fsUrl, log));

  const settled = await Promise.allSettled(tasks);
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) result.files.push(r.value);
    else if (r.status === "rejected") log.warn(`  SEC docs: extraction failed: ${r.reason}`);
  }

  return result;
}
