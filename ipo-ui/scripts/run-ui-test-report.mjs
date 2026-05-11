import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const appUrl = process.env.IPO_UI_URL || "http://localhost:3000";
const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const fallbackEdgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(repoRoot, "outputs", `ui-regression-${runStamp}`);
const reportPath = path.join(outputDir, "ipo_ui_regression_report.xlsx");
const screenshotPath = path.join(outputDir, "last_case_summary.png");
const cdpPort = Number(
  process.env.CDP_PORT || 9300 + Math.floor(Math.random() * 500),
);

const DATA_FILES = {
  base: path.join(repoRoot, "src", "app", "data", "base.csv"),
  sector: path.join(repoRoot, "src", "app", "data", "df_sector.csv"),
  faCompanyNorm: path.join(repoRoot, "src", "app", "data", "fa_company_norm.csv"),
  financials: path.join(repoRoot, "src", "app", "data", "financials.csv"),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];

    if (quoted) {
      if (c === '"' && n === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift() ?? [];
  return rows
    .filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
    .map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
    );
}

async function readCSV(file) {
  return parseCSV(await fs.readFile(file, "utf8"));
}

function firstCsvValue(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)[0] || "";
}

function isMeaningful(value) {
  const s = String(value || "").trim().toUpperCase();
  return Boolean(s) && !["N.A.", "N/A", "NA", "-", "NONE", "NULL"].includes(s);
}

function parsePythonList(value) {
  const s = String(value || "");
  const matches = [...s.matchAll(/'([^']*)'/g)].map((m) => m[1].trim()).filter(Boolean);
  if (matches.length) return matches;
  return s ? [s] : [];
}

function cleanNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? String(value).trim() : "";
}

function extractSector(row) {
  if (!row) return "";
  const sectorKey = Object.keys(row).find((k) => k.startsWith("Sector"));
  const industryKey = Object.keys(row).find((k) => k.startsWith("Industry Group"));
  const sector = sectorKey ? String(row[sectorKey] || "").trim() : "";
  if (sector && sector !== "-") return sector;
  return industryKey ? String(row[industryKey] || "").trim() : "";
}

async function loadTestCases(limit = 20) {
  const [baseRows, sectorRows, financialRows, faNormRows] = await Promise.all([
    readCSV(DATA_FILES.base),
    readCSV(DATA_FILES.sector),
    readCSV(DATA_FILES.financials),
    readCSV(DATA_FILES.faCompanyNorm),
  ]);

  const sectorBySymbol = new Map(sectorRows.map((r) => [r.symbol, r]));
  const financialBySymbol = new Map(financialRows.map((r) => [r.symbol, r]));
  const faNormByOriginal = new Map(
    faNormRows
      .filter((r) => r.fa_companies && r.fa_company_norm)
      .map((r) => [String(r.fa_companies).trim(), String(r.fa_company_norm).trim()]),
  );
  const requiredFinancialKeys = [
    "gross_proceeds",
    "total_expense",
    "offered_shares",
    "offered_ratio_pct",
    "existing_shares_pct",
    "executive_total_pct",
    "total_liabilities",
    "total_equity",
    "net_income_latest",
  ];

  const cases = [];
  for (const base of baseRows) {
    const financial = financialBySymbol.get(base.symbol);
    if (!financial) continue;

    const faPerson = firstCsvValue(base.fa_persons);
    const faCompanyRaw = firstCsvValue(base.fa_companies);
    const faCompany = faNormByOriginal.get(faCompanyRaw) || faCompanyRaw;
    const leadUnderwriter = parsePythonList(base.lead_underwriters_norm)[0] || "";
    const coUnderwriters = parsePythonList(base.co_underwriters_norm).slice(0, 2);
    const sector = extractSector(sectorBySymbol.get(base.symbol));

    const hasRequired =
      base.symbol &&
      cleanNumber(base.ipo_price) &&
      isMeaningful(faPerson) &&
      isMeaningful(faCompany) &&
      leadUnderwriter &&
      coUnderwriters.length > 0 &&
      sector &&
      requiredFinancialKeys.every((k) => cleanNumber(financial[k]));

    if (!hasRequired) continue;

    cases.push({
      symbol: base.symbol,
      faPerson,
      faCompany,
      leadUnderwriter,
      coUnderwriters,
      ipoPrice: cleanNumber(base.ipo_price),
      grossProceeds: cleanNumber(financial.gross_proceeds),
      totalExpense: cleanNumber(financial.total_expense),
      offeredShares: cleanNumber(financial.offered_shares),
      offeredRatio: cleanNumber(financial.offered_ratio_pct),
      existingPct: cleanNumber(financial.existing_shares_pct),
      totalLiabilities: cleanNumber(financial.total_liabilities),
      totalEquity: cleanNumber(financial.total_equity),
      netIncome: cleanNumber(financial.net_income_latest),
      executivePct: cleanNumber(financial.executive_total_pct),
      sector,
    });

    if (cases.length >= limit) break;
  }

  const selectedCases = process.env.TEST_SYMBOL
    ? cases.filter((testCase) => testCase.symbol === process.env.TEST_SYMBOL)
    : cases;

  return {
    cases: selectedCases.slice(0, limit),
    sourceCounts: {
      baseRows: baseRows.length,
      sectorRows: sectorRows.length,
      financialRows: financialRows.length,
      faCompanyNormRows: faNormRows.length,
      eligibleCases: cases.length,
    },
  };
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ""}`));
        else resolve(msg.result ?? {});
        return;
      }
      this.events.push(msg);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  close() {
    this.ws.close();
  }
}

async function connectCDP() {
  const pageInfo = await waitForChromePage();
  const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Input.setIgnoreInputEvents", { ignore: false }).catch(() => {});
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__uiTestErrors = [];
      window.addEventListener('error', (event) => {
        window.__uiTestErrors.push(String(event.message || event.error || 'unknown error'));
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__uiTestErrors.push(String(event.reason || 'unhandled rejection'));
      });
      const originalError = console.error;
      console.error = function(...args) {
        window.__uiTestErrors.push(args.map(String).join(' '));
        return originalError.apply(console, args);
      };
    `,
  });
  return cdp;
}

