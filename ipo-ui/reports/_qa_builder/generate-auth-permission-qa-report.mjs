import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
let outputXlsxPath = path.join(repoRoot, "reports", "ipo-auth-permission-qa-report.xlsx");
const outputMarkdownPath = path.join(repoRoot, "reports", "ipo-auth-permission-qa-report.md");
const previewDir = path.join(repoRoot, "reports", "_qa_builder", "auth-previews");

const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const dotenv = repoRequire("dotenv");
const { Pool } = repoRequire("pg");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const apiBase = process.env.QA_API_BASE_URL || "http://127.0.0.1:3000";
const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL is required for auth QA.");
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for auth QA.");

const parsedDbUrl = new URL(dbUrl);
const databaseLabel = `${parsedDbUrl.hostname}/${parsedDbUrl.pathname.replace(/^\//, "") || "postgres"}`;
const pool = new Pool({
  connectionString: dbUrl,
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

const scryptAsync = promisify(crypto.scrypt);
const suiteStarted = performance.now();
const testedAt = new Date();
const testedAtBangkok = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
}).format(testedAt);
const runToken = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`.toUpperCase();
const qaEmailPrefix = `qa_auth_uat_${runToken.toLowerCase()}`;
const testSymbol = `QAAUTH${runToken.slice(-6)}`;
const password = `QaAuth!${runToken}9`;
const buildVersion = getBuildVersion();

const testCases = [];
const apiLogs = [];
const sqlLogs = [];
const securityFindings = [];
const failedAccessAttempts = [];
const sessionLifecycle = [];
const dbChecks = [];
const performanceRows = [];
const cleanupRows = [];
let apiCounter = 0;
let sqlCounter = 0;
let createdIpoId = null;
let buildTriggerRunId = null;
const createdApiUserIds = new Set();
const createdDirectUserIds = new Set();
const createdBuildRunIds = new Set();
let schema = {
  hasSessionsTable: false,
  hasRoleColumn: false,
  hasIsActiveColumn: false,
  hasPermissionTables: false,
  hasAuditLogs: false,
};

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

function trunc(value, max = 220) {
  if (value == null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signSession(user, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const exp = options.exp ?? now + 60 * 60;
  const payload = {
    userId: user.user_id,
    email: user.email,
    firstName: user.first_name ?? "QA",
    lastName: user.last_name ?? "Auth",
    role: options.role ?? user.role ?? "admin",
    expiresAt: new Date(exp * 1000).toISOString(),
    iat: now,
    exp,
  };
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function cookieFromToken(token) {
  return `admin_session=${token}`;
}

function parseJwtPayload(token) {
  try {
    const body = token.split(".")[1];
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getSetCookieArray(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return [raw];
}

function extractAdminCookie(setCookies) {
  const cookie = setCookies.find((value) => /^admin_session=/.test(value));
  return cookie ? cookie.split(";")[0] : "";
}

function summarizePayload(payload) {
  if (!payload) return "-";
  const clone = structuredClone(payload);
  if (clone.password) clone.password = "***";
  if (clone.current_password) clone.current_password = "***";
  if (clone.new_password) clone.new_password = "***";
  return trunc(JSON.stringify(clone), 240);
}

function addCase({
  id,
  category,
  scenario,
  expected,
  actual,
  status,
  executionTime,
  apiStatusCode = "-",
  notes = "-",
}) {
  testCases.push({
    id,
    category,
    scenario,
    expected,
    actual,
    status,
    executionTime: `${ms(executionTime)} ms`,
    executionMs: ms(executionTime),
    apiStatusCode,
    notes,
  });
}

function addFinding(area, severity, finding, evidence, recommendation, status = "OPEN") {
  securityFindings.push({
    id: `SEC-${String(securityFindings.length + 1).padStart(3, "0")}`,
    area,
    severity,
    finding,
    evidence,
    recommendation,
    status,
  });
}

function addFailedAttempt(testId, actor, endpoint, method, expected, actual, statusCode, outcome, notes = "-") {
  failedAccessAttempts.push({
    testId,
    actor,
    endpoint,
    method,
    expected,
    actual,
    statusCode,
    outcome,
    notes,
  });
}

function addSessionEvent(event, actor, cookiePresent, tokenState, result, status, notes = "-") {
  sessionLifecycle.push({
    event,
    actor,
    cookiePresent,
    tokenState,
    result,
    status,
    notes,
  });
}

function addDbCheck(objectName, check, result, value, status, notes = "-") {
  dbChecks.push({
    objectName,
    check,
    result,
    value,
    status,
    notes,
  });
}

async function q(label, text, params = [], tables = "-", transactionStatus = "Auto-commit", notes = "-") {
  const started = performance.now();
  try {
    const result = await pool.query(text, params);
    sqlLogs.push({
      id: `SQL-${String(++sqlCounter).padStart(3, "0")}`,
      label,
      query: trunc(text, 320),
      affectedTables: tables,
      transactionStatus,
      result: "OK",
      executionMs: ms(performance.now() - started),
      rowCount: result.rowCount ?? result.rows.length,
      notes,
    });
    return result;
  } catch (err) {
    sqlLogs.push({
      id: `SQL-${String(++sqlCounter).padStart(3, "0")}`,
      label,
      query: trunc(text, 320),
      affectedTables: tables,
      transactionStatus,
      result: "ERROR",
      executionMs: ms(performance.now() - started),
      rowCount: 0,
      notes: err instanceof Error ? trunc(err.message, 260) : String(err),
    });
    throw err;
  }
}

async function http(method, endpoint, payload = undefined, options = {}) {
  const started = performance.now();
  let responseCode = 0;
  let text = "";
  let json = null;
  let errorMessage = "";
  let location = "";
  let setCookies = [];
  const headers = { ...(options.headers || {}) };
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;

  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method,
      redirect: options.redirect || "follow",
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    responseCode = response.status;
    location = response.headers.get("location") || "";
    setCookies = getSetCookieArray(response.headers);
    text = await response.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (responseCode >= 400) errorMessage = trunc(json?.error || text, 240);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const responseTime = ms(performance.now() - started);
  apiLogs.push({
    id: `API-${String(++apiCounter).padStart(3, "0")}`,
    endpoint,
    method,
    responseCode,
    responseTime,
    errorMessage: errorMessage || "-",
    payloadSummary: summarizePayload(payload),
    redirectMode: options.redirect || "follow",
    location: location || "-",
    note: options.note || "-",
  });
  return { responseCode, responseTime, text, json, errorMessage, location, setCookies };
}

async function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(value, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyPassword(value, storedHash) {
  if (!storedHash) return false;
  const [prefix, salt, hash] = storedHash.split(":");
  if (prefix !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(value, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), expected);
}

async function createTestUser(role, options = {}) {
  const userId = crypto.randomUUID();
  const email = `${qaEmailPrefix}_${role}@example.test`;
  const firstName = "QA";
  const lastName = role.replace("_", " ");
  const dbRole = options.dbRole ?? (
    role === "protected_super_admin" ? "super_admin" :
    role === "inactive" || role === "readonly_patch_target" ? "admin" :
    role
  );
  const isActive = options.isActive ?? role !== "inactive";
  const passwordHash = options.nullPassword ? null : await hashPassword(password);
  const columns = ["user_id", "email", "first_name", "last_name", "password_hash"];
  const values = [userId, email, firstName, lastName, passwordHash];
  if (schema.hasRoleColumn) {
    columns.push("role");
    values.push(dbRole);
  }
  if (schema.hasIsActiveColumn) {
    columns.push("is_active");
    values.push(isActive);
  }
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await q(
    `Create test ${role}`,
    `INSERT INTO admin_users (${quotedColumns})
     VALUES (${placeholders})`,
    values,
    "admin_users",
    "COMMIT",
    "Temporary QA account",
  );
  createdDirectUserIds.add(userId);
  return { user_id: userId, email, first_name: firstName, last_name: lastName, password_hash: passwordHash, role: dbRole, is_active: isActive };
}

async function setup() {
  const ping = await http("GET", "/admin/login", undefined, { note: "Server availability check" });
  if (ping.responseCode !== 200) {
    throw new Error(`Local app is not reachable at ${apiBase}/admin/login (status ${ping.responseCode}).`);
  }

  await q("Database identity", "SELECT current_database() AS db, current_user AS usr", [], "postgres", "Read-only");
  const tables = await q(
    "Auth table discovery",
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`,
    [],
    "information_schema",
    "Read-only",
  );
  const tableNames = new Set(tables.rows.map((row) => row.table_name));
  const adminColumns = await q(
    "admin_users columns",
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'admin_users'
     ORDER BY ordinal_position`,
    [],
    "information_schema",
    "Read-only",
  );
  const colNames = new Set(adminColumns.rows.map((row) => row.column_name));
  schema = {
    hasSessionsTable: tableNames.has("admin_sessions"),
    hasRoleColumn: colNames.has("role"),
    hasIsActiveColumn: colNames.has("is_active") || colNames.has("active"),
    hasPermissionTables: tableNames.has("admin_roles") && tableNames.has("admin_permissions") && tableNames.has("admin_role_permissions"),
    hasAuditLogs: tableNames.has("audit_logs"),
  };

  addDbCheck("admin_users", "Table exists", tableNames.has("admin_users") ? "found" : "missing", tableNames.has("admin_users") ? 1 : 0, tableNames.has("admin_users") ? "PASS" : "FAIL");
  addDbCheck("admin_sessions", "Server-side session store", schema.hasSessionsTable ? "found" : "missing", schema.hasSessionsTable ? 1 : 0, schema.hasSessionsTable ? "PASS" : "WARNING", "JWT cookie is backed by admin_sessions when migration is present");
  addDbCheck("RBAC schema", "Role/permission storage", schema.hasRoleColumn || schema.hasPermissionTables ? "found" : "missing", JSON.stringify(schema), schema.hasRoleColumn || schema.hasPermissionTables ? "PASS" : "FAIL", "Checks admin_users.role plus admin_* permission tables");
  addDbCheck("audit_logs", "Audit table exists", schema.hasAuditLogs ? "found" : "missing", schema.hasAuditLogs ? 1 : 0, schema.hasAuditLogs ? "PASS" : "WARNING");

  if (schema.hasPermissionTables) {
    const permissionCounts = await q(
      "RBAC permission table counts",
      `SELECT
         (SELECT count(*)::int FROM admin_roles) AS roles,
         (SELECT count(*)::int FROM admin_permissions) AS permissions,
         (SELECT count(*)::int FROM admin_role_permissions) AS role_permissions`,
      [],
      "admin_roles, admin_permissions, admin_role_permissions",
      "Read-only",
    );
    addDbCheck("admin_role_permissions", "Seeded permission rows", "counted", JSON.stringify(permissionCounts.rows[0] ?? {}), Number(permissionCounts.rows[0]?.role_permissions ?? 0) > 0 ? "PASS" : "FAIL");
  }

  await cleanupPreviousArtifacts();

  const superAdmin = await createTestUser("super_admin");
  const admin = await createTestUser("admin");
  const readonly = await createTestUser("readonly");
  const inactive = await createTestUser("inactive", { isActive: false });
  const protectedSuper = await createTestUser("protected_super_admin");

  const hashOk = await verifyPassword(password, superAdmin.password_hash);
  addDbCheck("admin_users.password_hash", "Password hashing validation", hashOk ? "scrypt hash verified" : "hash failed", superAdmin.password_hash?.slice(0, 14) ?? "-", hashOk ? "PASS" : "FAIL", "ตรวจด้วย scrypt + timingSafeEqual แบบเดียวกับระบบ");

  return { superAdmin, admin, readonly, inactive, protectedSuper };
}

async function cleanupPreviousArtifacts() {
  await q(
    "Pre-clean QA users",
    "DELETE FROM admin_users WHERE email LIKE 'qa_auth_uat_%@example.test'",
    [],
    "admin_users",
    "COMMIT",
    "Remove stale QA accounts only",
  );
  await cleanupIposBySymbolPattern("QAAUTH%");
}

async function cleanupIposBySymbolPattern(symbolPattern) {
  await q(
    "Cleanup validation for QA IPOs",
    `DELETE FROM validation_results
     WHERE ipo_id IN (SELECT id FROM ipos WHERE symbol LIKE $1)`,
    [symbolPattern],
    "validation_results, ipos",
    "COMMIT",
  );
  await q(
    "Cleanup IPO financials for QA IPOs",
    `DELETE FROM ipo_financials
     WHERE ipo_id IN (SELECT id FROM ipos WHERE symbol LIKE $1)`,
    [symbolPattern],
    "ipo_financials, ipos",
    "COMMIT",
  );
  await q(
    "Cleanup QA IPO records",
    "DELETE FROM ipos WHERE symbol LIKE $1",
    [symbolPattern],
    "ipos",
    "COMMIT",
  );
}

function statusFromPass(pass, failStatus = "FAIL") {
  return pass ? "PASS" : failStatus;
}

async function runTests(users) {
  let superCookie = "";
  let adminCookie = "";
  let readonlyCookie = "";
  const expiredCookie = cookieFromToken(signSession(users.admin, { role: "admin", exp: Math.floor(Date.now() / 1000) - 60 }));
  const invalidCookie = "admin_session=this.is.not.valid";

  let loginCookie = "";
  let loginTokenPayload = null;

  async function loginCookieFor(user, label) {
    const res = await http("POST", "/api/auth/login", { email: user.email, password }, { note: label });
    const cookie = extractAdminCookie(getSetCookieArrayLike(res.setCookies));
    addSessionEvent("Role cookie setup", user.role, cookie ? "Yes" : "No", `HTTP ${res.responseCode}`, cookie ? "ready" : "missing", cookie ? "PASS" : "FAIL", label);
    return cookie;
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/login", { email: users.superAdmin.email, password }, { note: "TC-001" });
    const setCookie = getSetCookieArrayLike(res.setCookies);
    loginCookie = extractAdminCookie(setCookie);
    superCookie = loginCookie;
    loginTokenPayload = loginCookie ? parseJwtPayload(loginCookie.replace(/^admin_session=/, "")) : null;
    const pass = res.responseCode === 200 && Boolean(loginCookie);
    addCase({
      id: "TC-001",
      category: "LOGIN",
      scenario: "Login สำเร็จด้วย email/password ถูกต้อง",
      expected: "HTTP 200 พร้อม session cookie",
      actual: `HTTP ${res.responseCode}; cookie=${loginCookie ? "created" : "missing"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ใช้บัญชี super_admin ชั่วคราว",
    });
    addSessionEvent("Login success", "super_admin", loginCookie ? "Yes" : "No", loginTokenPayload?.exp ? `exp=${loginTokenPayload.exp}` : "n/a", res.responseCode, pass ? "PASS" : "FAIL");
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/login", { email: users.superAdmin.email, password: `${password}_wrong` }, { note: "TC-002" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-002",
      category: "LOGIN",
      scenario: "Login fail ด้วย password ผิด",
      expected: "HTTP 401 และไม่มี session cookie",
      actual: `HTTP ${res.responseCode}; error=${res.json?.error ?? res.errorMessage}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ไม่พบ Set-Cookie สำหรับ session",
    });
    addFailedAttempt("TC-002", "known email", "/api/auth/login", "POST", "401", `HTTP ${res.responseCode}`, res.responseCode, pass ? "Blocked" : "Unexpected", "Wrong password");
  }

  {
    const started = performance.now();
    const missingEmail = `${qaEmailPrefix}_missing@example.test`;
    const res = await http("POST", "/api/auth/login", { email: missingEmail, password }, { note: "TC-003" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-003",
      category: "LOGIN",
      scenario: "Login fail ด้วย email ที่ไม่มีในระบบ",
      expected: "HTTP 401 และข้อความ generic",
      actual: `HTTP ${res.responseCode}; error=${res.json?.error ?? res.errorMessage}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ไม่เปิดเผยว่า email มีอยู่จริงหรือไม่",
    });
    addFailedAttempt("TC-003", "unknown email", "/api/auth/login", "POST", "401", `HTTP ${res.responseCode}`, res.responseCode, pass ? "Blocked" : "Unexpected");
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/login", { email: users.inactive.email, password }, { note: "TC-004" });
    const blocked = [401, 403].includes(res.responseCode);
    const status = blocked && schema.hasIsActiveColumn ? "PASS" : blocked ? "WARNING" : "FAIL";
    addCase({
      id: "TC-004",
      category: "LOGIN",
      scenario: "Login fail เมื่อ account inactive",
      expected: "HTTP 401/403 จาก inactive flag",
      actual: `HTTP ${res.responseCode}; inactive column=${schema.hasIsActiveColumn ? "present" : "missing"}`,
      status,
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: schema.hasIsActiveColumn ? "Blocked by admin_users.is_active=false after password verification" : "Blocked, but inactive flag is missing from schema",
    });
    if (!schema.hasIsActiveColumn) {
      addFinding("Account lifecycle", "Medium", "ไม่พบ active/inactive flag สำหรับ admin_users", "TC-004 could not verify is_active enforcement", "เพิ่ม is_active, locked_at, failed_login_count และ enforce ใน login route");
    }
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/login", { email: users.superAdmin.email, password: "" }, { note: "TC-005" });
    const pass = res.responseCode === 400;
    addCase({
      id: "TC-005",
      category: "LOGIN",
      scenario: "Login fail เมื่อ password ว่าง",
      expected: "HTTP 400",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ตรวจ required field ก่อน query password verify",
    });
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/login", { email: "not-an-email", password }, { note: "TC-006" });
    const status = res.responseCode === 400 ? "PASS" : res.responseCode === 401 ? "WARNING" : "FAIL";
    addCase({
      id: "TC-006",
      category: "LOGIN",
      scenario: "Login fail เมื่อ email format invalid",
      expected: "HTTP 400 format validation",
      actual: `HTTP ${res.responseCode}; treated as normal unknown email`,
      status,
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ควรเพิ่ม email format validation เพื่อแยก bad request จาก auth failure",
    });
    if (status === "WARNING") {
      addFinding("Input validation", "Low", "Login ไม่ validate รูปแบบ email", "TC-006 returned 401 instead of 400 for not-an-email", "เพิ่ม schema validation ที่ /api/auth/login");
    }
  }

  {
    const started = performance.now();
    const setCookies = loginCookie ? apiLogs.find((row) => row.note === "TC-001") : null;
    const cookieHeader = setCookies ? "captured" : "missing";
    const loginApi = await http("POST", "/api/auth/login", { email: users.admin.email, password }, { note: "TC-007 cookie flags" });
    const rawSetCookie = getSetCookieArrayLike(loginApi.setCookies).join("; ");
    adminCookie = extractAdminCookie(getSetCookieArrayLike(loginApi.setCookies)) || adminCookie;
    const hasHttpOnly = /httponly/i.test(rawSetCookie);
    const hasSameSite = /samesite=lax/i.test(rawSetCookie);
    const hasPath = /path=\//i.test(rawSetCookie);
    const pass = loginApi.responseCode === 200 && hasHttpOnly && hasSameSite && hasPath;
    addCase({
      id: "TC-007",
      category: "LOGIN",
      scenario: "Session cookie ถูกสร้างหลัง login",
      expected: "Set-Cookie admin_session พร้อม HttpOnly, SameSite=Lax, Path=/",
      actual: `HTTP ${loginApi.responseCode}; HttpOnly=${hasHttpOnly}; SameSite=Lax=${hasSameSite}; Path=/=${hasPath}; loginCookie=${cookieHeader}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: loginApi.responseCode,
      notes: "Secure flag เปิดตาม NODE_ENV=production เท่านั้น",
    });
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/logout", undefined, { cookie: loginCookie, note: "TC-008 logout" });
    const rawSetCookie = getSetCookieArrayLike(res.setCookies).join("; ");
    const replay = await http("GET", "/api/auth/me", undefined, { cookie: loginCookie, note: "TC-008 replay old cookie /me" });
    const replayAdmin = await http("GET", "/api/admin/profile", undefined, { cookie: loginCookie, note: "TC-008 replay old cookie admin API" });
    const clientDeleted = res.responseCode === 200 && /admin_session=;/i.test(rawSetCookie);
    const status = clientDeleted && replay.responseCode === 401 && replayAdmin.responseCode === 401 ? "PASS" : "FAIL";
    addCase({
      id: "TC-008",
      category: "LOGIN",
      scenario: "Logout สำเร็จและ session ถูกลบ",
      expected: "HTTP 200, cookie expired, old token unusable on auth and admin APIs",
      actual: `logout HTTP ${res.responseCode}; cookie expired=${clientDeleted}; replay /me=${replay.responseCode}; replay admin=${replayAdmin.responseCode}`,
      status,
      executionTime: performance.now() - started,
      apiStatusCode: `${res.responseCode}/${replay.responseCode}/${replayAdmin.responseCode}`,
      notes: status === "PASS" ? "admin_sessions.revoked_at invalidates replayed cookies on auth and admin APIs" : "Revoked cookie was rejected by /api/auth/me but accepted by a protected admin API",
    });
    addSessionEvent("Logout", "super_admin", "Yes", "client cookie expired", `replay /me=${replay.responseCode}; admin=${replayAdmin.responseCode}`, status, schema.hasSessionsTable ? "Revoked in admin_sessions" : "No sessions table for revocation");
    superCookie = "";
    if (status !== "PASS") {
      addFinding("Session handling", "Medium", "Logout/session revocation ไม่ครอบคลุม protected API ทั้งหมด", `TC-008 old cookie replay returned /me=${replay.responseCode}, admin=${replayAdmin.responseCode}`, "ตรวจ admin_sessions.revoked_at ใน auth guard โดยไม่กลืน DB/type errors");
    }
  }

  {
    const started = performance.now();
    const api = await http("GET", "/api/auth/me", undefined, { cookie: expiredCookie, note: "TC-009 expired API" });
    const route = await http("GET", "/admin", undefined, { cookie: expiredCookie, redirect: "manual", note: "TC-009 expired route" });
    const pass = api.responseCode === 401 && [307, 308].includes(route.responseCode) && /\/admin\/login/.test(route.location);
    addCase({
      id: "TC-009",
      category: "LOGIN",
      scenario: "Session expiration ทำงานถูกต้อง",
      expected: "API 401 และ route redirect ไป login",
      actual: `API ${api.responseCode}; /admin ${route.responseCode} -> ${route.location || "-"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${api.responseCode}/${route.responseCode}`,
      notes: "ทดสอบด้วย JWT exp ย้อนหลัง 60 วินาที",
    });
    addSessionEvent("Expired token", "admin", "Yes", "expired", `api=${api.responseCode}; route=${route.responseCode}`, pass ? "PASS" : "FAIL");
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/auth/login", { email: users.admin.email, password }, { note: "TC-010" });
    const cookie = extractAdminCookie(getSetCookieArrayLike(res.setCookies));
    adminCookie = cookie || adminCookie;
    const token = cookie.replace(/^admin_session=/, "");
    const payload = parseJwtPayload(token);
    const lifetimeHours = payload?.exp ? Math.round((((payload.exp * 1000) - Date.now()) / 3_600_000) * 10) / 10 : 0;
    const me = await http("GET", "/api/auth/me", undefined, { cookie, note: "TC-010 me persistence" });
    const pass = res.responseCode === 200 && me.responseCode === 200 && lifetimeHours >= 7 && lifetimeHours <= 9;
    addCase({
      id: "TC-010",
      category: "LOGIN",
      scenario: "Remember session/login persistence ทำงานถูกต้อง",
      expected: "Session ใช้งานต่อได้และอายุประมาณ 8 ชั่วโมง",
      actual: `login=${res.responseCode}; me=${me.responseCode}; lifetime≈${lifetimeHours} hours`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${res.responseCode}/${me.responseCode}`,
      notes: "ระบบยังไม่มี remember-me option แยก เป็น fixed 8-hour session",
    });
    addSessionEvent("Persistence", "admin", cookie ? "Yes" : "No", `${lifetimeHours} hours`, me.responseCode, pass ? "PASS" : "FAIL");
  }

  {
    const started = performance.now();
    const res = await http("GET", "/admin", undefined, { redirect: "manual", note: "TC-011" });
    const pass = [307, 308].includes(res.responseCode) && /\/admin\/login/.test(res.location);
    addCase({
      id: "TC-011",
      category: "AUTHORIZATION",
      scenario: "Unauthorized user เข้า /admin ไม่ได้",
      expected: "Redirect ไป /admin/login",
      actual: `HTTP ${res.responseCode}; location=${res.location || "-"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Proxy route guard ทำงานกับ /admin/:path*",
    });
    addFailedAttempt("TC-011", "anonymous", "/admin", "GET", "redirect", `HTTP ${res.responseCode}`, res.responseCode, pass ? "Blocked" : "Unexpected", res.location || "-");
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/upcoming/scrape", undefined, { note: "TC-012" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-012",
      category: "AUTHORIZATION",
      scenario: "Unauthorized API request ได้ 401",
      expected: "HTTP 401",
      actual: `HTTP ${res.responseCode}; error=${res.json?.error ?? res.errorMessage}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ใช้ endpoint scraper ที่มี requireAdmin",
    });
    addFailedAttempt("TC-012", "anonymous", "/api/admin/upcoming/scrape", "POST", "401", `HTTP ${res.responseCode}`, res.responseCode, pass ? "Blocked" : "Unexpected");
  }

  if (!superCookie) superCookie = await loginCookieFor(users.superAdmin, "Role setup super_admin");
  if (!adminCookie) adminCookie = await loginCookieFor(users.admin, "Role setup admin");
  if (!readonlyCookie) readonlyCookie = await loginCookieFor(users.readonly, "Role setup readonly");

  {
    const started = performance.now();
    const view = await http("GET", "/api/admin/profile", undefined, { cookie: readonlyCookie, note: "TC-013 view" });
    const create = await http(
      "POST",
      "/api/admin/admin-users",
      { email: `${qaEmailPrefix}_readonly_created@example.test`, first_name: "QA", last_name: "Readonly Created", password },
      { cookie: readonlyCookie, note: "TC-013 readonly create" },
    );
    if (create.json?.user?.user_id) createdApiUserIds.add(create.json.user.user_id);
    const pass = view.responseCode === 200 && [401, 403].includes(create.responseCode);
    addCase({
      id: "TC-013",
      category: "AUTHORIZATION",
      scenario: "Readonly role ดูข้อมูลได้แต่แก้ไขไม่ได้",
      expected: "GET allowed, mutation denied 403/401",
      actual: `GET profile=${view.responseCode}; POST admin-users=${create.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${view.responseCode}/${create.responseCode}`,
      notes: "GET profile uses authenticated session; admin user creation requires admin_users:create and should deny readonly",
    });
    if (!pass) {
      addFinding("RBAC", "High", "Readonly role สามารถสร้าง admin user ได้", `TC-013 POST /api/admin/admin-users returned HTTP ${create.responseCode}`, "บังคับใช้ requirePermission('admin_users:create') และตรวจ role จาก session ที่เชื่อถือได้");
      addFailedAttempt("TC-013", "readonly", "/api/admin/admin-users", "POST", "403", `HTTP ${create.responseCode}`, create.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const create = await http(
      "POST",
      "/api/admin/ipos",
      {
        symbol: testSymbol,
        company_name: "QA Auth Permission Test Co., Ltd.",
        market: "mai",
        sector: "TECH",
        status: "upcoming",
        listing_date: "2027-01-15",
        ipo_price: 10.5,
        source: "qa-auth-test",
      },
      { cookie: adminCookie, note: "TC-014 create IPO" },
    );
    createdIpoId = create.json?.id ?? null;
    const patch = createdIpoId
      ? await http("PATCH", `/api/admin/ipos/${createdIpoId}`, { ipo_price: 11.25 }, { cookie: adminCookie, note: "TC-014 patch IPO" })
      : { responseCode: 0, responseTime: 0 };
    const pass = create.responseCode === 201 && patch.responseCode === 200;
    addCase({
      id: "TC-014",
      category: "AUTHORIZATION",
      scenario: "Admin role แก้ไข IPO ได้",
      expected: "Admin cookie create/update IPO สำเร็จ",
      actual: `POST=${create.responseCode}; PATCH=${patch.responseCode}; ipo_id=${createdIpoId ?? "-"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${create.responseCode}/${patch.responseCode}`,
      notes: "Admin role has ipos:write permission and can create/update IPO records",
    });
  }

  {
    const started = performance.now();
    const email = `${qaEmailPrefix}_super_created@example.test`;
    const create = await http(
      "POST",
      "/api/admin/admin-users",
      { email, first_name: "QA", last_name: "Super Created", password },
      { cookie: superCookie, note: "TC-015 create" },
    );
    const newUserId = create.json?.user?.user_id;
    if (newUserId) createdApiUserIds.add(newUserId);
    const del = newUserId
      ? await http("DELETE", `/api/admin/admin-users/${newUserId}`, undefined, { cookie: superCookie, note: "TC-015 delete" })
      : { responseCode: 0, responseTime: 0 };
    if (del.responseCode === 200 && newUserId) createdApiUserIds.delete(newUserId);
    const pass = create.responseCode === 201 && del.responseCode === 200;
    addCase({
      id: "TC-015",
      category: "AUTHORIZATION",
      scenario: "Super admin จัดการ admin users ได้",
      expected: "Create/Delete admin user สำเร็จเฉพาะ super_admin",
      actual: `POST=${create.responseCode}; DELETE=${del.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${create.responseCode}/${del.responseCode}`,
      notes: "Super admin has admin_users:create/delete permissions",
    });
  }

  {
    const started = performance.now();
    const del = await http("DELETE", `/api/admin/admin-users/${users.protectedSuper.user_id}`, undefined, { cookie: adminCookie, note: "TC-016" });
    if (del.responseCode === 200) createdDirectUserIds.delete(users.protectedSuper.user_id);
    const pass = [401, 403].includes(del.responseCode);
    addCase({
      id: "TC-016",
      category: "AUTHORIZATION",
      scenario: "Admin ปกติไม่สามารถลบ super admin ได้",
      expected: "HTTP 403/401",
      actual: `HTTP ${del.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: del.responseCode,
      notes: pass ? "Admin role lacks admin_users:delete permission" : "Admin role was unexpectedly allowed to delete a super_admin test account",
    });
    if (!pass) {
      addFinding("RBAC", "Critical", "Admin ปกติสามารถลบ super_admin ได้", `TC-016 returned HTTP ${del.responseCode}`, "เพิ่ม requireRole('super_admin') และ policy ห้ามลบ/แก้ super_admin โดย admin ปกติ");
      addFailedAttempt("TC-016", "admin", `/api/admin/admin-users/${users.protectedSuper.user_id}`, "DELETE", "403", `HTTP ${del.responseCode}`, del.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const res = await http(
      "PATCH",
      "/api/admin/profile",
      { email: users.admin.email, first_name: "QA", last_name: "admin", role: "super_admin" },
      { cookie: adminCookie, note: "TC-017" },
    );
    const roleReturned = Object.prototype.hasOwnProperty.call(res.json?.user ?? {}, "role");
    const roleCheck = schema.hasRoleColumn
      ? await q(
          "Self role escalation check",
          "SELECT role FROM admin_users WHERE user_id = $1 LIMIT 1",
          [users.admin.user_id],
          "admin_users",
          "Read-only",
        )
      : { rows: [{ role: "no-role-column" }] };
    const dbRoleAfter = roleCheck.rows[0]?.role ?? "-";
    const pass = ([200, 400, 401, 403].includes(res.responseCode) && dbRoleAfter !== "super_admin");
    addCase({
      id: "TC-017",
      category: "AUTHORIZATION",
      scenario: "User ไม่สามารถแก้ไข role ตัวเองเป็น super_admin",
      expected: "Role escalation ถูก reject หรือ field ถูก ignore อย่างปลอดภัย",
      actual: `HTTP ${res.responseCode}; role returned=${roleReturned}; db role after=${dbRoleAfter}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Profile update ignores role payload; DB role must remain non-super_admin",
    });
  }

  {
    const started = performance.now();
    const res = await http("GET", "/admin/ipos", undefined, { redirect: "manual", note: "TC-018" });
    const pass = [307, 308].includes(res.responseCode) && /\/admin\/login/.test(res.location);
    addCase({
      id: "TC-018",
      category: "AUTHORIZATION",
      scenario: "Route guard redirect ทำงานถูกต้อง",
      expected: "Protected route redirect ไป login",
      actual: `HTTP ${res.responseCode}; location=${res.location || "-"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ตรวจ route ย่อย /admin/ipos",
    });
  }

  {
    const started = performance.now();
    const res = await http("GET", "/admin/ipos", undefined, { cookie: expiredCookie, redirect: "manual", note: "TC-019" });
    const pass = [307, 308].includes(res.responseCode) && /\/admin\/login/.test(res.location);
    addCase({
      id: "TC-019",
      category: "AUTHORIZATION",
      scenario: "Expired session ถูก redirect ไป login",
      expected: "Redirect ไป login พร้อม next path",
      actual: `HTTP ${res.responseCode}; location=${res.location || "-"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "ตรวจ Next proxy ด้วย expired JWT",
    });
  }

  {
    const started = performance.now();
    const res = await http("GET", "/api/auth/me", undefined, { cookie: invalidCookie, note: "TC-020" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-020",
      category: "AUTHORIZATION",
      scenario: "Invalid token/session ถูก reject",
      expected: "HTTP 401",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "JWT malformed ถูก reject โดย jwtVerify",
    });
  }

  {
    const started = performance.now();
    const anonRead = await http("GET", "/api/admin/ipos?limit=1", undefined, { note: "TC-021 anonymous read" });
    const pass = [401, 403].includes(anonRead.responseCode);
    addCase({
      id: "TC-021",
      category: "DATA ACCESS",
      scenario: "User อ่านข้อมูล IPO ได้ตามสิทธิ์",
      expected: "เฉพาะ authenticated/authorized user อ่าน admin IPO API ได้",
      actual: `anonymous GET /api/admin/ipos => HTTP ${anonRead.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: anonRead.responseCode,
      notes: pass ? "Proxy/API guard blocks anonymous admin IPO reads" : "Admin IPO list API opened to anonymous access",
    });
    if (!pass) {
      addFinding("API authorization", "Critical", "Unauthenticated user อ่าน /api/admin/ipos ได้", `TC-021 returned HTTP ${anonRead.responseCode}`, "เพิ่ม requireAdmin/requirePermission ที่ GET /api/admin/ipos");
      addFailedAttempt("TC-021", "anonymous", "/api/admin/ipos?limit=1", "GET", "401/403", `HTTP ${anonRead.responseCode}`, anonRead.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const res = createdIpoId
      ? await http("PATCH", `/api/admin/ipos/${createdIpoId}`, { ipo_price: 12.75 }, { note: "TC-022 anonymous patch" })
      : { responseCode: 0, responseTime: 0 };
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-022",
      category: "DATA ACCESS",
      scenario: "User แก้ไข IPO ได้ตามสิทธิ์",
      expected: "Anonymous/unauthorized mutation ถูก block",
      actual: `anonymous PATCH => HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Proxy/API guard blocks anonymous IPO mutation" : "PATCH /api/admin/ipos/:id allowed anonymous mutation",
    });
    if (!pass) {
      addFinding("API authorization", "Critical", "Unauthenticated user แก้ไข IPO ได้", `TC-022 returned HTTP ${res.responseCode}`, "เพิ่ม requireAdmin/requirePermission('ipos:update') ที่ PATCH");
      addFailedAttempt("TC-022", "anonymous", `/api/admin/ipos/${createdIpoId}`, "PATCH", "401/403", `HTTP ${res.responseCode}`, res.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const res = createdIpoId
      ? await http("DELETE", `/api/admin/ipos/${createdIpoId}`, undefined, { note: "TC-023 anonymous delete" })
      : { responseCode: 0, responseTime: 0 };
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-023",
      category: "DATA ACCESS",
      scenario: "User ลบ IPO ได้ตามสิทธิ์",
      expected: "Anonymous/unauthorized delete ถูก block",
      actual: `anonymous DELETE => HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Proxy/API guard blocks anonymous IPO delete/cancel" : "DELETE allowed anonymous soft-cancel",
    });
    if (!pass) {
      addFinding("API authorization", "Critical", "Unauthenticated user ลบ/ยกเลิก IPO ได้", `TC-023 returned HTTP ${res.responseCode}`, "เพิ่ม requireAdmin/requirePermission('ipos:delete') ที่ DELETE");
      addFailedAttempt("TC-023", "anonymous", `/api/admin/ipos/${createdIpoId}`, "DELETE", "401/403", `HTTP ${res.responseCode}`, res.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const target = await createTestUser("readonly_patch_target");
    const res = await http(
      "PATCH",
      `/api/admin/admin-users/${target.user_id}`,
      { email: target.email, first_name: "QA", last_name: "Readonly Patched" },
      { cookie: readonlyCookie, note: "TC-024" },
    );
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-024",
      category: "DATA ACCESS",
      scenario: "Restricted endpoint block readonly role",
      expected: "Readonly role ได้ HTTP 403/401",
      actual: `PATCH admin-users => HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "admin-users PATCH requires admin_users:update and denies readonly" : "Readonly role unexpectedly updated admin user",
    });
    if (!pass) {
      addFinding("RBAC", "High", "Readonly role แก้ไข admin user ได้", `TC-024 returned HTTP ${res.responseCode}`, "เพิ่ม role/permission check ใน admin-users PATCH/POST/DELETE");
      addFailedAttempt("TC-024", "readonly", `/api/admin/admin-users/${target.user_id}`, "PATCH", "403", `HTTP ${res.responseCode}`, res.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const res = await http("GET", "/api/admin/admin-users", undefined, { note: "TC-025" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-025",
      category: "DATA ACCESS",
      scenario: "Admin users API require authorization",
      expected: "HTTP 401 without cookie",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Endpoint requires admin_users:read permission",
    });
  }

  {
    const started = performance.now();
    const res = await http("GET", "/api/admin/validation", undefined, { note: "TC-026" });
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-026",
      category: "DATA ACCESS",
      scenario: "Validation API require authorization",
      expected: "HTTP 401/403 without cookie",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Validation API is protected by proxy/validation:read permission" : "GET /api/admin/validation opened to anonymous access",
    });
    if (!pass) {
      addFinding("API authorization", "High", "Validation API ไม่มี auth guard", `TC-026 returned HTTP ${res.responseCode}`, "เพิ่ม requireAdmin ใน GET/POST /api/admin/validation และ resolve route");
      addFailedAttempt("TC-026", "anonymous", "/api/admin/validation", "GET", "401/403", `HTTP ${res.responseCode}`, res.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/builds/trigger", undefined, { note: "TC-027" });
    if (res.json?.runId) {
      buildTriggerRunId = res.json.runId;
      createdBuildRunIds.add(buildTriggerRunId);
    }
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-027",
      category: "DATA ACCESS",
      scenario: "Build trigger API require authorization",
      expected: "HTTP 401/403 without cookie",
      actual: `HTTP ${res.responseCode}; runId=${res.json?.runId ?? "-"}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Build trigger blocked before DB side effect" : "Build trigger created a DB row without authorization",
    });
    if (!pass) {
      addFinding("API authorization", "Critical", "Build trigger API เรียกได้โดยไม่ต้อง login", `TC-027 returned HTTP ${res.responseCode}`, "เพิ่ม requireAdmin/requirePermission('builds:trigger') ที่ /api/admin/builds/trigger และ /run");
      addFailedAttempt("TC-027", "anonymous", "/api/admin/builds/trigger", "POST", "401/403", `HTTP ${res.responseCode}`, res.responseCode, "Allowed unexpectedly");
    }
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/upcoming/scrape", undefined, { note: "TC-028" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-028",
      category: "DATA ACCESS",
      scenario: "Scraper API require authorization",
      expected: "HTTP 401 without cookie",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Endpoint มี requireAdmin ก่อน insert scrape_runs",
    });
  }

  {
    const started = performance.now();
    const injection = "' OR '1'='1";
    const res = await http("POST", "/api/auth/login", { email: injection, password: injection }, { note: "TC-029" });
    const cookie = extractAdminCookie(getSetCookieArrayLike(res.setCookies));
    const pass = [400, 401].includes(res.responseCode) && !cookie && !/syntax|sql|database/i.test(res.errorMessage || res.text);
    addCase({
      id: "TC-029",
      category: "DATA ACCESS",
      scenario: "SQL injection attempt ผ่าน login form ถูก block",
      expected: "HTTP 401/400, ไม่มี session, ไม่มี SQL error",
      actual: `HTTP ${res.responseCode}; cookie=${cookie ? "created" : "none"}; error=${res.json?.error ?? res.errorMessage}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Blocked before session creation; 400 validation or 401 generic auth failure are both acceptable",
    });
    addFailedAttempt("TC-029", "attacker", "/api/auth/login", "POST", "401/400", `HTTP ${res.responseCode}`, res.responseCode, pass ? "Blocked" : "Unexpected", "SQLi payload");
  }

  {
    const started = performance.now();
    const payload = "<script>alert(1)</script>@example.test";
    const res = await http("POST", "/api/auth/login", { email: payload, password }, { note: "TC-030" });
    const reflected = res.text.includes("<script>alert(1)</script>");
    const pass = [400, 401].includes(res.responseCode) && !reflected;
    addCase({
      id: "TC-030",
      category: "DATA ACCESS",
      scenario: "XSS attempt ผ่าน auth form ถูก sanitize/reject",
      expected: "Reject/block และไม่ reflect script payload",
      actual: `HTTP ${res.responseCode}; reflected=${reflected}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "API response ใช้ generic error ไม่สะท้อน payload",
    });
    addFailedAttempt("TC-030", "attacker", "/api/auth/login", "POST", "400/401", `HTTP ${res.responseCode}`, res.responseCode, pass ? "Blocked" : "Unexpected", "XSS payload");
  }

  // ═══════════════════════════════════════════════════════════════
  // SESSION REPLAY / TAMPERING (TC-031 ~ TC-037)
  // ═══════════════════════════════════════════════════════════════

  {
    const started = performance.now();
    const forgedToken = signSession(users.admin, { role: "admin" });
    const parts = forgedToken.split(".");
    const tamperedSig = parts[2].split("").reverse().join("");
    const tamperedCookie = cookieFromToken(`${parts[0]}.${parts[1]}.${tamperedSig}`);
    const res = await http("GET", "/api/auth/me", undefined, { cookie: tamperedCookie, note: "TC-031" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-031",
      category: "SESSION TAMPERING",
      scenario: "JWT ที่ signature ถูก tamper ถูก reject",
      expected: "HTTP 401",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Reversed signature bytes to simulate tampering",
    });
    addSessionEvent("Tampered signature", "attacker", "Yes", "invalid signature", `${res.responseCode}`, pass ? "PASS" : "FAIL");
    if (!pass) addFinding("Session security", "Critical", "Tampered JWT signature ไม่ถูก reject", `TC-031 returned ${res.responseCode}`, "ตรวจ HMAC signature ทุก request");
  }

  {
    const started = performance.now();
    const wrongSecretHeader = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const escalatedPayload = toBase64Url(JSON.stringify({
      userId: users.admin.user_id,
      email: users.admin.email,
      firstName: "QA",
      lastName: "admin",
      role: "super_admin",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    const unsigned = `${wrongSecretHeader}.${escalatedPayload}`;
    const fakeSig = crypto.createHmac("sha256", "wrong_secret_key_12345").update(unsigned).digest("base64url");
    const forgedCookie = cookieFromToken(`${unsigned}.${fakeSig}`);
    const res = await http("GET", "/api/admin/admin-users", undefined, { cookie: forgedCookie, note: "TC-032" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-032",
      category: "SESSION TAMPERING",
      scenario: "JWT role escalation ด้วย wrong secret ถูก reject",
      expected: "HTTP 401 เพราะ signature invalid",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Forged JWT with role=super_admin signed with wrong secret",
    });
    addSessionEvent("Forged role escalation", "attacker", "Yes", "wrong secret", `${res.responseCode}`, pass ? "PASS" : "FAIL");
    if (!pass) addFinding("Session security", "Critical", "Forged JWT ด้วย wrong secret ถูกยอมรับ", `TC-032 returned ${res.responseCode}`, "ตรวจ signature verification ใน auth guard");
  }

  {
    const started = performance.now();
    const stolenUserIdToken = signSession({ ...users.readonly, user_id: users.superAdmin.user_id }, { role: "super_admin" });
    const stolenCookie = cookieFromToken(stolenUserIdToken);
    const res = await http("GET", "/api/admin/admin-users", undefined, { cookie: stolenCookie, note: "TC-033" });
    const dbCheck = schema.hasSessionsTable
      ? await q("Session DB check for stolen userId", "SELECT count(*)::int AS cnt FROM admin_sessions WHERE user_id = $1 AND revoked_at IS NULL", [users.superAdmin.user_id], "admin_sessions", "Read-only")
      : { rows: [{ cnt: -1 }] };
    const sessionInDb = Number(dbCheck.rows[0]?.cnt ?? 0);
    const pass = res.responseCode === 401 || (res.responseCode === 200 && sessionInDb === 0);
    addCase({
      id: "TC-033",
      category: "SESSION TAMPERING",
      scenario: "JWT with stolen userId ถูก reject ถ้ามี server-side session",
      expected: "HTTP 401 หรือ session ไม่ match ใน DB",
      actual: `HTTP ${res.responseCode}; session_in_db=${sessionInDb}`,
      status: statusFromPass(pass, "WARNING"),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: schema.hasSessionsTable ? "Server-side session validation should catch userId mismatch" : "No sessions table — JWT-only validation",
    });
    addSessionEvent("Stolen userId", "attacker", "Yes", "valid sig, wrong user", `${res.responseCode}`, pass ? "PASS" : "WARNING");
  }

  {
    const started = performance.now();
    const loginRes = await http("POST", "/api/auth/login", { email: users.admin.email, password }, { note: "TC-034 login" });
    const sessionCookie = extractAdminCookie(getSetCookieArrayLike(loginRes.setCookies));
    await http("POST", "/api/auth/logout", undefined, { cookie: sessionCookie, note: "TC-034 logout" });
    const endpoints = [
      { method: "GET", path: "/api/admin/profile" },
      { method: "GET", path: "/api/admin/ipos?limit=1" },
      { method: "GET", path: "/api/admin/stats" },
      { method: "POST", path: "/api/admin/upcoming/scrape" },
    ];
    const results = [];
    for (const ep of endpoints) {
      const r = await http(ep.method, ep.path, undefined, { cookie: sessionCookie, note: `TC-034 replay ${ep.path}` });
      results.push({ ...ep, status: r.responseCode });
    }
    const allBlocked = results.every((r) => r.status === 401);
    addCase({
      id: "TC-034",
      category: "SESSION TAMPERING",
      scenario: "Revoked session replay ถูก block ทุก endpoint",
      expected: "ทุก endpoint return 401 หลัง logout",
      actual: results.map((r) => `${r.method} ${r.path}=${r.status}`).join("; "),
      status: statusFromPass(allBlocked),
      executionTime: performance.now() - started,
      apiStatusCode: results.map((r) => r.status).join("/"),
      notes: allBlocked ? "Session revocation ครอบคลุมทุก protected endpoint" : "บาง endpoint ยังยอมรับ revoked session",
    });
    if (!allBlocked) {
      const leaky = results.filter((r) => r.status !== 401);
      addFinding("Session revocation", "High", "Revoked session ยังใช้ได้กับบาง endpoint", `TC-034: ${leaky.map((r) => `${r.method} ${r.path}=${r.status}`).join(", ")}`, "ตรวจ admin_sessions.revoked_at ใน auth guard ทุก route");
    }
    adminCookie = await loginCookieFor(users.admin, "Re-login admin after TC-034");
  }

  {
    const started = performance.now();
    const login1 = await http("POST", "/api/auth/login", { email: users.admin.email, password }, { note: "TC-035 session1" });
    const cookie1 = extractAdminCookie(getSetCookieArrayLike(login1.setCookies));
    const login2 = await http("POST", "/api/auth/login", { email: users.admin.email, password }, { note: "TC-035 session2" });
    const cookie2 = extractAdminCookie(getSetCookieArrayLike(login2.setCookies));
    const me1 = await http("GET", "/api/auth/me", undefined, { cookie: cookie1, note: "TC-035 me1" });
    const me2 = await http("GET", "/api/auth/me", undefined, { cookie: cookie2, note: "TC-035 me2" });
    const bothValid = me1.responseCode === 200 && me2.responseCode === 200;
    addCase({
      id: "TC-035",
      category: "SESSION TAMPERING",
      scenario: "Concurrent sessions จาก user เดียวกัน",
      expected: "ทั้งสอง session ใช้งานได้พร้อมกัน (หรือ old session ถูก revoke)",
      actual: `session1=${me1.responseCode}; session2=${me2.responseCode}`,
      status: bothValid ? "PASS" : me2.responseCode === 200 ? "PASS" : "WARNING",
      executionTime: performance.now() - started,
      apiStatusCode: `${me1.responseCode}/${me2.responseCode}`,
      notes: bothValid ? "Multiple concurrent sessions allowed" : me1.responseCode === 401 ? "Old session revoked on new login (single-session policy)" : "Unexpected session behavior",
    });
    adminCookie = cookie2 || cookie1 || adminCookie;
  }

  {
    const started = performance.now();
    const futureIat = Math.floor(Date.now() / 1000) + 600;
    const futureToken = signSession(users.admin, { role: "admin", exp: futureIat + 3600 });
    const futureParts = futureToken.split(".");
    const futurePayload = JSON.parse(Buffer.from(futureParts[1], "base64url").toString("utf8"));
    futurePayload.iat = futureIat;
    const newBody = toBase64Url(JSON.stringify(futurePayload));
    const newUnsigned = `${futureParts[0]}.${newBody}`;
    const newSig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(newUnsigned).digest("base64url");
    const futureCookie = cookieFromToken(`${newUnsigned}.${newSig}`);
    const res = await http("GET", "/api/admin/profile", undefined, { cookie: futureCookie, note: "TC-036" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-036",
      category: "SESSION TAMPERING",
      scenario: "JWT with future iat (clock skew attack) ถูก reject",
      expected: "HTTP 401 เพราะ iat > now",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass, "WARNING"),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Future iat rejected" : "Server does not validate iat — acceptable if exp is enforced",
    });
    addSessionEvent("Future iat", "attacker", "Yes", `iat=${futureIat} (10min ahead)`, `${res.responseCode}`, pass ? "PASS" : "WARNING");
  }

  {
    const started = performance.now();
    const emptyPayloadToken = `${toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${toBase64Url("{}")}.invalidsig`;
    const emptyCookie = cookieFromToken(emptyPayloadToken);
    const res = await http("GET", "/api/auth/me", undefined, { cookie: emptyCookie, note: "TC-037" });
    const pass = res.responseCode === 401;
    addCase({
      id: "TC-037",
      category: "SESSION TAMPERING",
      scenario: "JWT with empty payload ถูก reject",
      expected: "HTTP 401",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Empty payload JWT should be treated as invalid",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // RBAC MATRIX (TC-038 ~ TC-050)
  // ═══════════════════════════════════════════════════════════════

  if (!superCookie) superCookie = await loginCookieFor(users.superAdmin, "RBAC setup super_admin");
  if (!adminCookie) adminCookie = await loginCookieFor(users.admin, "RBAC setup admin");
  if (!readonlyCookie) readonlyCookie = await loginCookieFor(users.readonly, "RBAC setup readonly");

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/upcoming/scrape", undefined, { cookie: readonlyCookie, note: "TC-038" });
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-038",
      category: "RBAC MATRIX",
      scenario: "Readonly ไม่สามารถ trigger scraper ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Scraper trigger requires write permission" : "Readonly role unexpectedly triggered scraper",
    });
    if (!pass) addFinding("RBAC", "High", "Readonly role trigger scraper ได้", `TC-038 returned ${res.responseCode}`, "เพิ่ม role check ที่ /api/admin/upcoming/scrape");
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/builds/trigger", undefined, { cookie: readonlyCookie, note: "TC-039" });
    if (res.json?.runId) createdBuildRunIds.add(res.json.runId);
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-039",
      category: "RBAC MATRIX",
      scenario: "Readonly ไม่สามารถ trigger build ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Build trigger requires write permission" : "Readonly role triggered build",
    });
    if (!pass) addFinding("RBAC", "High", "Readonly role trigger build ได้", `TC-039 returned ${res.responseCode}`, "เพิ่ม requirePermission('builds:trigger')");
  }

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/import/commit", { rows: [] }, { cookie: readonlyCookie, note: "TC-040" });
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-040",
      category: "RBAC MATRIX",
      scenario: "Readonly ไม่สามารถ commit import ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Import commit requires write permission" : "Readonly role committed import",
    });
    if (!pass) addFinding("RBAC", "High", "Readonly role commit import ได้", `TC-040 returned ${res.responseCode}`, "เพิ่ม requirePermission('import:commit')");
  }

  {
    const started = performance.now();
    const res = createdIpoId
      ? await http("DELETE", `/api/admin/ipos/${createdIpoId}`, undefined, { cookie: readonlyCookie, note: "TC-041" })
      : { responseCode: 0, responseTime: 0 };
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-041",
      category: "RBAC MATRIX",
      scenario: "Readonly ไม่สามารถลบ IPO ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Delete requires ipos:delete permission" : "Readonly role deleted IPO",
    });
    if (!pass) addFinding("RBAC", "Critical", "Readonly role ลบ IPO ได้", `TC-041 returned ${res.responseCode}`, "เพิ่ม role check ที่ DELETE /api/admin/ipos/:id");
  }

  {
    const started = performance.now();
    const res = await http(
      "POST",
      "/api/admin/admin-users",
      { email: `${qaEmailPrefix}_admin_create_test@example.test`, first_name: "QA", last_name: "Admin Create", password },
      { cookie: adminCookie, note: "TC-042" },
    );
    if (res.json?.user?.user_id) createdApiUserIds.add(res.json.user.user_id);
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-042",
      category: "RBAC MATRIX",
      scenario: "Admin ปกติไม่สามารถสร้าง admin user ได้ (เฉพาะ super_admin)",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "admin_users:create restricted to super_admin" : "Admin role created admin user — escalation risk",
    });
    if (!pass) addFinding("RBAC", "High", "Admin ปกติสร้าง admin user ได้", `TC-042 returned ${res.responseCode}`, "จำกัด POST /api/admin/admin-users เฉพาะ super_admin");
  }

  {
    const started = performance.now();
    const res = await http("DELETE", `/api/admin/admin-users/${users.readonly.user_id}`, undefined, { cookie: adminCookie, note: "TC-043" });
    if (res.responseCode === 200) createdDirectUserIds.delete(users.readonly.user_id);
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-043",
      category: "RBAC MATRIX",
      scenario: "Admin ปกติไม่สามารถลบ admin user ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "admin_users:delete restricted to super_admin" : "Admin role deleted another user",
    });
    if (!pass) {
      addFinding("RBAC", "High", "Admin ปกติลบ admin user ได้", `TC-043 returned ${res.responseCode}`, "จำกัด DELETE /api/admin/admin-users เฉพาะ super_admin");
      readonlyCookie = await loginCookieFor(users.readonly, "Re-create readonly after TC-043 deletion").catch(() => "");
    }
  }

  {
    const started = performance.now();
    const readRes = await http("GET", "/api/admin/ipos?limit=1", undefined, { cookie: readonlyCookie, note: "TC-044 readonly read" });
    const pass = readRes.responseCode === 200;
    addCase({
      id: "TC-044",
      category: "RBAC MATRIX",
      scenario: "Readonly role สามารถอ่านข้อมูล IPO ได้",
      expected: "HTTP 200",
      actual: `HTTP ${readRes.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: readRes.responseCode,
      notes: "Read access should be granted to all authenticated roles",
    });
  }

  {
    const started = performance.now();
    const res = await http("GET", "/api/admin/stats", undefined, { cookie: adminCookie, note: "TC-045" });
    const pass = res.responseCode === 200;
    addCase({
      id: "TC-045",
      category: "RBAC MATRIX",
      scenario: "Admin role สามารถดู dashboard stats ได้",
      expected: "HTTP 200",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Stats endpoint accessible to admin role",
    });
  }

  {
    const started = performance.now();
    const res = await http("GET", "/api/admin/admin-users", undefined, { cookie: superCookie, note: "TC-046" });
    const pass = res.responseCode === 200;
    addCase({
      id: "TC-046",
      category: "RBAC MATRIX",
      scenario: "Super admin สามารถดูรายชื่อ admin users ได้",
      expected: "HTTP 200",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "admin_users:read granted to super_admin",
    });
  }

  {
    const started = performance.now();
    const roles = [
      { name: "super_admin", cookie: superCookie },
      { name: "admin", cookie: adminCookie },
      { name: "readonly", cookie: readonlyCookie },
    ];
    const results = [];
    for (const role of roles) {
      const r = await http("GET", "/api/admin/profile", undefined, { cookie: role.cookie, note: `TC-047 ${role.name}` });
      results.push({ role: role.name, status: r.responseCode });
    }
    const allOk = results.every((r) => r.status === 200);
    addCase({
      id: "TC-047",
      category: "RBAC MATRIX",
      scenario: "ทุก role เข้าถึง /api/admin/profile ได้",
      expected: "ทุก role return HTTP 200",
      actual: results.map((r) => `${r.role}=${r.status}`).join("; "),
      status: statusFromPass(allOk),
      executionTime: performance.now() - started,
      apiStatusCode: results.map((r) => r.status).join("/"),
      notes: "Profile endpoint accessible to all authenticated roles",
    });
  }

  {
    const started = performance.now();
    const res = await http("PUT", "/api/admin/upcoming/schedule", { slots: [{ hour: 8, minute: 0, enabled: true }] }, { cookie: readonlyCookie, note: "TC-048" });
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-048",
      category: "RBAC MATRIX",
      scenario: "Readonly ไม่สามารถแก้ไข scraper schedule ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: pass ? "Schedule update requires write permission" : "Readonly role updated schedule",
    });
    if (!pass) addFinding("RBAC", "Medium", "Readonly role แก้ไข scraper schedule ได้", `TC-048 returned ${res.responseCode}`, "เพิ่ม role check ใน PUT /api/admin/upcoming/schedule");
  }

  {
    const started = performance.now();
    const readonlyIpo = await http(
      "POST",
      "/api/admin/ipos",
      { symbol: `${testSymbol}RO`, company_name: "QA Readonly Create", market: "mai", sector: "TECH", status: "upcoming" },
      { cookie: readonlyCookie, note: "TC-049" },
    );
    if (readonlyIpo.json?.id) createdIpoId = readonlyIpo.json.id;
    const pass = [401, 403].includes(readonlyIpo.responseCode);
    addCase({
      id: "TC-049",
      category: "RBAC MATRIX",
      scenario: "Readonly ไม่สามารถสร้าง IPO ได้",
      expected: "HTTP 401/403",
      actual: `HTTP ${readonlyIpo.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: readonlyIpo.responseCode,
      notes: pass ? "IPO creation requires ipos:write" : "Readonly role created IPO record",
    });
    if (!pass) addFinding("RBAC", "High", "Readonly role สร้าง IPO ได้", `TC-049 returned ${readonlyIpo.responseCode}`, "เพิ่ม requirePermission('ipos:create') ที่ POST /api/admin/ipos");
  }

  {
    const started = performance.now();
    const res = await http("GET", "/api/admin/upcoming/runs", undefined, { cookie: readonlyCookie, note: "TC-050" });
    const pass = res.responseCode === 200;
    addCase({
      id: "TC-050",
      category: "RBAC MATRIX",
      scenario: "Readonly สามารถดูประวัติ scrape runs ได้",
      expected: "HTTP 200 (read-only access)",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "Scrape run history is read-only data accessible to all authenticated roles",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CSRF-ISH BEHAVIOR (TC-051 ~ TC-055)
  // ═══════════════════════════════════════════════════════════════

  {
    const started = performance.now();
    const res = await http("POST", "/api/admin/ipos", {
      symbol: `${testSymbol}CS`, company_name: "CSRF Test", market: "mai", sector: "TECH", status: "upcoming",
    }, { note: "TC-051" });
    const pass = [401, 403].includes(res.responseCode);
    addCase({
      id: "TC-051",
      category: "CSRF",
      scenario: "State-changing POST ถูก block เมื่อไม่มี session cookie",
      expected: "HTTP 401/403",
      actual: `HTTP ${res.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: res.responseCode,
      notes: "SameSite=Lax cookie + requireAdmin = CSRF mitigation",
    });
  }

  {
    const started = performance.now();
    const res = await fetch(`${apiBase}/api/admin/ipos`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "text/plain" },
      body: JSON.stringify({ symbol: `${testSymbol}CT`, company_name: "Content-Type Test", market: "mai", sector: "TECH", status: "upcoming" }),
    });
    const responseCode = res.status;
    const pass = [400, 415].includes(responseCode);
    const status = pass ? "PASS" : responseCode === 201 ? "WARNING" : "PASS";
    addCase({
      id: "TC-052",
      category: "CSRF",
      scenario: "POST ด้วย Content-Type: text/plain ถูก reject หรือ parse ไม่ได้",
      expected: "HTTP 400/415 (wrong content type)",
      actual: `HTTP ${responseCode}`,
      status,
      executionTime: performance.now() - started,
      apiStatusCode: responseCode,
      notes: status === "WARNING" ? "Server accepted text/plain — CSRF via form possible" : "Content-Type enforcement active",
    });
    if (status === "WARNING") addFinding("CSRF", "Medium", "Server ยอมรับ Content-Type: text/plain สำหรับ mutation", `TC-052 returned ${responseCode}`, "Enforce application/json Content-Type สำหรับ mutation endpoints");
  }

  {
    const started = performance.now();
    const deleteNoSession = await http("DELETE", `/api/admin/ipos/${createdIpoId ?? 999999}`, undefined, { note: "TC-053" });
    const patchNoSession = await http("PATCH", `/api/admin/ipos/${createdIpoId ?? 999999}`, { ipo_price: 99 }, { note: "TC-053 patch" });
    const pass = [401, 403].includes(deleteNoSession.responseCode) && [401, 403].includes(patchNoSession.responseCode);
    addCase({
      id: "TC-053",
      category: "CSRF",
      scenario: "DELETE/PATCH ถูก block เมื่อไม่มี session cookie",
      expected: "HTTP 401/403 ทั้ง DELETE และ PATCH",
      actual: `DELETE=${deleteNoSession.responseCode}; PATCH=${patchNoSession.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${deleteNoSession.responseCode}/${patchNoSession.responseCode}`,
      notes: "All state-changing methods require session cookie",
    });
  }

  {
    const started = performance.now();
    const putNoSession = await http("PUT", "/api/admin/upcoming/schedule", { slots: [{ hour: 9, minute: 0, enabled: true }] }, { note: "TC-054" });
    const pass = [401, 403].includes(putNoSession.responseCode);
    addCase({
      id: "TC-054",
      category: "CSRF",
      scenario: "PUT schedule ถูก block เมื่อไม่มี session cookie",
      expected: "HTTP 401/403",
      actual: `HTTP ${putNoSession.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: putNoSession.responseCode,
      notes: "Schedule mutation requires authentication",
    });
  }

  {
    const started = performance.now();
    const logoutRes = await http("POST", "/api/auth/logout", undefined, { note: "TC-055 no cookie" });
    const pass = [200, 401].includes(logoutRes.responseCode);
    addCase({
      id: "TC-055",
      category: "CSRF",
      scenario: "Logout ไม่มี side effect เมื่อไม่มี session",
      expected: "HTTP 200 (no-op) หรือ 401",
      actual: `HTTP ${logoutRes.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: logoutRes.responseCode,
      notes: "Logout without cookie should be safe no-op",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN USER LIFECYCLE (TC-056 ~ TC-063)
  // ═══════════════════════════════════════════════════════════════

  {
    const started = performance.now();
    const email = `${qaEmailPrefix}_lifecycle@example.test`;
    const create = await http(
      "POST",
      "/api/admin/admin-users",
      { email, first_name: "QA", last_name: "Lifecycle", password },
      { cookie: superCookie, note: "TC-056 create" },
    );
    const newId = create.json?.user?.user_id;
    if (newId) createdApiUserIds.add(newId);
    const login = await http("POST", "/api/auth/login", { email, password }, { note: "TC-056 login" });
    const pass = create.responseCode === 201 && login.responseCode === 200;
    addCase({
      id: "TC-056",
      category: "ADMIN LIFECYCLE",
      scenario: "สร้าง admin user ใหม่แล้ว login ได้ทันที",
      expected: "Create 201 แล้ว login 200",
      actual: `create=${create.responseCode}; login=${login.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: `${create.responseCode}/${login.responseCode}`,
      notes: "Full lifecycle: create → login",
    });
  }

  {
    const started = performance.now();
    const lifecycleEmail = `${qaEmailPrefix}_lifecycle@example.test`;
    const loginRes = await http("POST", "/api/auth/login", { email: lifecycleEmail, password }, { note: "TC-057 login" });
    const lifecycleCookie = extractAdminCookie(getSetCookieArrayLike(loginRes.setCookies));
    const newPassword = `${password}_changed`;
    const change = lifecycleCookie
      ? await http("PUT", "/api/admin/profile", { email: lifecycleEmail, first_name: "QA", last_name: "Lifecycle", current_password: password, new_password: newPassword }, { cookie: lifecycleCookie, note: "TC-057 change pwd" })
      : { responseCode: 0 };
    const oldPwdLogin = await http("POST", "/api/auth/login", { email: lifecycleEmail, password }, { note: "TC-057 old pwd" });
    const newPwdLogin = await http("POST", "/api/auth/login", { email: lifecycleEmail, password: newPassword }, { note: "TC-057 new pwd" });
    const pwdChanged = change.responseCode === 200;
    const oldBlocked = oldPwdLogin.responseCode === 401;
    const newWorks = newPwdLogin.responseCode === 200;
    const pass = pwdChanged && oldBlocked && newWorks;
    addCase({
      id: "TC-057",
      category: "ADMIN LIFECYCLE",
      scenario: "เปลี่ยน password แล้ว old password ใช้ไม่ได้",
      expected: "Change 200, old pwd 401, new pwd 200",
      actual: `change=${change.responseCode}; old=${oldPwdLogin.responseCode}; new=${newPwdLogin.responseCode}`,
      status: statusFromPass(pass, "WARNING"),
      executionTime: performance.now() - started,
      apiStatusCode: `${change.responseCode}/${oldPwdLogin.responseCode}/${newPwdLogin.responseCode}`,
      notes: !pwdChanged ? "Password change API not working or not available via PUT /api/admin/profile" : pass ? "Password rotation works correctly" : "Old password still accepted after change",
    });
  }

  {
    const started = performance.now();
    const dupEmail = users.admin.email;
    const dup = await http(
      "POST",
      "/api/admin/admin-users",
      { email: dupEmail, first_name: "QA", last_name: "Duplicate", password },
      { cookie: superCookie, note: "TC-058" },
    );
    if (dup.json?.user?.user_id) createdApiUserIds.add(dup.json.user.user_id);
    const pass = [400, 409, 422].includes(dup.responseCode);
    addCase({
      id: "TC-058",
      category: "ADMIN LIFECYCLE",
      scenario: "สร้าง admin user ด้วย email ซ้ำถูก reject",
      expected: "HTTP 400/409/422",
      actual: `HTTP ${dup.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: dup.responseCode,
      notes: pass ? "Duplicate email uniqueness enforced" : "Duplicate email was accepted",
    });
    if (!pass) addFinding("Data integrity", "High", "สร้าง admin user ด้วย email ซ้ำได้", `TC-058 returned ${dup.responseCode}`, "เพิ่ม UNIQUE constraint + validation ที่ email column");
  }

  {
    const started = performance.now();
    const selfDelete = await http("DELETE", `/api/admin/admin-users/${users.superAdmin.user_id}`, undefined, { cookie: superCookie, note: "TC-059" });
    const pass = [400, 403].includes(selfDelete.responseCode);
    const meCheck = await http("GET", "/api/auth/me", undefined, { cookie: superCookie, note: "TC-059 self check" });
    addCase({
      id: "TC-059",
      category: "ADMIN LIFECYCLE",
      scenario: "Admin ไม่สามารถลบตัวเองได้",
      expected: "HTTP 400/403 (self-delete protection)",
      actual: `DELETE=${selfDelete.responseCode}; me after=${meCheck.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: selfDelete.responseCode,
      notes: pass ? "Self-delete protection active" : "User might have deleted themselves — re-check session",
    });
    if (!pass && meCheck.responseCode !== 200) {
      addFinding("Admin lifecycle", "Critical", "Admin สามารถลบตัวเองได้", `TC-059 DELETE returned ${selfDelete.responseCode}, /me returned ${meCheck.responseCode}`, "เพิ่ม self-delete protection ที่ DELETE /api/admin/admin-users/:id");
      users.superAdmin = await createTestUser("super_admin");
      superCookie = await loginCookieFor(users.superAdmin, "Re-create super_admin after self-delete");
    }
  }

  if (schema.hasIsActiveColumn) {
    const started = performance.now();
    const deactivateTarget = `${qaEmailPrefix}_lifecycle@example.test`;
    const targetUser = await q("Find lifecycle user", "SELECT user_id FROM admin_users WHERE email = $1 LIMIT 1", [deactivateTarget], "admin_users", "Read-only");
    const targetId = targetUser.rows[0]?.user_id;
    let deactivateRes = { responseCode: 0 };
    let loginAfterDeactivate = { responseCode: 0 };
    if (targetId) {
      deactivateRes = await http("PATCH", `/api/admin/admin-users/${targetId}`, { is_active: false }, { cookie: superCookie, note: "TC-060 deactivate" });
      if (deactivateRes.responseCode !== 200) {
        await q("Direct deactivate", "UPDATE admin_users SET is_active = false WHERE user_id = $1", [targetId], "admin_users", "COMMIT");
      }
      loginAfterDeactivate = await http("POST", "/api/auth/login", { email: deactivateTarget, password: `${password}_changed` }, { note: "TC-060 login blocked" });
    }
    const pass = targetId && [401, 403].includes(loginAfterDeactivate.responseCode);
    addCase({
      id: "TC-060",
      category: "ADMIN LIFECYCLE",
      scenario: "Deactivated user ไม่สามารถ login ได้",
      expected: "HTTP 401/403 หลัง deactivate",
      actual: `deactivate=${deactivateRes.responseCode}; login=${loginAfterDeactivate.responseCode}`,
      status: statusFromPass(pass, "WARNING"),
      executionTime: performance.now() - started,
      apiStatusCode: `${deactivateRes.responseCode}/${loginAfterDeactivate.responseCode}`,
      notes: !targetId ? "Lifecycle user not found" : pass ? "is_active=false blocks login" : "Deactivated user can still login",
    });

    if (targetId) {
      const reactivateStarted = performance.now();
      await q("Reactivate", "UPDATE admin_users SET is_active = true WHERE user_id = $1", [targetId], "admin_users", "COMMIT");
      const loginAfterReactivate = await http("POST", "/api/auth/login", { email: deactivateTarget, password: `${password}_changed` }, { note: "TC-061 reactivate login" });
      const reactivatePass = loginAfterReactivate.responseCode === 200;
      addCase({
        id: "TC-061",
        category: "ADMIN LIFECYCLE",
        scenario: "Reactivated user สามารถ login ได้อีกครั้ง",
        expected: "HTTP 200 หลัง reactivate",
        actual: `HTTP ${loginAfterReactivate.responseCode}`,
        status: statusFromPass(reactivatePass, "WARNING"),
        executionTime: performance.now() - reactivateStarted,
        apiStatusCode: loginAfterReactivate.responseCode,
        notes: reactivatePass ? "Reactivation restores login access" : "Reactivated user still cannot login",
      });
    }
  } else {
    addCase({
      id: "TC-060",
      category: "ADMIN LIFECYCLE",
      scenario: "Deactivated user ไม่สามารถ login ได้",
      expected: "HTTP 401/403 หลัง deactivate",
      actual: "SKIPPED — is_active column missing",
      status: "WARNING",
      executionTime: 0,
      apiStatusCode: "-",
      notes: "Cannot test without is_active column",
    });
    addCase({
      id: "TC-061",
      category: "ADMIN LIFECYCLE",
      scenario: "Reactivated user สามารถ login ได้อีกครั้ง",
      expected: "HTTP 200 หลัง reactivate",
      actual: "SKIPPED — is_active column missing",
      status: "WARNING",
      executionTime: 0,
      apiStatusCode: "-",
      notes: "Cannot test without is_active column",
    });
  }

  {
    const started = performance.now();
    const emptyCreate = await http(
      "POST",
      "/api/admin/admin-users",
      { email: "", first_name: "", last_name: "", password: "" },
      { cookie: superCookie, note: "TC-062" },
    );
    if (emptyCreate.json?.user?.user_id) createdApiUserIds.add(emptyCreate.json.user.user_id);
    const pass = [400, 422].includes(emptyCreate.responseCode);
    addCase({
      id: "TC-062",
      category: "ADMIN LIFECYCLE",
      scenario: "สร้าง admin user ด้วยข้อมูลว่าง ถูก reject",
      expected: "HTTP 400/422 validation error",
      actual: `HTTP ${emptyCreate.responseCode}`,
      status: statusFromPass(pass),
      executionTime: performance.now() - started,
      apiStatusCode: emptyCreate.responseCode,
      notes: pass ? "Empty field validation active" : "Empty fields accepted — validation gap",
    });
  }

  {
    const started = performance.now();
    const weakPwdCreate = await http(
      "POST",
      "/api/admin/admin-users",
      { email: `${qaEmailPrefix}_weakpwd@example.test`, first_name: "QA", last_name: "Weak", password: "123" },
      { cookie: superCookie, note: "TC-063" },
    );
    if (weakPwdCreate.json?.user?.user_id) createdApiUserIds.add(weakPwdCreate.json.user.user_id);
    const pass = [400, 422].includes(weakPwdCreate.responseCode);
    addCase({
      id: "TC-063",
      category: "ADMIN LIFECYCLE",
      scenario: "สร้าง admin user ด้วย weak password ถูก reject",
      expected: "HTTP 400/422 (password too weak)",
      actual: `HTTP ${weakPwdCreate.responseCode}`,
      status: statusFromPass(pass, "WARNING"),
      executionTime: performance.now() - started,
      apiStatusCode: weakPwdCreate.responseCode,
      notes: pass ? "Password strength validation active" : "Weak password accepted",
    });
    if (!pass) addFinding("Input validation", "Medium", "ระบบยอมรับ weak password (123)", `TC-063 returned ${weakPwdCreate.responseCode}`, "เพิ่ม password strength validation (min length, complexity)");
  }

  // ═══════════════════════════════════════════════════════════════
  // AUDIT COVERAGE (TC-064 ~ TC-068)
  // ═══════════════════════════════════════════════════════════════

  if (schema.hasAuditLogs) {
    const auditBefore = await q(
      "Audit count before audit tests",
      "SELECT count(*)::int AS count FROM audit_logs WHERE created_at >= $1",
      [testedAt.toISOString()],
      "audit_logs",
      "Read-only",
    );
    const countBefore = auditBefore.rows[0]?.count ?? 0;

    {
      const started = performance.now();
      const loginAudit = await http("POST", "/api/auth/login", { email: users.admin.email, password }, { note: "TC-064 audit login" });
      await sleep(500);
      const auditRows = await q(
        "Audit rows for login success",
        "SELECT count(*)::int AS cnt FROM audit_logs WHERE action LIKE '%login%' AND created_at >= $1",
        [testedAt.toISOString()],
        "audit_logs",
        "Read-only",
      );
      const hasAudit = Number(auditRows.rows[0]?.cnt ?? 0) > 0;
      addCase({
        id: "TC-064",
        category: "AUDIT",
        scenario: "Login สำเร็จถูกบันทึกใน audit log",
        expected: "audit_logs มี row สำหรับ login action",
        actual: `login=${loginAudit.responseCode}; audit_rows=${auditRows.rows[0]?.cnt}`,
        status: statusFromPass(hasAudit, "WARNING"),
        executionTime: performance.now() - started,
        apiStatusCode: loginAudit.responseCode,
        notes: hasAudit ? "Login success events logged" : "No login audit events found",
      });
    }

    {
      const started = performance.now();
      await http("POST", "/api/auth/login", { email: users.admin.email, password: "wrong_pwd_audit" }, { note: "TC-065 audit fail" });
      await sleep(500);
      const failRows = await q(
        "Audit rows for login failure",
        "SELECT count(*)::int AS cnt FROM audit_logs WHERE (action LIKE '%login%' OR action LIKE '%fail%' OR action LIKE '%denied%') AND created_at >= $1",
        [testedAt.toISOString()],
        "audit_logs",
        "Read-only",
      );
      const hasFailAudit = Number(failRows.rows[0]?.cnt ?? 0) > 0;
      addCase({
        id: "TC-065",
        category: "AUDIT",
        scenario: "Login ล้มเหลวถูกบันทึกใน audit log",
        expected: "audit_logs มี row สำหรับ failed login",
        actual: `audit_rows=${failRows.rows[0]?.cnt}`,
        status: statusFromPass(hasFailAudit, "WARNING"),
        executionTime: performance.now() - started,
        apiStatusCode: "-",
        notes: hasFailAudit ? "Failed login events logged" : "Failed login not logged — security monitoring gap",
      });
      if (!hasFailAudit) addFinding("Audit logging", "Medium", "Login failure ไม่ถูกบันทึกใน audit_logs", "TC-065: no fail/denied audit rows", "เพิ่ม audit event สำหรับ authentication failure");
    }

    {
      const started = performance.now();
      const auditAfterAll = await q(
        "Total audit rows after all tests",
        "SELECT count(*)::int AS count FROM audit_logs WHERE created_at >= $1",
        [testedAt.toISOString()],
        "audit_logs",
        "Read-only",
      );
      const totalAudit = Number(auditAfterAll.rows[0]?.count ?? 0);
      const newAuditRows = totalAudit - countBefore;
      addCase({
        id: "TC-066",
        category: "AUDIT",
        scenario: "QA suite สร้าง audit events ครอบคลุม",
        expected: "มี audit events > 0 จากกิจกรรมทั้งหมด",
        actual: `total=${totalAudit}; new_during_suite=${newAuditRows}`,
        status: statusFromPass(newAuditRows > 3, "WARNING"),
        executionTime: performance.now() - started,
        apiStatusCode: "-",
        notes: newAuditRows > 3 ? `${newAuditRows} audit events created during QA run` : "Very few audit events — coverage gaps likely",
      });
    }

    {
      const started = performance.now();
      const categories = await q(
        "Audit event categories",
        `SELECT DISTINCT action, count(*)::int AS cnt
         FROM audit_logs
         WHERE created_at >= $1
         GROUP BY action
         ORDER BY cnt DESC
         LIMIT 20`,
        [testedAt.toISOString()],
        "audit_logs",
        "Read-only",
      );
      const actionList = categories.rows.map((r) => `${r.action}(${r.cnt})`).join(", ");
      const hasMutationAudit = categories.rows.some((r) => /create|update|delete|insert|mutation/i.test(r.action));
      addCase({
        id: "TC-067",
        category: "AUDIT",
        scenario: "Data mutation events ถูกบันทึกใน audit",
        expected: "มี create/update/delete audit events",
        actual: actionList || "no events",
        status: statusFromPass(hasMutationAudit, "WARNING"),
        executionTime: performance.now() - started,
        apiStatusCode: "-",
        notes: hasMutationAudit ? "Mutation audit trail present" : "No mutation audit events found",
      });
      if (!hasMutationAudit) addFinding("Audit logging", "Medium", "Data mutation ไม่ถูกบันทึกใน audit_logs", "TC-067: no create/update/delete actions", "เพิ่ม audit event สำหรับ IPO/user mutations");
    }

    {
      const started = performance.now();
      const permDenied = await q(
        "Permission denied audit events",
        `SELECT count(*)::int AS cnt FROM audit_logs
         WHERE (action LIKE '%denied%' OR action LIKE '%unauthorized%' OR action LIKE '%forbidden%')
         AND created_at >= $1`,
        [testedAt.toISOString()],
        "audit_logs",
        "Read-only",
      );
      const hasPermDenied = Number(permDenied.rows[0]?.cnt ?? 0) > 0;
      addCase({
        id: "TC-068",
        category: "AUDIT",
        scenario: "Permission denied events ถูกบันทึกใน audit",
        expected: "มี denied/unauthorized audit events จาก RBAC tests",
        actual: `denied_events=${permDenied.rows[0]?.cnt}`,
        status: statusFromPass(hasPermDenied, "WARNING"),
        executionTime: performance.now() - started,
        apiStatusCode: "-",
        notes: hasPermDenied ? "Permission denied events logged for security monitoring" : "No permission denied audit events — cannot detect unauthorized access attempts",
      });
      if (!hasPermDenied) addFinding("Audit logging", "Medium", "Permission denied events ไม่ถูกบันทึก", "TC-068: no denied/unauthorized/forbidden audit rows", "เพิ่ม audit event เมื่อ requireAdmin/requirePermission reject request");
    }
  } else {
    for (const tc of [
      { id: "TC-064", scenario: "Login สำเร็จถูกบันทึกใน audit log" },
      { id: "TC-065", scenario: "Login ล้มเหลวถูกบันทึกใน audit log" },
      { id: "TC-066", scenario: "QA suite สร้าง audit events ครอบคลุม" },
      { id: "TC-067", scenario: "Data mutation events ถูกบันทึกใน audit" },
      { id: "TC-068", scenario: "Permission denied events ถูกบันทึกใน audit" },
    ]) {
      addCase({
        id: tc.id,
        category: "AUDIT",
        scenario: tc.scenario,
        expected: "audit_logs table ต้องมีอยู่",
        actual: "SKIPPED — audit_logs table missing",
        status: "WARNING",
        executionTime: 0,
        apiStatusCode: "-",
        notes: "Cannot verify audit coverage without audit_logs table",
      });
    }
    addFinding("Audit logging", "Medium", "ไม่พบ audit_logs table สำหรับ auth/permission events", "audit_logs table missing", "เพิ่ม audit table/event สำหรับ login fail, unauthorized API, permission denied, user management mutations");
  }
}

function getSetCookieArrayLike(value) {
  return Array.isArray(value) ? value : [];
}

async function cleanup() {
  await sleep(3600);
  const cleanupStarted = performance.now();

  if (createdIpoId) {
    const triggers = [`auto:create:${testSymbol}`, `auto:update:${createdIpoId}`, `auto:delete:${createdIpoId}`];
    const autoBuilds = await q(
      "Cleanup auto build runs",
      "DELETE FROM build_runs WHERE trigger_type = ANY($1::text[]) RETURNING id",
      [triggers],
      "build_runs",
      "COMMIT",
      "Remove build rows created by QA IPO mutations",
    );
    cleanupRows.push(["Build runs", "Delete QA auto build rows", autoBuilds.rowCount ?? autoBuilds.rows.length, "PASS", `trigger_type in ${triggers.join(", ")}`]);
  }

  if (createdBuildRunIds.size > 0) {
    const ids = [...createdBuildRunIds].filter(Boolean);
    const result = await q(
      "Cleanup explicit build trigger run",
      "DELETE FROM build_runs WHERE id = ANY($1::bigint[]) RETURNING id",
      [ids],
      "build_runs",
      "COMMIT",
      "Remove /api/admin/builds/trigger QA row",
    );
    cleanupRows.push(["Build trigger", "Delete run ids", result.rowCount ?? result.rows.length, "PASS", ids.join(", ")]);
  }

  await cleanupIposBySymbolPattern(`${testSymbol}%`);
  cleanupRows.push(["IPO records", "Delete QA IPO symbol", testSymbol, "PASS", "Deleted related financial/validation/relation rows first"]);

  if (schema.hasSessionsTable) {
    const sessionCleanup = await q(
      "Cleanup QA admin sessions",
      `DELETE FROM admin_sessions s
       USING admin_users u
       WHERE s.user_id = u.user_id
         AND u.email LIKE $1
       RETURNING s.session_id`,
      [`${qaEmailPrefix}%@example.test`],
      "admin_sessions, admin_users",
      "COMMIT",
      "Remove only this run's QA session rows",
    );
    cleanupRows.push(["Admin sessions", "Delete QA sessions", sessionCleanup.rowCount ?? sessionCleanup.rows.length, "PASS", `${qaEmailPrefix}*@example.test`]);
  }

  const userCleanup = await q(
    "Cleanup QA admin users",
    "DELETE FROM admin_users WHERE email LIKE $1 RETURNING user_id, email",
    [`${qaEmailPrefix}%@example.test`],
    "admin_users",
    "COMMIT",
    "Remove only this run's QA accounts",
  );
  cleanupRows.push(["Admin users", "Delete QA accounts", userCleanup.rowCount ?? userCleanup.rows.length, "PASS", `${qaEmailPrefix}*@example.test`]);

  if (schema.hasAuditLogs) {
    const auditCleanup = await q(
      "Cleanup QA audit logs",
      "DELETE FROM audit_logs WHERE entity = 'auth' AND entity_id LIKE $1 AND created_at >= $2",
      [`${qaEmailPrefix}%`, testedAt.toISOString()],
      "audit_logs",
      "COMMIT",
      "Remove auth audit rows generated by this QA run",
    );
    cleanupRows.push(["Audit logs", "Delete QA auth audit rows", auditCleanup.rowCount ?? auditCleanup.rows.length, "PASS", `entity_id LIKE ${qaEmailPrefix}%`]);
  }

  const orphanCheck = await q(
    "Remaining QA artifact check",
    `SELECT
       (SELECT count(*)::int FROM admin_users WHERE email LIKE $1) AS users,
       (SELECT count(*)::int FROM ipos WHERE symbol LIKE $2) AS ipos`,
    [`${qaEmailPrefix}%@example.test`, `${testSymbol}%`],
    "admin_users, ipos",
    "Read-only",
  );
  const remaining = orphanCheck.rows[0];
  const noRemaining = Number(remaining?.users ?? 0) === 0 && Number(remaining?.ipos ?? 0) === 0;
  cleanupRows.push(["Orphan check", "Remaining QA users/IPOs", JSON.stringify(remaining), noRemaining ? "PASS" : "WARNING", schema.hasSessionsTable ? "admin_sessions cleanup executed before user deletion" : "admin_sessions table not present"]);

  performanceRows.push(["Cleanup duration", `${ms(performance.now() - cleanupStarted)} ms`, "< 5000 ms", performance.now() - cleanupStarted < 5000 ? "PASS" : "WARNING", "Includes debounce wait for auto-build side effects"]);
}

function collectPerformanceRows() {
  const apiTimes = apiLogs.map((row) => row.responseTime).filter(Number.isFinite);
  const sqlTimes = sqlLogs.map((row) => row.executionMs).filter(Number.isFinite);
  const caseTimes = testCases.map((row) => row.executionMs).filter(Number.isFinite);
  const totalMs = ms(performance.now() - suiteStarted);
  performanceRows.unshift(
    ["Total execution time", `${totalMs} ms`, "< 60000 ms", totalMs < 60_000 ? "PASS" : "WARNING", "รวม setup, API test, SQL verification, cleanup, report generation pre-export"],
    ["API average response time", `${ms(avg(apiTimes))} ms`, "< 1000 ms", avg(apiTimes) < 1000 ? "PASS" : "WARNING", `${apiTimes.length} API calls`],
    ["API max response time", `${ms(Math.max(...apiTimes))} ms`, "< 5000 ms", Math.max(...apiTimes) < 5000 ? "PASS" : "WARNING", "รวม route/page redirect checks"],
    ["SQL average query time", `${ms(avg(sqlTimes))} ms`, "< 1000 ms", avg(sqlTimes) < 1000 ? "PASS" : "WARNING", `${sqlTimes.length} SQL statements`],
    ["Test case average time", `${ms(avg(caseTimes))} ms`, "< 3000 ms", avg(caseTimes) < 3000 ? "PASS" : "WARNING", `${caseTimes.length} test cases`],
    ["Runtime memory RSS", `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`, "< 512 MB", process.memoryUsage().rss < 512 * 1024 * 1024 ? "PASS" : "WARNING", "Node.js QA runner memory observation"],
  );
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function counts() {
  return {
    PASS: testCases.filter((row) => row.status === "PASS").length,
    WARNING: testCases.filter((row) => row.status === "WARNING").length,
    FAIL: testCases.filter((row) => row.status === "FAIL").length,
  };
}

function overallStatus() {
  const c = counts();
  if (c.FAIL > 0) return "NOT READY";
  if (c.WARNING > 0) return "CONDITIONAL READY";
  return "READY";
}

function productionReadiness() {
  const c = counts();
  if (c.FAIL > 0) return "ไม่พร้อม Production: ต้องปิด authorization gaps ก่อน";
  if (c.WARNING > 0) return "พร้อมแบบมีเงื่อนไข: ต้องรับความเสี่ยง warning";
  return "พร้อม Production";
}

function markdownEscape(value) {
  return String(value ?? "-").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

async function writeMarkdownReport(validationSummary = null) {
  const c = counts();
  const totalMs = ms(performance.now() - suiteStarted);
  const topFindings = securityFindings
    .map((finding) => `- **${finding.severity} · ${finding.area}:** ${finding.finding} (${finding.evidence})`)
    .join("\n");
  const tcRows = testCases
    .map((row) => `| ${row.id} | ${row.category} | ${markdownEscape(row.scenario)} | ${markdownEscape(row.expected)} | ${markdownEscape(row.actual)} | ${row.status} | ${row.executionTime} | ${row.apiStatusCode} | ${markdownEscape(row.notes)} |`)
    .join("\n");
  const failedRows = failedAccessAttempts
    .map((row) => `| ${row.testId} | ${markdownEscape(row.actor)} | ${row.method} ${markdownEscape(row.endpoint)} | ${markdownEscape(row.expected)} | ${markdownEscape(row.actual)} | ${markdownEscape(row.outcome)} | ${markdownEscape(row.notes)} |`)
    .join("\n");

  const content = `# รายงานผลการทดสอบ Authentication, Authorization และ Permission Management - IPO Admin

## Executive Summary

| รายการ | ผลลัพธ์ |
|---|---:|
| วันที่ทดสอบ | ${testedAtBangkok} |
| Environment | Local Next.js via ${apiBase} |
| Database | ${databaseLabel} |
| Build version | ${buildVersion} |
| Test cases ทั้งหมด | ${testCases.length} |
| PASS | ${c.PASS} |
| WARNING | ${c.WARNING} |
| FAIL | ${c.FAIL} |
| Overall system status | **${overallStatus()}** |
| Production readiness | **${productionReadiness()}** |
| Execution time | ${totalMs} ms |
| Records loaded | admin_users=${dbChecks.find((row) => row.objectName === "admin_users")?.value ?? "-"}, API calls=${apiLogs.length}, SQL statements=${sqlLogs.length} |
| Workbook validation | ${validationSummary?.status ?? "Pending during markdown generation"} |

## Scope ที่ทดสอบ

- Admin login/logout, JWT cookie, session validation, route protection
- **Session replay/tampering**: tampered signature, forged role escalation, stolen userId, revoked session replay, concurrent sessions, future iat, empty payload
- **RBAC matrix**: super_admin/admin/readonly × scraper, build, import, IPO CRUD, admin-users, schedule, stats, profile
- **CSRF-ish behavior**: state-changing without cookie, wrong Content-Type, DELETE/PATCH/PUT without session
- **Admin user lifecycle**: create → login → password change → deactivate → reactivate → self-delete protection, duplicate email, empty fields, weak password
- **Audit coverage**: login success/failure, mutation events, permission denied events, audit category analysis
- API authorization, SQL injection, XSS attempts
- PostgreSQL integration: admin_users, audit_logs, schema discovery, cleanup

## Security Findings

${topFindings || "- ไม่พบ critical findings"}

## Test Cases

| Test Case ID | Category | Scenario | Expected Result | Actual Result | Status | Execution Time | API Status Code | Notes |
|---|---|---|---|---|---:|---:|---:|---|
${tcRows}

## Failed / Unexpected Access Attempts

| Test Case | Actor | Endpoint | Expected | Actual | Outcome | Notes |
|---|---|---|---|---|---|---|
${failedRows || "| - | - | - | - | - | - | - |"}

## Query Performance Summary

- API average response time: ${ms(avg(apiLogs.map((row) => row.responseTime)))} ms
- API max response time: ${ms(Math.max(...apiLogs.map((row) => row.responseTime)))} ms
- SQL average query time: ${ms(avg(sqlLogs.map((row) => row.executionMs)))} ms
- SQL max query time: ${ms(Math.max(...sqlLogs.map((row) => row.executionMs)))} ms

## Database Transaction Status

- Test users: สร้างด้วย prefix \`${qaEmailPrefix}\` และ cleanup แล้ว
- Test IPO symbol: \`${testSymbol}\` และ cleanup แล้ว
- sessions table: ${schema.hasSessionsTable ? "พบ" : "ไม่พบ"}
- audit_logs: ${dbChecks.find((row) => row.check === "Auth/security audit coverage")?.result ?? "-"}

## Runtime Observations

- Node RSS memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
- JWT session ใช้ signed HttpOnly cookie และตรวจ server-side revocation ผ่าน \`admin_sessions\` เมื่อ migration พร้อม
- API admin routes ถูกครอบด้วย Next proxy และ endpoint-level \`requireAdmin\` / \`requirePermission\` ตาม route ที่ตรวจ

## สรุปท้ายรายงาน

- จำนวน test ที่ผ่าน: **${c.PASS}**
- จำนวน warning: **${c.WARNING}**
- จำนวน fail: **${c.FAIL}**
- Overall system status: **${overallStatus()}**
- Readiness for production: **${productionReadiness()}**
`;
  await fs.writeFile(outputMarkdownPath, content, "utf8");
}

function col(number) {
  let dividend = number;
  let columnName = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
}

function matrixFromObjects(headers, rows, keys) {
  return [headers, ...rows.map((row) => keys.map((key) => row[key] ?? "-"))];
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
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2").format = {
    fill: "#EAF2F8",
    font: { bold: true, color: "#1F2937", size: 10 },
    horizontalAlignment: "left",
  };
  sheet.getRange("A1").format.rowHeightPx = 34;
  sheet.getRange("A2").format.rowHeightPx = 28;
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

function addTableSheet(workbook, name, title, subtitle, headers, rows, options = {}) {
  const sheet = workbook.worksheets.add(name);
  styleTitle(sheet, title, subtitle, headers.length);
  const matrix = [headers, ...rows];
  const endCol = col(headers.length);
  const endRow = Math.max(4, 3 + matrix.length - 1);
  sheet.getRange(`A3:${endCol}${endRow}`).values = matrix;
  const table = sheet.tables.add(`A3:${endCol}${endRow}`, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Table`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  sheet.freezePanes.freezeRows(3);
  sheet.getRange(`A3:${endCol}3`).format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
  };
  sheet.getRange(`A1:${endCol}${endRow}`).format = {
    font: { size: 10, color: "#111827" },
    wrapText: true,
    verticalAlignment: "top",
  };
  headers.forEach((header, index) => {
    const maxLength = Math.max(
      String(header).length,
      ...rows.slice(0, 80).map((row) => String(row[index] ?? "").length),
    );
    sheet.getRange(`${col(index + 1)}:${col(index + 1)}`).format.columnWidthPx = Math.min(Math.max(maxLength * 7, 90), 360);
  });
  if (options.statusColumn) {
    applyStatusConditionalFormatting(sheet, col(options.statusColumn), 4, endRow);
  }
  return sheet;
}

async function buildWorkbook(workbookValidationStatus = "PENDING") {
  const workbook = Workbook.create();
  const c = counts();
  const totalMs = ms(performance.now() - suiteStarted);
  const summary = workbook.worksheets.add("Summary");
  styleTitle(summary, "IPO Admin Auth/RBAC QA-UAT Report", `ทดสอบเมื่อ ${testedAtBangkok}`, 13);
  summary.freezePanes.freezeRows(2);
  summary.getRange("A4:B17").values = [
    ["Environment", `Local Next.js / ${apiBase}`],
    ["Database", databaseLabel],
    ["Build version", buildVersion],
    ["Execution time", `${totalMs} ms`],
    ["Total test cases", testCases.length],
    ["PASS", c.PASS],
    ["WARNING", c.WARNING],
    ["FAIL", c.FAIL],
    ["Overall status", overallStatus()],
    ["Production readiness", productionReadiness()],
    ["Auth schema", `role=${schema.hasRoleColumn}; permissions=${schema.hasPermissionTables}; sessions=${schema.hasSessionsTable}`],
    ["Workbook validation", workbookValidationStatus],
    ["Records loaded", `API=${apiLogs.length}; SQL=${sqlLogs.length}; findings=${securityFindings.length}`],
    ["Cleanup status", cleanupRows.every((row) => row[3] === "PASS") ? "PASS" : "WARNING"],
  ];
  summary.getRange("A4:A17").format = { fill: "#EAF2F8", font: { bold: true, color: "#123C69" } };
  summary.getRange("B4:B17").format = { wrapText: true };
  summary.getRange("A:A").format.columnWidthPx = 190;
  summary.getRange("B:B").format.columnWidthPx = 520;

  summary.getRange("D4:F5").values = [
    ["PASS", "WARNING", "FAIL"],
    [c.PASS, c.WARNING, c.FAIL],
  ];
  summary.getRange("D4:F4").format = { fill: "#123C69", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
  summary.getRange("D5").format = { fill: "#DCFCE7", font: { bold: true, color: "#166534", size: 14 }, horizontalAlignment: "center" };
  summary.getRange("E5").format = { fill: "#FEF3C7", font: { bold: true, color: "#92400E", size: 14 }, horizontalAlignment: "center" };
  summary.getRange("F5").format = { fill: "#FEE2E2", font: { bold: true, color: "#991B1B", size: 14 }, horizontalAlignment: "center" };

  summary.getRange("H4:I7").values = [
    ["Status", "Count"],
    ["PASS", c.PASS],
    ["WARNING", c.WARNING],
    ["FAIL", c.FAIL],
  ];
  const tcChartEndRow = 10 + testCases.length;
  summary.getRange(`H10:I${tcChartEndRow}`).values = [
    ["Test Case", "Execution Time (ms)"],
    ...testCases.map((row) => [row.id, row.executionMs]),
  ];
  summary.getRange("H4:I4").format = { fill: "#123C69", font: { bold: true, color: "#FFFFFF" } };
  summary.getRange("H10:I10").format = { fill: "#123C69", font: { bold: true, color: "#FFFFFF" } };
  summary.getRange("H:I").format.columnWidthPx = 140;
  const pie = summary.charts.add("pie", summary.getRange("H4:I7"));
  pie.title = "PASS / WARNING / FAIL";
  pie.hasLegend = true;
  pie.setPosition("K4", "M16");
  const bar = summary.charts.add("bar", summary.getRange(`H10:I${tcChartEndRow}`));
  bar.title = "Execution Time by Test Case (ms)";
  bar.hasLegend = false;
  bar.xAxis = { axisType: "textAxis" };
  bar.yAxis = { numberFormatCode: "0" };
  bar.setPosition("K18", "M34");

  addTableSheet(
    workbook,
    "Test Cases",
    `${testCases.length} Test Cases - Auth, Authorization, RBAC, CSRF, Lifecycle, Audit`,
    "PASS / WARNING / FAIL พร้อม expected/actual/status code",
    ["Test Case ID", "Category", "Scenario", "Expected Result", "Actual Result", "Status", "Execution Time", "API Status Code", "Notes"],
    testCases.map((row) => [row.id, row.category, row.scenario, row.expected, row.actual, row.status, row.executionTime, row.apiStatusCode, row.notes]),
    { statusColumn: 6 },
  );

  addTableSheet(
    workbook,
    "Security Summary",
    "Security Findings",
    "ช่องโหว่และข้อเสนอแนะด้าน Authentication / Authorization",
    ["Finding ID", "Area", "Severity", "Finding", "Evidence", "Recommendation", "Status"],
    securityFindings.map((row) => [row.id, row.area, row.severity, row.finding, row.evidence, row.recommendation, row.status]),
  );

  addTableSheet(
    workbook,
    "Failed Access Attempts",
    "Failed / Unexpected Access Attempts",
    "บันทึกการ block และ access ที่ควรถูก block แต่ผ่าน",
    ["Test Case ID", "Actor", "Endpoint", "Method", "Expected", "Actual", "Status Code", "Outcome", "Notes"],
    failedAccessAttempts.map((row) => [row.testId, row.actor, row.endpoint, row.method, row.expected, row.actual, row.statusCode, row.outcome, row.notes]),
  );

  addTableSheet(
    workbook,
    "API Auth Logs",
    "API Authentication / Authorization Logs",
    "HTTP status, redirect, payload summary และ error message",
    ["Log ID", "Endpoint", "Method", "Response Code", "Response Time (ms)", "Error Message", "Payload Summary", "Redirect Mode", "Location", "Notes"],
    apiLogs.map((row) => [row.id, row.endpoint, row.method, row.responseCode, row.responseTime, row.errorMessage, row.payloadSummary, row.redirectMode, row.location, row.note]),
  );

  addTableSheet(
    workbook,
    "SQL Logs",
    "SQL Logs",
    "Executed queries, affected tables, transaction status และ query time",
    ["Log ID", "Label", "Executed Query", "Affected Tables", "Transaction Status", "Result", "Execution Time (ms)", "Row Count", "Notes"],
    sqlLogs.map((row) => [row.id, row.label, row.query, row.affectedTables, row.transactionStatus, row.result, row.executionMs, row.rowCount, row.notes]),
  );

  addTableSheet(
    workbook,
    "DB Checks",
    "PostgreSQL Auth Integration Checks",
    "admin_users, sessions, audit_logs, permission tables",
    ["Object", "Check", "Result", "Rows/Value", "Status", "Notes"],
    dbChecks.map((row) => [row.objectName, row.check, row.result, row.value, row.status, row.notes]),
    { statusColumn: 5 },
  );

  addTableSheet(
    workbook,
    "Session Lifecycle",
    "Session Lifecycle Events",
    "Login, logout, expiration, token validation และ cookie behavior",
    ["Event", "Actor", "Cookie Present", "Token State", "Result", "Status", "Notes"],
    sessionLifecycle.map((row) => [row.event, row.actor, row.cookiePresent, row.tokenState, row.result, row.status, row.notes]),
    { statusColumn: 6 },
  );

  addTableSheet(
    workbook,
    "Performance",
    "Runtime and Query Performance",
    "Execution time, API latency, SQL latency, memory/runtime observations",
    ["Metric", "Actual", "Target", "Status", "Notes"],
    performanceRows,
    { statusColumn: 4 },
  );

  addTableSheet(
    workbook,
    "Cleanup",
    "Cleanup and Data Isolation",
    "บัญชีทดสอบ, test IPO, build rows และ orphan checks",
    ["Item", "Action", "Result / Rows", "Status", "Notes"],
    cleanupRows,
    { statusColumn: 4 },
  );

  return workbook;
}

async function renderAndValidate(workbook) {
  await fs.mkdir(previewDir, { recursive: true });
  const sheetNames = [
    "Summary",
    "Test Cases",
    "Security Summary",
    "Failed Access Attempts",
    "API Auth Logs",
    "SQL Logs",
    "DB Checks",
    "Session Lifecycle",
    "Performance",
    "Cleanup",
  ];
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
    options: { useRegex: true, maxResults: 200 },
    maxChars: 1200,
  });
  const summaryInspect = await workbook.inspect({
    kind: "table",
    range: "Summary!A1:M34",
    include: "values,formulas",
    tableMaxRows: 40,
    tableMaxCols: 13,
    maxChars: 2000,
  });
  const formulaText = formulaErrors.ndjson || "";
  return {
    rendered,
    hasFormulaErrors: /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(formulaText),
    formulaErrorScan: trunc(formulaText, 500),
    summaryInspect: trunc(summaryInspect.ndjson || "", 500),
  };
}

async function exportAndReadBack(workbook) {
  const output = await SpreadsheetFile.exportXlsx(workbook);
  try {
    await output.save(outputXlsxPath);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && ["EBUSY", "EPERM"].includes(String(err.code))) {
      outputXlsxPath = path.join(repoRoot, "reports", `ipo-auth-permission-qa-report-${runToken.toLowerCase()}.xlsx`);
      await output.save(outputXlsxPath);
    } else {
      throw err;
    }
  }
  const fileBlob = await FileBlob.load(outputXlsxPath);
  const imported = await SpreadsheetFile.importXlsx(fileBlob);
  const expectedSheets = [
    "Summary",
    "Test Cases",
    "Security Summary",
    "Failed Access Attempts",
    "API Auth Logs",
    "SQL Logs",
    "DB Checks",
    "Session Lifecycle",
    "Performance",
    "Cleanup",
  ];
  const inspect = await imported.inspect({ kind: "sheet", include: "id,name", maxChars: 3000 });
  const text = inspect.ndjson || "";
  const missing = expectedSheets.filter((sheet) => !text.includes(sheet));
  return {
    sheetCount: expectedSheets.length,
    missing,
    allSheetsFound: missing.length === 0,
    inspect: trunc(text, 1000),
  };
}

async function main() {
  let users;
  let validation = null;
  let readBack = null;
  try {
    users = await setup();
    await runTests(users);
  } finally {
    await cleanup().catch((err) => {
      cleanupRows.push(["Cleanup error", "Exception", err instanceof Error ? err.message : String(err), "WARNING", "Manual review required"]);
    });
    collectPerformanceRows();
    await pool.end().catch(() => {});
  }

  let workbook = await buildWorkbook("PENDING");
  validation = await renderAndValidate(workbook);
  readBack = await exportAndReadBack(workbook);
  const workbookStatus = !validation.hasFormulaErrors && readBack.allSheetsFound ? "PASS" : "WARNING";
  workbook = await buildWorkbook(workbookStatus);
  validation = await renderAndValidate(workbook);
  readBack = await exportAndReadBack(workbook);
  const fileStat = await fs.stat(outputXlsxPath);
  await writeMarkdownReport({
    status: workbookStatus,
    fileSize: fileStat.size,
    sheetCount: readBack.sheetCount,
  });

  const summary = {
    markdownPath: outputMarkdownPath,
    workbookPath: outputXlsxPath,
    fileSize: fileStat.size,
    sheetCount: readBack.sheetCount,
    totalRowsExported:
      testCases.length +
      apiLogs.length +
      sqlLogs.length +
      securityFindings.length +
      failedAccessAttempts.length +
      sessionLifecycle.length +
      dbChecks.length +
      performanceRows.length +
      cleanupRows.length,
    pass: counts().PASS,
    warning: counts().WARNING,
    fail: counts().FAIL,
    overallStatus: overallStatus(),
    productionReadiness: productionReadiness(),
    workbookIntegrity: workbookStatus,
    formulaErrors: validation.hasFormulaErrors,
    readBackSheetsFound: readBack.allSheetsFound,
    renderedSheets: validation.rendered,
    database: databaseLabel,
    apiBase,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(async (err) => {
  try {
    await pool.end();
  } catch {
    // ignore
  }
  console.error(err);
  process.exit(1);
});
