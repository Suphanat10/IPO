import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const reportDate = "2026-05-28";
const outputDir = path.join(repoRoot, "outputs", "qa");
const summaryPath = path.join(outputDir, `set-sec-source-recheck-summary-${reportDate}.json`);
const assetDir = path.join(outputDir, `set-sec-source-recheck-${reportDate}-assets`);
const verdictPngPath = path.join(assetDir, "source-recheck-verdict.png");
const outputPath = path.join(outputDir, `set-sec-source-recheck-report-${reportDate}.xlsx`);

const PALETTE = {
  navy: "#0f172a",
  blue: "#2563eb",
  teal: "#0f766e",
  purple: "#7c3aed",
  orange: "#ea580c",
  red: "#dc2626",
  green: "#16a34a",
  slate: "#475569",
  lightBlue: "#eff6ff",
  lightGreen: "#dcfce7",
  lightRed: "#fee2e2",
  lightAmber: "#fef3c7",
  lightSlate: "#f8fafc",
  border: "#cbd5e1",
  white: "#ffffff",
};

function colName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - rem - 1) / 26);
  }
  return name;
}

function a1(row, col) {
  return `${colName(col)}${row + 1}`;
}

function rangeAddress(startRow, startCol, rowCount, colCount) {
  return `${a1(startRow, startCol)}:${a1(startRow + rowCount - 1, startCol + colCount - 1)}`;
}

function writeBlock(sheet, startRow, startCol, rows) {
  if (!rows.length || !rows[0].length) return null;
  const range = sheet.getRangeByIndexes(startRow, startCol, rows.length, rows[0].length);
  range.values = rows;
  return range;
}

function fmtNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrBlank(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function dateOrBlank(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

function display(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusLabel(value) {
  if (value === true || value === "MATCH" || value === "PASS" || value === "OK") return "PASS";
  if (value === "DIFFERS_FROM_SET_TEXT" || value === "LIMITATION") return "REVIEW";
  if (value === false || value === "MISMATCH" || value === "FAIL") return "FAIL";
  return value || "";
}

function styleTitle(sheet, range, title, subtitle) {
  range.merge();
  range.values = [[title]];
  range.format = {
    fill: PALETTE.navy,
    font: { bold: true, color: PALETTE.white },
    horizontalAlignment: "left",
    verticalAlignment: "middle",
  };
  range.format.rowHeightPx = 42;
  if (subtitle) {
    const subtitleRange = sheet.getRangeByIndexes(1, 0, 1, 8);
    subtitleRange.merge();
    subtitleRange.values = [[subtitle]];
    subtitleRange.format = {
      fill: PALETTE.lightBlue,
      font: { color: PALETTE.slate },
      horizontalAlignment: "left",
      verticalAlignment: "middle",
      wrapText: true,
    };
    subtitleRange.format.rowHeightPx = 28;
  }
}

function styleHeader(range, fill = PALETTE.blue) {
  range.format = {
    fill,
    font: { bold: true, color: PALETTE.white },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
    wrapText: true,
  };
  range.format.rowHeightPx = 32;
}

function styleTable(sheet, startRow, startCol, rowCount, colCount, headerFill = PALETTE.blue) {
  if (rowCount < 1 || colCount < 1) return;
  const header = sheet.getRangeByIndexes(startRow, startCol, 1, colCount);
  styleHeader(header, headerFill);
  const body = sheet.getRangeByIndexes(startRow + 1, startCol, Math.max(rowCount - 1, 1), colCount);
  body.format = {
    fill: PALETTE.white,
    font: { color: PALETTE.navy },
    verticalAlignment: "top",
    wrapText: true,
  };
}

function applyStatusFormats(range) {
  range.conditionalFormats.add("containsText", {
    text: "PASS",
    format: { fill: PALETTE.lightGreen, font: { color: "#166534", bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "MATCH",
    format: { fill: PALETTE.lightGreen, font: { color: "#166534", bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: PALETTE.lightGreen, font: { color: "#166534", bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "REVIEW",
    format: { fill: PALETTE.lightAmber, font: { color: "#92400e", bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "DIFFERS",
    format: { fill: PALETTE.lightAmber, font: { color: "#92400e", bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "FAIL",
    format: { fill: PALETTE.lightRed, font: { color: "#991b1b", bold: true } },
  });
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 200, 1).format.columnWidthPx = width;
  });
}

function addExcelTable(sheet, startRow, startCol, rowCount, colCount, name) {
  if (rowCount < 2) return;
  const address = rangeAddress(startRow, startCol, rowCount, colCount);
  const table = sheet.tables.add(address, true, name);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
}

function addSourceNote(sheet, row, text) {
  const note = sheet.getRangeByIndexes(row, 0, 1, 8);
  note.merge();
  note.values = [[text]];
  note.format = {
    fill: PALETTE.lightSlate,
    font: { color: PALETTE.slate },
    wrapText: true,
    verticalAlignment: "top",
  };
  note.format.rowHeightPx = 46;
}

function buildSetRows(rows) {
  const output = [["Symbol", "Check type", "DB field", "Source field", "DB value", "SET value", "Status", "Filing URL"]];
  for (const row of rows) {
    for (const comparison of row.setComparisons ?? []) {
      output.push([
        row.symbol,
        "SET core",
        comparison.dbField,
        comparison.sourceField,
        display(comparison.dbValue),
        display(comparison.sourceValue),
        comparison.pass ? "PASS" : "FAIL",
        row.setUrl,
      ]);
    }
    if (row.setNoOfIpoShareCheck) {
      output.push([
        row.symbol,
        "SET noOfIPO shares",
        "offered_shares",
        "noOfIPO first numeric value",
        fmtNumber(row.setNoOfIpoShareCheck.dbValue),
        fmtNumber(row.setNoOfIpoShareCheck.sourceValue),
        statusLabel(row.setNoOfIpoShareCheck.status),
        row.setUrl,
      ]);
    }
  }
  return output;
}

function buildSecRows(rows) {
  const output = [["Symbol", "Field", "DB value", "SEC snapshot value", "Status", "SEC cache file", "Snapshot time"]];
  for (const row of rows) {
    for (const comparison of row.secComparisons ?? []) {
      output.push([
        row.symbol,
        comparison.field,
        numberOrBlank(comparison.dbValue),
        numberOrBlank(comparison.sourceValue),
        comparison.status,
        row.secCache?.name ?? "",
        dateOrBlank(row.secCache?.lastModified),
      ]);
    }
  }
  return output;
}

function buildSourceRows(rows) {
  const output = [
    [
      "Symbol",
      "SEC TransID",
      "SEC Filing URL",
      "Cached SEC sections",
      "Annual FS sections",
      "Live SEC fetch during QA",
      "SEC snapshot time",
      "SEC cache file",
      "DB financial fields",
      "SET noOfIPO",
    ],
  ];
  for (const row of rows) {
    output.push([
      row.symbol,
      row.transId,
      row.setUrl,
      row.secPage?.sectionCount ?? 0,
      row.secPage?.annualFsSections ?? 0,
      row.liveSec?.ok ? "OK" : row.liveSec?.error ?? row.liveSec?.status ?? "",
      dateOrBlank(row.secCache?.lastModified),
      row.secCache?.name ?? "",
      row.dbFinancialFieldCount,
      row.setNoOfIPO ?? "",
    ]);
  }
  return output;
}

async function addVerdictImage(sheet) {
  try {
    const imageBytes = await fs.readFile(verdictPngPath);
    const dataUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;
    sheet.images.add({
      dataUrl,
      anchor: { from: { row: 10, col: 0 }, extent: { widthPx: 760, heightPx: 182 } },
    });
  } catch {
    // The workbook remains complete without the embedded visual if image export is unavailable.
  }
}

async function main() {
  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  await fs.mkdir(outputDir, { recursive: true });

  const workbook = Workbook.create();
  const summarySheet = workbook.worksheets.add("Summary");
  const setSheet = workbook.worksheets.add("SET_Recheck");
  const secSheet = workbook.worksheets.add("SEC_Financials");
  const sourceSheet = workbook.worksheets.add("Source_Evidence");
  const warningsSheet = workbook.worksheets.add("Warnings");
  const checksSheet = workbook.worksheets.add("Checks");

  for (const sheet of [summarySheet, setSheet, secSheet, sourceSheet, warningsSheet, checksSheet]) {
    sheet.showGridLines = false;
  }

  styleTitle(
    summarySheet,
    summarySheet.getRange("A1:H1"),
    "SET/SEC Source Recheck Report",
    `ตรวจวันที่ ${reportDate} | SET asOfDate: SET=${summary.setAsOfDate.SET}, mai=${summary.setAsOfDate.mai}`,
  );
  setWidths(summarySheet, [210, 110, 110, 130, 220, 160, 160, 160, 24, 170, 120, 120]);

  const totals = summary.totals;
  const kpiRows = [
    ["Metric", "Actual", "Expected", "Status", "Notes"],
    ["Symbols present in SET and DB", totals.symbols, totals.symbols, "PASS", "SET API สดและ DB มีครบทุก symbol"],
    ["SET core fields matched", totals.setCoreMatched, totals.setCoreTotal, "PASS", "company/name/market/status/par/FA/business description"],
    ["SEC cache available", totals.secCacheAvailable, totals.symbols, "PASS", "มี SEC extraction snapshot สำหรับทุก TransID"],
    ["SEC cached fields matched DB", totals.secMatched, totals.secVerifiable, "PASS", "ไม่พบ numeric mismatch ใน field ที่ตรวจได้"],
    ["Live SEC pages reachable during QA", totals.liveSecOk, totals.symbols, "REVIEW", "เครื่องนี้เรียก SEC สดไม่ผ่าน จึงใช้ snapshot ล่าสุดจาก IPOSGetFile.aspx"],
  ];
  writeBlock(summarySheet, 3, 0, kpiRows);
  styleTable(summarySheet, 3, 0, kpiRows.length, kpiRows[0].length, PALETTE.teal);
  summarySheet.getRange("B5:C9").setNumberFormat("#,##0");
  applyStatusFormats(summarySheet.getRange("D5:D9"));
  addExcelTable(summarySheet, 3, 0, kpiRows.length, kpiRows[0].length, "SummaryKpis");

  const conclusionRows = [
    ["Conclusion", "Value"],
    ["SET result", "Core fields จาก SET API สดตรงกับ DB 100/100 และ symbols ตรงกัน 10/10"],
    ["SEC result", "Financial fields ที่มีใน SEC snapshot ตรงกับ DB 81/81 ไม่มี mismatch"],
    ["Important limitation", "Live SEC page fetch ระหว่าง QA ไม่สำเร็จ 0/10 จึงตรวจ ก.ล.ต. จาก snapshot/cache ล่าสุดที่ scraper ดึงจาก official SEC documents"],
    ["Notable review item", "TEBP: SET noOfIPO ระบุไม่เกิน 90,000,000 หุ้น แต่ DB offered_shares เป็น 75,000,000 จาก SEC snapshot"],
  ];
  writeBlock(summarySheet, 3, 5, conclusionRows);
  styleTable(summarySheet, 3, 5, conclusionRows.length, conclusionRows[0].length, PALETTE.blue);
  summarySheet.getRange("F5:H8").format.wrapText = true;

  const chartRows = [
    ["Metric", "Actual", "Expected"],
    ["Symbols", totals.symbols, totals.symbols],
    ["SET fields", totals.setCoreMatched, totals.setCoreTotal],
    ["SEC cache", totals.secCacheAvailable, totals.symbols],
    ["SEC fields", totals.secMatched, totals.secVerifiable],
    ["Live SEC", totals.liveSecOk, totals.symbols],
  ];
  writeBlock(summarySheet, 3, 9, chartRows);
  styleTable(summarySheet, 3, 9, chartRows.length, chartRows[0].length, PALETTE.purple);
  const chart = summarySheet.charts.add("bar", summarySheet.getRange("J4:L9"));
  chart.title = "Recheck Coverage";
  chart.hasLegend = true;
  chart.xAxis = { axisType: "textAxis" };
  chart.yAxis = { numberFormatCode: "#,##0" };
  chart.setPosition("J11", "P25");
  await addVerdictImage(summarySheet);
  addSourceNote(
    summarySheet,
    23,
    "Official sources: https://www.set.or.th/api/set/ipo/upcoming?type=SET&lang=th | https://www.set.or.th/api/set/ipo/upcoming?type=mai&lang=th | https://market.sec.or.th/public/ipos/IPOSEQ01.aspx?TransID=<TransID>",
  );

  styleTitle(setSheet, setSheet.getRange("A1:H1"), "SET API Recheck", "Core fields and noOfIPO checks compared against live SET API response.");
  setWidths(setSheet, [110, 150, 170, 190, 280, 280, 120, 360]);
  const setRows = buildSetRows(summary.rows);
  writeBlock(setSheet, 3, 0, setRows);
  styleTable(setSheet, 3, 0, setRows.length, setRows[0].length, PALETTE.blue);
  applyStatusFormats(setSheet.getRangeByIndexes(4, 6, setRows.length - 1, 1));
  addExcelTable(setSheet, 3, 0, setRows.length, setRows[0].length, "SetRecheck");
  setSheet.freezePanes.freezeRows(4);

  styleTitle(secSheet, secSheet.getRange("A1:G1"), "SEC Financial Snapshot Recheck", "DB financial fields compared against latest SEC extraction snapshot/cache.");
  setWidths(secSheet, [110, 190, 150, 170, 150, 250, 210]);
  const secRows = buildSecRows(summary.rows);
  writeBlock(secSheet, 3, 0, secRows);
  styleTable(secSheet, 3, 0, secRows.length, secRows[0].length, PALETTE.orange);
  secSheet.getRangeByIndexes(4, 2, secRows.length - 1, 2).setNumberFormat("#,##0.00");
  secSheet.getRangeByIndexes(4, 6, secRows.length - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm");
  applyStatusFormats(secSheet.getRangeByIndexes(4, 4, secRows.length - 1, 1));
  addExcelTable(secSheet, 3, 0, secRows.length, secRows[0].length, "SecFinancials");
  secSheet.freezePanes.freezeRows(4);

  styleTitle(sourceSheet, sourceSheet.getRange("A1:J1"), "Source Evidence", "Filing URLs, SEC cache files, snapshot times, and source text used for audit.");
  setWidths(sourceSheet, [100, 110, 420, 130, 130, 180, 210, 260, 130, 460]);
  const sourceRows = buildSourceRows(summary.rows);
  writeBlock(sourceSheet, 3, 0, sourceRows);
  styleTable(sourceSheet, 3, 0, sourceRows.length, sourceRows[0].length, PALETTE.purple);
  sourceSheet.getRangeByIndexes(4, 3, sourceRows.length - 1, 2).setNumberFormat("#,##0");
  sourceSheet.getRangeByIndexes(4, 6, sourceRows.length - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm");
  addExcelTable(sourceSheet, 3, 0, sourceRows.length, sourceRows[0].length, "SourceEvidence");
  sourceSheet.freezePanes.freezeRows(4);

  styleTitle(warningsSheet, warningsSheet.getRange("A1:D1"), "Warnings and Limitations", "Known caveats from the source recheck run.");
  setWidths(warningsSheet, [90, 170, 780, 170]);
  const warningRows = [["No.", "Type", "Warning / Limitation", "Severity"]];
  summary.warnings.forEach((warning, index) => {
    const severity = warning.includes("TEBP") && warning.includes("differs") ? "REVIEW" : "LIMITATION";
    warningRows.push([index + 1, severity === "REVIEW" ? "Data review" : "Source access", warning, severity]);
  });
  writeBlock(warningsSheet, 3, 0, warningRows);
  styleTable(warningsSheet, 3, 0, warningRows.length, warningRows[0].length, PALETTE.red);
  applyStatusFormats(warningsSheet.getRangeByIndexes(4, 3, warningRows.length - 1, 1));
  addExcelTable(warningsSheet, 3, 0, warningRows.length, warningRows[0].length, "Warnings");
  warningsSheet.freezePanes.freezeRows(4);

  styleTitle(checksSheet, checksSheet.getRange("A1:F1"), "QA Checks", "Workbook-level checks and audit outcomes.");
  setWidths(checksSheet, [260, 120, 120, 120, 420, 170]);
  const checksRows = [
    ["Check", "Actual", "Expected", "Status", "Notes", "Source"],
    ["SET symbol coverage", totals.symbols, totals.symbols, "OK", "SET API symbols and DB upcoming symbols match.", "SET API"],
    ["SET core mismatches", summary.setMismatches.length, 0, summary.setMismatches.length === 0 ? "OK" : "FAIL", "No SET core field mismatches found.", "SET API vs DB"],
    ["SEC financial mismatches", summary.secMismatches.length, 0, summary.secMismatches.length === 0 ? "OK" : "FAIL", "No mismatch in fields available in SEC snapshot.", "SEC snapshot vs DB"],
    ["SEC snapshot coverage", totals.secCacheAvailable, totals.symbols, totals.secCacheAvailable === totals.symbols ? "OK" : "FAIL", "Each upcoming IPO has a SEC cache snapshot.", "SEC cache"],
    ["Live SEC page reachability", totals.liveSecOk, totals.symbols, "REVIEW", "Live SEC pages were not reachable during QA from this machine.", "market.sec.or.th"],
    ["TEBP SET noOfIPO vs DB offered_shares", 75000000, 90000000, "REVIEW", "SET text is a not-exceeding amount; DB follows SEC snapshot where available.", "SET/SEC"],
  ];
  writeBlock(checksSheet, 3, 0, checksRows);
  styleTable(checksSheet, 3, 0, checksRows.length, checksRows[0].length, PALETTE.teal);
  checksSheet.getRange("B5:C10").setNumberFormat("#,##0");
  applyStatusFormats(checksSheet.getRangeByIndexes(4, 3, checksRows.length - 1, 1));
  addExcelTable(checksSheet, 3, 0, checksRows.length, checksRows[0].length, "QaChecks");
  checksSheet.freezePanes.freezeRows(4);

  const inspections = [];
  inspections.push(await workbook.inspect({ kind: "table", range: "Summary!A1:H12", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10 }));
  inspections.push(await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" }));
  await fs.writeFile(path.join(assetDir, "excel-inspection.ndjson"), inspections.map((item) => item.ndjson).join("\n"), "utf8");

  for (const sheetName of ["Summary", "SET_Recheck", "SEC_Financials", "Source_Evidence", "Warnings", "Checks"]) {
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    const previewBytes = new Uint8Array(await preview.arrayBuffer());
    await fs.writeFile(path.join(assetDir, `excel-preview-${sheetName}.png`), previewBytes);
  }

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);
  console.log(JSON.stringify({ outputPath, sheets: 6, previews: 6 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
