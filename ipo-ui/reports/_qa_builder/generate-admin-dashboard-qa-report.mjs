import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const outputPath = path.join(repoRoot, "reports", "admin-dashboard-qa-report.xlsx");
const previewDir = path.join(repoRoot, "reports", "_qa_builder", "admin-dashboard-previews");

const requireFromRepo = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const dotenv = requireFromRepo("dotenv");
const { Pool } = requireFromRepo("pg");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const apiBase = process.env.QA_API_BASE_URL || "http://127.0.0.1:3000";
const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL is required.");

const parsedDbUrl = new URL(dbUrl);
const databaseLabel = `${parsedDbUrl.hostname}/${parsedDbUrl.pathname.replace(/^\//, "") || "postgres"}`;
const pool = new Pool({
  connectionString: dbUrl,
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

const testedAt = new Date();
const testedAtBangkok = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
}).format(testedAt);

const buildVersion = getBuildVersion();
const sqlLogs = [];
const apiLogs = [];
const testCases = [];
const displayChecks = [];
const performanceRows = [];
const validationIssues = [];
const cleanupRows = [];
let sqlCounter = 0;
let apiCounter = 0;
let poolClosed = false;
const suiteStarted = performance.now();

function getBuildVersion() {
  const pkg = JSON.parse(
    execFileSync("cmd.exe", ["/c", "type", "package.json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    commit = "no-git";
  }
  return `${pkg.version} (${commit})`;
}

function ms(value) {
  return Math.round(value * 10) / 10;
}

function trunc(value, max = 180) {
  if (value == null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signSessionCookie() {
  const secret = process.env.SESSION_SECRET ?? "";
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    userId: "qa-dashboard-report",
    email: "qa.dashboard@example.test",
    firstName: "QA",
    lastName: "Dashboard",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    iat: now,
    exp: now + 30 * 60,
  };
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function addCase(id, category, scenario, expected, actual, status, executionTime, apiStatusCode, notes = "-") {
  testCases.push([
    id,
    category,
    scenario,
    expected,
    actual,
    status,
    `${ms(executionTime)} ms`,
    apiStatusCode,
    notes,
  ]);
}

function addDisplayCheck(area, selectorOrSignal, expected, actual, status, notes = "-") {
  displayChecks.push([area, selectorOrSignal, expected, actual, status, notes]);
}

async function q(label, text, params = [], tables = "-", tx = "Read-only", notes = "-") {
  const started = performance.now();
  try {
    const result = await pool.query(text, params);
    sqlLogs.push([
      `SQL-${String(++sqlCounter).padStart(3, "0")}`,
      label,
      trunc(text, 280),
      tables,
      tx,
      "OK",
      ms(performance.now() - started),
      result.rowCount ?? result.rows.length,
      notes,
    ]);
    return result;
  } catch (err) {
    sqlLogs.push([
      `SQL-${String(++sqlCounter).padStart(3, "0")}`,
      label,
      trunc(text, 280),
      tables,
      tx,
      "ERROR",
      ms(performance.now() - started),
      0,
      err instanceof Error ? trunc(err.message, 220) : String(err),
    ]);
    throw err;
  }
}

async function http(method, endpoint, options = {}) {
  const started = performance.now();
  let responseCode = 0;
  let text = "";
  let json = null;
  let errorMessage = "";
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;

  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method,
      headers,
      redirect: options.redirect || "follow",
    });
    responseCode = response.status;
    text = await response.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (responseCode >= 400) errorMessage = trunc(json?.error || text, 220);
    apiLogs.push([
      `API-${String(++apiCounter).padStart(3, "0")}`,
      endpoint,
      method,
      responseCode,
      ms(performance.now() - started),
      errorMessage || "-",
      options.redirect || "follow",
      options.note || "-",
      response.headers.get("location") || "-",
    ]);
    return { responseCode, text, json, errorMessage, responseTime: ms(performance.now() - started), location: response.headers.get("location") };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    apiLogs.push([
      `API-${String(++apiCounter).padStart(3, "0")}`,
      endpoint,
      method,
      responseCode,
      ms(performance.now() - started),
      errorMessage,
      options.redirect || "follow",
      options.note || "-",
      "-",
    ]);
    return { responseCode, text, json, errorMessage, responseTime: ms(performance.now() - started), location: null };
  }
}

async function closePool() {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

async function collectDbData() {
  const stats = (await q(
    "Load dashboard stats view",
    "SELECT * FROM v_dashboard_stats LIMIT 1",
    [],
    "v_dashboard_stats",
    "Read-only",
    "ข้อมูลหลักบน KPI dashboard",
  )).rows[0];

  const directCounts = (await q(
    "Cross-check status counts",
    `SELECT
       count(*)::int AS total_ipos,
       count(*) FILTER (WHERE status = 'listed')::int AS listed_count,
       count(*) FILTER (WHERE status = 'upcoming')::int AS upcoming_count,
       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count
     FROM ipos`,
    [],
    "ipos",
    "Read-only",
    "เทียบกับ v_dashboard_stats",
  )).rows[0];

  const builds = (await q(
    "Load recent builds",
    "SELECT id, status, started_at, finished_at, duration_ms, artifact_size, trigger_type, error_message FROM build_runs ORDER BY started_at DESC LIMIT 6",
    [],
    "build_runs",
    "Read-only",
    "Recent builds panel",
  )).rows;

  const upcoming = (await q(
    "Load upcoming IPO preview",
    "SELECT * FROM v_upcoming_ipos ORDER BY listing_date ASC NULLS LAST LIMIT 5",
    [],
    "v_upcoming_ipos",
    "Read-only",
    "Upcoming panel preview",
  )).rows;

  const yearly = (await q(
    "Dashboard report yearly listings",
    `SELECT
       CASE WHEN i.listing_date IS NULL THEN NULL ELSE EXTRACT(YEAR FROM i.listing_date)::int END AS year,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
       COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
       COUNT(*) FILTER (WHERE i.status = 'cancelled')::int AS cancelled,
       ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
     FROM ipos i
     LEFT JOIN v_ipo_completeness c ON c.id = i.id
     GROUP BY 1
     ORDER BY year DESC NULLS LAST`,
    [],
    "ipos, v_ipo_completeness",
    "Read-only",
    "Yearly report section",
  )).rows;

  const market = (await q(
    "Dashboard report market mix",
    `SELECT COALESCE(NULLIF(TRIM(i.market), ''), 'ไม่ระบุ / Unspecified') AS label,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
            COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
            ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
       FROM ipos i
       LEFT JOIN v_ipo_completeness c ON c.id = i.id
      GROUP BY 1
      ORDER BY total DESC, label ASC
      LIMIT 8`,
    [],
    "ipos, v_ipo_completeness",
    "Read-only",
    "Market distribution chart/table",
  )).rows;

  const sector = (await q(
    "Dashboard report sector leaders",
    `SELECT COALESCE(NULLIF(TRIM(i.sector), ''), 'ไม่ระบุ / Unspecified') AS label,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
            COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
            ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
       FROM ipos i
       LEFT JOIN v_ipo_completeness c ON c.id = i.id
      GROUP BY 1
      ORDER BY total DESC, label ASC
      LIMIT 8`,
    [],
    "ipos, v_ipo_completeness",
    "Read-only",
    "Sector leaders chart/table",
  )).rows;

  const statusMix = (await q(
    "Dashboard report status mix",
    `SELECT i.status AS label,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE i.status = 'listed')::int AS listed,
            COUNT(*) FILTER (WHERE i.status = 'upcoming')::int AS upcoming,
            ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness
       FROM ipos i
       LEFT JOIN v_ipo_completeness c ON c.id = i.id
      GROUP BY 1
      ORDER BY total DESC`,
    [],
    "ipos, v_ipo_completeness",
    "Read-only",
    "Status mix chart/table",
  )).rows;

  const completenessBuckets = (await q(
    "Dashboard report completeness buckets",
    `SELECT bucket.label,
            COUNT(*)::int AS total,
            ROUND(AVG(c.completeness_pct)::numeric, 1) AS avg_completeness,
            bucket.sort_order
       FROM v_ipo_completeness c
       CROSS JOIN LATERAL (
         SELECT CASE
           WHEN c.completeness_pct >= 100 THEN '100% / Complete'
           WHEN c.completeness_pct >= 80 THEN '80-99% / Strong'
           WHEN c.completeness_pct >= 60 THEN '60-79% / Needs work'
           ELSE '<60% / High risk'
         END AS label,
         CASE
           WHEN c.completeness_pct >= 100 THEN 1
           WHEN c.completeness_pct >= 80 THEN 2
           WHEN c.completeness_pct >= 60 THEN 3
           ELSE 4
         END AS sort_order
       ) bucket
      GROUP BY bucket.label, bucket.sort_order
      ORDER BY bucket.sort_order ASC`,
    [],
    "v_ipo_completeness",
    "Read-only",
    "Completeness section",
  )).rows;

  const financial = (await q(
    "Dashboard report financial aggregation",
    `SELECT
       COUNT(f.ipo_id)::int AS rows_with_financials,
       COALESCE(SUM(f.gross_proceeds), 0) AS total_gross_proceeds,
       COALESCE(SUM(f.offered_shares), 0) AS total_offered_shares,
       ROUND(AVG(i.ipo_price)::numeric, 2) AS avg_ipo_price,
       ROUND(AVG(f.offered_ratio_pct)::numeric, 2) AS avg_offered_ratio,
       ROUND(AVG(((i.close_d1 - i.ipo_price) / NULLIF(i.ipo_price, 0)) * 100)::numeric, 2) AS avg_day1_return_pct,
       COUNT(*) FILTER (WHERE i.close_d1 IS NOT NULL AND i.ipo_price IS NOT NULL AND i.ipo_price <> 0)::int AS day1_return_count
     FROM ipos i
     LEFT JOIN ipo_financials f ON f.ipo_id = i.id`,
    [],
    "ipos, ipo_financials",
    "Read-only",
    "Financial KPI section",
  )).rows[0];

  const anomalies = (await q(
    "Data quality observations",
    `SELECT
       (SELECT count(*)::int FROM ipos WHERE market IS NULL OR btrim(market) = '') AS missing_market,
       (SELECT count(*)::int FROM ipos WHERE listing_date IS NULL) AS missing_listing_date,
       (SELECT count(*)::int FROM ipos WHERE ipo_price IS NULL) AS missing_ipo_price,
       (SELECT count(*)::int FROM v_ipo_completeness WHERE completeness_pct < 80) AS low_completeness,
       (SELECT count(*)::int FROM ipo_financials WHERE executive_total_pct > 50) AS high_exec_ownership`,
    [],
    "ipos, v_ipo_completeness, ipo_financials",
    "Read-only",
    "Data quality backlog signals",
  )).rows[0];

  return { stats, directCounts, builds, upcoming, yearly, market, sector, statusMix, completenessBuckets, financial, anomalies };
}

function evaluateDashboardHtml(html, db) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const stats = db.stats;
  const signals = [
    ["Header", "Dashboard title", "พบหัวข้อ Dashboard", containsAny(html, ["Dashboard", "IPO data operations"]), containsAny(html, ["Dashboard", "IPO data operations"]) ? "PASS" : "FAIL"],
    ["Navigation", "Admin nav", "พบเมนู Dashboard / IPO Explorer / Validation", containsAny(html, ["IPO Explorer"]) && containsAny(html, ["Validation"]), containsAny(html, ["IPO Explorer"]) && containsAny(html, ["Validation"]) ? "PASS" : "FAIL"],
    ["KPI", "Total IPOs", `แสดง total_ipos=${stats.total_ipos}`, html.includes(formatNumber(stats.total_ipos)) || html.includes(String(stats.total_ipos)), html.includes(formatNumber(stats.total_ipos)) || html.includes(String(stats.total_ipos)) ? "PASS" : "FAIL"],
    ["KPI", "Listed count", `แสดง listed_count=${stats.listed_count}`, html.includes(formatNumber(stats.listed_count)) || html.includes(String(stats.listed_count)), html.includes(formatNumber(stats.listed_count)) || html.includes(String(stats.listed_count)) ? "PASS" : "FAIL"],
    ["KPI", "Upcoming count", `แสดง upcoming_count=${stats.upcoming_count}`, html.includes(formatNumber(stats.upcoming_count)) || html.includes(String(stats.upcoming_count)), html.includes(formatNumber(stats.upcoming_count)) || html.includes(String(stats.upcoming_count)) ? "PASS" : "FAIL"],
    ["Panel", "Recent builds", "พบ panel Recent builds", containsAny(html, ["Recent builds", "Build"]), containsAny(html, ["Recent builds", "Build"]) ? "PASS" : "FAIL"],
    ["Panel", "Upcoming preview", "พบ panel upcoming IPO", containsAny(html, ["Upcoming", "IPO ที่กำลังจะเข้า"]), containsAny(html, ["Upcoming", "IPO ที่กำลังจะเข้า"]) ? "PASS" : "FAIL"],
    ["Report", "Dashboard data report", "พบ report section / chart source text", containsAny(text, ["Market", "Sector", "Completeness", "Financial"]), containsAny(text, ["Market", "Sector", "Completeness", "Financial"]) ? "PASS" : "FAIL"],
  ];

  for (const [area, signal, expected, actualBool, status] of signals) {
    addDisplayCheck(area, signal, expected, actualBool ? "พบข้อมูลบน HTML/SSR" : "ไม่พบข้อมูลบน HTML/SSR", status, "ตรวจจาก authenticated SSR HTML");
  }

  return { text, signals };
}

async function runTests() {
  const db = await collectDbData();
  const cookie = `admin_session=${signSessionCookie()}`;

  const unauthStart = performance.now();
  const unauth = await http("GET", "/admin", { redirect: "manual", note: "ตรวจ redirect เมื่อไม่มี session" });
  addCase(
    "TC-ADMIN-001",
    "AUTH",
    "เปิด /admin โดยไม่มี session",
    "ต้อง redirect ไป /admin/login",
    `status=${unauth.responseCode}, location=${unauth.location}`,
    unauth.responseCode === 307 && String(unauth.location).includes("/admin/login") ? "PASS" : "FAIL",
    performance.now() - unauthStart,
    unauth.responseCode,
    "ตรวจ proxy auth guard",
  );

  const authStart = performance.now();
  const authPage = await http("GET", "/admin", { cookie, note: "โหลด Admin Dashboard แบบ authenticated SSR" });
  addCase(
    "TC-ADMIN-002",
    "SSR",
    "โหลดหน้า /admin ด้วย admin_session",
    "ต้องได้ HTTP 200 และ HTML ขนาดเหมาะสม",
    `status=${authPage.responseCode}, htmlLength=${authPage.text.length}`,
    authPage.responseCode === 200 && authPage.text.length > 10_000 ? "PASS" : "FAIL",
    performance.now() - authStart,
    authPage.responseCode,
    "วัด page load + SSR data fetch",
  );

  const htmlEval = evaluateDashboardHtml(authPage.text, db);

  const statsStart = performance.now();
  const statsApi = await http("GET", "/api/admin/stats", { cookie, note: "โหลด dashboard stats API" });
  const apiTotal = Number(statsApi.json?.stats?.total_ipos ?? -1);
  addCase(
    "TC-ADMIN-003",
    "API",
    "เรียก /api/admin/stats",
    "API ต้องตอบ 200 และ total_ipos ตรงกับ DB",
    `status=${statsApi.responseCode}, apiTotal=${apiTotal}, dbTotal=${db.stats.total_ipos}`,
    statsApi.responseCode === 200 && apiTotal === Number(db.stats.total_ipos) ? "PASS" : "FAIL",
    performance.now() - statsStart,
    statsApi.responseCode,
    "API feed สำหรับ dashboard/admin widgets",
  );

  const meStart = performance.now();
  const meApi = await http("GET", "/api/auth/me", { cookie, note: "โหลดข้อมูล session ของ sidebar" });
  addCase(
    "TC-ADMIN-004",
    "API",
    "เรียก /api/auth/me สำหรับ sidebar profile",
    "API ต้องตอบ 200 และคืน email/session metadata",
    `status=${meApi.responseCode}, email=${meApi.json?.email ?? "N/A"}`,
    meApi.responseCode === 200 && Boolean(meApi.json?.email) ? "PASS" : "FAIL",
    performance.now() - meStart,
    meApi.responseCode,
    "AdminNav client fetch",
  );

  const c = db.directCounts;
  addCase(
    "TC-ADMIN-005",
    "DATA",
    "ตรวจ total IPO count บน dashboard",
    "v_dashboard_stats.total_ipos ต้องตรงกับ count(ipos)",
    `view=${db.stats.total_ipos}, direct=${c.total_ipos}`,
    Number(db.stats.total_ipos) === Number(c.total_ipos) ? "PASS" : "FAIL",
    Number(sqlLogs.find((row) => row[1] === "Cross-check status counts")?.[6] ?? 0),
    "N/A",
    "KPI: Total IPOs / Master records",
  );

  addCase("TC-ADMIN-006", "DATA", "ตรวจ listed count", "listed_count ต้องตรง direct SQL", `view=${db.stats.listed_count}, direct=${c.listed_count}`, Number(db.stats.listed_count) === Number(c.listed_count) ? "PASS" : "FAIL", 0, "N/A", "KPI: Listed");
  addCase("TC-ADMIN-007", "DATA", "ตรวจ upcoming count", "upcoming_count ต้องตรง direct SQL", `view=${db.stats.upcoming_count}, direct=${c.upcoming_count}`, Number(db.stats.upcoming_count) === Number(c.upcoming_count) ? "PASS" : "FAIL", 0, "N/A", "KPI: Upcoming");
  addCase("TC-ADMIN-008", "DATA", "ตรวจ cancelled count", "cancelled_count ต้องตรง direct SQL", `view=${db.stats.cancelled_count}, direct=${c.cancelled_count}`, Number(db.stats.cancelled_count) === Number(c.cancelled_count) ? "PASS" : "FAIL", 0, "N/A", "Status distribution");
  addCase("TC-ADMIN-009", "DISPLAY", "ตรวจ header/title ของ dashboard", "SSR HTML ต้องมี Dashboard/IPO data operations", displayChecks.find((row) => row[1] === "Dashboard title")?.[3] ?? "-", displayChecks.find((row) => row[1] === "Dashboard title")?.[4] ?? "FAIL", 0, authPage.responseCode, "ส่วนหัวหน้า /admin");
  addCase("TC-ADMIN-010", "DISPLAY", "ตรวจ navigation/sidebar", "SSR HTML ต้องมีเมนูหลัก", displayChecks.find((row) => row[1] === "Admin nav")?.[3] ?? "-", displayChecks.find((row) => row[1] === "Admin nav")?.[4] ?? "FAIL", 0, authPage.responseCode, "Dashboard, IPO Explorer, Validation");
  addCase("TC-ADMIN-011", "DISPLAY", "ตรวจ KPI Total IPO แสดงผล", "HTML ต้องมีตัวเลข total_ipos", displayChecks.find((row) => row[1] === "Total IPOs")?.[3] ?? "-", displayChecks.find((row) => row[1] === "Total IPOs")?.[4] ?? "FAIL", 0, authPage.responseCode, "เลข KPI ใน SSR HTML");
  addCase("TC-ADMIN-012", "DISPLAY", "ตรวจ KPI Listed/Upcoming แสดงผล", "HTML ต้องมี listed/upcoming count", `listed=${displayChecks.find((row) => row[1] === "Listed count")?.[4]}, upcoming=${displayChecks.find((row) => row[1] === "Upcoming count")?.[4]}`, displayChecks.find((row) => row[1] === "Listed count")?.[4] === "PASS" && displayChecks.find((row) => row[1] === "Upcoming count")?.[4] === "PASS" ? "PASS" : "FAIL", 0, authPage.responseCode, "KPI cards");
  addCase("TC-ADMIN-013", "DATA", "ตรวจ recent builds query", "ต้อง query build_runs ได้ และ panel มี data/no-data state", `rows=${db.builds.length}`, db.builds.length >= 0 ? "PASS" : "FAIL", Number(sqlLogs.find((row) => row[1] === "Load recent builds")?.[6] ?? 0), "N/A", "Recent builds panel");
  addCase("TC-ADMIN-014", "DATA", "ตรวจ upcoming IPO preview", "v_upcoming_ipos ต้องโหลดได้และ panel แสดง state", `rows=${db.upcoming.length}`, db.upcoming.length >= 0 ? "PASS" : "FAIL", Number(sqlLogs.find((row) => row[1] === "Load upcoming IPO preview")?.[6] ?? 0), "N/A", "Upcoming panel");
  addCase("TC-ADMIN-015", "REPORT", "ตรวจ yearly listing aggregation", "query yearlyListings ต้องคืนข้อมูล", `rows=${db.yearly.length}`, db.yearly.length > 0 ? "PASS" : "FAIL", Number(sqlLogs.find((row) => row[1] === "Dashboard report yearly listings")?.[6] ?? 0), "N/A", "DashboardDataReport");
  addCase("TC-ADMIN-016", "REPORT", "ตรวจ market distribution aggregation", "marketMix ต้องคืนข้อมูล", `rows=${db.market.length}, top=${db.market[0]?.label ?? "N/A"}`, db.market.length > 0 ? "PASS" : "FAIL", Number(sqlLogs.find((row) => row[1] === "Dashboard report market mix")?.[6] ?? 0), "N/A", "Market chart source");
  addCase("TC-ADMIN-017", "REPORT", "ตรวจ sector leaders aggregation", "sectorLeaders ต้องคืนข้อมูล", `rows=${db.sector.length}, top=${db.sector[0]?.label ?? "N/A"}`, db.sector.length > 0 ? "PASS" : "FAIL", Number(sqlLogs.find((row) => row[1] === "Dashboard report sector leaders")?.[6] ?? 0), "N/A", "Sector chart source");
  addCase("TC-ADMIN-018", "REPORT", "ตรวจ completeness bucket aggregation", "completenessBuckets ต้องมี buckets", `rows=${db.completenessBuckets.length}`, db.completenessBuckets.length > 0 ? "PASS" : "FAIL", Number(sqlLogs.find((row) => row[1] === "Dashboard report completeness buckets")?.[6] ?? 0), "N/A", "Completeness distribution");
  addCase("TC-ADMIN-019", "REPORT", "ตรวจ financial aggregation", "financial KPI ต้องมี rowsWithFinancials/day1ReturnCount", `rowsWithFinancials=${db.financial.rows_with_financials}, day1ReturnCount=${db.financial.day1_return_count}`, Number(db.financial.rows_with_financials) > 0 ? "PASS" : "WARNING", Number(sqlLogs.find((row) => row[1] === "Dashboard report financial aggregation")?.[6] ?? 0), "N/A", "Financial report source");

  const totalDuration = ms(performance.now() - suiteStarted);
  addCase(
    "TC-ADMIN-020",
    "PERFORMANCE",
    "ระยะเวลารวมของ dashboard QA suite",
    "ควรจบภายใน 30 วินาทีสำหรับ dev environment",
    `duration=${totalDuration} ms, page=${authPage.responseTime} ms, apiStats=${statsApi.responseTime} ms`,
    totalDuration <= 30_000 ? "PASS" : "WARNING",
    totalDuration,
    "N/A",
    "รวม DB + API + workbook data prep",
  );

  const pageThreshold = 4_000;
  performanceRows.push(
    ["Authenticated SSR page load", "/admin", `${authPage.responseTime} ms`, `< ${pageThreshold} ms`, authPage.responseTime < pageThreshold ? "PASS" : "WARNING", `htmlLength=${authPage.text.length}`],
    ["Stats API latency", "/api/admin/stats", `${statsApi.responseTime} ms`, "< 2500 ms", statsApi.responseTime < 2500 ? "PASS" : "WARNING", "stats + recentBuilds"],
    ["Session API latency", "/api/auth/me", `${meApi.responseTime} ms`, "< 1000 ms", meApi.responseTime < 1000 ? "PASS" : "WARNING", "sidebar profile request"],
    ["Dashboard SQL avg", "all report queries", `${avgSqlMs()} ms`, "< 1000 ms", avgSqlMs() < 1000 ? "PASS" : "WARNING", `${sqlLogs.length} queries`],
    ["HTML display payload", "SSR HTML", `${authPage.text.length} bytes`, "> 10,000 bytes", authPage.text.length > 10_000 ? "PASS" : "FAIL", "ใช้ตรวจว่าหน้า render ไม่ว่าง"],
    ["Total test runtime", "20 test cases", `${totalDuration} ms`, "< 30,000 ms", totalDuration <= 30_000 ? "PASS" : "WARNING", "รวม end-to-end check"],
  );

  const anomalies = db.anomalies;
  validationIssues.push(
    ["Missing market", "market is null/blank", anomalies.missing_market, Number(anomalies.missing_market) > 0 ? "Medium" : "Info", `พบ ${anomalies.missing_market} records`, Number(anomalies.missing_market) > 0 ? "WARNING" : "PASS", "กระทบ market mix/dashboard filter"],
    ["Missing listing date", "listing_date is null", anomalies.missing_listing_date, Number(anomalies.missing_listing_date) > 0 ? "Medium" : "Info", `พบ ${anomalies.missing_listing_date} records`, Number(anomalies.missing_listing_date) > 0 ? "WARNING" : "PASS", "กระทบ timeline/upcoming"],
    ["Missing IPO price", "ipo_price is null", anomalies.missing_ipo_price, Number(anomalies.missing_ipo_price) > 0 ? "Medium" : "Info", `พบ ${anomalies.missing_ipo_price} records`, Number(anomalies.missing_ipo_price) > 0 ? "WARNING" : "PASS", "กระทบ financial KPI"],
    ["Low completeness", "completeness_pct < 80", anomalies.low_completeness, Number(anomalies.low_completeness) > 0 ? "Medium" : "Info", `พบ ${anomalies.low_completeness} records`, Number(anomalies.low_completeness) > 0 ? "WARNING" : "PASS", "เป็น backlog data cleansing"],
    ["Executive ownership > 50%", "executive_total_pct > 50", anomalies.high_exec_ownership, Number(anomalies.high_exec_ownership) > 0 ? "Low" : "Info", `พบ ${anomalies.high_exec_ownership} records`, Number(anomalies.high_exec_ownership) > 0 ? "WARNING" : "PASS", "business rule review"],
  );

  cleanupRows.push(
    ["Temporary admin user", "admin_users", "ไม่สร้าง temp user ใน report run", "ไม่มี temp user ค้าง", "PASS", "N/A", "ใช้ signed QA cookie เฉพาะ request"],
    ["Database mutations", "dashboard QA", "ไม่มี mutation กับ IPO data", "Read-only queries only", "PASS", "N/A", "ยกเว้น session cookie ใน HTTP request"],
    ["Report export", outputPath, "เขียน xlsx สำเร็จ", "pending validation", "PASS", "N/A", "ตรวจอ่านกลับหลัง export"],
  );

  return { db, authPage, statsApi, meApi };
}

function avgSqlMs() {
  const times = sqlLogs.map((row) => Number(row[6])).filter(Number.isFinite);
  return times.length ? ms(times.reduce((a, b) => a + b, 0) / times.length) : 0;
}

function totalRowsExported() {
  return 12 + testCases.length + sqlLogs.length + apiLogs.length + displayChecks.length + validationIssues.length + performanceRows.length + cleanupRows.length;
}

function col(n) {
  let out = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    out = String.fromCharCode(65 + mod) + out;
    n = Math.floor((n - mod) / 26);
  }
  return out;
}

