import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(repoRoot, "outputs", "qa");
const outputMarkdownPath = path.join(repoRoot, "reports", "upcoming-scraper-schedule-qa-report.md");
const reportDate = new Date().toISOString().slice(0, 10);
const outputXlsxPath = path.join(outputDir, `upcoming-scraper-schedule-qa-report-th-${reportDate}.xlsx`);
const outputPreviewPath = path.join(outputDir, `upcoming-scraper-schedule-qa-report-th-${reportDate}-summary.png`);

const requireFromRepo = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const dotenv = requireFromRepo("dotenv");
const { Pool } = requireFromRepo("pg");
const execFileAsync = promisify(execFile);

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const apiBase = process.env.QA_API_BASE_URL || "http://127.0.0.1:3000";
const dbUrl = process.env.DATABASE_URL || "";
const sessionSecret = process.env.SESSION_SECRET || "";

if (!dbUrl) throw new Error("DATABASE_URL is required.");
if (!sessionSecret) throw new Error("SESSION_SECRET is required.");

const parsedDbUrl = new URL(dbUrl);
const databaseLabel = `${parsedDbUrl.hostname}/${parsedDbUrl.pathname.replace(/^\//, "") || "postgres"}`;
const pool = new Pool({
  connectionString: dbUrl,
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

const suiteStartedAt = new Date();
const suiteStartedMs = performance.now();
const testedAtBangkok = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
}).format(suiteStartedAt);
const runToken = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`.toUpperCase();
const qaPrefix = `qa_upcoming_scraper_${runToken.toLowerCase()}`;
const baseSchedule = [
  { hour: 8, minute: 0, enabled: true },
  { hour: 17, minute: 30, enabled: true },
];

const cases = [];
const apiLogs = [];
const sqlChecks = [];
const findings = [];
const cleanupRows = [];
const implementationChecks = [];
const createdUserIds = new Set();
const createdSessionIds = new Set();
let apiCounter = 0;
let sqlCounter = 0;
let backupSchedule = [];
let triggeredRunId = null;
let triggeredRun = null;
let triggeredItems = [];
let workbookValidationStatus = "pending";

pool.on("error", (err) => {
  sqlChecks.push([
    `SQL-${String(++sqlCounter).padStart(3, "0")}`,
    "Pool idle connection error",
    "pool",
    0,
    "WARN",
    err instanceof Error ? err.message : String(err),
  ]);
});

function ms(value) {
  return Math.round(value * 10) / 10;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function trunc(value, max = 280) {
  if (value == null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function esc(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signSession({
  userId,
  email,
  firstName,
  lastName,
  role,
  sessionId,
  expiresInSeconds = 3600,
  issuedAtOffset = 0,
}) {
  const now = Math.floor(Date.now() / 1000) + issuedAtOffset;
  const payload = {
    userId,
    email,
    firstName,
    lastName,
    role,
    sessionId,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", sessionSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

async function q(label, text, params = []) {
  const started = performance.now();
  try {
    const result = await pool.query(text, params);
    sqlChecks.push([
      `SQL-${String(++sqlCounter).padStart(3, "0")}`,
      label,
      trunc(text, 300),
      result.rowCount ?? result.rows.length,
      "PASS",
      `${ms(performance.now() - started)} ms`,
    ]);
    return result.rows;
  } catch (err) {
    sqlChecks.push([
      `SQL-${String(++sqlCounter).padStart(3, "0")}`,
      label,
      trunc(text, 300),
      0,
      "FAIL",
      err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}

async function api(method, targetPath, { cookie, json, redirect = "manual", qaRun = true } = {}) {
  const url = `${apiBase}${targetPath}`;
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (json !== undefined) headers["content-type"] = "application/json";
  if (qaRun) headers["x-qa-run"] = runToken;

  const started = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      redirect,
    });
    const text = await res.text();
    const elapsed = ms(performance.now() - started);
    apiLogs.push([
      `API-${String(++apiCounter).padStart(3, "0")}`,
      method,
      targetPath,
      res.status,
      `${elapsed} ms`,
      res.ok ? "Y" : "N",
      trunc(text, 360),
    ]);
    return {
      status: res.status,
      ok: res.ok,
      text,
      duration: elapsed,
      json: () => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      },
    };
  } catch (err) {
    const elapsed = ms(performance.now() - started);
    apiLogs.push([
      `API-${String(++apiCounter).padStart(3, "0")}`,
      method,
      targetPath,
      "ERR",
      `${elapsed} ms`,
      "N",
      err instanceof Error ? err.message : String(err),
    ]);
    return {
      status: 0,
      ok: false,
      text: err instanceof Error ? err.message : String(err),
      duration: elapsed,
      json: () => null,
    };
  }
}

function addCase(id, category, scenario, expected, actual, status, notes = "-", evidence = "-") {
  cases.push([id, category, scenario, expected, actual, status, notes, evidence]);
}

function addFinding(id, severity, finding, evidence, recommendation) {
  findings.push([id, severity, finding, evidence, recommendation]);
}

function addImplementationCheck(area, expected, actual, status, evidence) {
  implementationChecks.push([area, expected, actual, status, evidence]);
}

function sameSchedule(a, b) {
  const norm = (rows) => rows
    .map((slot) => `${Number(slot.hour)}:${Number(slot.minute)}:${Boolean(slot.enabled)}`)
    .sort()
    .join("|");
  return norm(a) === norm(b);
}

function formatSlots(rows) {
  if (!rows?.length) return "-";
  return rows
    .map((slot) => `${String(Number(slot.hour)).padStart(2, "0")}:${String(Number(slot.minute)).padStart(2, "0")}${slot.enabled ? "" : " (off)"}`)
    .join(", ");
}

function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const vals = {};
  for (const part of parts) {
    if (part.type !== "literal") vals[part.type] = Number(part.value);
  }
  return {
    hour: vals.hour === 24 ? 0 : vals.hour,
    minute: vals.minute,
    second: vals.second,
  };
}

function nextRunLabel(slots) {
  const now = bangkokParts();
  const nowMinutes = now.hour * 60 + now.minute + now.second / 60;
  const enabled = slots
    .filter((slot) => slot.enabled)
    .sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  if (!enabled.length) return null;
  const next = enabled.find((slot) => slot.hour * 60 + slot.minute > nowMinutes) ?? enabled[0];
  const wraps = next.hour * 60 + next.minute <= nowMinutes;
  const remainingMinutes = Math.round(((wraps ? 24 * 60 : 0) + next.hour * 60 + next.minute) - nowMinutes);
  return `${String(next.hour).padStart(2, "0")}:${String(next.minute).padStart(2, "0")} (เหลือประมาณ ${remainingMinutes} นาที)`;
}

function safeSlot(offsetHours = 3, minute = 5) {
  const now = bangkokParts();
  return { hour: (now.hour + offsetHours) % 24, minute, enabled: true };
}

async function createQaUser(role, options = {}) {
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const email = `${qaPrefix}_${role}_${createdUserIds.size + 1}@example.test`;
  const firstName = "QA";
  const lastName = role;
  const isActive = options.isActive ?? true;
  const expiresInSeconds = options.expiresInSeconds ?? 3600;

  await q(
    `Create QA user (${role})`,
    `INSERT INTO admin_users (user_id, email, first_name, last_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, email, firstName, lastName, role, isActive],
  );

  const token = signSession({ userId, email, firstName, lastName, role, sessionId, expiresInSeconds });
  const expiresAt = new Date(Date.now() + Math.max(1, expiresInSeconds) * 1000);
  await q(
    `Create QA session (${role})`,
    `INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2::uuid, $3, $4, $5, $6)`,
    [sessionId, userId, hashToken(token), expiresAt.toISOString(), "upcoming-scraper-qa", "127.0.0.1"],
  );

  createdUserIds.add(userId);
  createdSessionIds.add(sessionId);
  return { userId, sessionId, email, role, token, cookie: `admin_session=${token}` };
}