async function waitForChromePage() {
  const deadline = Date.now() + 20000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent("about:blank")}`, {
        method: "PUT",
      });
      if (response.ok) return await response.json();
      lastError = new Error(`CDP /json/new HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError ?? new Error("Chrome CDP did not start");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function navigateAndWait(cdp, url) {
  await cdp.send("Page.navigate", { url });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      cdp,
      `(() => document.readyState === 'complete' && document.querySelectorAll('input').length >= 15)()`,
    ).catch(() => false);
    if (ready) return;
    await sleep(200);
  }
  throw new Error("Page did not become ready with expected inputs");
}

async function focusCoInput(cdp) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const input = [...document.querySelectorAll('input')]
        .find((i) => (i.placeholder || '').includes('Co Underwriter'));
      if (!input) return false;
      input.scrollIntoView({ block: 'center' });
      input.focus();
      return true;
    })()`,
  );
  if (!ok) throw new Error("CO_UNDERWRITER input not found");
}

async function commitCoValues(cdp, values) {
  await focusCoInput(cdp);
  for (const value of values) {
    await cdp.send("Input.insertText", { text: value });
    await sleep(250);
    const clicked = await evaluate(
      cdp,
      `(() => {
        const value = ${JSON.stringify(value)};
        const options = [...document.querySelectorAll('[role="option"]')];
        const exact = options.find((option) => option.textContent.trim() === value);
        const partial = options.find((option) => option.textContent.includes(value));
        const target = exact || partial;
        if (!target) return false;
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }));
        target.click();
        return true;
      })()`,
    ).catch(() => false);
    if (!clicked) {
      await pressKey(cdp, "Enter", 13);
    }
    await sleep(150);
  }
}

async function pressKey(cdp, key, keyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

async function focusNamedInput(cdp, name) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const textInputs = [...document.querySelectorAll('input')]
        .filter((i) => i.type === 'text' || i.getAttribute('role') === 'combobox');
      const byPlaceholder = (fragment) =>
        textInputs.find((i) => (i.placeholder || '').includes(fragment));
      const input =
        ${JSON.stringify(name)} === 'faPerson' ? byPlaceholder('FA Person') :
        ${JSON.stringify(name)} === 'faCompany' ? byPlaceholder('FA Company') :
        ${JSON.stringify(name)} === 'leadUnderwriter' ? byPlaceholder('Lead Underwriter') :
        null;
      if (!input) return false;
      input.scrollIntoView({ block: 'center' });
      input.focus();
      return true;
    })()`,
  );
  if (!ok) throw new Error(`Input not found: ${name}`);
}