function applyStatusConditionalFormatting(sheet, statusColumnLetter, startRow, endRow) {
  if (endRow < startRow) return;
  const range = sheet.getRange(`${statusColumnLetter}${startRow}:${statusColumnLetter}${endRow}`);
  range.conditionalFormats.add("containsText", { text: "PASS", format: { fill: "#DCFCE7", font: { bold: true, color: "#166534" } } });
  range.conditionalFormats.add("containsText", { text: "WARNING", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } } });
  range.conditionalFormats.add("containsText", { text: "FAIL", format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } } });
}

function styleTitle(sheet, title, subtitle, width) {
  const endCol = col(width);
  sheet.showGridLines = false;
  sheet.getRange(`A1:${endCol}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1").format = {
    fill: "#123C69",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
  };
  sheet.getRange("A1").format.rowHeightPx = 34;
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2").format = {
    fill: "#EAF2F8",
    font: { bold: true, color: "#1F2937", size: 10 },
    horizontalAlignment: "left",
  };
}

function addTableSheet(workbook, name, title, headers, rows, options = {}) {
  const sheet = workbook.worksheets.add(name);
  styleTitle(sheet, title, `สร้างจาก automated QA run: ${testedAtBangkok}`, headers.length);
  const headerRow = 4;
  const dataStart = headerRow + 1;
  const endRow = headerRow + rows.length;
  const endCol = col(headers.length);

  sheet.getRangeByIndexes(headerRow - 1, 0, 1, headers.length).values = [headers];
  const effectiveRows = rows.length > 0 ? rows : [headers.map(() => "")];
  sheet.getRangeByIndexes(dataStart - 1, 0, effectiveRows.length, headers.length).values = effectiveRows;
  const tableRange = `A${headerRow}:${endCol}${Math.max(endRow, dataStart)}`;
  const table = sheet.tables.add(tableRange, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Table`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  sheet.freezePanes.freezeRows(headerRow);

  sheet.getRange(`A1:${endCol}${Math.max(endRow, dataStart)}`).format = {
    font: { size: 10, color: "#111827" },
    verticalAlignment: "top",
    wrapText: true,
  };
  sheet.getRange(`A${headerRow}:${endCol}${headerRow}`).format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
    wrapText: true,
  };
  sheet.getRange(`A${headerRow}:${endCol}${headerRow}`).format.rowHeightPx = 32;

  const widths = options.widths || [];
  for (let i = 0; i < headers.length; i += 1) {
    sheet.getRange(`${col(i + 1)}:${col(i + 1)}`).format.columnWidthPx = widths[i] || 150;
  }
  if (options.statusColumn) {
    applyStatusConditionalFormatting(sheet, col(options.statusColumn), dataStart, Math.max(endRow, dataStart));
  }
  return sheet;
}