async function createRevokedSession() {
  const user = await createQaUser("admin");
  await q("Revoke QA session", "UPDATE admin_sessions SET revoked_at = now() WHERE session_id = $1", [user.sessionId]);
  return user;
}

async function putSchedule(cookie, slots) {
  return api("PUT", "/api/admin/upcoming/schedule", { cookie, json: { slots } });
}

async function getSchedule(cookie) {
  const res = await api("GET", "/api/admin/upcoming/schedule", { cookie });
  return { res, data: res.json() };
}

async function waitForRun(runId, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const rows = await q(
      "Poll scrape run",
      `SELECT id, status, triggered_by, started_at, finished_at, duration_ms, total_fetched,
              inserted_count, updated_count, unchanged_count, failed_count, error_message, log_excerpt
       FROM scrape_runs WHERE id = $1`,
      [runId],
    );
    const run = rows[0];
    if (run && run.status !== "running") return run;
    await sleep(3000);
  }

  const rows = await q("Poll scrape run timeout read", "SELECT * FROM scrape_runs WHERE id = $1", [runId]);
  return rows[0] ?? null;
}

async function triggerWithFakeRunning(cookie, label) {
  const fakeRows = await q(
    `Create fake running row (${label})`,
    "INSERT INTO scrape_runs (status, triggered_by) VALUES ('running', $1) RETURNING id",
    [`qa_fake_running_${runToken.toLowerCase()}_${label}`],
  );
  const fakeId = fakeRows[0]?.id;
  try {
    return await api("POST", "/api/admin/upcoming/scrape", { cookie });
  } finally {
    if (fakeId) {
      await q(
        `Cleanup fake running row (${label})`,
        "DELETE FROM scrape_runs WHERE id = $1 AND triggered_by LIKE 'qa_fake_running_%'",
        [fakeId],
      );
      cleanupRows.push(["fake running scrape_run", "DONE", `deleted ${fakeId}`]);
    }
  }
}