async function focusFundamentalInput(cdp, index) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const textInputs = [...document.querySelectorAll('input')]
        .filter((i) => i.type === 'text' || i.getAttribute('role') === 'combobox');
      const byPlaceholder = (fragment) =>
        textInputs.find((i) => (i.placeholder || '').includes(fragment));
      const faPerson = byPlaceholder('FA Person');
      const faCompany = byPlaceholder('FA Company');
      const lead = byPlaceholder('Lead Underwriter');
      const co = byPlaceholder('Co Underwriter');
      const fundamentalInputs = textInputs.filter((i) =>
        i !== faPerson &&
        i !== faCompany &&
        i !== lead &&
        i !== co &&
        i.offsetParent !== null
      );
      const input = fundamentalInputs[${index}];
      if (!input) return false;
      input.scrollIntoView({ block: 'center' });
      input.focus();
      return true;
    })()`,
  );
  if (!ok) throw new Error(`Fundamental input not found at index ${index}`);
}

async function typeIntoFocusedInput(cdp, value, pressEnter = false) {
  await cdp.send("Input.insertText", { text: String(value ?? "") });
  await sleep(40);
  if (!pressEnter) return;
  await pressKey(cdp, "Enter", 13);
  await sleep(120);
}

async function fillCase(cdp, testCase) {
  const result = {
    textInputCount: 15,
    faPerson: false,
    faCompany: false,
    leadUnderwriter: false,
    coInputFound: false,
    fundamentalCount: 11,
    fundamental: {},
  };

  for (const [name, value] of [
    ["faPerson", testCase.faPerson],
    ["faCompany", testCase.faCompany],
    ["leadUnderwriter", testCase.leadUnderwriter],
  ]) {
    await focusNamedInput(cdp, name);
    await typeIntoFocusedInput(cdp, value, name !== "faPerson");
    result[name] = true;
    await sleep(100);
  }

  await commitCoValues(cdp, testCase.coUnderwriters);
  result.coInputFound = true;

  const fundamentalValues = [
    ["ipoPrice", testCase.ipoPrice],
    ["grossProceeds", testCase.grossProceeds],
    ["totalExpense", testCase.totalExpense],
    ["offeredShares", testCase.offeredShares],
    ["offeredRatio", testCase.offeredRatio],
    ["existingPct", testCase.existingPct],
    ["totalLiabilities", testCase.totalLiabilities],
    ["totalEquity", testCase.totalEquity],
    ["netIncome", testCase.netIncome],
    ["executivePct", testCase.executivePct],
    ["sector", testCase.sector],
  ];

  for (let i = 0; i < fundamentalValues.length; i += 1) {
    const [key, value] = fundamentalValues[i];
    await focusFundamentalInput(cdp, i);
    await typeIntoFocusedInput(cdp, value);
    result.fundamental[key] = true;
    await sleep(40);
  }

  await sleep(250);
  return result;
}

async function collectFieldStatus(cdp, testCase) {
  const payload = JSON.stringify(testCase).replace(/</g, "\\u003c");
  return evaluate(
    cdp,
    `(() => {
      const data = ${payload};
      const norm = (v) => String(v ?? '').replace(/\\s+/g, ' ').trim();
      const textInputs = [...document.querySelectorAll('input')]
        .filter((i) => i.type === 'text' || i.getAttribute('role') === 'combobox');
      const byPlaceholder = (fragment) =>
        textInputs.find((i) => (i.placeholder || '').includes(fragment));
      const faPerson = byPlaceholder('FA Person');
      const faCompany = byPlaceholder('FA Company');
      const lead = byPlaceholder('Lead Underwriter');
      const co = byPlaceholder('Co Underwriter');
      const fundamentalInputs = textInputs.filter((i) =>
        i !== faPerson &&
        i !== faCompany &&
        i !== lead &&
        i !== co &&
        i.offsetParent !== null
      );
      const expectedFundamentals = [
        data.ipoPrice,
        data.grossProceeds,
        data.totalExpense,
        data.offeredShares,
        data.offeredRatio,
        data.existingPct,
        data.totalLiabilities,
        data.totalEquity,
        data.netIncome,
        data.executivePct,
        data.sector,
      ].map(String);
      const fundamentalMatches = expectedFundamentals.map((v, i) =>
        String(fundamentalInputs[i]?.value ?? '') === v
      );
      const bodyText = document.body.innerText || '';
      const coMatches = data.coUnderwriters.map((v) => bodyText.includes(v));
      const faPersonActual = String(faPerson?.value ?? '');
      const faCompanyActual = String(faCompany?.value ?? '');
      const leadActual = String(lead?.value ?? '');
      return {
        faPerson: norm(faPersonActual) === norm(data.faPerson) || bodyText.includes(data.faPerson),
        faCompany: norm(faCompanyActual) === norm(data.faCompany) || bodyText.includes(data.faCompany),
        leadUnderwriter: norm(leadActual) === norm(data.leadUnderwriter) || bodyText.includes(data.leadUnderwriter),
        coUnderwriters: coMatches,
        fundamentalMatches,
        actuals: {
          faPerson: faPersonActual,
          faCompany: faCompanyActual,
          leadUnderwriter: leadActual,
          coChipText: [...document.querySelectorAll('.MuiChip-label')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 20),
        },
        visibleTextLength: bodyText.length,
        errors: window.__uiTestErrors || [],
      };
    })()`,
  );
}

async function clickSummaryTabAndRead(cdp, label) {
  await evaluate(
    cdp,
    `(() => {
      const target = [...document.querySelectorAll('button[role="tab"]')]
        .find((button) => button.textContent.trim() === ${JSON.stringify(label)});
      if (!target) return false;
      target.click();
      return true;
    })()`,
  );
  await sleep(250);
  return evaluate(
    cdp,
    `(() => {
      const papers = [...document.querySelectorAll('.MuiPaper-root')];
      const summary = papers.filter((paper) => (paper.innerText || '').includes('Performance Summary')).at(-1);
      return summary ? summary.innerText : document.body.innerText;
    })()`,
  );
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function firstMatch(text, regex) {
  const m = String(text || "").match(regex);
  return m ? m[1] : "";
}

function parseObservedSummary(overallText, leadCoText, faText, fundamentalText) {
  const overallNorm = normalizeText(overallText);
  const leadCoNorm = normalizeText(leadCoText);
  const faNorm = normalizeText(faText);
  const fundamentalNorm = normalizeText(fundamentalText);
  return {
    overallDecision: firstMatch(overallNorm, /\b(BUY|NEUTRAL|AVOID)\b/),
    overallScore:
      firstMatch(overallNorm, /OVERALL SCORE\s+([0-9.]+)\s*\/\s*100/i) ||
      firstMatch(overallNorm, /OVERALL SCORE\):\s*([0-9.]+)\s*\/\s*100/i),
    leadCoDecision: firstMatch(leadCoNorm, /\b(BUY|NEUTRAL|AVOID)\b/),
    leadCoScore:
      firstMatch(leadCoNorm, /Score\s+([0-9.]+)\s*\/\s*100/i) ||
      firstMatch(leadCoNorm, /Score:\s*([0-9.]+)\s*\/\s*100/i),
    leadCoRecommendation:
      firstMatch(leadCoNorm, /คำแนะนำจาก Lead-Co\s+(.+?)\s+Score/i) ||
      firstMatch(leadCoNorm, /(แนะนำให้เข้าลงทุน IPO ตัวนี้|ไม่แนะนำให้เข้าลงทุน IPO ตัวนี้)/),
    faDecision: firstMatch(faNorm, /\b(BUY|AVOID|NEUTRAL)\b/),
    fundamentalScore:
      firstMatch(fundamentalNorm, /Fundamental Score\s+([0-9.]+)\s*\/\s*100/i) ||
      firstMatch(fundamentalNorm, /([0-9.]+)\s*\/\s*100/),
    overallText: overallNorm.slice(0, 1200),
    leadCoText: leadCoNorm.slice(0, 1200),
    faText: faNorm.slice(0, 900),
    fundamentalText: fundamentalNorm.slice(0, 900),
  };
}

function listFailedFields(fieldStatus) {
  const names = [];
  if (!fieldStatus.faPerson) names.push("FA_PERSON");
  if (!fieldStatus.faCompany) names.push("FA_COMPANY");
  if (!fieldStatus.leadUnderwriter) names.push("LEAD_UNDERWRITER");
  (fieldStatus.coUnderwriters || []).forEach((ok, index) => {
    if (!ok) names.push(`CO_UNDERWRITER_${index + 1}`);
  });
  const fundamentalNames = [
    "IPO_PRICE",
    "GROSS_PROCEEDS",
    "TOTAL_EXPENSE",
    "OFFERED_SHARES",
    "OFFERED_RATIO",
    "EXISTING_PCT",
    "TOTAL_LIABILITIES",
    "TOTAL_EQUITY",
    "NET_INCOME",
    "EXECUTIVE_PCT",
    "SECTOR",
  ];
  (fieldStatus.fundamentalMatches || []).forEach((ok, index) => {
    if (!ok) names.push(fundamentalNames[index] || `FUNDAMENTAL_${index + 1}`);
  });
  return names;
}

async function runSingleCase(cdp, testCase, index) {
  const start = Date.now();
  const caseUrl = `${appUrl}?uiTest=${encodeURIComponent(testCase.symbol)}&run=${index}`;
  await navigateAndWait(cdp, caseUrl);
  const fillResult = await fillCase(cdp, testCase);
  await sleep(600);
  const fieldStatus = await collectFieldStatus(cdp, testCase);

  const overallText = await clickSummaryTabAndRead(cdp, "Overall");
  const faText = await clickSummaryTabAndRead(cdp, "FA");
  const leadCoText = await clickSummaryTabAndRead(cdp, "Lead-Co");
  const fundamentalText = await clickSummaryTabAndRead(cdp, "Fundamental");
  const observed = parseObservedSummary(overallText, leadCoText, faText, fundamentalText);

  const allFieldsFilled =
    fieldStatus.faPerson &&
    fieldStatus.faCompany &&
    fieldStatus.leadUnderwriter &&
    fieldStatus.coUnderwriters.every(Boolean) &&
    fieldStatus.fundamentalMatches.every(Boolean);
  const noRuntimeErrors = (fieldStatus.errors ?? []).length === 0;
  const hasSummary = Boolean(observed.overallDecision || observed.overallScore || observed.leadCoScore);
  const failedFields = listFailedFields(fieldStatus);
  const bugs = [
    ...(allFieldsFilled ? [] : [`Field mismatch: ${failedFields.join(", ")}`]),
    ...(noRuntimeErrors ? [] : [`Runtime errors: ${(fieldStatus.errors ?? []).slice(0, 3).join(" | ")}`]),
    ...(hasSummary ? [] : ["Summary output not found"]),
  ];

  if (index === 20) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await fs.writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
  }

  return {
    testNo: index,
    symbol: testCase.symbol,
    executionStatus: "DONE",
    allFieldsFilled,
    noRuntimeErrors,
    hasSummary,
    failedFields,
    bugs,
    bugCount: bugs.length,
    runtimeMs: Date.now() - start,
    issue: bugs.join("; "),
    fillResult,
    fieldStatus,
    observed,
    input: testCase,
  };
}

function sheetWrite(sheet, startCell, rows) {
  if (!rows.length) return;
  sheet.getRange(startCell).writeValues(rows);
}

function styleHeader(range) {
  range.format = {
    fill: "#0A1929",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
}

function styleTitle(range) {
  range.format = {
    fill: "#E0F2FE",
    font: { bold: true, color: "#0A1929", size: 16 },
  };
}

async function buildWorkbook(results, testCases, sourceCounts, meta) {
  const workbook = Workbook.create();

  const summary = workbook.worksheets.add("Summary");
  const resultsSheet = workbook.worksheets.add("Test Results");
  const inputSheet = workbook.worksheets.add("Input Cases");
  const textSheet = workbook.worksheets.add("Observed Text");
  const sourcesSheet = workbook.worksheets.add("Sources");

  for (const sheet of [summary, resultsSheet, inputSheet, textSheet, sourcesSheet]) {
    sheet.showGridLines = false;
  }

  const bugRuns = results.filter((r) => r.bugCount > 0).length;
  const cleanRuns = results.length - bugRuns;
  const avgRuntime = results.reduce((s, r) => s + r.runtimeMs, 0) / Math.max(1, results.length);
  const decisions = ["BUY", "NEUTRAL", "AVOID"].map((d) => [
    d,
    results.filter((r) => r.observed.overallDecision === d).length,
  ]);

  summary.getRange("A1:H1").merge();
  summary.getRange("A1").values = [["IPO UI Regression Test Report"]];
  styleTitle(summary.getRange("A1:H1"));
  sheetWrite(summary, "A3", [
    ["Generated At", meta.generatedAt],
    ["Application URL", meta.appUrl],
    ["Browser", meta.browser],
    ["Test Iterations", results.length],
    ["Runs Without Detected Bug", cleanRuns],
    ["Runs With Detected Bug", bugRuns],
    ["Bug Run Rate", results.length ? bugRuns / results.length : 0],
    ["Average Runtime (ms)", Math.round(avgRuntime)],
    ["Browser-use Note", meta.browserUseNote],
  ]);
  summary.getRange("A3:A11").format = { font: { bold: true }, fill: "#F1F5F9" };
  summary.getRange("B9").format.numberFormat = "0.0%";
  summary.getRange("A13:B16").values = [["Overall Decision", "Count"], ...decisions];
  styleHeader(summary.getRange("A13:B13"));
  const chart = summary.charts.add("bar", summary.getRange("A13:B16"));
  chart.title = "Overall Decision Distribution";
  chart.hasLegend = false;
  chart.xAxis = { axisType: "textAxis" };
  chart.setPosition("D3", "H16");
  summary.getRange("A:H").format.autofitColumns();

  const resultRows = [
    [
      "Test #",
      "Symbol",
      "Execution Status",
      "All Fields Filled",
      "No Runtime Errors",
      "Summary Found",
      "Overall Decision",
      "Overall Score",
      "Lead-Co Decision",
      "Lead-Co Score",
      "Lead-Co Recommendation",
      "Fundamental Score",
      "Runtime (ms)",
      "Bug Count",
      "Failed Fields",
      "Detected Bugs",
    ],
    ...results.map((r) => [
      r.testNo,
      r.symbol,
      r.executionStatus,
      r.allFieldsFilled,
      r.noRuntimeErrors,
      r.hasSummary,
      r.observed.overallDecision,
      r.observed.overallScore ? Number(r.observed.overallScore) : null,
      r.observed.leadCoDecision,
      r.observed.leadCoScore ? Number(r.observed.leadCoScore) : null,
      r.observed.leadCoRecommendation,
      r.observed.fundamentalScore ? Number(r.observed.fundamentalScore) : null,
      r.runtimeMs,
      r.bugCount,
      r.failedFields.join(", "),
      r.bugs.join("; "),
    ]),
  ];
  sheetWrite(resultsSheet, "A1", resultRows);
  styleHeader(resultsSheet.getRange("A1:O1"));
  resultsSheet.freezePanes.freezeRows(1);
  resultsSheet.tables.add(`A1:O${resultRows.length}`, true, "UiTestResults");
  resultsSheet.getRange("A:O").format.autofitColumns();
  resultsSheet.getRange("K:O").format = { wrapText: true };

  const inputRows = [
    [
      "Test #",
      "Symbol",
      "FA Person",
      "FA Company",
      "Lead Underwriter",
      "Co Underwriters",
      "IPO Price",
      "Gross Proceeds",
      "Total Expense",
      "Offered Shares",
      "Offered Ratio %",
      "Existing Shares %",
      "Total Liabilities",
      "Total Equity",
      "Net Income",
      "Executive %",
      "Sector",
    ],
    ...testCases.map((c, i) => [
      i + 1,
      c.symbol,
      c.faPerson,
      c.faCompany,
      c.leadUnderwriter,
      c.coUnderwriters.join(", "),
      Number(c.ipoPrice),
      Number(c.grossProceeds),
      Number(c.totalExpense),
      Number(c.offeredShares),
      Number(c.offeredRatio),
      Number(c.existingPct),
      Number(c.totalLiabilities),
      Number(c.totalEquity),
      Number(c.netIncome),
      Number(c.executivePct),
      c.sector,
    ]),
  ];
  sheetWrite(inputSheet, "A1", inputRows);
  styleHeader(inputSheet.getRange("A1:Q1"));
  inputSheet.freezePanes.freezeRows(1);
  inputSheet.tables.add(`A1:Q${inputRows.length}`, true, "InputCases");
  inputSheet.getRange("A:Q").format.autofitColumns();
  inputSheet.getRange("C:F").format = { wrapText: true };

  const textRows = [
    ["Test #", "Symbol", "Overall Text", "Lead-Co Text", "FA Text", "Fundamental Text"],
    ...results.map((r) => [
      r.testNo,
      r.symbol,
      r.observed.overallText,
      r.observed.leadCoText,
      r.observed.faText,
      r.observed.fundamentalText,
    ]),
  ];
  sheetWrite(textSheet, "A1", textRows);
  styleHeader(textSheet.getRange("A1:F1"));
  textSheet.freezePanes.freezeRows(1);
  textSheet.getRange("C:F").format = { wrapText: true };
  textSheet.getRange("A:B").format.autofitColumns();
  textSheet.getRange("C:F").format.columnWidth = 55;

  sheetWrite(sourcesSheet, "A1", [
    ["Source", "Path / Count"],
    ["base.csv", DATA_FILES.base],
    ["df_sector.csv", DATA_FILES.sector],
    ["fa_company_norm.csv", DATA_FILES.faCompanyNorm],
    ["financials.csv", DATA_FILES.financials],
    ["base rows", sourceCounts.baseRows],
    ["sector rows", sourceCounts.sectorRows],
    ["financial rows", sourceCounts.financialRows],
    ["fa_company_norm rows", sourceCounts.faCompanyNormRows],
    ["eligible cases used", sourceCounts.eligibleCases],
    ["screenshot", screenshotPath],
  ]);
  styleHeader(sourcesSheet.getRange("A1:B1"));
  sourcesSheet.getRange("A:B").format.autofitColumns();

  const renderRanges = {
    Summary: "A1:H18",
    "Test Results": `A1:O${Math.min(resultRows.length, 26)}`,
    "Input Cases": `A1:Q${Math.min(inputRows.length, 26)}`,
    "Observed Text": `A1:F${Math.min(textRows.length, 8)}`,
    Sources: "A1:B11",
  };
  for (const [sheetName, range] of Object.entries(renderRanges)) {
    await workbook.render({ sheetName, range, scale: 1, format: "png" });
  }

  const inspectSummary = await workbook.inspect({
    kind: "table",
    range: "Summary!A1:H16",
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 10,
  });
  const errorScan = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 50 },
    summary: "formula error scan",
  });

  await fs.mkdir(outputDir, { recursive: true });
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(reportPath);

  return {
    reportPath,
    inspectSummary: inspectSummary.ndjson,
    errorScan: errorScan.ndjson,
  };
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const browserPath = await fs
    .access(chromePath)
    .then(() => chromePath)
    .catch(async () => {
      await fs.access(fallbackEdgePath);
      return fallbackEdgePath;
    });

  const requestedLimit = Number(process.env.TEST_LIMIT || 20);
  const { cases, sourceCounts } = await loadTestCases(requestedLimit);
  if (cases.length < 20) {
    if (!process.env.TEST_LIMIT) {
      throw new Error(`Only ${cases.length} eligible cases found; need at least 20`);
    }
  }

  const userDataDir = path.join(outputDir, "chrome-profile");
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: "ignore",
    detached: false,
  });

  let cdp;
  const results = [];
  try {
    cdp = await connectCDP();
    for (let i = 0; i < cases.length; i += 1) {
      const result = await runSingleCase(cdp, cases[i], i + 1);
      results.push(result);
      console.log(
        `${String(i + 1).padStart(2, "0")}/${cases.length} ${result.symbol} ${result.executionStatus} ` +
          `overall=${result.observed.overallDecision || "-"} score=${result.observed.overallScore || "-"} ` +
          `${result.bugCount > 0 ? `bugs=${result.bugCount}` : "bugs=0"}`,
      );
      if (process.env.DEBUG_UI_TEST) {
        console.log(JSON.stringify({
          fillResult: result.fillResult,
          fieldStatus: result.fieldStatus,
          observed: {
            overallDecision: result.observed.overallDecision,
            overallScore: result.observed.overallScore,
            leadCoDecision: result.observed.leadCoDecision,
            leadCoScore: result.observed.leadCoScore,
          },
        }, null, 2));
      }
    }

    const workbookResult = await buildWorkbook(results, cases, sourceCounts, {
      generatedAt: new Date().toISOString(),
      appUrl,
      browser: browserPath,
      browserUseNote:
        "browser-use Node REPL could not initialize in this environment because its Node runtime is below the required version; Chrome CDP fallback was used for real page automation.",
    });

    console.log(JSON.stringify({
      reportPath: workbookResult.reportPath,
      screenshotPath,
      runCount: results.length,
      runsWithDetectedBug: results.filter((r) => r.bugCount > 0).length,
      runsWithoutDetectedBug: results.filter((r) => r.bugCount === 0).length,
      inspectSummary: workbookResult.inspectSummary.slice(0, 800),
      errorScan: workbookResult.errorScan.slice(0, 800),
    }, null, 2));
  } finally {
    if (cdp) cdp.close();
    browser.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
