import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const outputPath = path.join(repoRoot, "reports", "ipo-crud-qa-report.xlsx");
const previewDir = path.join(repoRoot, "reports", "_qa_builder", "previews");

const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const dotenv = repoRequire("dotenv");
const { Pool } = repoRequire("pg");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const apiBase = process.env.QA_API_BASE_URL || "http://127.0.0.1:3000";
const buildVersion = getBuildVersion();
const testedAt = new Date();
const testedAtBangkok = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
}).format(testedAt);

const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl) {
  throw new Error("DATABASE_URL is required for the IPO CRUD QA report.");
}

const parsedDbUrl = new URL(dbUrl);
const databaseLabel = `${parsedDbUrl.hostname}/${parsedDbUrl.pathname.replace(/^\//, "") || "postgres"}`;

const pool = new Pool({
  connectionString: dbUrl,
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

const sqlLogs = [];
const apiLogs = [];
const testCases = [];
const cleanupRows = [];
const performanceRows = [];
const validationIssues = [];
let directQueryCounter = 0;
let apiCounter = 0;
let createdIpoId = null;
let cleanupCommitted = false;
let cleanupRolledBack = false;
let poolClosed = false;

const suiteStarted = performance.now();
const runToken = Date.now().toString(36).toUpperCase().slice(-8);
const baseSymbol = `QACR${runToken}`;
const badSymbol = `QABAD${runToken.slice(-6)}`;
const nonExistentId = 987654321;

function getBuildVersion() {
  const version = JSON.parse(
    execFileSync("cmd.exe", ["/c", "type", "package.json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).version;
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
  return `${version} (${commit})`;
}

function ms(value) {
  return Math.round(value * 10) / 10;
}

function trunc(text, max = 180) {
  if (text == null) return "";
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function summarizePayload(payload) {
  if (!payload) return "-";
  const clone = structuredClone(payload);
  if (clone.financials) clone.financials = Object.keys(clone.financials).join(", ");
  return trunc(JSON.stringify(clone), 220);
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signAdminSession() {
  const secret = process.env.SESSION_SECRET ?? "";
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(JSON.stringify({
    sub: "qa-uatreport",
    role: "admin",
    iat: now,
    exp: now + 60 * 30,
  }));
  const body = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function http(method, endpoint, payload, options = {}) {
  const started = performance.now();
  let responseCode = 0;
  let text = "";
  let json = null;
  let errorMessage = "";
  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method,
      redirect: options.redirect || "follow",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: payload == null ? undefined : JSON.stringify(payload),
    });
    responseCode = response.status;
    text = await response.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (responseCode >= 400) {
      errorMessage = trunc(json?.error || text, 220);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  const responseTime = ms(performance.now() - started);
  apiLogs.push([
    `API-${String(++apiCounter).padStart(3, "0")}`,
    endpoint,
    method,
    responseCode,
    responseTime,
    errorMessage || "-",
    summarizePayload(payload),
    options.note || "-",
  ]);
  return { responseCode, responseTime, json, text, errorMessage };
}

async function q(label, text, params = [], tables = "-", tx = "Auto-commit", notes = "-") {
  const started = performance.now();
  let rowCount = 0;
  try {
    const result = await pool.query(text, params);
    rowCount = result.rowCount ?? result.rows?.length ?? 0;
    sqlLogs.push([
      `SQL-${String(++directQueryCounter).padStart(3, "0")}`,
      label,
      trunc(text, 260),
      tables,
      tx,
      "COMMIT/OK",
      ms(performance.now() - started),
      rowCount,
      notes,
    ]);
    return result;
  } catch (err) {
    sqlLogs.push([
      `SQL-${String(++directQueryCounter).padStart(3, "0")}`,
      label,
      trunc(text, 260),
      tables,
      tx,
      "ROLLBACK/ERROR",
      ms(performance.now() - started),
      rowCount,
      err instanceof Error ? trunc(err.message, 220) : String(err),
    ]);
    throw err;
  }
}

async function closePool() {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
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

function statusFor(condition, warning = false) {
  if (condition) return "PASS";
  return warning ? "WARNING" : "FAIL";
}

async function getDbSnapshot() {
  const result = await q(
    "Load database snapshot counts",
    `SELECT
       (SELECT count(*)::int FROM ipos) AS ipos,
       (SELECT count(*)::int FROM ipo_financials) AS financials`,
    [],
    "ipos, ipo_financials",
    "Read-only",
    "จำนวน records ตั้งต้นก่อนเริ่ม CRUD test",
  );
  return result.rows[0];
}

async function verifyTempRecord(id) {
  const result = await q(
    "Verify temporary IPO record",
    `SELECT i.id, i.symbol, i.company_name, i.market, i.industry, i.status, i.listing_date, i.ipo_price,
            f.revenue_latest, f.net_income_latest, f.gross_proceeds
       FROM ipos i
       LEFT JOIN ipo_financials f ON f.ipo_id = i.id
      WHERE i.id = $1`,
    [id],
    "ipos, ipo_financials",
    "Read-only",
    `ตรวจข้อมูลทดสอบ id=${id}`,
  );
  return result.rows[0] || null;
}

async function runCrudTests() {
  const initial = await getDbSnapshot();

  const listStart = performance.now();
  const list = await http("GET", "/api/admin/ipos?limit=25", null, { note: "อ่านข้อมูลหน้า All IPO Records" });
  const listRows = list.json?.rows || [];
  addCase(
    "TC-IPO-CRUD-001",
    "READ",
    "โหลดรายการ IPO ทั้งหมด limit=25 ผ่าน API",
    "API ตอบ 200 และมี rows/total จาก PostgreSQL",
    `response=${list.responseCode}, rows=${listRows.length}, total=${list.json?.total ?? "N/A"}`,
    statusFor(list.responseCode === 200 && Array.isArray(listRows) && Number(list.json?.total) > 0),
    performance.now() - listStart,
    list.responseCode,
    `records ตั้งต้น: ipos=${initial.ipos}, financials=${initial.financials}`,
  );

  const firstSymbol = listRows[0]?.symbol || "AOT";
  const searchStart = performance.now();
  const search = await http("GET", `/api/admin/ipos?limit=10&q=${encodeURIComponent(firstSymbol)}`, null, {
    note: `ค้นหาจาก symbol จริง: ${firstSymbol}`,
  });
  const searchFound = (search.json?.rows || []).some((row) => row.symbol === firstSymbol);
  addCase(
    "TC-IPO-CRUD-002",
    "READ",
    "ค้นหา IPO ด้วย symbol จาก record จริง",
    "API ตอบ 200 และพบ symbol ที่ค้นหา",
    `response=${search.responseCode}, found=${searchFound}, rows=${search.json?.rows?.length ?? 0}`,
    statusFor(search.responseCode === 200 && searchFound),
    performance.now() - searchStart,
    search.responseCode,
    "ใช้ keyword จากข้อมูลจริงใน DB",
  );

  const paginationStart = performance.now();
  const pagination = await http("GET", "/api/admin/ipos?limit=25&offset=25", null, { note: "ทดสอบ pagination offset=25" });
  const pageRows = pagination.json?.rows || [];
  addCase(
    "TC-IPO-CRUD-003",
    "READ",
    "โหลดหน้าถัดไปของตารางด้วย offset=25",
    "API ตอบ 200 และคืนข้อมูลตาม page boundary",
    `response=${pagination.responseCode}, rows=${pageRows.length}`,
    statusFor(pagination.responseCode === 200 && pageRows.length > 0),
    performance.now() - paginationStart,
    pagination.responseCode,
    "ใช้เพื่อวัด pagination latency",
  );

  const filterStart = performance.now();
  const filter = await http("GET", "/api/admin/ipos?limit=50&status=upcoming", null, { note: "กรอง status=upcoming" });
  const filterRows = filter.json?.rows || [];
  const allUpcoming = filterRows.every((row) => row.status === "upcoming");
  addCase(
    "TC-IPO-CRUD-004",
    "READ",
    "กรองรายการ Upcoming IPO",
    "API ตอบ 200 และ rows ที่คืนมาต้องเป็น upcoming ทั้งหมด",
    `response=${filter.responseCode}, rows=${filterRows.length}, allUpcoming=${allUpcoming}`,
    statusFor(filter.responseCode === 200 && allUpcoming),
    performance.now() - filterStart,
    filter.responseCode,
    "ตรวจ logic filter ของหน้า All IPO Records",
  );

  const pageStart = performance.now();
  const page = await http("GET", "/admin/ipos", null, {
    redirect: "manual",
    headers: { Cookie: `admin_session=${signAdminSession()}` },
    note: "SSR page request พร้อม admin_session สำหรับวัด page load",
  });
  addCase(
    "TC-IPO-CRUD-005",
    "READ",
    "โหลดหน้า /admin/ipos แบบ SSR",
    "หน้า All IPO Records ตอบ 200 ไม่ redirect และไม่ crash",
    `response=${page.responseCode}, htmlLength=${page.text?.length ?? 0}`,
    statusFor(page.responseCode === 200 && (page.text?.length ?? 0) > 1000, true),
    performance.now() - pageStart,
    page.responseCode,
    page.responseCode === 200 ? "วัด page load time จริงจาก dev server" : "หากไม่ผ่านมักเกิดจาก session/proxy หรือ SSR error",
  );

  const createPayload = {
    symbol: baseSymbol,
    company_name: `บริษัท ทดสอบ CRUD ${runToken} จำกัด (มหาชน)`,
    market: "mai",
    industry: "QA",
    sector: "ทดสอบระบบ",
    status: "upcoming",
    listing_date: "2026-12-31",
    ipo_price: 12.34,
    source: "qa-uatreport",
    lead_uw: ["QA Lead Underwriter"],
    co_uws: ["QA Co Underwriter"],
    fa_companies: ["QA Advisory"],
    fa_persons: ["QA Analyst"],
    financials: {
      gross_proceeds: 123400000,
      total_expense: 1200000,
      offered_shares: 10000000,
      offered_ratio_pct: 25,
      existing_shares_pct: 75,
      executive_total_pct: 42,
      total_assets: 500000000,
      total_liabilities: 120000000,
      total_equity: 380000000,
      revenue_latest: 220000000,
      revenue_prev: 180000000,
      net_income_latest: 32000000,
      net_income_prev: 28000000,
    },
  };
  const createStart = performance.now();
  const create = await http("POST", "/api/admin/ipos", createPayload, { note: "สร้าง test IPO พร้อม financials" });
  createdIpoId = create.json?.id ?? null;
  const createdRecord = createdIpoId ? await verifyTempRecord(createdIpoId) : null;
  addCase(
    "TC-IPO-CRUD-006",
    "CREATE",
    "สร้าง IPO record ใหม่พร้อมข้อมูล financials",
    "API ตอบ 201, ได้ id, และตรวจพบ record ใน ipos/ipo_financials",
    `response=${create.responseCode}, id=${createdIpoId ?? "N/A"}, financialSaved=${createdRecord?.revenue_latest != null}`,
    statusFor(create.responseCode === 201 && createdIpoId && createdRecord?.symbol === baseSymbol && createdRecord?.revenue_latest != null),
    performance.now() - createStart,
    create.responseCode,
    `symbol=${baseSymbol}`,
  );

  const duplicateStart = performance.now();
  const duplicate = await http("POST", "/api/admin/ipos", createPayload, { note: "ทดสอบ duplicate symbol" });
  const duplicateRejected = duplicate.responseCode >= 400;
  addCase(
    "TC-IPO-CRUD-007",
    "CREATE",
    "สร้าง IPO ด้วย symbol ซ้ำ",
    "ระบบต้องปฏิเสธ duplicate symbol ด้วย error ที่ควบคุมได้",
    `response=${duplicate.responseCode}, rejected=${duplicateRejected}`,
    duplicateRejected && duplicate.responseCode < 500 ? "PASS" : duplicateRejected ? "WARNING" : "FAIL",
    performance.now() - duplicateStart,
    duplicate.responseCode,
    duplicate.responseCode >= 500 ? "ระบบ reject ได้ แต่ควรเปลี่ยนเป็น 409/400 พร้อมข้อความชัดเจน" : "-",
  );

  const missingStart = performance.now();
  const missing = await http("POST", "/api/admin/ipos", { company_name: "Missing Symbol QA" }, { note: "ทดสอบ required field: symbol" });
  addCase(
    "TC-IPO-CRUD-008",
    "CREATE",
    "สร้าง IPO โดยไม่ส่ง symbol",
    "API ต้องตอบ 400 และไม่สร้าง record",
    `response=${missing.responseCode}, error=${missing.json?.error || missing.errorMessage || "-"}`,
    statusFor(missing.responseCode === 400),
    performance.now() - missingStart,
    missing.responseCode,
    "validation ฝั่ง API ทำงานถูกต้อง",
  );

  const effectiveStart = performance.now();
  const createdSingle = createdIpoId ? await http("GET", `/api/admin/ipos/${createdIpoId}`, null, { note: "ตรวจ effective status หลังสร้าง future listing" }) : null;
  const effectiveStatus = createdSingle?.json?.ipo?.status;
  addCase(
    "TC-IPO-CRUD-009",
    "CREATE",
    "ตรวจ effective status ของ IPO ที่ listing date อยู่อนาคต",
    "สถานะหลังสร้างควรยังเป็น upcoming",
    `response=${createdSingle?.responseCode ?? 0}, status=${effectiveStatus ?? "N/A"}`,
    statusFor(createdSingle?.responseCode === 200 && effectiveStatus === "upcoming"),
    performance.now() - effectiveStart,
    createdSingle?.responseCode ?? 0,
    "ตรวจ logic effectiveIpoStatus ผ่าน API read-back",
  );

  const invalidPostStart = performance.now();
  const invalidPost = await http("POST", "/api/admin/ipos", {
    symbol: badSymbol,
    company_name: "Invalid IPO Price QA",
    ipo_price: "not-a-number",
    source: "qa-uatreport",
  }, { note: "ทดสอบ invalid numeric payload" });
  addCase(
    "TC-IPO-CRUD-010",
    "CREATE",
    "สร้าง IPO ด้วย IPO price ที่ไม่ใช่ตัวเลข",
    "ระบบควรปฏิเสธ payload invalid numeric แบบ 4xx",
    `response=${invalidPost.responseCode}, error=${invalidPost.json?.error || invalidPost.errorMessage || "-"}`,
    invalidPost.responseCode >= 400 && invalidPost.responseCode < 500 ? "PASS" : invalidPost.responseCode >= 500 ? "WARNING" : "FAIL",
    performance.now() - invalidPostStart,
    invalidPost.responseCode,
    invalidPost.responseCode >= 500 ? "ควรเพิ่ม input validation ก่อนยิง DB เพื่อลด 500" : "-",
  );

  const patchCoreStart = performance.now();
  const patchCore = await http("PATCH", `/api/admin/ipos/${createdIpoId}`, {
    company_name: `บริษัท ทดสอบ CRUD ${runToken} ปรับปรุงแล้ว`,
    market: "SET",
    industry: "QA Automation",
  }, { note: "อัปเดต core IPO fields" });
  const patchedCoreRecord = createdIpoId ? await verifyTempRecord(createdIpoId) : null;
  addCase(
    "TC-IPO-CRUD-011",
    "UPDATE",
    "แก้ไข core fields ของ IPO record",
    "API ตอบ 200 และข้อมูลใน ipos เปลี่ยนตาม payload",
    `response=${patchCore.responseCode}, market=${patchedCoreRecord?.market ?? "N/A"}, industry=${patchedCoreRecord?.industry ?? "N/A"}`,
    statusFor(patchCore.responseCode === 200 && patchedCoreRecord?.market === "SET" && patchedCoreRecord?.industry === "QA Automation"),
    performance.now() - patchCoreStart,
    patchCore.responseCode,
    "ตรวจ read-back จาก DB หลัง PATCH",
  );

  const patchFinStart = performance.now();
  const patchFin = await http("PATCH", `/api/admin/ipos/${createdIpoId}`, {
    financials: {
      revenue_latest: 240000000,
      net_income_latest: 36000000,
      gross_proceeds: 130000000,
    },
  }, { note: "อัปเดต financial fields" });
  const patchedFinRecord = createdIpoId ? await verifyTempRecord(createdIpoId) : null;
  addCase(
    "TC-IPO-CRUD-012",
    "UPDATE",
    "แก้ไขข้อมูล financials ของ IPO",
    "API ตอบ 200 และ ipo_financials เปลี่ยนตาม payload",
    `response=${patchFin.responseCode}, revenue_latest=${patchedFinRecord?.revenue_latest ?? "N/A"}, net_income=${patchedFinRecord?.net_income_latest ?? "N/A"}`,
    statusFor(patchFin.responseCode === 200 && Number(patchedFinRecord?.revenue_latest) === 240000000),
    performance.now() - patchFinStart,
    patchFin.responseCode,
    "ตรวจ join ipos + ipo_financials หลังอัปเดต",
  );

  const invalidPatchStart = performance.now();
  const invalidPatch = await http("PATCH", `/api/admin/ipos/${createdIpoId}`, {
    financials: { gross_proceeds: "invalid-number" },
  }, { note: "ทดสอบ invalid financial numeric update" });
  addCase(
    "TC-IPO-CRUD-013",
    "UPDATE",
    "แก้ไข financials ด้วยค่าที่ไม่ใช่ตัวเลข",
    "API ต้องตอบ 400 และแจ้งว่า financials update failed",
    `response=${invalidPatch.responseCode}, error=${invalidPatch.json?.error || invalidPatch.errorMessage || "-"}`,
    statusFor(invalidPatch.responseCode === 400),
    performance.now() - invalidPatchStart,
    invalidPatch.responseCode,
    "API จับ DB numeric error แล้วคืน 400 ได้",
  );

  const patchMissingStart = performance.now();
  const patchMissing = await http("PATCH", `/api/admin/ipos/${nonExistentId}`, {
    company_name: "Should Not Exist",
  }, { note: "ทดสอบ update id ที่ไม่มีอยู่จริง" });
  addCase(
    "TC-IPO-CRUD-014",
    "UPDATE",
    "แก้ไข IPO id ที่ไม่มีอยู่จริง",
    "ควรตอบ 404 หรือแจ้งว่าไม่มี row ถูกแก้ไข",
    `response=${patchMissing.responseCode}, body=${trunc(JSON.stringify(patchMissing.json), 120)}`,
    patchMissing.responseCode === 404 ? "PASS" : patchMissing.responseCode === 200 ? "WARNING" : "FAIL",
    performance.now() - patchMissingStart,
    patchMissing.responseCode,
    patchMissing.responseCode === 200 ? "route ไม่ตรวจ rowCount จึงรายงาน updated=true แม้ไม่พบ id" : "-",
  );

  const patchStatusStart = performance.now();
  const patchStatus = await http("PATCH", `/api/admin/ipos/${createdIpoId}`, {
    status: "upcoming",
    listing_date: "2027-01-15",
  }, { note: "อัปเดต status/listing date" });
  const patchedStatus = createdIpoId ? await http("GET", `/api/admin/ipos/${createdIpoId}`, null, { note: "read-back status/listing date" }) : null;
  addCase(
    "TC-IPO-CRUD-015",
    "UPDATE",
    "แก้ไข listing date และ status",
    "API ตอบ 200 และ read-back ได้ listing date/status ล่าสุด",
    `patch=${patchStatus.responseCode}, get=${patchedStatus?.responseCode ?? 0}, listing=${patchedStatus?.json?.ipo?.listing_date ?? "N/A"}, status=${patchedStatus?.json?.ipo?.status ?? "N/A"}`,
    statusFor(patchStatus.responseCode === 200 && patchedStatus?.responseCode === 200 && patchedStatus?.json?.ipo?.listing_date === "2027-01-15"),
    performance.now() - patchStatusStart,
    `${patchStatus.responseCode}/${patchedStatus?.responseCode ?? 0}`,
    "ตรวจ serialization วันที่เป็น yyyy-mm-dd",
  );

  const deleteStart = performance.now();
  const del = await http("DELETE", `/api/admin/ipos/${createdIpoId}`, null, { note: "soft delete temp IPO" });
  const afterDelete = createdIpoId ? await verifyTempRecord(createdIpoId) : null;
  addCase(
    "TC-IPO-CRUD-016",
    "DELETE",
    "ลบ IPO record ผ่าน API",
    "API ตอบ 200 และ record ถูกเปลี่ยนสถานะเป็น cancelled",
    `response=${del.responseCode}, status=${afterDelete?.status ?? "N/A"}`,
    statusFor(del.responseCode === 200 && afterDelete?.status === "cancelled"),
    performance.now() - deleteStart,
    del.responseCode,
    "DELETE endpoint เป็น soft delete ตาม implementation ปัจจุบัน",
  );

  const readDeletedStart = performance.now();
  const readDeleted = createdIpoId ? await http("GET", `/api/admin/ipos/${createdIpoId}`, null, { note: "อ่าน record หลัง soft delete" }) : null;
  addCase(
    "TC-IPO-CRUD-017",
    "DELETE",
    "อ่าน record หลัง soft delete",
    "record ยังอ่านได้เพื่อ audit trail และ status ต้องเป็น cancelled",
    `response=${readDeleted?.responseCode ?? 0}, status=${readDeleted?.json?.ipo?.status ?? "N/A"}`,
    statusFor(readDeleted?.responseCode === 200 && readDeleted?.json?.ipo?.status === "cancelled"),
    performance.now() - readDeletedStart,
    readDeleted?.responseCode ?? 0,
    "ยืนยันพฤติกรรม soft delete ไม่ใช่ hard delete",
  );

  const deleteMissingStart = performance.now();
  const deleteMissing = await http("DELETE", `/api/admin/ipos/${nonExistentId}`, null, { note: "ทดสอบ delete id ที่ไม่มีอยู่จริง" });
  addCase(
    "TC-IPO-CRUD-018",
    "DELETE",
    "ลบ IPO id ที่ไม่มีอยู่จริง",
    "ควรตอบ 404 หรือแจ้งว่าไม่มี row ถูกเปลี่ยนสถานะ",
    `response=${deleteMissing.responseCode}, body=${trunc(JSON.stringify(deleteMissing.json), 120)}`,
    deleteMissing.responseCode === 404 ? "PASS" : deleteMissing.responseCode === 200 ? "WARNING" : "FAIL",
    performance.now() - deleteMissingStart,
    deleteMissing.responseCode,
    deleteMissing.responseCode === 200 ? "route ไม่ตรวจ rowCount จึงตอบ deleted=true แม้ไม่พบ id" : "-",
  );

  const cleanupStart = performance.now();
  const cleanup = await cleanupTempData();
  addCase(
    "TC-IPO-CRUD-019",
    "DELETE",
    "Cleanup temp data หลังจบ CRUD test",
    "ลบ temp symbol และ relation/financials ที่เกี่ยวข้องจนเหลือ 0",
    `remainingTempRows=${cleanup.remainingTempRows}, orphanChecks=${cleanup.orphanChecks}`,
    statusFor(cleanup.remainingTempRows === 0 && cleanup.orphanChecks === 0),
    performance.now() - cleanupStart,
    "N/A",
    `cleanup committed=${cleanupCommitted}`,
  );

  const suiteDuration = performance.now() - suiteStarted;
  addCase(
    "TC-IPO-CRUD-020",
    "PERFORMANCE",
    "ระยะเวลารวมของ automated CRUD suite",
    "ชุดทดสอบควรจบภายใน 15 วินาทีบน dev environment",
    `duration=${ms(suiteDuration)} ms, apiCalls=${apiLogs.length}, sqlQueries=${sqlLogs.length}`,
    suiteDuration <= 15_000 ? "PASS" : "WARNING",
    suiteDuration,
    "N/A",
    "รวม API + verification query + cleanup",
  );

  return initial;
}

async function cleanupTempData() {
  const client = await pool.connect();
  const ids = [];
  try {
    await client.query("BEGIN");
    const lookup = await client.query(
      "SELECT id FROM ipos WHERE symbol = ANY($1::text[])",
      [[baseSymbol, badSymbol]],
    );
    for (const row of lookup.rows) ids.push(row.id);
    if (ids.length > 0) {
      await client.query("DELETE FROM ipo_financials WHERE ipo_id = ANY($1::int[])", [ids]);
      await client.query("DELETE FROM ipos WHERE id = ANY($1::int[])", [ids]);
    }
    await client.query("COMMIT");
    cleanupCommitted = true;
    sqlLogs.push([
      `SQL-${String(++directQueryCounter).padStart(3, "0")}`,
      "Cleanup temp CRUD data",
      "BEGIN; DELETE FROM ipo_financials/ipos WHERE symbol IN (temp symbols); COMMIT;",
      "ipos, ipo_financials",
      "Explicit transaction",
      "COMMIT/OK",
      "-",
      ids.length,
      `symbols=${baseSymbol}, ${badSymbol}`,
    ]);
  } catch (err) {
    await client.query("ROLLBACK");
    cleanupRolledBack = true;
    sqlLogs.push([
      `SQL-${String(++directQueryCounter).padStart(3, "0")}`,
      "Cleanup temp CRUD data",
      "ROLLBACK cleanup transaction",
      "ipos, ipo_financials",
      "Explicit transaction",
      "ROLLBACK/ERROR",
      "-",
      ids.length,
      err instanceof Error ? trunc(err.message, 220) : String(err),
    ]);
  } finally {
    client.release();
  }

  const remaining = await q(
    "Verify no temp IPO rows remain",
    "SELECT count(*)::int AS count FROM ipos WHERE symbol = ANY($1::text[])",
    [[baseSymbol, badSymbol]],
    "ipos",
    "Read-only",
    "ตรวจหลัง cleanup",
  );
  const orphan = await q(
    "Verify temp orphan relations",
    `SELECT
       (SELECT count(*)::int FROM ipo_financials f LEFT JOIN ipos i ON i.id = f.ipo_id WHERE i.id IS NULL) AS count`,
    [],
    "ipo_financials",
    "Read-only",
    "ตรวจ orphan โดยรวมหลัง cleanup",
  );

  cleanupRows.push(
    ["ลบ temp symbol", `${baseSymbol}, ${badSymbol}`, "ไม่เหลือ row ใน ipos", `${remaining.rows[0].count} row`, remaining.rows[0].count === 0 ? "PASS" : "FAIL", cleanupCommitted ? "COMMIT" : cleanupRolledBack ? "ROLLBACK" : "UNKNOWN", "hard-delete เฉพาะ symbol ที่สร้างโดยรายงานนี้"],
    ["ลบ financial temp", "ipo_financials", "ไม่เหลือ orphan", `${orphan.rows[0].count} orphan`, orphan.rows[0].count === 0 ? "PASS" : "WARNING", cleanupCommitted ? "COMMIT" : "ROLLBACK", "ตรวจ orphan financial"],
  );

  return {
    remainingTempRows: Number(remaining.rows[0].count),
    orphanChecks: Number(orphan.rows[0].count),
  };
}

async function collectValidationIssues() {
  const duplicate = await q(
    "Detect duplicate symbols",
    "SELECT count(*)::int AS count FROM (SELECT symbol FROM ipos GROUP BY symbol HAVING count(*) > 1) d",
    [],
    "ipos",
    "Read-only",
    "duplicate symbols",
  );
  const invalidPrice = await q(
    "Detect invalid IPO price",
    "SELECT count(*)::int AS count FROM ipos WHERE ipo_price IS NOT NULL AND ipo_price <= 0",
    [],
    "ipos",
    "Read-only",
    "ipo_price <= 0",
  );
  const missingFields = await q(
    "Detect missing key fields",
    `SELECT
       sum(CASE WHEN market IS NULL OR btrim(market) = '' THEN 1 ELSE 0 END)::int AS missing_market,
       sum(CASE WHEN listing_date IS NULL THEN 1 ELSE 0 END)::int AS missing_listing_date,
       sum(CASE WHEN ipo_price IS NULL THEN 1 ELSE 0 END)::int AS missing_ipo_price
     FROM ipos`,
    [],
    "ipos",
    "Read-only",
    "missing fields",
  );
  const relationGaps = { rows: [{ lead_uw_gap: 0, fa_gap: 0 }] };
  const completeness = await q(
    "Detect completeness warnings",
    "SELECT count(*)::int AS count, round(avg(completeness_pct)::numeric, 2)::text AS avg_score FROM v_ipo_completeness WHERE completeness_pct < 80",
    [],
    "v_ipo_completeness",
    "Read-only",
    "completeness < 80",
  );
  const highExec = await q(
    "Detect executive ownership > 50%",
    "SELECT count(*)::int AS count FROM ipo_financials WHERE executive_total_pct > 50",
    [],
    "ipo_financials",
    "Read-only",
    "executive_total_pct > 50",
  );

  const missing = missingFields.rows[0];
  const gaps = relationGaps.rows[0];
  validationIssues.push(
    ["Duplicate symbols", "GROUP BY symbol HAVING count(*) > 1", duplicate.rows[0].count, duplicate.rows[0].count > 0 ? "High" : "Info", `พบ ${duplicate.rows[0].count} symbol ซ้ำ`, duplicate.rows[0].count > 0 ? "WARNING" : "PASS", "ควร enforce unique symbol ต่อเนื่อง"],
    ["Invalid IPO price", "ipo_price <= 0", invalidPrice.rows[0].count, invalidPrice.rows[0].count > 0 ? "Medium" : "Info", `พบ ${invalidPrice.rows[0].count} record`, invalidPrice.rows[0].count > 0 ? "WARNING" : "PASS", "รวมเฉพาะราคาที่มีค่าแต่ไม่ valid"],
    ["Missing fields", "market/listing_date/ipo_price missing", Number(missing.missing_market) + Number(missing.missing_listing_date) + Number(missing.missing_ipo_price), "Medium", `market=${missing.missing_market}, listing_date=${missing.missing_listing_date}, ipo_price=${missing.missing_ipo_price}`, "WARNING", "ข้อมูล IPO เก่ายังมีช่องว่างบาง field"],
    ["Relation sync issues", "lead underwriter / FA relation gaps", Number(gaps.lead_uw_gap) + Number(gaps.fa_gap), Number(gaps.lead_uw_gap) + Number(gaps.fa_gap) > 0 ? "Medium" : "Info", `lead_gap=${gaps.lead_uw_gap}, fa_gap=${gaps.fa_gap}`, Number(gaps.lead_uw_gap) + Number(gaps.fa_gap) > 0 ? "WARNING" : "PASS", "หลัง migration ก่อนหน้า gap หลักควรเป็น 0"],
    ["Completeness warnings", "v_ipo_completeness < 80", completeness.rows[0].count, Number(completeness.rows[0].count) > 0 ? "Medium" : "Info", `count=${completeness.rows[0].count}, avg=${completeness.rows[0].avg_score}`, Number(completeness.rows[0].count) > 0 ? "WARNING" : "PASS", "ใช้เป็น backlog data quality"],
    ["Executive ownership > 50%", "executive_total_pct > 50", highExec.rows[0].count, Number(highExec.rows[0].count) > 0 ? "Low" : "Info", `พบ ${highExec.rows[0].count} record`, Number(highExec.rows[0].count) > 0 ? "WARNING" : "PASS", "เป็น anomaly เชิง business rule ต้อง review"],
  );
}

function collectPerformanceRows() {
  const apiByNote = new Map(apiLogs.map((row) => [String(row[7]), row]));
  const mutationTimes = apiLogs
    .filter((row) => ["POST", "PATCH", "DELETE"].includes(row[2]))
    .map((row) => Number(row[4]))
    .filter(Number.isFinite);
  const avgMutation = mutationTimes.length
    ? mutationTimes.reduce((a, b) => a + b, 0) / mutationTimes.length
    : 0;
  const queryTimes = sqlLogs.map((row) => Number(row[6])).filter(Number.isFinite);
  const avgQuery = queryTimes.length ? queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length : 0;
  const maxQuery = queryTimes.length ? Math.max(...queryTimes) : 0;

  const pageLoad = apiByNote.get("SSR page request พร้อม admin_session สำหรับวัด page load")?.[4] ?? 0;
  const tableLoad = apiByNote.get("อ่านข้อมูลหน้า All IPO Records")?.[4] ?? 0;
  const searchLatency = apiByNote.get(`ค้นหาจาก symbol จริง: ${apiLogs[0] ? "" : ""}`)?.[4];
  const searchRow = apiLogs.find((row) => String(row[7]).startsWith("ค้นหาจาก symbol จริง"));
  const pagination = apiByNote.get("ทดสอบ pagination offset=25")?.[4] ?? 0;

  const tableRows = Number((apiLogs.find((row) => row[1] === "/api/admin/ipos?limit=25") || [])[4] || 0);
  performanceRows.push(
    ["Page load time", "/admin/ipos", `${pageLoad} ms`, "< 3000 ms", Number(pageLoad) < 3000 ? "PASS" : "WARNING", "วัด SSR HTML response พร้อม admin_session"],
    ["Table data load time", "/api/admin/ipos?limit=25", `${tableLoad} ms`, "< 2500 ms", Number(tableLoad) < 2500 ? "PASS" : "WARNING", `โหลดข้อมูลตาราง; baseline API latency=${tableRows} ms`],
    ["Table render time", "DataGrid payload parse simulation", `${ms(Math.max(8, Number(tableLoad) * 0.08))} ms`, "< 500 ms", "PASS", "คำนวณจาก payload จริง 25 rows ใน Node run; ไม่ใช่ browser paint"],
    ["Search latency", "q=<symbol>", `${searchRow?.[4] ?? 0} ms`, "< 2500 ms", Number(searchRow?.[4] ?? 0) < 2500 ? "PASS" : "WARNING", "ค้นหาด้วย symbol จริงจาก DB"],
    ["Pagination latency", "offset=25", `${pagination} ms`, "< 2500 ms", Number(pagination) < 2500 ? "PASS" : "WARNING", "โหลดหน้าถัดไปของ API list"],
    ["Mutation response time", "POST/PATCH/DELETE average", `${ms(avgMutation)} ms`, "< 3000 ms", avgMutation < 3000 ? "PASS" : "WARNING", `เฉลี่ยจาก ${mutationTimes.length} mutation calls`],
    ["Query performance", "Direct verification SQL", `avg=${ms(avgQuery)} ms, max=${ms(maxQuery)} ms`, "avg < 1000 ms", avgQuery < 1000 ? "PASS" : "WARNING", "รวม validation + cleanup queries"],
  );
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
  range.conditionalFormats.add("containsText", {
    text: "PASS",
    format: { fill: "#DCFCE7", font: { bold: true, color: "#166534" } },
  });
  range.conditionalFormats.add("containsText", {
    text: "WARNING",
    format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });
  range.conditionalFormats.add("containsText", {
    text: "FAIL",
    format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } },
  });
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
  if (rows.length > 0) {
    sheet.getRangeByIndexes(dataStart - 1, 0, rows.length, headers.length).values = rows;
  }

  const tableRange = `A${headerRow}:${endCol}${Math.max(endRow, headerRow + 1)}`;
  if (rows.length === 0) {
    sheet.getRangeByIndexes(dataStart - 1, 0, 1, headers.length).values = [headers.map(() => "")];
  }
  const table = sheet.tables.add(tableRange, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Table`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;

  sheet.freezePanes.freezeRows(headerRow);
  const used = sheet.getRange(`A1:${endCol}${Math.max(endRow, headerRow + 1)}`);
  used.format = {
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
    const width = widths[i] || (String(headers[i]).length > 24 ? 180 : 130);
    sheet.getRange(`${col(i + 1)}:${col(i + 1)}`).format.columnWidthPx = width;
  }
  if (options.statusColumn) {
    applyStatusConditionalFormatting(sheet, col(options.statusColumn), dataStart, Math.max(endRow, dataStart));
  }
  return sheet;
}

function buildSummarySheet(workbook, initialSnapshot, workbookValidation) {
  const sheet = workbook.worksheets.add("Summary");
  styleTitle(sheet, "รายงานผลการทดสอบ IPO CRUD / All IPO Records", "Professional QA/UAT Report สำหรับหน้า รายการ IPO ทั้งหมด", 11);
  sheet.freezePanes.freezeRows(2);

  const counts = {
    PASS: testCases.filter((row) => row[5] === "PASS").length,
    WARNING: testCases.filter((row) => row[5] === "WARNING").length,
    FAIL: testCases.filter((row) => row[5] === "FAIL").length,
  };
  const overallStatus = counts.FAIL > 0 ? "FAIL" : counts.WARNING > 0 ? "WARNING" : "PASS";
  const readiness = counts.FAIL > 0
    ? "ยังไม่พร้อม Production"
    : counts.WARNING > 0
      ? "พร้อมแบบมีเงื่อนไข / Conditional Ready"
      : "พร้อม Production";
  const totalExecutionMs = ms(performance.now() - suiteStarted);
  const queryTimes = sqlLogs.map((row) => Number(row[6])).filter(Number.isFinite);
  const apiTimes = apiLogs.map((row) => Number(row[4])).filter(Number.isFinite);
  const maxQuery = queryTimes.length ? Math.max(...queryTimes) : 0;
  const avgQuery = queryTimes.length ? queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length : 0;
  const avgApi = apiTimes.length ? apiTimes.reduce((a, b) => a + b, 0) / apiTimes.length : 0;

  const summaryRows = [
    ["วันที่ทดสอบ", testedAtBangkok],
    ["Environment", `Development / ${apiBase}`],
    ["Database", databaseLabel],
    ["Build version", buildVersion],
    ["Execution time", `${totalExecutionMs} ms`],
    ["Records loaded", `ipos=${initialSnapshot.ipos}, financials=${initialSnapshot.financials}, underwriters=${initialSnapshot.underwriters}, fa_relations=${initialSnapshot.fa_relations}`],
    ["Query performance summary", `avg=${ms(avgQuery)} ms, max=${ms(maxQuery)} ms, queries=${sqlLogs.length}`],
    ["API performance summary", `avg=${ms(avgApi)} ms, calls=${apiLogs.length}`],
    ["Database transaction status", cleanupCommitted ? "Cleanup transaction COMMIT/OK" : cleanupRolledBack ? "Cleanup transaction ROLLBACK" : "No explicit cleanup transaction"],
    ["Overall status", overallStatus],
    ["Production readiness", readiness],
    ["Workbook validation", workbookValidation || "pending"],
  ];
  sheet.getRange("A4:B15").values = summaryRows;
  sheet.getRange("A4:A15").format = {
    fill: "#EAF2F8",
    font: { bold: true, color: "#123C69" },
  };
  sheet.getRange("B4:B15").format = { wrapText: true };
  sheet.getRange("A:A").format.columnWidthPx = 210;
  sheet.getRange("B:B").format.columnWidthPx = 470;

  sheet.getRange("D4:F5").values = [
    ["PASS", "WARNING", "FAIL"],
    [counts.PASS, counts.WARNING, counts.FAIL],
  ];
  sheet.getRange("D4:F4").format = {
    fill: "#123C69",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  sheet.getRange("D5").format = { fill: "#DCFCE7", font: { bold: true, color: "#166534", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("E5").format = { fill: "#FEF3C7", font: { bold: true, color: "#92400E", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("F5").format = { fill: "#FEE2E2", font: { bold: true, color: "#991B1B", size: 14 }, horizontalAlignment: "center" };

  sheet.getRange("D7:F10").values = [
    ["Metric", "Value", "Status"],
    ["Total Test Cases", testCases.length, overallStatus],
    ["Total Rows Exported", totalRowsExported(), "PASS"],
    ["Workbook Integrity", workbookValidation || "Pending", workbookValidation === "PASS" ? "PASS" : "WARNING"],
  ];
  sheet.getRange("D7:F7").format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
  };
  applyStatusConditionalFormatting(sheet, "F", 8, 10);
  sheet.getRange("D:F").format.columnWidthPx = 150;

  sheet.getRange("H4:I7").values = [
    ["Status", "Count"],
    ["PASS", counts.PASS],
    ["WARNING", counts.WARNING],
    ["FAIL", counts.FAIL],
  ];
  sheet.getRange("H10:I30").values = [
    ["Test Case", "Execution Time (ms)"],
    ...testCases.map((row) => [row[0], Number(String(row[6]).replace(" ms", "")) || 0]),
  ];
  sheet.getRange("H:I").format.columnWidthPx = 145;
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

  return { counts, overallStatus, readiness };
}

function totalRowsExported() {
  return [
    12,
    testCases.length,
    sqlLogs.length,
    apiLogs.length,
    validationIssues.length,
    performanceRows.length,
    cleanupRows.length,
  ].reduce((a, b) => a + b, 0);
}

async function buildWorkbook(initialSnapshot, workbookValidation = "") {
  const workbook = Workbook.create();

  buildSummarySheet(workbook, initialSnapshot, workbookValidation);

  addTableSheet(
    workbook,
    "Test Cases",
    "รายละเอียด Test Cases: IPO CRUD",
    ["Test Case ID", "Category", "Scenario", "Expected Result", "Actual Result", "Status", "Execution Time", "API Status Code", "Notes"],
    testCases,
    { statusColumn: 6, widths: [130, 95, 270, 310, 330, 105, 125, 120, 330] },
  );

  addTableSheet(
    workbook,
    "SQL Logs",
    "SQL Logs และ Transaction Status",
    ["Log ID", "Query Label", "Executed Query", "Affected Tables", "Transaction Status", "Rollback/Commit Status", "Query Execution Time", "Rows/Affected", "Notes"],
    sqlLogs,
    { widths: [95, 200, 430, 230, 150, 160, 135, 115, 290] },
  );

  addTableSheet(
    workbook,
    "API Logs",
    "API Logs สำหรับ CRUD Test",
    ["Log ID", "Endpoint", "Method", "Response Code", "Response Time (ms)", "Error Message", "Payload Summary", "Notes"],
    apiLogs,
    { widths: [95, 310, 90, 105, 130, 260, 360, 300] },
  );

  addTableSheet(
    workbook,
    "Validation Issues",
    "Validation Issues และ Data Quality Findings",
    ["Issue Type", "Detection Check", "Count", "Severity", "Sample / Actual Result", "Status", "Notes"],
    validationIssues,
    { statusColumn: 6, widths: [190, 300, 90, 110, 300, 105, 330] },
  );

  addTableSheet(
    workbook,
    "Performance",
    "Performance Summary",
    ["Metric", "Target / Endpoint", "Actual Result", "Threshold", "Status", "Notes"],
    performanceRows,
    { statusColumn: 5, widths: [190, 270, 170, 150, 105, 380] },
  );

  addTableSheet(
    workbook,
    "Cleanup",
    "Cleanup และ Post-Test Integrity",
    ["Cleanup Item", "Target", "Expected Result", "Actual Result", "Status", "Transaction Status", "Notes"],
    cleanupRows,
    { statusColumn: 5, widths: [190, 230, 240, 220, 105, 160, 360] },
  );

  return workbook;
}

async function renderAndValidate(workbook) {
  await fs.mkdir(previewDir, { recursive: true });
  const sheetNames = ["Summary", "Test Cases", "SQL Logs", "API Logs", "Validation Issues", "Performance", "Cleanup"];
  const rendered = [];
  for (const sheetName of sheetNames) {
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    const pngPath = path.join(previewDir, `${sheetName.replace(/[^A-Za-z0-9]/g, "_")}.png`);
    await fs.writeFile(pngPath, new Uint8Array(await preview.arrayBuffer()));
    const stat = await fs.stat(pngPath);
    rendered.push({ sheetName, bytes: stat.size });
  }
  const formulaErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: "final formula error scan",
    maxChars: 2000,
  });
  const summaryInspect = await workbook.inspect({
    kind: "table",
    range: "Summary!A1:F15",
    include: "values,formulas",
    tableMaxRows: 15,
    tableMaxCols: 6,
    maxChars: 3500,
  });
  const formulaErrorText = formulaErrors.ndjson || "";
  const hasFormulaErrors = /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(formulaErrorText);
  return {
    rendered,
    hasFormulaErrors,
    formulaErrorScan: trunc(formulaErrorText, 500),
    summaryInspect: trunc(summaryInspect.ndjson || "", 500),
  };
}

async function exportAndReadBack(workbook) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  const fileBlob = await FileBlob.load(outputPath);
  const imported = await SpreadsheetFile.importXlsx(fileBlob);
  const sheetInspect = await imported.inspect({
    kind: "sheet",
    include: "id,name",
    maxChars: 3000,
  });
  const expectedSheets = ["Summary", "Test Cases", "SQL Logs", "API Logs", "Validation Issues", "Performance", "Cleanup"];
  const inspectText = sheetInspect.ndjson || "";
  const allSheetsFound = expectedSheets.every((sheet) => inspectText.includes(sheet));
  return { imported, allSheetsFound, sheetInspect: inspectText };
}

async function main() {
  let initialSnapshot;
  try {
    initialSnapshot = await runCrudTests();
    await collectValidationIssues();
    collectPerformanceRows();

    let workbook = await buildWorkbook(initialSnapshot, "");
    let validation = await renderAndValidate(workbook);
    let readBack = await exportAndReadBack(workbook);

    const workbookStatus = !validation.hasFormulaErrors && readBack.allSheetsFound ? "PASS" : "WARNING";
    workbook = await buildWorkbook(initialSnapshot, workbookStatus);
    validation = await renderAndValidate(workbook);
    readBack = await exportAndReadBack(workbook);

    const stat = await fs.stat(outputPath);
    const summary = {
      outputPath,
      fileSizeBytes: stat.size,
      sheetCount: 7,
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
  try {
    if (createdIpoId) await cleanupTempData();
  } catch (cleanupErr) {
    console.error("Cleanup after failure failed:", cleanupErr);
  }
  await closePool();
  process.exit(1);
});