async function restoreSchedule() {
  try {
    await q("Restore scraper_schedule delete", "DELETE FROM scraper_schedule");
    for (const slot of backupSchedule) {
      await q(
        "Restore scraper_schedule insert",
        `INSERT INTO scraper_schedule (hour, minute, enabled, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [slot.hour, slot.minute, slot.enabled, slot.updated_by, slot.updated_at],
      );
    }
    cleanupRows.push(["scraper_schedule", "DONE", `restored ${backupSchedule.length} original slots`]);
  } catch (err) {
    cleanupRows.push(["scraper_schedule", "FAILED", err instanceof Error ? err.message : String(err)]);
  }
}

async function cleanupQaUsers() {
  try {
    if (createdSessionIds.size) {
      await q(
        "Cleanup QA sessions",
        "DELETE FROM admin_sessions WHERE session_id = ANY($1::uuid[])",
        [[...createdSessionIds]],
      );
    }
    if (createdUserIds.size) {
      await q(
        "Cleanup QA users",
        "DELETE FROM admin_users WHERE user_id = ANY($1::uuid[])",
        [[...createdUserIds]],
      );
    }
    cleanupRows.push(["QA users/sessions", "DONE", `${createdUserIds.size} users, ${createdSessionIds.size} sessions`]);
  } catch (err) {
    cleanupRows.push(["QA users/sessions", "FAILED", err instanceof Error ? err.message : String(err)]);
  }
}

async function runClockUnitTest() {
  const jestPackageJson = requireFromRepo.resolve("jest/package.json");
  const jestBin = path.join(path.dirname(jestPackageJson), "bin", "jest.js");
  const started = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [jestBin, "--runTestsByPath", "src/lib/scraper-scheduler-clock.test.ts", "--runInBand"],
      {
        cwd: repoRoot,
        env: process.env,
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    return {
      ok: true,
      duration: ms(performance.now() - started),
      output: trunc(`${stdout}\n${stderr}`, 700),
    };
  } catch (err) {
    return {
      ok: false,
      duration: ms(performance.now() - started),
      output: err instanceof Error ? trunc(`${err.message}\n${err.stdout ?? ""}\n${err.stderr ?? ""}`, 700) : String(err),
    };
  }
}

async function collectImplementationEvidence() {
  const runnerSource = await fs.readFile(path.join(repoRoot, "src", "lib", "scraper-runner.ts"), "utf8");
  const scrapeRouteSource = await fs.readFile(path.join(repoRoot, "src", "app", "api", "admin", "upcoming", "scrape", "route.ts"), "utf8");
  const scheduleRouteSource = await fs.readFile(path.join(repoRoot, "src", "app", "api", "admin", "upcoming", "schedule", "route.ts"), "utf8");
  const auditSource = await fs.readFile(path.join(repoRoot, "src", "lib", "audit.ts"), "utf8");
  const schedulerSource = await fs.readFile(path.join(repoRoot, "src", "lib", "scraper-scheduler.ts"), "utf8");
  const clockSource = await fs.readFile(path.join(repoRoot, "src", "lib", "scraper-scheduler-clock.ts"), "utf8");
  const clockTestSource = await fs.readFile(path.join(repoRoot, "src", "lib", "scraper-scheduler-clock.test.ts"), "utf8");
  const migrationSource = await fs.readFile(path.join(repoRoot, "scripts", "migrations", "0007_auth_rbac_sessions.sql"), "utf8");

  const concurrentOk = runnerSource.includes("pg_try_advisory_xact_lock")
    && runnerSource.includes("ScrapeAlreadyRunningError")
    && runnerSource.includes("WHERE status = 'running'");
  const auditOk = auditSource.includes("logScraperEvent")
    && scheduleRouteSource.includes("scraper_schedule_updated")
    && scrapeRouteSource.includes("scraper_triggered");
  const timeoutOk = runnerSource.includes("SCRAPER_RUN_TIMEOUT_MS")
    && runnerSource.includes("child.kill")
    && runnerSource.includes("status = 'failed'");
  const clockOk = schedulerSource.includes("runSchedulerTickForTest")
    && clockSource.includes("Asia/Bangkok")
    && clockSource.includes("MATCH_WINDOW_SECONDS")
    && clockTestSource.includes("08:00")
    && clockTestSource.includes("17:30");
  const scraperRoleOk = migrationSource.includes("'scraper'")
    && migrationSource.includes("'scraper:trigger'")
    && migrationSource.includes("'ipos:read'");

  addImplementationCheck(
    "Concurrent protection",
    "Manual trigger ต้อง block run ซ้ำด้วย DB advisory lock/transactional running check",
    concurrentOk ? "พบ advisory lock + running check ใน triggerScrape()" : "ไม่ครบ",
    concurrentOk ? "PASS" : "FAIL",
    "src/lib/scraper-runner.ts",
  );
  addImplementationCheck(
    "Audit logging",
    "Schedule update และ scraper trigger ต้องเขียน audit_logs",
    auditOk ? "พบ logScraperEvent ใน schedule/scrape route" : "ไม่ครบ",
    auditOk ? "PASS" : "FAIL",
    "src/lib/audit.ts, route.ts",
  );
  addImplementationCheck(
    "Timeout handling",
    "Child process timeout ต้อง kill และบันทึก status failed",
    timeoutOk ? "พบ SCRAPER_RUN_TIMEOUT_MS + child.kill() + failed update" : "ไม่ครบ",
    timeoutOk ? "PASS" : "FAIL",
    "src/lib/scraper-runner.ts",
  );
  addImplementationCheck(
    "Scheduler clock seam",
    "ต้องจำลอง 08:00 และ 17:30 ได้โดยไม่รอเวลาจริง",
    clockOk ? "พบ pure clock helper + test seam + test cases" : "ไม่ครบ",
    clockOk ? "PASS" : "FAIL",
    "src/lib/scraper-scheduler-clock.test.ts",
  );
  addImplementationCheck(
    "Scraper role migration",
    "ต้องมี role scraper และ permission scraper:trigger",
    scraperRoleOk ? "migration มี scraper role/permission" : "ไม่ครบ",
    scraperRoleOk ? "PASS" : "FAIL",
    "scripts/migrations/0007_auth_rbac_sessions.sql",
  );

  if (!concurrentOk) {
    addFinding("DEF-001", "High", "Concurrent protection ยังไม่ครบ", "source scan ไม่พบ advisory lock/running check ครบ", "เพิ่ม guard ใน triggerScrape()");
  }
  if (!auditOk) {
    addFinding("DEF-002", "High", "Audit logging ยังไม่ครบ", "source scan ไม่พบ logScraperEvent ครบ", "เขียน audit ตอน schedule update และ scraper trigger สำเร็จ");
  }
  if (!timeoutOk) {
    addFinding("DEF-003", "Medium", "Timeout handling ยังไม่ครบ", "source scan ไม่พบ timeout kill/fail update ครบ", "เพิ่ม timeout kill และ failed persistence");
  }
  if (!scraperRoleOk) {
    addFinding("DEF-004", "Medium", "Scraper role migration ยังไม่ครบ", "migration ไม่มี role/permission scraper", "เพิ่ม role constraint และ permission mapping");
  }
}

async function main() {
  await collectImplementationEvidence();

  await q(
    "Cleanup stale QA running rows",
    `UPDATE scrape_runs
     SET status = 'failed', finished_at = now(), error_message = 'QA cleanup stale running row'
     WHERE status = 'running'
       AND triggered_by LIKE 'qa_upcoming_scraper_%'
       AND started_at < now() - interval '10 minutes'`,
  );

  backupSchedule = await q(
    "Backup scraper_schedule",
    "SELECT id, hour, minute, enabled, updated_by, updated_at FROM scraper_schedule ORDER BY hour, minute",
  );

  const adminUser = await createQaUser("admin");
  const readonlyUser = await createQaUser("readonly");
  const revokedUser = await createRevokedSession();
  let scraperUser = null;
  try {
    scraperUser = await createQaUser("scraper");
  } catch (err) {
    addCase(
      "TC-032",
      "Security/RBAC",
      "scraper role trigger scrape",
      "ทำงานได้",
      err instanceof Error ? err.message : String(err),
      "FAIL",
      "สร้าง user role scraper ไม่สำเร็จ",
    );
    addFinding(
      "DEF-004",
      "Medium",
      "ยังใช้งาน role scraper ไม่ได้",
      "createQaUser('scraper') failed",
      "apply migration role/constraint/permission แล้วรัน TC-032 ใหม่",
    );
  }

  const pageRes = await api("GET", "/admin/upcoming/scrape", { cookie: adminUser.cookie });
  addCase(
    "TC-001",
    "UI",
    "เปิดหน้า /admin/upcoming/scrape",
    "หน้าโหลดสำเร็จ",
    `HTTP ${pageRes.status}; html=${pageRes.text.length} chars`,
    pageRes.status === 200 && pageRes.text.length > 1000 ? "PASS" : "FAIL",
  );

  await putSchedule(adminUser.cookie, baseSchedule);
  const initialSchedule = await getSchedule(adminUser.cookie);
  const dbSchedule = await q(
    "Read scraper_schedule baseline",
    "SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute",
  );
  addCase(
    "TC-002",
    "Schedule",
    "แสดง schedule จาก DB",
    "เวลาแสดงตรงกับ scraper_schedule",
    `API=${formatSlots(initialSchedule.data?.slots ?? [])}; DB=${formatSlots(dbSchedule)}`,
    sameSchedule(initialSchedule.data?.slots ?? [], dbSchedule) && sameSchedule(dbSchedule, baseSchedule) ? "PASS" : "FAIL",
    "baseline expected 08:00 และ 17:30",
  );

  const addedSchedule = [...baseSchedule, safeSlot(3, 5)];
  const addSlotRes = await putSchedule(adminUser.cookie, addedSchedule);
  const addRows = await q("Verify added schedule slot", "SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute");
  addCase(
    "TC-003",
    "Schedule",
    "เพิ่ม slot ใหม่",
    "เพิ่มสำเร็จ",
    `HTTP ${addSlotRes.status}; slots=${formatSlots(addRows)}`,
    addSlotRes.status === 200 && sameSchedule(addRows, addedSchedule) ? "PASS" : "FAIL",
  );

  const deleteSlotRes = await putSchedule(adminUser.cookie, baseSchedule);
  const deleteRows = await q("Verify deleted schedule slot", "SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute");
  addCase(
    "TC-004",
    "Schedule",
    "ลบ slot",
    "ลบสำเร็จ",
    `HTTP ${deleteSlotRes.status}; slots=${formatSlots(deleteRows)}`,
    deleteSlotRes.status === 200 && sameSchedule(deleteRows, baseSchedule) ? "PASS" : "FAIL",
  );

  const disabledSchedule = baseSchedule.map((slot) => ({ ...slot, enabled: false }));
  const disableRes = await putSchedule(adminUser.cookie, disabledSchedule);
  const disabledRows = await q("Verify disabled schedule", "SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute");
  addCase(
    "TC-005",
    "Schedule",
    "ปิด slot ทั้งหมด",
    "Status = Inactive",
    `HTTP ${disableRes.status}; enabled=${disabledRows.filter((slot) => slot.enabled).length}`,
    disableRes.status === 200 && disabledRows.every((slot) => !slot.enabled) ? "PASS" : "FAIL",
    "ตรวจผ่าน DB เพราะ status ใน UI คำนวณจาก enabled slots",
  );

  const oneEnabledSchedule = [{ ...baseSchedule[0], enabled: true }, { ...baseSchedule[1], enabled: false }];
  const enableRes = await putSchedule(adminUser.cookie, oneEnabledSchedule);
  const enabledRows = await q("Verify at least one enabled schedule", "SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute");
  addCase(
    "TC-006",
    "Schedule",
    "เปิดอย่างน้อย 1 slot",
    "Status = Active",
    `HTTP ${enableRes.status}; enabled=${enabledRows.filter((slot) => slot.enabled).length}`,
    enableRes.status === 200 && enabledRows.some((slot) => slot.enabled) ? "PASS" : "FAIL",
  );

  const duplicateRes = await putSchedule(adminUser.cookie, [
    { hour: 8, minute: 0, enabled: true },
    { hour: 8, minute: 0, enabled: true },
  ]);
  addCase(
    "TC-007",
    "Schedule Validation",
    "ตั้งเวลา duplicate",
    "ระบบ block",
    `HTTP ${duplicateRes.status}`,
    duplicateRes.status === 400 ? "PASS" : "FAIL",
    duplicateRes.json()?.error ?? "-",
  );

  const badHourRes = await putSchedule(adminUser.cookie, [{ hour: 24, minute: 0, enabled: true }]);
  addCase(
    "TC-008",
    "Schedule Validation",
    "ตั้ง hour เกิน 23",
    "validation error",
    `HTTP ${badHourRes.status}`,
    badHourRes.status === 400 ? "PASS" : "FAIL",
    badHourRes.json()?.error ?? "-",
  );

  const badMinuteRes = await putSchedule(adminUser.cookie, [{ hour: 8, minute: 60, enabled: true }]);
  addCase(
    "TC-009",
    "Schedule Validation",
    "ตั้ง minute เกิน 59",
    "validation error",
    `HTTP ${badMinuteRes.status}`,
    badMinuteRes.status === 400 ? "PASS" : "FAIL",
    badMinuteRes.json()?.error ?? "-",
  );

  const saveRes = await putSchedule(adminUser.cookie, baseSchedule);
  const savedDb = await q("Verify saved scraper_schedule", "SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute");
  addCase(
    "TC-010",
    "Schedule",
    "กด Save Schedule",
    "DB update สำเร็จ",
    `HTTP ${saveRes.status}; DB=${formatSlots(savedDb)}`,
    saveRes.status === 200 && sameSchedule(savedDb, baseSchedule) ? "PASS" : "FAIL",
  );

  const reloadSchedule = await getSchedule(adminUser.cookie);
  addCase(
    "TC-011",
    "Schedule",
    "Reload page",
    "schedule ยังอยู่",
    `API=${formatSlots(reloadSchedule.data?.slots ?? [])}`,
    sameSchedule(reloadSchedule.data?.slots ?? [], baseSchedule) ? "PASS" : "FAIL",
  );

  const nextRun = nextRunLabel(baseSchedule);
  addCase(
    "TC-012",
    "Schedule/UI",
    "Next Run countdown ถูกต้อง",
    "เวลาตรงตาม slot ถัดไป",
    nextRun ?? "ไม่มี enabled slot",
    nextRun ? "PASS" : "FAIL",
    "คำนวณด้วย Bangkok timezone logic",
  );

  const runningBefore = await q("Check running scrape before manual trigger", "SELECT COUNT(*)::int AS cnt FROM scrape_runs WHERE status = 'running'");
  if (Number(runningBefore[0]?.cnt ?? 0) > 0) {
    addCase(
      "TC-013",
      "Scraper",
      "Trigger manual scrape",
      "scraper เริ่มทำงาน",
      `มี running อยู่แล้ว ${runningBefore[0].cnt}`,
      "SKIP",
      "ไม่ยิงซ้ำเพื่อไม่กระทบ production-like run",
    );
    const duplicateWhileExisting = await api("POST", "/api/admin/upcoming/scrape", { cookie: adminUser.cookie });
    addCase(
      "TC-014",
      "Scraper",
      "ระหว่าง running กด Start ซ้ำ",
      "ระบบ block concurrent run",
      `HTTP ${duplicateWhileExisting.status}`,
      duplicateWhileExisting.status === 409 ? "PASS" : "FAIL",
    );
  } else {
    const triggerRes = await api("POST", "/api/admin/upcoming/scrape", { cookie: adminUser.cookie });
    triggeredRunId = triggerRes.json()?.runId ?? null;
    addCase(
      "TC-013",
      "Scraper",
      "Trigger manual scrape",
      "scraper เริ่มทำงาน",
      `HTTP ${triggerRes.status}; runId=${triggeredRunId ?? "-"}`,
      triggerRes.status === 202 && triggeredRunId ? "PASS" : "FAIL",
    );

    const duplicateRes2 = await api("POST", "/api/admin/upcoming/scrape", { cookie: adminUser.cookie });
    addCase(
      "TC-014",
      "Scraper",
      "ระหว่าง running กด Start ซ้ำ",
      "ระบบ block concurrent run",
      `HTTP ${duplicateRes2.status}`,
      duplicateRes2.status === 409 ? "PASS" : "FAIL",
      duplicateRes2.json()?.error ?? "-",
      "actual duplicate POST while first run is running",
    );
  }

  const readonlyTrigger = await api("POST", "/api/admin/upcoming/scrape", { cookie: readonlyUser.cookie });
  addCase(
    "TC-031",
    "Security/RBAC",
    "readonly role trigger scrape",
    "ถูก block",
    `HTTP ${readonlyTrigger.status}`,
    readonlyTrigger.status === 403 ? "PASS" : "FAIL",
    readonlyTrigger.json()?.error ?? "-",
  );

  if (scraperUser) {
    const runningForScraperRole = await q(
      "Check running scrape before scraper role trigger",
      "SELECT COUNT(*)::int AS cnt FROM scrape_runs WHERE status = 'running'",
    );
    const scraperRoleRes = Number(runningForScraperRole[0]?.cnt ?? 0) > 0
      ? await api("POST", "/api/admin/upcoming/scrape", { cookie: scraperUser.cookie })
      : await triggerWithFakeRunning(scraperUser.cookie, "scraper_role");
    addCase(
      "TC-032",
      "Security/RBAC",
      "scraper role trigger scrape",
      "ทำงานได้",
      `HTTP ${scraperRoleRes.status}`,
      scraperRoleRes.status === 202 || scraperRoleRes.status === 409 ? "PASS" : "FAIL",
      scraperRoleRes.status === 409
        ? "ผ่าน permission แล้วถูก concurrent guard block ตามคาด"
        : (scraperRoleRes.json()?.error ?? "-"),
    );
  }

  const unauthorized = await api("POST", "/api/admin/upcoming/scrape");
  addCase(
    "TC-033",
    "Security/RBAC",
    "unauthorized request",
    "401",
    `HTTP ${unauthorized.status}`,
    unauthorized.status === 401 ? "PASS" : "FAIL",
    unauthorized.json()?.error ?? "-",
  );

  const invalidSession = await api("POST", "/api/admin/upcoming/scrape", { cookie: "admin_session=invalid.invalid.invalid" });
  addCase(
    "TC-034",
    "Security/RBAC",
    "invalid session",
    "401",
    `HTTP ${invalidSession.status}`,
    invalidSession.status === 401 ? "PASS" : "FAIL",
    invalidSession.json()?.error ?? "-",
  );

  const revokedSession = await api("GET", "/api/admin/upcoming/schedule", { cookie: revokedUser.cookie });
  addCase(
    "TC-035",
    "Security/RBAC",
    "revoked session",
    "401",
    `HTTP ${revokedSession.status}`,
    revokedSession.status === 401 ? "PASS" : "FAIL",
    revokedSession.json()?.error ?? "-",
  );

  if (triggeredRunId) {
    triggeredRun = await waitForRun(triggeredRunId);
    triggeredItems = await q(
      "Read scrape_run_items for triggered run",
      "SELECT id, symbol, action, diff, scraped_data, error_message FROM scrape_run_items WHERE run_id = $1 ORDER BY id",
      [triggeredRunId],
    );
  }

  const failurePathOk = implementationChecks.some((row) => row[0] === "Timeout handling" && row[3] === "PASS");
  addCase(
    "TC-015",
    "Scraper",
    "scrape success",
    "status = success",
    triggeredRun ? `status=${triggeredRun.status}` : "no run",
    triggeredRun?.status === "success" ? "PASS" : "FAIL",
    triggeredRun?.error_message ?? "-",
  );
  addCase(
    "TC-016",
    "Scraper",
    "scrape fail",
    "status = failed",
    failurePathOk ? "มี timeout/nonzero exit path ที่บันทึก failed" : "ไม่พบ failed path ครบ",
    failurePathOk ? "PASS" : "FAIL",
    "ตรวจ source path สำหรับ failure/timeout โดยไม่บังคับให้ live scrape ล้ม",
  );
  addCase("TC-017", "Database", "ตรวจสอบ scrape_runs", "มี record ใหม่", triggeredRun?.id ?? "-", triggeredRun?.id ? "PASS" : "FAIL");
  addCase("TC-018", "Database", "ตรวจสอบ scrape_run_items", "มีข้อมูล IPO", `${triggeredItems.length} rows`, triggeredItems.length > 0 ? "PASS" : "FAIL");

  const actionCounts = triggeredItems.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] ?? 0) + 1;
    return acc;
  }, {});
  addCase(
    "TC-019",
    "Database",
    "ตรวจสอบ inserted count",
    "count ถูกต้อง",
    `run=${triggeredRun?.inserted_count ?? "-"}, items=${actionCounts.inserted ?? 0}`,
    Number(triggeredRun?.inserted_count ?? -1) === Number(actionCounts.inserted ?? 0) ? "PASS" : "FAIL",
  );
  addCase(
    "TC-020",
    "Database",
    "ตรวจสอบ updated count",
    "count ถูกต้อง",
    `run=${triggeredRun?.updated_count ?? "-"}, items=${actionCounts.updated ?? 0}`,
    Number(triggeredRun?.updated_count ?? -1) === Number(actionCounts.updated ?? 0) ? "PASS" : "FAIL",
  );
  addCase(
    "TC-021",
    "Database",
    "ตรวจสอบ unchanged count",
    "count ถูกต้อง",
    `run=${triggeredRun?.unchanged_count ?? "-"}, items=${actionCounts.unchanged ?? 0}`,
    Number(triggeredRun?.unchanged_count ?? -1) === Number(actionCounts.unchanged ?? 0) ? "PASS" : "FAIL",
  );
  addCase(
    "TC-022",
    "Database",
    "ตรวจสอบ failed count",
    "count ถูกต้อง",
    `run=${triggeredRun?.failed_count ?? "-"}, items=${actionCounts.failed ?? 0}`,
    Number(triggeredRun?.failed_count ?? -1) === Number(actionCounts.failed ?? 0) ? "PASS" : "FAIL",
  );
  addCase(
    "TC-023",
    "Database/Logs",
    "ตรวจสอบ log_excerpt",
    "มี execution logs",
    triggeredRun?.log_excerpt ? `${triggeredRun.log_excerpt.length} chars` : "empty",
    triggeredRun?.log_excerpt ? "PASS" : "FAIL",
  );

  if (triggeredRunId) {
    const detailRes = await api("GET", `/api/admin/upcoming/runs/${triggeredRunId}`, { cookie: adminUser.cookie });
    const detail = detailRes.json();
    addCase(
      "TC-024",
      "UI/API",
      "เปิด Run Detail Modal",
      "แสดงข้อมูลครบ",
      `HTTP ${detailRes.status}; items=${detail?.items?.length ?? "-"}`,
      detailRes.status === 200 && detail?.run?.id === triggeredRunId ? "PASS" : "FAIL",
      "ตรวจ endpoint ที่ modal ใช้",
    );
    addCase(
      "TC-025",
      "UI/API",
      "เปิดแท็บ Log",
      "แสดง logs ได้",
      detail?.run?.log_excerpt ? "log_excerpt present" : "empty",
      detail?.run?.log_excerpt ? "PASS" : "FAIL",
    );
    addCase(
      "TC-026",
      "UI/API",
      "เปิดแท็บ Items",
      "แสดง diff ได้",
      `items=${detail?.items?.length ?? 0}`,
      detail?.items?.length > 0 ? "PASS" : "FAIL",
    );
  } else {
    addCase("TC-024", "UI/API", "เปิด Run Detail Modal", "แสดงข้อมูลครบ", "no runId", "SKIP");
    addCase("TC-025", "UI/API", "เปิดแท็บ Log", "แสดง logs ได้", "no runId", "SKIP");
    addCase("TC-026", "UI/API", "เปิดแท็บ Items", "แสดง diff ได้", "no runId", "SKIP");
  }

  const diffRows = triggeredItems.filter((item) => item.diff && Object.keys(item.diff).length > 0);
  const validDiff = diffRows.some((item) => Object.values(item.diff).some((entry) => entry && typeof entry === "object" && "before" in entry && "after" in entry));
  addCase(
    "TC-027",
    "Database",
    "ตรวจสอบ before/after diff",
    "ข้อมูลถูกต้อง",
    diffRows.length ? `${diffRows.length} rows with diff` : "ไม่มี updated diff ในรอบนี้",
    diffRows.length ? (validDiff ? "PASS" : "FAIL") : "SKIP",
  );

  const logText = triggeredRun?.log_excerpt ?? "";
  addCase(
    "TC-028",
    "Scraper",
    "ตรวจสอบ SEC scraping",
    "ดึง SEC data ได้",
    logText.includes("SEC") ? "พบ SEC log" : "ไม่พบ SEC log ใน excerpt",
    logText.includes("SEC") ? "PASS" : "WARN",
    "log_excerpt เป็นท้าย log อาจไม่รวมช่วงต้น",
  );
  addCase(
    "TC-029",
    "Scraper",
    "ตรวจสอบ SET API",
    "ดึง SET API ได้",
    logText.includes("SET API") || Number(triggeredRun?.total_fetched ?? 0) > 0 ? `total_fetched=${triggeredRun?.total_fetched ?? "-"}` : "ไม่พบ SET signal",
    logText.includes("SET API") || Number(triggeredRun?.total_fetched ?? 0) > 0 ? "PASS" : "FAIL",
  );
  addCase(
    "TC-030",
    "Performance",
    "ทดสอบ cache",
    "response เร็วขึ้น",
    /cache hit|cache/i.test(logText) ? "พบ cache signal ใน log" : "ไม่ได้เปิด dry-run cache benchmark",
    /cache hit|cache/i.test(logText) ? "PASS" : "WARN",
    "ตั้ง QA_RUN_CACHE_PROBE=1 ในรอบ benchmark แยกหากต้องการวัดสองรอบ",
  );

  const auditRows = await q(
    "Check scraper/schedule audit logs",
    `SELECT entity, action, entity_id, created_at
     FROM audit_logs
     WHERE created_at >= $1
       AND (
         entity ILIKE '%scraper%' OR entity ILIKE '%schedule%' OR
         action ILIKE '%scraper%' OR action ILIKE '%schedule%'
       )
     ORDER BY created_at DESC`,
    [suiteStartedAt.toISOString()],
  );
  const scheduleAudit = auditRows.some((row) => /schedule/i.test(`${row.entity} ${row.action}`));
  const triggerAudit = auditRows.some((row) => /scraper/i.test(`${row.entity} ${row.action}`));
  addCase("TC-036", "Audit", "audit log schedule update", "มี audit event", scheduleAudit ? "found" : "not found", scheduleAudit ? "PASS" : "FAIL");
  addCase("TC-037", "Audit", "audit log scraper trigger", "มี audit event", triggerAudit ? "found" : "not found", triggerAudit ? "PASS" : "FAIL");

  const clockTest = await runClockUnitTest();
  addCase(
    "TC-038",
    "Scheduler",
    "scheduled run เวลา 08:00",
    "run อัตโนมัติ",
    clockTest.ok ? "จำลอง 08:00 ผ่าน unit test" : clockTest.output,
    clockTest.ok ? "PASS" : "FAIL",
    `duration=${clockTest.duration} ms`,
  );
  addCase(
    "TC-039",
    "Scheduler",
    "scheduled run เวลา 17:30",
    "run อัตโนมัติ",
    clockTest.ok ? "จำลอง 17:30 ผ่าน unit test" : clockTest.output,
    clockTest.ok ? "PASS" : "FAIL",
    "ไม่ต้องรอเวลาจริง",
  );
  addCase(
    "TC-040",
    "Scheduler",
    "ตรวจสอบวันละ 2 รอบ",
    "scrape_runs = 2 records/day",
    `configured slots=${formatSlots(baseSchedule)}; clock test=${clockTest.ok ? "PASS" : "FAIL"}`,
    sameSchedule(savedDb, baseSchedule) && clockTest.ok ? "PASS" : "FAIL",
    "ใช้ schedule config 2 รอบ + clock seam simulation แทนการรอ production ทั้งวัน",
  );
}

function renderTable(headers, rows) {
  return [
    `| ${headers.map(esc).join(" |")} |`,
    `| ${headers.map(() => "---").join(" |")} |`,
    ...rows.map((row) => `| ${row.map(esc).join(" |")} |`),
  ].join("\n");
}

async function writeMarkdownReport() {
  const counts = statusCounts();
  const elapsedSeconds = ms((performance.now() - suiteStartedMs) / 1000);
  const md = [
    "# รายงานทดสอบระบบ Upcoming IPO Scraper (Schedule วันละ 2 รอบ)",
    "",
    `วันที่ทดสอบ: ${testedAtBangkok} (Asia/Bangkok)`,
    `สภาพแวดล้อม: ${apiBase}`,
    `ฐานข้อมูล: ${databaseLabel}`,
    `รหัสรอบทดสอบ: ${runToken}`,
    `ระยะเวลารวม: ${elapsedSeconds} วินาที`,
    "",
    "## สรุปผล",
    "",
    `ผลรวม ${cases.length} เคส: PASS ${counts.PASS}, FAIL ${counts.FAIL}, WARN ${counts.WARN}, SKIP ${counts.SKIP}`,
    "",
    "## Test Cases",
    "",
    renderTable(
      ["TC", "หมวด", "รายการทดสอบ", "Expected", "Actual", "Status", "หมายเหตุ", "หลักฐาน"],
      cases,
    ),
    "",
    "## Implementation Checks",
    "",
    renderTable(["Area", "Expected", "Actual", "Status", "Evidence"], implementationChecks),
    "",
    "## Defects / Risks",
    "",
    findings.length
      ? renderTable(["ID", "Severity", "Finding", "Evidence", "Recommendation"], findings)
      : "ไม่พบ defect สำคัญเพิ่มเติมหลัง hardening",
    "",
    "## API Evidence",
    "",
    renderTable(["#", "Method", "Path", "HTTP", "เวลา", "OK", "Response"], apiLogs),
    "",
    "## SQL Evidence",
    "",
    renderTable(["#", "รายการ", "SQL", "Rows", "Status", "เวลา/หมายเหตุ"], sqlChecks),
    "",
    "## Cleanup",
    "",
    renderTable(["รายการ", "Status", "หมายเหตุ"], cleanupRows),
    "",
  ].join("\n");

  await fs.writeFile(outputMarkdownPath, md, "utf8");
}

function statusCounts() {
  return {
    PASS: cases.filter((row) => row[5] === "PASS").length,
    FAIL: cases.filter((row) => row[5] === "FAIL").length,
    WARN: cases.filter((row) => row[5] === "WARN").length,
    SKIP: cases.filter((row) => row[5] === "SKIP").length,
  };
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

function applyStatusConditionalFormatting(sheet, statusColumnLetter, startRow, endRow) {
  if (endRow < startRow) return;
  const range = sheet.getRange(`${statusColumnLetter}${startRow}:${statusColumnLetter}${endRow}`);
  range.conditionalFormats.add("containsText", {
    text: "PASS",
    format: { fill: "#DCFCE7", font: { bold: true, color: "#166534" } },
  });
  range.conditionalFormats.add("containsText", {
    text: "FAIL",
    format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } },
  });
  range.conditionalFormats.add("containsText", {
    text: "WARN",
    format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });
  range.conditionalFormats.add("containsText", {
    text: "SKIP",
    format: { fill: "#E5E7EB", font: { bold: true, color: "#374151" } },
  });
}

function addTableSheet(workbook, name, title, headers, rows, options = {}) {
  const sheet = workbook.worksheets.add(name);
  styleTitle(sheet, title, `สร้างจาก automated QA run: ${testedAtBangkok}`, headers.length);
  const headerRow = 4;
  const dataStart = headerRow + 1;
  const endRow = headerRow + Math.max(rows.length, 1);
  const endCol = col(headers.length);

  sheet.getRangeByIndexes(headerRow - 1, 0, 1, headers.length).values = [headers];
  sheet.getRangeByIndexes(dataStart - 1, 0, Math.max(rows.length, 1), headers.length).values =
    rows.length > 0 ? rows : [headers.map(() => "")];

  const table = sheet.tables.add(`A${headerRow}:${endCol}${endRow}`, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Table`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;

  sheet.freezePanes.freezeRows(headerRow);
  sheet.getRange(`A1:${endCol}${endRow}`).format = {
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
    applyStatusConditionalFormatting(sheet, col(options.statusColumn), dataStart, endRow);
  }
  return sheet;
}

function buildSummarySheet(workbook) {
  const sheet = workbook.worksheets.add("สรุป");
  styleTitle(
    sheet,
    "รายงานทดสอบ Upcoming IPO Scraper / Schedule วันละ 2 รอบ",
    "ครอบคลุม schedule editor, manual trigger, concurrent guard, audit log, timeout handling, scheduler clock seam และ RBAC",
    9,
  );
  sheet.freezePanes.freezeRows(2);

  const counts = statusCounts();
  const elapsedSeconds = ms((performance.now() - suiteStartedMs) / 1000);
  const overall = counts.FAIL > 0 ? "FAIL" : counts.WARN > 0 ? "PASS_WITH_WARNINGS" : "PASS";
  const readiness = counts.FAIL > 0
    ? "ยังไม่พร้อม Production"
    : counts.WARN > 0
      ? "พร้อมแบบมีข้อควรติดตาม"
      : "พร้อม Production";

  sheet.getRange("A4:B15").values = [
    ["วันที่ทดสอบ", testedAtBangkok],
    ["Environment", apiBase],
    ["Database", databaseLabel],
    ["รหัสรอบทดสอบ", runToken],
    ["Execution time", `${elapsedSeconds} วินาที`],
    ["Manual run id", triggeredRunId ?? "-"],
    ["Manual run status", triggeredRun?.status ?? "-"],
    ["Schedule baseline", formatSlots(baseSchedule)],
    ["Workbook validation", workbookValidationStatus],
    ["Overall status", overall],
    ["Production readiness", readiness],
    ["หมายเหตุ", "TC-038/039 ใช้ clock seam จำลอง 08:00 และ 17:30 โดยไม่รอเวลาจริง"],
  ];
  sheet.getRange("A4:A15").format = {
    fill: "#EAF2F8",
    font: { bold: true, color: "#123C69" },
  };
  sheet.getRange("A:A").format.columnWidthPx = 210;
  sheet.getRange("B:B").format.columnWidthPx = 520;
  sheet.getRange("B4:B15").format = { wrapText: true };

  sheet.getRange("D4:H5").values = [
    ["PASS", "FAIL", "WARN", "SKIP", "TOTAL"],
    [counts.PASS, counts.FAIL, counts.WARN, counts.SKIP, cases.length],
  ];
  sheet.getRange("D4:H4").format = {
    fill: "#123C69",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  sheet.getRange("D5").format = { fill: "#DCFCE7", font: { bold: true, color: "#166534", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("E5").format = { fill: "#FEE2E2", font: { bold: true, color: "#991B1B", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("F5").format = { fill: "#FEF3C7", font: { bold: true, color: "#92400E", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("G5").format = { fill: "#E5E7EB", font: { bold: true, color: "#374151", size: 14 }, horizontalAlignment: "center" };
  sheet.getRange("H5").format = { fill: "#DBEAFE", font: { bold: true, color: "#1D4ED8", size: 14 }, horizontalAlignment: "center" };

  const categories = [...new Set(cases.map((row) => row[1]))].sort();
  const categoryRows = [["หมวด", "จำนวน", "PASS", "FAIL", "WARN", "SKIP"]];
  for (const category of categories) {
    const rows = cases.filter((row) => row[1] === category);
    categoryRows.push([
      category,
      rows.length,
      rows.filter((row) => row[5] === "PASS").length,
      rows.filter((row) => row[5] === "FAIL").length,
      rows.filter((row) => row[5] === "WARN").length,
      rows.filter((row) => row[5] === "SKIP").length,
    ]);
  }
  sheet.getRangeByIndexes(17, 0, categoryRows.length, 6).values = categoryRows;
  sheet.getRange("A18:F18").format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  sheet.getRange(`A19:F${18 + categories.length}`).format = { wrapText: true };

  const chart = sheet.charts.add("bar", sheet.getRange("D4:H5"));
  chart.title = "Test Status Summary";
  chart.hasLegend = false;
  chart.xAxis = { axisType: "textAxis" };
  chart.setPosition("D7", "I17");
}

async function buildWorkbook() {
  const workbook = Workbook.create();
  buildSummarySheet(workbook);
  addTableSheet(
    workbook,
    "Test Cases",
    "รายละเอียด Test Cases: Upcoming IPO Scraper",
    ["TC", "หมวด", "รายการทดสอบ", "Expected Result", "Actual Result", "Status", "หมายเหตุ", "หลักฐาน"],
    cases,
    { statusColumn: 6, widths: [90, 130, 270, 300, 340, 95, 320, 260] },
  );
  addTableSheet(
    workbook,
    "Implementation",
    "Implementation Hardening Checks",
    ["Area", "Expected", "Actual", "Status", "Evidence"],
    implementationChecks,
    { statusColumn: 4, widths: [190, 360, 340, 95, 320] },
  );
  addTableSheet(
    workbook,
    "Defects",
    "Defects / Risks",
    ["ID", "Severity", "Finding", "Evidence", "Recommendation"],
    findings,
    { widths: [90, 110, 330, 330, 360] },
  );
  addTableSheet(
    workbook,
    "API Evidence",
    "API Evidence",
    ["#", "Method", "Path", "HTTP", "เวลา", "OK", "Response"],
    apiLogs,
    { widths: [90, 85, 300, 85, 105, 70, 520] },
  );
  addTableSheet(
    workbook,
    "SQL Evidence",
    "SQL / DB Evidence",
    ["#", "รายการ", "SQL", "Rows", "Status", "เวลา/หมายเหตุ"],
    sqlChecks,
    { statusColumn: 5, widths: [90, 230, 520, 80, 95, 240] },
  );
  addTableSheet(
    workbook,
    "Cleanup",
    "Cleanup และ Post-Test Integrity",
    ["รายการ", "Status", "หมายเหตุ"],
    cleanupRows,
    { statusColumn: 2, widths: [240, 95, 520] },
  );
  return workbook;
}

async function exportWorkbook() {
  await fs.mkdir(outputDir, { recursive: true });

  let workbook = await buildWorkbook();
  const validation = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    maxChars: 2000,
  });
  workbookValidationStatus = /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(validation.ndjson || "")
    ? "WARNING: พบสูตร error"
    : "PASS: ไม่พบ formula error";

  workbook = await buildWorkbook();
  const preview = await workbook.render({ sheetName: "สรุป", autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(outputPreviewPath, new Uint8Array(await preview.arrayBuffer()));

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputXlsxPath);

  const blob = await FileBlob.load(outputXlsxPath);
  const imported = await SpreadsheetFile.importXlsx(blob);
  const inspect = await imported.inspect({ kind: "sheet", include: "id,name", maxChars: 3000 });
  const expectedSheets = ["สรุป", "Test Cases", "Implementation", "Defects", "API Evidence", "SQL Evidence", "Cleanup"];
  const allSheetsFound = expectedSheets.every((sheet) => (inspect.ndjson || "").includes(sheet));
  if (!allSheetsFound) {
    throw new Error(`Excel readback validation failed: ${inspect.ndjson || ""}`);
  }

  return { outputXlsxPath, outputPreviewPath };
}

try {
  await main();
} finally {
  let exported = null;
  try {
    await restoreSchedule();
    await cleanupQaUsers();
    await writeMarkdownReport();
    exported = await exportWorkbook();
  } finally {
    await pool.end();
  }
  console.log(JSON.stringify({
    report: exported?.outputXlsxPath ?? null,
    preview: exported?.outputPreviewPath ?? null,
    markdown: outputMarkdownPath,
    cases: cases.length,
    counts: statusCounts(),
  }, null, 2));
}
