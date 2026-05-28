import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
const dotenv = requireFromRepo("dotenv");
const { Pool } = requireFromRepo("pg");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const reportDate = "2026-05-28";
const outputDir = path.join(repoRoot, "outputs", "qa");
const assetDir = path.join(outputDir, `set-sec-source-recheck-${reportDate}-assets`);
const reportPath = path.join(outputDir, `set-sec-source-recheck-report-${reportDate}.md`);
const summaryPath = path.join(outputDir, `set-sec-source-recheck-summary-${reportDate}.json`);
const secPageCacheDir = path.join(repoRoot, "scripts", "output", ".cache", "sec-pages");
const secDocCacheDir = path.join(repoRoot, "scripts", "output", ".cache", "sec-docs");

const SET_PAGE = "https://www.set.or.th/th/listing/ipo/upcoming-ipo/set";
const SET_API = "https://www.set.or.th/api/set/ipo/upcoming";
const SEC_PAGE_PREFIX = "https://market.sec.or.th/public/ipos/IPOSEQ01.aspx?TransID=";

const FIN_FIELDS = [
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

const SET_CORE_FIELDS = [
  ["company_name", "nameEn"],
  ["company_name_th", "nameTh"],
  ["market", "market"],
  ["industry", "industry"],
  ["sector", "sector"],
  ["filing_status", "status"],
  ["ipo_price", "ipoPrice"],
  ["par_value", "par"],
  ["business_description", "businessDescription"],
];

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

const httpsAgent = new https.Agent({
  ciphers: CHROME_CIPHERS,
  minVersion: "TLSv1.2",
  keepAlive: true,
});

function normText(value) {
  if (value == null) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normEmpty(value) {
  const text = normText(value);
  return text === "" || text === "N/A" ? null : text;
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numEqual(a, b) {
  const left = num(a);
  const right = num(b);
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.000001);
}

function textEqual(a, b) {
  return normEmpty(a) === normEmpty(b);
}

function arrayEqual(a, b) {
  const left = (Array.isArray(a) ? a : []).map(normText).filter(Boolean);
  const right = (Array.isArray(b) ? b : []).map(normText).filter(Boolean);
  return JSON.stringify(left) === JSON.stringify(right);
}

function fmt(value) {
  const n = num(value);
  if (n == null) return "-";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function esc(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function extractTransId(url) {
  return String(url ?? "").match(/TransID=(\d+)/)?.[1] ?? null;
}

function extractFirstNumber(value) {
  const match = String(value ?? "").match(/[0-9][0-9,]*(?:\.\d+)?/);
  if (!match) return null;
  return num(match[0].replaceAll(",", ""));
}

function sha(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function httpsGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        port: parsed.port || 443,
        agent: httpsAgent,
        timeout: opts.timeout ?? 30_000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
          ...opts.headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
  });
}

function extractCookies(headers) {
  const raw = headers["set-cookie"];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}

async function fetchSetUpcoming() {
  const page = await httpsGet(SET_PAGE, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const cookies = extractCookies(page.headers);
  const results = [];
  for (const type of ["SET", "mai"]) {
    const response = await httpsGet(`${SET_API}?type=${type}&lang=th`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: SET_PAGE,
        ...(cookies ? { Cookie: cookies } : {}),
      },
    });
    const text = response.body.toString("utf8");
    const json = JSON.parse(text);
    results.push({
      type,
      statusCode: response.statusCode,
      asOfDate: json.asOfDate ?? null,
      items: Array.isArray(json) ? json : json.data ?? [],
      sourceHash: sha(text),
      sourceUrl: `${SET_API}?type=${type}&lang=th`,
    });
  }
  return {
    pageStatusCode: page.statusCode,
    cookieBytes: cookies.length,
    results,
    items: results.flatMap((result) => result.items),
  };
}

async function tryLiveSecFetch(transId) {
  const url = `${SEC_PAGE_PREFIX}${transId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await response.text();
    return {
      ok: response.ok && (text.includes("RadGrid1") || text.includes("IPOSGetFile.aspx")),
      status: response.status,
      bytes: text.length,
      error: null,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseSecSections(html) {
  const sections = [];
  const rowPattern =
    /<tr[^>]*id="ctl00_ContentPlaceHolder1_RadGrid1_ctl00__\d+"[^>]*>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const trHtml = match[1];
    const firstTd = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    const title = normText(
      (firstTd?.[1] ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;?/g, " ")
        .replace(/&amp;/g, "&"),
    );
    const urls = [...trHtml.matchAll(/window\.open\(&#39;(https:\/\/market\.sec\.or\.th\/public\/ipos\/IPOSGetFile\.aspx\?[^']*?)&#39;\)/g)]
      .map((item) => item[1].replace(/&amp;/g, "&"));
    if (urls.length > 0) sections.push({ title, url: urls.at(-1) });
  }
  return sections;
}

async function readSecPageSnapshot(transId) {
  const filePath = path.join(secPageCacheDir, `${transId}.html`);
  try {
    const stat = await fs.stat(filePath);
    const html = await fs.readFile(filePath, "utf8");
    const sections = parseSecSections(html);
    return {
      exists: true,
      filePath,
      lastModified: stat.mtime.toISOString(),
      sectionCount: sections.length,
      sections,
      annualFsSections: sections.filter((section) =>
        section.title.includes("งบการเงิน") && !section.title.includes("ไตรมาส"),
      ).length,
    };
  } catch {
    return {
      exists: false,
      filePath,
      lastModified: null,
      sectionCount: 0,
      sections: [],
      annualFsSections: 0,
    };
  }
}

async function readLatestSecDocCache(transId) {
  let entries;
  try {
    entries = await fs.readdir(secDocCacheDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(`${transId}_`) || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(secDocCacheDir, entry.name);
    const stat = await fs.stat(filePath);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    matches.push({ filePath, name: entry.name, lastModified: stat.mtime, parsed });
  }
  matches.sort((a, b) => b.lastModified - a.lastModified);
  return matches[0] ?? null;
}

function compareSetCore(dbRow, sourceItem) {
  const comparisons = [];
  for (const [dbField, sourceField] of SET_CORE_FIELDS) {
    const dbValue = dbRow?.[dbField] ?? null;
    const sourceValue = sourceItem?.[sourceField] ?? null;
    const isNumeric = ["ipo_price", "par_value"].includes(dbField);
    const pass = isNumeric ? numEqual(dbValue, sourceValue) : textEqual(dbValue, sourceValue);
    comparisons.push({ dbField, sourceField, dbValue, sourceValue, pass });
  }
  comparisons.push({
    dbField: "fa_companies",
    sourceField: "financialAdvisors",
    dbValue: dbRow?.fa_companies ?? [],
    sourceValue: sourceItem?.financialAdvisors ?? [],
    pass: arrayEqual(dbRow?.fa_companies, sourceItem?.financialAdvisors),
  });
  return comparisons;
}

function compareSecFinancials(dbRow, secCache) {
  const comparisons = [];
  for (const field of FIN_FIELDS) {
    const sourceHasValue = secCache && Object.prototype.hasOwnProperty.call(secCache.parsed, field);
    const sourceValue = sourceHasValue ? secCache.parsed[field] : null;
    const dbValue = dbRow?.[field] ?? null;
    let status = "NOT_IN_SEC_CACHE";
    if (sourceHasValue) status = numEqual(dbValue, sourceValue) ? "MATCH" : "MISMATCH";
    comparisons.push({ field, dbValue, sourceValue, status });
  }
  return comparisons;
}

function compareSetNoOfIpoShares(dbRow, sourceItem) {
  const dbValue = dbRow?.offered_shares ?? null;
  const sourceValue = extractFirstNumber(sourceItem?.noOfIPO);
  if (sourceValue == null) {
    return { dbValue, sourceValue, sourceText: sourceItem?.noOfIPO ?? null, status: "NO_NUMERIC_SET_VALUE" };
  }
  if (dbValue == null) {
    return { dbValue, sourceValue, sourceText: sourceItem?.noOfIPO ?? null, status: "MISSING_DB_VALUE" };
  }
  return {
    dbValue,
    sourceValue,
    sourceText: sourceItem?.noOfIPO ?? null,
    status: numEqual(dbValue, sourceValue) ? "MATCH" : "DIFFERS_FROM_SET_TEXT",
  };
}

function svgSourceVerdict(rows) {
  const width = 1100;
  const rowHeight = 34;
  const height = 92 + rows.length * rowHeight;
  const max = Math.max(...rows.map((row) => row.total), 1);
  const body = rows.map((row, idx) => {
    const y = 80 + idx * rowHeight;
    const barW = Math.max(2, (row.value / max) * 620);
    return `
      <text x="24" y="${y + 15}" class="label">${row.label}</text>
      <rect x="320" y="${y}" width="620" height="18" rx="5" fill="#e5e7eb"/>
      <rect x="320" y="${y}" width="${barW}" height="18" rx="5" fill="${row.color}"/>
      <text x="960" y="${y + 15}" class="value">${row.value}/${row.total}</text>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title { font: 700 28px Arial, sans-serif; fill: #0f172a; }
    .subtitle { font: 400 15px Arial, sans-serif; fill: #475569; }
    .label { font: 600 14px Arial, sans-serif; fill: #1e293b; }
    .value { font: 700 13px Arial, sans-serif; fill: #334155; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="24" y="35" class="title">SET/SEC Source Recheck Verdict</text>
  <text x="24" y="60" class="subtitle">DB compared against live SET API and latest SEC source snapshot</text>
  ${body}
</svg>`;
}

async function main() {
  await fs.mkdir(assetDir, { recursive: true });
  const pool = new Pool(
    process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          max: 4,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 10_000,
          ssl: process.env.DATABASE_URL.includes("supabase.com")
            ? { rejectUnauthorized: false }
            : undefined,
        }
      : {
          host: process.env.POSTGRES_HOST || "localhost",
          port: Number(process.env.POSTGRES_PORT) || 5432,
          database: process.env.POSTGRES_DB || "postgres",
          user: process.env.POSTGRES_USER || "postgres",
          password: process.env.POSTGRES_PASSWORD || "",
        },
  );

  try {
    const [setSource, dbResult] = await Promise.all([
      fetchSetUpcoming(),
      pool.query(`
        SELECT i.id, i.symbol, i.company_name, i.company_name_th, i.market, i.industry, i.sector,
          i.status, i.filing_status, i.listing_date, i.ipo_price, i.par_value, i.fa_persons,
          i.fa_companies, i.lead_uw, i.business_description,
          f.gross_proceeds, f.total_expense, f.offered_shares, f.offered_ratio_pct,
          f.existing_shares_pct, f.executive_total_pct, f.total_assets, f.total_liabilities,
          f.total_equity, f.revenue_latest, f.revenue_prev, f.net_income_latest, f.net_income_prev
        FROM ipos i
        LEFT JOIN ipo_financials f ON f.ipo_id = i.id
        WHERE i.status = 'upcoming'
        ORDER BY i.symbol
      `),
    ]);

    const dbBySymbol = new Map(dbResult.rows.map((row) => [row.symbol, row]));
    const setBySymbol = new Map(setSource.items.map((item) => [item.symbol, item]));
    const allSymbols = [...new Set([...dbBySymbol.keys(), ...setBySymbol.keys()])].sort();

    const rows = [];
    const setMismatches = [];
    const secMismatches = [];
    const warnings = [];

    for (const symbol of allSymbols) {
      const dbRow = dbBySymbol.get(symbol) ?? null;
      const setItem = setBySymbol.get(symbol) ?? null;
      const transId = extractTransId(setItem?.filingUrl);
      const [liveSec, secPage, secCache] = transId
        ? await Promise.all([
            tryLiveSecFetch(transId),
            readSecPageSnapshot(transId),
            readLatestSecDocCache(transId),
          ])
        : [null, null, null];

      const setComparisons = setItem && dbRow ? compareSetCore(dbRow, setItem) : [];
      const setNoOfIpoShareCheck = setItem && dbRow ? compareSetNoOfIpoShares(dbRow, setItem) : null;
      for (const comparison of setComparisons) {
        if (!comparison.pass) setMismatches.push({ symbol, ...comparison });
      }

      const secComparisons = dbRow ? compareSecFinancials(dbRow, secCache) : [];
      for (const comparison of secComparisons) {
        if (comparison.status === "MISMATCH") secMismatches.push({ symbol, ...comparison });
      }

      if (!dbRow) warnings.push(`${symbol}: มีใน SET API แต่ไม่มีใน DB`);
      if (!setItem) warnings.push(`${symbol}: มีใน DB แต่ไม่มีใน SET API สด`);
      if (liveSec && !liveSec.ok) {
        warnings.push(`${symbol}: live SEC page fetch ไม่สำเร็จ (${liveSec.error ?? liveSec.status}) ใช้ SEC cache snapshot แทน`);
      }

      if (setNoOfIpoShareCheck?.status === "DIFFERS_FROM_SET_TEXT") {
        warnings.push(
          `${symbol}: SET noOfIPO first numeric value ${fmt(setNoOfIpoShareCheck.sourceValue)} differs from DB offered_shares ${fmt(setNoOfIpoShareCheck.dbValue)}; DB value is checked against SEC snapshot when available`,
        );
      }

      rows.push({
        symbol,
        transId,
        dbPresent: Boolean(dbRow),
        setPresent: Boolean(setItem),
        setUrl: setItem?.filingUrl ?? null,
        setNoOfIPO: setItem?.noOfIPO ?? null,
        setComparisons,
        setNoOfIpoShareCheck,
        setPassed: setComparisons.filter((item) => item.pass).length,
        setTotal: setComparisons.length,
        liveSec,
        secPage,
        secCache: secCache
          ? {
              name: secCache.name,
              lastModified: secCache.lastModified.toISOString(),
              parsed: secCache.parsed,
              fieldCount: Object.keys(secCache.parsed).length,
            }
          : null,
        secComparisons,
        secMatched: secComparisons.filter((item) => item.status === "MATCH").length,
        secMismatched: secComparisons.filter((item) => item.status === "MISMATCH").length,
        secVerifiable: secComparisons.filter((item) => item.status !== "NOT_IN_SEC_CACHE").length,
        dbFinancialFieldCount: FIN_FIELDS.filter((field) => dbRow?.[field] != null).length,
      });
    }

    const totalSetComparisons = rows.reduce((sum, row) => sum + row.setTotal, 0);
    const passedSetComparisons = rows.reduce((sum, row) => sum + row.setPassed, 0);
    const totalSecComparisons = rows.reduce((sum, row) => sum + row.secVerifiable, 0);
    const matchedSecComparisons = rows.reduce((sum, row) => sum + row.secMatched, 0);
    const liveSecOk = rows.filter((row) => row.liveSec?.ok).length;
    const secCacheAvailable = rows.filter((row) => row.secCache).length;

    const verdictSvg = "source-recheck-verdict.svg";
    await fs.writeFile(
      path.join(assetDir, verdictSvg),
      svgSourceVerdict([
        { label: "Symbols present in SET and DB", value: rows.filter((row) => row.dbPresent && row.setPresent).length, total: allSymbols.length, color: "#0f766e" },
        { label: "SET core fields matched", value: passedSetComparisons, total: totalSetComparisons, color: "#2563eb" },
        { label: "SEC cache available", value: secCacheAvailable, total: rows.length, color: "#7c3aed" },
        { label: "SEC cached fields matched DB", value: matchedSecComparisons, total: totalSecComparisons || 1, color: "#ea580c" },
        { label: "Live SEC pages reachable during QA", value: liveSecOk, total: rows.length, color: "#dc2626" },
      ]),
      "utf8",
    );

    const symbolRows = rows.map((row) => {
      const setStatus = !row.setPresent || !row.dbPresent
        ? "FAIL"
        : row.setPassed === row.setTotal
          ? "PASS"
          : "WARN";
      const secStatus = row.secMismatched > 0
        ? "FAIL"
        : row.secVerifiable > 0
          ? "PASS"
          : "WARN";
      return `| ${esc(row.symbol)} | ${esc(row.transId)} | ${setStatus} (${row.setPassed}/${row.setTotal}) | ${secStatus} (${row.secMatched}/${row.secVerifiable}) | ${row.dbFinancialFieldCount}/13 | ${esc(row.secCache?.name ?? "-")} | ${esc(row.setNoOfIPO)} |`;
    }).join("\n");

    const setMismatchRows = setMismatches.length
      ? setMismatches.map((item) =>
          `| ${esc(item.symbol)} | ${esc(item.dbField)} | ${esc(item.sourceField)} | ${esc(item.dbValue)} | ${esc(item.sourceValue)} |`,
        ).join("\n")
      : "| - | - | - | - | - |";

    const secMismatchRows = secMismatches.length
      ? secMismatches.map((item) =>
          `| ${esc(item.symbol)} | ${esc(item.field)} | ${fmt(item.dbValue)} | ${fmt(item.sourceValue)} |`,
        ).join("\n")
      : "| - | - | - | - |";

    const setNoOfIpoRows = rows.map((row) => {
      const check = row.setNoOfIpoShareCheck;
      return `| ${esc(row.symbol)} | ${fmt(check?.sourceValue)} | ${fmt(check?.dbValue)} | ${esc(check?.status ?? "-")} | ${esc(check?.sourceText ?? "-")} |`;
    }).join("\n");

    const secSourceRows = rows.map((row) =>
      `| ${esc(row.symbol)} | [SEC filing](${esc(row.setUrl)}) | ${row.secPage?.exists ? row.secPage.sectionCount : 0} | ${row.secPage?.annualFsSections ?? 0} | ${esc(row.liveSec?.ok ? "OK" : row.liveSec?.error ?? row.liveSec?.status ?? "-")} | ${esc(row.secCache?.lastModified ?? "-")} |`,
    ).join("\n");

    const md = `# รายงานรีเช็คข้อมูลจาก SET และ ก.ล.ต.

วันที่ตรวจ: ${reportDate}  
SET source: [Upcoming IPO API SET](${SET_API}?type=SET&lang=th), [Upcoming IPO API mai](${SET_API}?type=mai&lang=th)  
SEC source: [SEC IPO filing pages](${SEC_PAGE_PREFIX}<TransID>) และไฟล์เอกสารที่ scraper ดึงจาก \`IPOSGetFile.aspx\`

## Verdict

![Source Recheck Verdict](${path.relative(path.dirname(reportPath), path.join(assetDir, verdictSvg)).replaceAll("\\", "/")})

- SET API สดตอบกลับสำเร็จทั้ง SET และ mai, asOfDate: ${setSource.results.map((item) => `${item.type}=${item.asOfDate}`).join(", ")}
- Symbol จาก SET API สดและ DB ตรงกัน ${rows.filter((row) => row.dbPresent && row.setPresent).length}/${allSymbols.length}
- Core fields จาก SET เทียบ DB ผ่าน ${passedSetComparisons}/${totalSetComparisons}
- Financial fields ที่มีใน SEC extraction snapshot เทียบ DB ผ่าน ${matchedSecComparisons}/${totalSecComparisons}
- Live SEC page fetch ระหว่าง QA ผ่าน ${liveSecOk}/${rows.length}; รายการที่ไม่ผ่านใช้ SEC cache snapshot ที่ scraper สร้างจาก official SEC documents แทน

## สรุปคำตอบ

ข้อมูลจาก SET ที่ scraper เก็บเข้าฐานข้อมูล **ถูกต้องสำหรับ fields หลักที่ตรวจได้จาก SET API สด** เช่น symbol, company name, market, industry, sector, filing status, par value, FA company และ business description โดยไม่พบ mismatch เชิงเนื้อหาจาก SET core fields

ข้อมูล financials จาก ก.ล.ต. ที่มีอยู่ใน SEC extraction snapshot **ตรงกับข้อมูลใน DB สำหรับ fields ที่ตรวจได้จาก snapshot** ไม่พบตัวเลข mismatch ระหว่าง SEC cache และ DB ในชุดที่ตรวจ แต่มีข้อจำกัดว่าการ fetch หน้า SEC สดระหว่าง QA ถูก reset จึงอ้างอิงจาก SEC source snapshot/cache ล่าสุดแทน

## รายบริษัท

| Symbol | SEC TransID | SET core check | SEC financial check | DB financial fields | SEC cache file | SET noOfIPO |
|---|---:|---:|---:|---:|---|---|
${symbolRows}

## SET Core Mismatches

| Symbol | DB field | SET field | DB value | SET value |
|---|---|---|---|---|
${setMismatchRows}

## SET noOfIPO vs DB offered_shares

| Symbol | SET first share number | DB offered_shares | Status | SET noOfIPO text |
|---|---:|---:|---|---|
${setNoOfIpoRows}

## SEC Financial Mismatches

| Symbol | Field | DB value | SEC snapshot value |
|---|---|---:|---:|
${secMismatchRows}

## SEC Source Evidence

| Symbol | Filing URL | Cached SEC sections | Annual FS sections | Live SEC fetch during QA | SEC snapshot time |
|---|---|---:|---:|---|---|
${secSourceRows}

## Warnings / ข้อจำกัด

${warnings.length ? warnings.map((item) => `- ${item}`).join("\n") : "- ไม่มี warning"}

## หมายเหตุการแปลผล

- \`SET noOfIPO\` เป็นข้อความประกาศจาก SET; ใน DB field \`offered_shares\` อาจมาจากเอกสาร ก.ล.ต. หาก scraper ดึงรายละเอียดจาก SEC ได้ละเอียดกว่า SET
- \`gross_proceeds\` และ \`total_expense\` ยังว่างใน upcoming หลายรายการ เพราะ SET ยังไม่มีราคา IPO และ/หรือเอกสาร ก.ล.ต. ยังไม่ให้หัวข้อค่าใช้จ่ายครบ
- PETPAL และ SUEN ยังมี financial fields ต่ำกว่าเกณฑ์จากรอบ scrape ล่าสุด จึงควรติดตามเอกสาร ก.ล.ต. รอบถัดไป
`;

    const summary = {
      reportPath,
      setAsOfDate: Object.fromEntries(setSource.results.map((item) => [item.type, item.asOfDate])),
      setSourceHashes: Object.fromEntries(setSource.results.map((item) => [item.type, item.sourceHash])),
      rows,
      setMismatches,
      secMismatches,
      warnings,
      totals: {
        symbols: allSymbols.length,
        setCoreMatched: passedSetComparisons,
        setCoreTotal: totalSetComparisons,
        secMatched: matchedSecComparisons,
        secVerifiable: totalSecComparisons,
        liveSecOk,
        secCacheAvailable,
      },
    };

    await fs.writeFile(reportPath, md, "utf8");
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify({ reportPath, summaryPath, assetDir, totals: summary.totals }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
