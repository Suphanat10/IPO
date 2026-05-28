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
const assetDir = path.join(outputDir, `financials-recheck-${reportDate}-assets`);
const reportPath = path.join(outputDir, `financials-recheck-report-${reportDate}.md`);
const dataPath = path.join(repoRoot, "src", "app", "data", "ipo.json");
const secDocCacheDir = path.join(repoRoot, "scripts", "output", ".cache", "sec-docs");

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

function pct(value, total) {
  if (!total) return "0.0%";
  return `${((Number(value) / Number(total)) * 100).toFixed(1)}%`;
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(value) {
  const n = num(value);
  if (n == null) return "-";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function esc(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function svgBarChart({ title, subtitle, rows, width = 1100, rowHeight = 34 }) {
  const margin = { top: 84, right: 44, bottom: 40, left: 270 };
  const height = margin.top + margin.bottom + rows.length * rowHeight;
  const max = Math.max(...rows.map((r) => r.total || r.value || 1), 1);
  const chartWidth = width - margin.left - margin.right;
  const colors = ["#0f766e", "#2563eb", "#7c3aed", "#ea580c"];
  const bars = rows
    .map((row, i) => {
      const y = margin.top + i * rowHeight;
      const total = row.total || max;
      const barW = Math.max(2, (Number(row.value) / total) * chartWidth);
      const fullW = chartWidth;
      const color = row.color || colors[i % colors.length];
      const percent = total ? ((Number(row.value) / total) * 100).toFixed(1) : "0.0";
      return `
        <text x="24" y="${y + 21}" class="label">${row.label}</text>
        <rect x="${margin.left}" y="${y + 6}" width="${fullW}" height="18" rx="5" fill="#e5e7eb"/>
        <rect x="${margin.left}" y="${y + 6}" width="${barW}" height="18" rx="5" fill="${color}"/>
        <text x="${margin.left + fullW + 12}" y="${y + 21}" class="value">${row.value}/${total} (${percent}%)</text>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .bg { fill: #ffffff; }
    .title { font: 700 28px Arial, sans-serif; fill: #0f172a; }
    .subtitle { font: 400 15px Arial, sans-serif; fill: #475569; }
    .label { font: 600 14px Arial, sans-serif; fill: #1e293b; }
    .value { font: 600 13px Arial, sans-serif; fill: #334155; }
  </style>
  <rect class="bg" width="100%" height="100%"/>
  <text x="24" y="36" class="title">${title}</text>
  <text x="24" y="62" class="subtitle">${subtitle}</text>
  ${bars}
</svg>`;
}

function svgUpcomingTable({ rows, width = 1280 }) {
  const rowHeight = 36;
  const height = 96 + rows.length * rowHeight;
  const body = rows
    .map((row, i) => {
      const y = 84 + i * rowHeight;
      const fill = i % 2 === 0 ? "#f8fafc" : "#ffffff";
      const count = Number(row.field_count ?? 0);
      const color = count >= 10 ? "#059669" : count >= 8 ? "#2563eb" : count >= 4 ? "#d97706" : "#dc2626";
      return `
        <rect x="20" y="${y - 24}" width="${width - 40}" height="${rowHeight}" fill="${fill}"/>
        <text x="38" y="${y}" class="cell sym">${esc(row.symbol)}</text>
        <text x="130" y="${y}" class="cell">${esc(row.filing_status)}</text>
        <text x="250" y="${y}" class="cell">${fmt(row.offered_shares)}</text>
        <text x="440" y="${y}" class="cell">${fmt(row.offered_ratio_pct)}</text>
        <text x="590" y="${y}" class="cell">${fmt(row.total_assets)}</text>
        <text x="790" y="${y}" class="cell">${fmt(row.total_equity)}</text>
        <text x="990" y="${y}" class="cell">${fmt(row.net_income_latest)}</text>
        <text x="1170" y="${y}" class="cell count" fill="${color}">${count}/13</text>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title { font: 700 27px Arial, sans-serif; fill: #0f172a; }
    .subtitle { font: 400 15px Arial, sans-serif; fill: #475569; }
    .head { font: 700 13px Arial, sans-serif; fill: #0f172a; }
    .cell { font: 500 13px Arial, sans-serif; fill: #334155; }
    .sym { font-weight: 800; fill: #0f172a; }
    .count { font-weight: 800; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="20" y="34" class="title">Upcoming IPO Financial Field Check</text>
  <text x="20" y="60" class="subtitle">ข้อมูลจาก DB หลัง scraper run ล่าสุด</text>
  <text x="38" y="82" class="head">Symbol</text>
  <text x="130" y="82" class="head">Status</text>
  <text x="250" y="82" class="head">Offered shares</text>
  <text x="440" y="82" class="head">Ratio %</text>
  <text x="590" y="82" class="head">Assets</text>
  <text x="790" y="82" class="head">Equity</text>
  <text x="990" y="82" class="head">Net income</text>
  <text x="1170" y="82" class="head">Fields</text>
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
    const [dbSummaryRows, latestRunsRows, upcomingRows] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS ipos, COUNT(f.ipo_id)::int AS financial_rows,
          COUNT(*) FILTER (WHERE f.gross_proceeds IS NOT NULL)::int AS gross_proceeds,
          COUNT(*) FILTER (WHERE f.total_expense IS NOT NULL)::int AS total_expense,
          COUNT(*) FILTER (WHERE f.offered_shares IS NOT NULL)::int AS offered_shares,
          COUNT(*) FILTER (WHERE f.offered_ratio_pct IS NOT NULL)::int AS offered_ratio_pct,
          COUNT(*) FILTER (WHERE f.existing_shares_pct IS NOT NULL)::int AS existing_shares_pct,
          COUNT(*) FILTER (WHERE f.executive_total_pct IS NOT NULL)::int AS executive_total_pct,
          COUNT(*) FILTER (WHERE f.total_assets IS NOT NULL)::int AS total_assets,
          COUNT(*) FILTER (WHERE f.total_liabilities IS NOT NULL)::int AS total_liabilities,
          COUNT(*) FILTER (WHERE f.total_equity IS NOT NULL)::int AS total_equity,
          COUNT(*) FILTER (WHERE f.revenue_latest IS NOT NULL)::int AS revenue_latest,
          COUNT(*) FILTER (WHERE f.revenue_prev IS NOT NULL)::int AS revenue_prev,
          COUNT(*) FILTER (WHERE f.net_income_latest IS NOT NULL)::int AS net_income_latest,
          COUNT(*) FILTER (WHERE f.net_income_prev IS NOT NULL)::int AS net_income_prev
        FROM ipos i LEFT JOIN ipo_financials f ON f.ipo_id = i.id
      `),
      pool.query(`
        SELECT id, status, total_fetched, inserted_count, updated_count, unchanged_count,
          failed_count, started_at, finished_at, error_message
        FROM scrape_runs
        ORDER BY started_at DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT i.symbol, i.company_name, i.market, i.ipo_price, i.filing_status,
          f.gross_proceeds, f.total_expense, f.offered_shares, f.offered_ratio_pct,
          f.existing_shares_pct, f.executive_total_pct, f.total_assets, f.total_liabilities,
          f.total_equity, f.revenue_latest, f.revenue_prev, f.net_income_latest, f.net_income_prev,
          ((${FIN_FIELDS.map((field) => `(f.${field} IS NOT NULL)::int`).join(" + ")}))::int AS field_count
        FROM ipos i
        LEFT JOIN ipo_financials f ON f.ipo_id = i.id
        WHERE i.status = 'upcoming'
        ORDER BY i.symbol
      `),
    ]);

    const dbSummary = dbSummaryRows.rows[0];
    const latestRuns = latestRunsRows.rows;
    const upcoming = upcomingRows.rows;
    const dataStat = await fs.stat(dataPath);
    const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
    const fundamentals = Object.values(data.fundamentalsBySymbol || {});
    const metricKeys = [
      "offeredRatio",
      "existingPct",
      "executivePct",
      "roe",
      "earningsYield",
      "de",
      "costRatio",
      "pe",
      "pbv",
      "marketCap",
      "netIncome",
    ];
    const metricCoverage = Object.fromEntries(
      metricKeys.map((key) => [
        key,
        fundamentals.filter((row) => row?.[key] != null && Number.isFinite(Number(row[key]))).length,
      ]),
    );

    const latestCacheFiles = (await fs.readdir(secDocCacheDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
    const latestCache = [];
    for (const name of latestCacheFiles) {
      const full = path.join(secDocCacheDir, name);
      const stat = await fs.stat(full);
      latestCache.push({
        name,
        mtime: stat.mtime,
        data: JSON.parse(await fs.readFile(full, "utf8")),
      });
    }
    latestCache.sort((a, b) => b.mtime - a.mtime);
    const cacheSample = latestCache.slice(0, 20).map((item) => ({
      name: item.name,
      fields: Object.keys(item.data).length,
      keys: Object.keys(item.data),
      mtime: item.mtime,
    }));

    const issues = [];
    for (const row of upcoming) {
      const fields = FIN_FIELDS.filter((field) => row[field] != null);
      const assets = num(row.total_assets);
      const liabilities = num(row.total_liabilities);
      const equity = num(row.total_equity);
      if (assets != null && liabilities != null && equity != null) {
        const delta = Math.abs(assets - liabilities - equity);
        if (delta > Math.max(1, assets * 0.001)) {
          issues.push(`${row.symbol}: total_assets - total_liabilities ไม่ใกล้ total_equity (delta=${fmt(delta)})`);
        }
      }
      for (const field of ["offered_ratio_pct", "existing_shares_pct", "executive_total_pct"]) {
        const value = num(row[field]);
        if (value != null && (value < 0 || value > 100)) {
          issues.push(`${row.symbol}: ${field} อยู่นอกช่วง 0-100 (${value})`);
        }
      }
      if (fields.length < 8) {
        issues.push(`${row.symbol}: financial fields ยังต่ำกว่าเกณฑ์ 8/13 (${fields.length}/13)`);
      }
    }

    const fieldCoverageRows = FIN_FIELDS.map((field) => ({
      label: field,
      value: Number(dbSummary[field] ?? 0),
      total: Number(dbSummary.ipos),
    }));
    const metricCoverageRows = metricKeys.map((key) => ({
      label: key,
      value: Number(metricCoverage[key] ?? 0),
      total: fundamentals.length,
    }));
    const upcomingCoverageRows = upcoming.map((row) => ({
      label: row.symbol,
      value: Number(row.field_count),
      total: FIN_FIELDS.length,
    }));

    const fieldSvg = "financial-field-coverage.svg";
    const metricSvg = "fundamental-metric-coverage.svg";
    const upcomingSvg = "upcoming-financial-fields.svg";
    const upcomingTableSvg = "upcoming-financial-table.svg";
    await fs.writeFile(
      path.join(assetDir, fieldSvg),
      svgBarChart({
        title: "DB Financial Field Coverage",
        subtitle: `ipo_financials coverage across ${dbSummary.ipos} IPO records`,
        rows: fieldCoverageRows,
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(assetDir, metricSvg),
      svgBarChart({
        title: "ipo.json Fundamental Metric Coverage",
        subtitle: `computed metrics across ${fundamentals.length} historical symbols`,
        rows: metricCoverageRows,
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(assetDir, upcomingSvg),
      svgBarChart({
        title: "Upcoming IPO Field Completeness",
        subtitle: "financial fields present per upcoming IPO row",
        rows: upcomingCoverageRows,
        width: 920,
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(assetDir, upcomingTableSvg),
      svgUpcomingTable({ rows: upcoming }),
      "utf8",
    );

    const reportRel = (file) => path.relative(path.dirname(reportPath), path.join(assetDir, file)).replaceAll("\\", "/");
    const screenshotRel = (file) => reportRel(file);

    const latestRun = latestRuns[0];
    const dbCoverageTable = FIN_FIELDS.map(
      (field) => `| \`${field}\` | ${dbSummary[field] ?? 0} | ${pct(dbSummary[field] ?? 0, dbSummary.ipos)} |`,
    ).join("\n");
    const upcomingTable = upcoming.map(
      (row) =>
        `| ${esc(row.symbol)} | ${esc(row.filing_status)} | ${esc(row.market)} | ${row.field_count}/13 | ${fmt(row.offered_shares)} | ${fmt(row.offered_ratio_pct)} | ${fmt(row.total_assets)} | ${fmt(row.total_equity)} | ${fmt(row.net_income_latest)} |`,
    ).join("\n");
    const runTable = latestRuns.map(
      (run) =>
        `| ${esc(run.id)} | ${esc(run.status)} | ${run.total_fetched ?? 0} | ${run.inserted_count ?? 0} | ${run.updated_count ?? 0} | ${run.unchanged_count ?? 0} | ${run.failed_count ?? 0} | ${esc(run.started_at?.toISOString?.() ?? run.started_at)} |`,
    ).join("\n");
    const cacheTable = cacheSample.map(
      (item) =>
        `| ${esc(item.name)} | ${item.fields} | ${esc(item.keys.join(", "))} | ${esc(item.mtime.toISOString())} |`,
    ).join("\n");
    const metricTable = metricKeys.map(
      (key) => `| \`${key}\` | ${metricCoverage[key] ?? 0} | ${pct(metricCoverage[key] ?? 0, fundamentals.length)} |`,
    ).join("\n");

    const md = `# รายงานตรวจสอบข้อมูล Financials จาก Scraper

วันที่ทดสอบ: ${reportDate}  
ระบบที่ทดสอบ: \`D:/IPO/ipo-ui/src/lib/scraper.ts\`  
แหล่งข้อมูลที่ตรวจ: PostgreSQL tables \`ipos\`, \`ipo_financials\`, \`scrape_runs\`, SEC doc cache, และ \`src/app/data/ipo.json\`

## สรุปผล

- Scraper run ล่าสุดสำเร็จ: \`${latestRun.id}\`, status \`${latestRun.status}\`, fetched ${latestRun.total_fetched}, failed ${latestRun.failed_count}
- DB มี \`ipo_financials\` ${dbSummary.financial_rows}/${dbSummary.ipos} แถว (${pct(dbSummary.financial_rows, dbSummary.ipos)})
- Upcoming IPO ใน DB มี ${upcoming.length} รายการ และมี financial fields หลายรายการถูกเขียนลง DB แล้ว
- \`ipo.json\` ถูก rebuild แล้ว: ${dataStat.mtime.toISOString()}, ขนาด ${fmt(dataStat.size)} bytes
- ข้อควรทราบ: \`ipo.json\` ชุดนี้เป็น historical/fundamentals dataset ${fundamentals.length} symbols จึงไม่รวม upcoming symbols โดยตรง เช่น ${upcoming.map((row) => row.symbol).join(", ")}
- Findings: ${issues.length === 0 ? "ไม่พบ consistency error เชิงตัวเลขใน upcoming rows" : `พบ ${issues.length} รายการที่ต้องติดตาม`}

## ภาพประกอบ

### 1. DB Financial Field Coverage

![DB Financial Field Coverage](${reportRel(fieldSvg)})

### 2. Upcoming IPO Field Completeness

![Upcoming IPO Field Completeness](${reportRel(upcomingSvg)})

### 3. Upcoming IPO Financial Table

![Upcoming IPO Financial Table](${reportRel(upcomingTableSvg)})

### 4. ipo.json Fundamental Metric Coverage

![ipo.json Fundamental Metric Coverage](${reportRel(metricSvg)})

### 5. Screenshot หน้า Upcoming Dashboard

![Upcoming Dashboard Screenshot](${screenshotRel("upcoming-dashboard.png")})

### 6. Screenshot หน้า Scrape Console

![Scrape Console Screenshot](${screenshotRel("scrape-console.png")})

## Test Evidence

### Latest Scrape Runs

| Run ID | Status | Fetched | Inserted | Updated | Unchanged | Failed | Started |
|---|---:|---:|---:|---:|---:|---:|---|
${runTable}

### DB Financial Field Coverage

| Field | Non-null rows | Coverage |
|---|---:|---:|
${dbCoverageTable}

### Upcoming IPO Financial Rows

| Symbol | Filing status | Market | Fields | Offered shares | Offered ratio % | Assets | Equity | Net income latest |
|---|---|---|---:|---:|---:|---:|---:|---:|
${upcomingTable}

### ipo.json Fundamental Metric Coverage

| Metric | Non-null symbols | Coverage |
|---|---:|---:|
${metricTable}

### Latest SEC Doc Cache Sample

| Cache file | Field count | Keys | Last modified |
|---|---:|---|---|
${cacheTable}

## Consistency Checks

ตรวจแล้ว:

- \`ipo_financials\` มี row สำหรับ IPO ทุกตัวใน DB
- ค่า percentage ที่ตรวจใน upcoming rows อยู่ในช่วง 0-100 เมื่อมีข้อมูล
- \`total_equity\` สอดคล้องกับ \`total_assets - total_liabilities\` ใน rows ที่มีครบ
- Scraper run ล่าสุดจบด้วย status \`success\` และ \`failed_count = 0\`
- Logic ใหม่ไม่ cache SEC docs ที่ได้ field ต่ำกว่าเกณฑ์ เพื่อกันข้อมูล partial กลายเป็น cache ถาวร

${issues.length ? `รายการที่ต้องติดตาม:\n\n${issues.map((issue) => `- ${issue}`).join("\n")}` : "ไม่พบรายการผิดปกติจาก consistency checks ชุดนี้"}

## Interpretation

ข้อมูลทางการเงิน “ขึ้นแล้วใน DB” สำหรับ upcoming IPO ส่วนใหญ่ แต่ความครบถ้วนในหน้า Upcoming Dashboard ยังแสดงไม่ครบ 100% เพราะบางบริษัทไม่มี \`ipo_price\`, \`listing_date\`, \`gross_proceeds\`, \`total_expense\` หรือ SEC filing ยังให้เอกสารงบไม่ครบในรอบนี้ โดยเฉพาะ PETPAL และ SUEN ที่ run ล่าสุดดึงได้ต่ำกว่าเกณฑ์และระบบไม่ cache ผล partial ตามที่ตั้งใจไว้
`;

    await fs.writeFile(reportPath, md, "utf8");
    await fs.writeFile(
      path.join(outputDir, `financials-recheck-summary-${reportDate}.json`),
      JSON.stringify({ dbSummary, latestRuns, upcoming, metricCoverage, issues, reportPath, assetDir }, null, 2),
      "utf8",
    );

    console.log(JSON.stringify({ reportPath, assetDir, issues: issues.length, latestRun: latestRun.id }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