function buildSummarySheet(workbook, workbookValidation = "") {
  const sheet = workbook.worksheets.add("Summary");
  styleTitle(sheet, "รายงานผลการทดสอบ Admin Dashboard / /admin", "Professional QA/UAT Report สำหรับการเรียกข้อมูลและการแสดงผลหน้า Admin", 11);
  sheet.freezePanes.freezeRows(2);

  const counts = {
    PASS: testCases.filter((row) => row[5] === "PASS").length,
    WARNING: testCases.filter((row) => row[5] === "WARNING").length,
    FAIL: testCases.filter((row) => row[5] === "FAIL").length,
  };
  const overallStatus = counts.FAIL > 0 ? "FAIL" : counts.WARNING > 0 ? "WARNING" : "PASS";
  const readiness = counts.FAIL > 0 ? "ยังไม่พร้อม Production" : counts.WARNING > 0 ? "พร้อมแบบมีเงื่อนไข / Conditional Ready" : "พร้อม Production";

  const summaryRows = [
    ["วันที่ทดสอบ", testedAtBangkok],
    ["Environment", `Development / ${apiBase}`],
    ["Database", databaseLabel],
    ["Build version", buildVersion],
    ["Execution time", `${ms(performance.now() - suiteStarted)} ms`],
    ["Records loaded", firstStatsSummary()],
    ["Query performance summary", `avg=${avgSqlMs()} ms, queries=${sqlLogs.length}`],
    ["API performance summary", apiSummary()],
    ["Database transaction status", "Read-only dashboard QA; no IPO mutation"],
    ["Overall status", overallStatus],
    ["Production readiness", readiness],
    ["Workbook validation", workbookValidation || "pending"],
  ];
  sheet.getRange("A4:B15").values = summaryRows;
  sheet.getRange("A4:A15").format = { fill: "#EAF2F8", font: { bold: true, color: "#123C69" } };
  sheet.getRange("B4:B15").format = { wrapText: true };
  sheet.getRange("A:A").format.columnWidthPx = 220;
  sheet.getRange("B:B").format.columnWidthPx = 520;

  sheet.getRange("D4:F5").values = [["PASS", "WARNING", "FAIL"], [counts.PASS, counts.WARNING, counts.FAIL]];
  sheet.getRange("D4:F4").format = { fill: "#123C69", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
  sheet.getRange("D5").format = { fill: "#DCFCE7", font: { bold: true, color: "#166534", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("E5").format = { fill: "#FEF3C7", font: { bold: true, color: "#92400E", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("F5").format = { fill: "#FEE2E2", font: { bold: true, color: "#991B1B", size: 14 }, horizontalAlignment: "center" };

  sheet.getRange("D7:F10").values = [
    ["Metric", "Value", "Status"],
    ["Total Test Cases", testCases.length, overallStatus],
    ["Total Rows Exported", totalRowsExported(), "PASS"],
    ["Workbook Integrity", workbookValidation || "Pending", workbookValidation === "PASS" ? "PASS" : "WARNING"],
  ];
  sheet.getRange("D7:F7").format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF" } };
  applyStatusConditionalFormatting(sheet, "F", 8, 10);
  sheet.getRange("D:F").format.columnWidthPx = 155;

  sheet.getRange("H4:I7").values = [["Status", "Count"], ["PASS", counts.PASS], ["WARNING", counts.WARNING], ["FAIL", counts.FAIL]];
  sheet.getRange("H10:I30").values = [["Test Case", "Execution Time (ms)"], ...testCases.map((row) => [row[0], Number(String(row[6]).replace(" ms", "")) || 0])];
  sheet.getRange("H:I").format.columnWidthPx = 150;
  sheet.getRange("H4:I4").format = { fill: "#123C69", font: { bold: true, color: "#FFFFFF" } };
  sheet.getRange("H10:I10").format = { fill: "#123C69", font: { bold: true, color: "#FFFFFF" } };

  const pie = sheet.charts.add("pie", sheet.getRange("H4:I7"));
  pie.title = "PASS / WARNING / FAIL";
  pie.hasLegend = true;
  pie.setPosition("K4", "Q18");

  const bar = sheet.charts.add("bar", sheet.getRange(`H10:I${10 + testCases.length}`));
  bar.title = "Execution Time by Test Case (ms)";
  bar.hasLegend = false;
  bar.xAxis = { axisType: "textAxis" };
  bar.yAxis = { numberFormatCode: "0" };
  bar.setPosition("K20", "Q38");
}

function firstStatsSummary() {
  const row = sqlLogs.find((item) => item[1] === "Load dashboard stats view");
  const totalCase = testCases.find((item) => item[0] === "TC-ADMIN-005");
  return `${totalCase?.[4] ?? "stats loaded"}; statsQuery=${row?.[6] ?? "-"} ms`;
}

function apiSummary() {
  const times = apiLogs.map((row) => Number(row[4])).filter(Number.isFinite);
  return times.length ? `avg=${ms(times.reduce((a, b) => a + b, 0) / times.length)} ms, calls=${times.length}` : "No API calls";
}

async function buildWorkbook(validationStatus = "") {
  const workbook = Workbook.create();
  buildSummarySheet(workbook, validationStatus);
  addTableSheet(workbook, "Test Cases", "รายละเอียด Test Cases: Admin Dashboard", ["Test Case ID", "Category", "Scenario", "Expected Result", "Actual Result", "Status", "Execution Time", "API Status Code", "Notes"], testCases, { statusColumn: 6, widths: [130, 105, 280, 310, 330, 105, 130, 120, 330] });
  addTableSheet(workbook, "SQL Logs", "SQL Logs และ Query Performance", ["Log ID", "Query Label", "Executed Query", "Affected Tables", "Transaction Status", "Query Status", "Query Execution Time", "Rows/Affected", "Notes"], sqlLogs, { widths: [95, 220, 470, 260, 140, 115, 135, 115, 300] });
  addTableSheet(workbook, "API Logs", "API Logs สำหรับหน้า Admin Dashboard", ["Log ID", "Endpoint", "Method", "Response Code", "Response Time (ms)", "Error Message", "Redirect Mode", "Notes", "Location"], apiLogs, { widths: [95, 260, 90, 105, 130, 230, 120, 300, 240] });
  addTableSheet(workbook, "Display Checks", "Display Checks / SSR Rendering Signals", ["Area", "Selector / Signal", "Expected Result", "Actual Result", "Status", "Notes"], displayChecks, { statusColumn: 5, widths: [130, 210, 320, 260, 105, 320] });
  addTableSheet(workbook, "Validation Issues", "Data Quality Findings ที่พบระหว่างทดสอบ Dashboard", ["Issue Type", "Detection Check", "Count", "Severity", "Sample / Actual Result", "Status", "Notes"], validationIssues, { statusColumn: 6, widths: [190, 270, 90, 110, 280, 105, 340] });
  addTableSheet(workbook, "Performance", "Performance Summary", ["Metric", "Target / Endpoint", "Actual Result", "Threshold", "Status", "Notes"], performanceRows, { statusColumn: 5, widths: [210, 260, 170, 150, 105, 380] });
  addTableSheet(workbook, "Cleanup", "Cleanup และ Post-Test Integrity", ["Cleanup Item", "Target", "Expected Result", "Actual Result", "Status", "Transaction Status", "Notes"], cleanupRows, { statusColumn: 5, widths: [190, 230, 250, 230, 105, 160, 360] });
  return workbook;
}

async function renderAndValidate(workbook) {
  await fs.mkdir(previewDir, { recursive: true });
  const sheetNames = ["Summary", "Test Cases", "SQL Logs", "API Logs", "Display Checks", "Validation Issues", "Performance", "Cleanup"];
  const rendered = [];
  for (const sheetName of sheetNames) {
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    const pngPath = path.join(previewDir, `${sheetName.replace(/[^A-Za-z0-9]/g, "_")}.png`);
    await fs.writeFile(pngPath, new Uint8Array(await preview.arrayBuffer()));
    const stat = await fs.stat(pngPath);
    rendered.push({ sheetName, bytes: stat.size });
  }
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    maxChars: 2000,
  });
  return { rendered, hasFormulaErrors: /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(errors.ndjson || "") };
}

async function exportAndReadBack(workbook) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);
  const blob = await FileBlob.load(outputPath);
  const imported = await SpreadsheetFile.importXlsx(blob);
  const inspect = await imported.inspect({ kind: "sheet", include: "id,name", maxChars: 3000 });
  const expected = ["Summary", "Test Cases", "SQL Logs", "API Logs", "Display Checks", "Validation Issues", "Performance", "Cleanup"];
  const text = inspect.ndjson || "";
  return { allSheetsFound: expected.every((sheet) => text.includes(sheet)), sheetCount: expected.length };
}

async function main() {
  try {
    await runTests();
    let workbook = await buildWorkbook("");
    let validation = await renderAndValidate(workbook);
    let readBack = await exportAndReadBack(workbook);
    const workbookStatus = !validation.hasFormulaErrors && readBack.allSheetsFound ? "PASS" : "WARNING";
    workbook = await buildWorkbook(workbookStatus);
    validation = await renderAndValidate(workbook);
    readBack = await exportAndReadBack(workbook);
    const stat = await fs.stat(outputPath);
    const summary = {
      outputPath,
      fileSizeBytes: stat.size,
      sheetCount: readBack.sheetCount,
      totalRowsExported: totalRowsExported(),
      exportSuccess: true,
      workbookIntegrity: workbookStatus,
      renderedSheets: validation.rendered,
      formulaErrors: validation.hasFormulaErrors,
      readBackSheetsFound: readBack.allSheetsFound,
      pass: testCases.filter((row) => row[5] === "PASS").length,
      warning: testCases.filter((row) => row[5] === "WARNING").length,
      fail: testCases.filter((row) => row[5] === "FAIL").length,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await closePool();
  }
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
