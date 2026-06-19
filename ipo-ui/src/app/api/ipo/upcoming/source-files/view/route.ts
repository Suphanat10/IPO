import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { parseFragment } from "parse5";
import { fetchSecOfficeFileForView } from "@/lib/sec-extractor";

export const dynamic = "force-dynamic";

// SEC's own file host. We only proxy this host so the route can't be turned
// into a general-purpose SSRF fetch-anything endpoint.
const ALLOWED_HOST = "market.sec.or.th";

// Defensive caps so a pathological workbook can't render a multi-million-cell page.
const MAX_ROWS = 2000;
const MAX_COLS = 80;

const HTML_SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
} as const;

const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
} as const;

const ALLOWED_DOCX_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const DROP_WITH_CONTENT = new Set([
  "base",
  "button",
  "embed",
  "form",
  "iframe",
  "input",
  "link",
  "meta",
  "noscript",
  "object",
  "script",
  "select",
  "style",
  "svg",
  "textarea",
]);

type HtmlNode = {
  nodeName?: string;
  tagName?: string;
  value?: string;
  childNodes?: HtmlNode[];
  attrs?: Array<{ name: string; value: string }>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeIntegerAttr(value: string, min = 1, max = 100): string | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return String(n);
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function safeImageSrc(value: string): string | null {
  const trimmed = value.trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed.replace(/\s+/g, "");
  }
  return null;
}

function docxAttrs(tag: string, attrs: HtmlNode["attrs"] = []): string {
  const out: string[] = [];
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (name === "title") {
      out.push(`title="${escapeHtml(value)}"`);
      continue;
    }

    if (tag === "a" && name === "href") {
      const href = safeUrl(value);
      if (href) {
        out.push(`href="${escapeHtml(href)}"`);
        out.push('target="_blank"');
        out.push('rel="noreferrer"');
      }
      continue;
    }

    if ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan")) {
      const safe = safeIntegerAttr(value);
      if (safe) out.push(`${name}="${safe}"`);
      continue;
    }

    if (tag === "ol" && name === "start") {
      const safe = safeIntegerAttr(value, 1, 10_000);
      if (safe) out.push(`start="${safe}"`);
      continue;
    }

    if (tag === "img") {
      if (name === "src") {
        const src = safeImageSrc(value);
        if (src) out.push(`src="${escapeHtml(src)}"`);
      } else if (name === "alt") {
        out.push(`alt="${escapeHtml(value)}"`);
      }
    }
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

function sanitizeNodes(nodes: HtmlNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.nodeName === "#text") return escapeHtml(node.value ?? "");
      if (!node.tagName) return sanitizeNodes(node.childNodes);

      const tag = node.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) return "";

      const children = sanitizeNodes(node.childNodes);
      if (!ALLOWED_DOCX_TAGS.has(tag)) return children;
      if (tag === "br") return "<br>";
      if (tag === "img") {
        const attrs = docxAttrs(tag, node.attrs);
        return attrs.includes("src=") ? `<img${attrs}>` : "";
      }
      return `<${tag}${docxAttrs(tag, node.attrs)}>${children}</${tag}>`;
    })
    .join("");
}

export function sanitizeDocxHtml(html: string): string {
  const fragment = parseFragment(html) as unknown as { childNodes?: HtmlNode[] };
  return sanitizeNodes(fragment.childNodes);
}

function secureJson(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...BASE_SECURITY_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

// ExcelJS throws on `cell.text` for a merged cell whose master value is null
// (MergeValue.toString -> null.toString). Read defensively so one such cell
// can't abort the whole render.
function cellText(cell: ExcelJS.Cell): string {
  try {
    const t = cell.text;
    return t == null ? "" : String(t);
  } catch {
    return "";
  }
}

function columnLabel(index: number): string {
  let label = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function columnPixelWidth(width: number | undefined): number {
  if (!width || !Number.isFinite(width)) return 96;
  return Math.min(Math.max(Math.round(width * 7.2 + 12), 48), 360);
}

function rowPixelHeight(height: number | undefined): number | null {
  if (!height || !Number.isFinite(height)) return null;
  return Math.min(Math.max(Math.round(height * 1.33), 20), 180);
}

function colorToCss(color: Partial<ExcelJS.Color> | undefined): string | null {
  if (!color?.argb) return null;
  const raw = color.argb.trim().replace(/^#/, "");
  const rgb = raw.length === 8 ? raw.slice(2) : raw;
  if (!/^[0-9a-f]{6}$/i.test(rgb)) return null;
  return `#${rgb}`;
}

function fillColorToCss(fill: ExcelJS.Cell["fill"] | undefined): string | null {
  if (!fill || fill.type !== "pattern") return null;
  if (fill.pattern !== "solid" && fill.pattern !== "darkGray" && fill.pattern !== "mediumGray") {
    return null;
  }
  return colorToCss(fill.fgColor) ?? colorToCss(fill.bgColor);
}

function styleAttr(styles: string[]): string {
  const clean = styles.filter(Boolean);
  return clean.length ? ` style="${escapeHtml(clean.join(";"))}"` : "";
}

function cellCss(cell: ExcelJS.Cell): string[] {
  const master = cell.isMerged ? cell.master : cell;
  const styles: string[] = [];
  const fill = fillColorToCss(master.fill);
  const { alignment, font } = master;

  if (fill) styles.push(`background:${fill}`);
  if (font?.color) {
    const color = colorToCss(font.color);
    if (color) styles.push(`color:${color}`);
  }
  if (font?.bold) styles.push("font-weight:700");
  if (font?.italic) styles.push("font-style:italic");
  if (font?.underline) styles.push("text-decoration:underline");
  if (font?.size) styles.push(`font-size:${Math.min(Math.max(font.size, 8), 24)}px`);
  if (alignment?.horizontal) {
    const h = alignment.horizontal === "centerContinuous" ? "center" : alignment.horizontal;
    if (["left", "center", "right", "justify"].includes(h)) styles.push(`text-align:${h}`);
  } else if (typeof master.value === "number") {
    styles.push("text-align:right");
  }
  if (alignment?.vertical) {
    const v = alignment.vertical === "middle" ? "middle" : alignment.vertical;
    if (["top", "middle", "bottom"].includes(v)) styles.push(`vertical-align:${v}`);
  }
  if (alignment?.wrapText) styles.push("white-space:pre-wrap");
  if (master.border && Object.values(master.border).some((side) => side?.style)) {
    styles.push("border-color:#8eaadb");
  }
  return styles;
}

function parseCellAddress(address: string): { row: number; col: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1].toUpperCase()) {
    col = col * 26 + ch.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]), col };
}

type MergeInfo = { rowspan: number; colspan: number };

function getMergeMaps(
  ws: ExcelJS.Worksheet,
  maxRows: number,
  maxCols: number,
): { masters: Map<string, MergeInfo>; covered: Set<string> } {
  const masters = new Map<string, MergeInfo>();
  const covered = new Set<string>();

  for (const rawRange of ws.model.merges ?? []) {
    const range = String(rawRange).split("!").pop()?.replace(/'/g, "") ?? "";
    const [startRef, endRef = startRef] = range.split(":");
    const start = parseCellAddress(startRef);
    const end = parseCellAddress(endRef);
    if (!start || !end) continue;

    const top = Math.min(start.row, end.row);
    const left = Math.min(start.col, end.col);
    const bottom = Math.min(Math.max(start.row, end.row), maxRows);
    const right = Math.min(Math.max(start.col, end.col), maxCols);
    if (top > maxRows || left > maxCols || bottom < top || right < left) continue;

    masters.set(`${top}:${left}`, {
      rowspan: bottom - top + 1,
      colspan: right - left + 1,
    });

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (r !== top || c !== left) covered.add(`${r}:${c}`);
      }
    }
  }

  return { masters, covered };
}

function renderCellContent(cell: ExcelJS.Cell): string {
  const text = escapeHtml(cellText(cell));
  if (cell.isHyperlink && cell.hyperlink) {
    const href = safeUrl(cell.hyperlink);
    if (href) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${text || escapeHtml(href)}</a>`;
    }
  }
  return text.replace(/\n/g, "<br>");
}

/** Render every worksheet of an xlsx workbook as a self-contained HTML page. */
async function xlsxToHtml(bytes: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);

  const sections: string[] = [];
  const tabs = wb.worksheets
    .map((ws, index) => `<a class="sheet-tab" href="#sheet-${index}">${escapeHtml(ws.name)}</a>`)
    .join("");
  sections.push(
    `<div class="topbar"><strong>SEC financial statement</strong><span>Excel-like preview</span></div><nav class="sheet-tabs">${tabs}</nav>`,
  );

  for (const [index, ws] of wb.worksheets.entries()) {
    const colCount = Math.min(
      Math.max(ws.columnCount || 0, ws.actualColumnCount || 0, ws.dimensions?.right || 0),
      MAX_COLS,
    );
    const rowCount = Math.min(
      Math.max(ws.rowCount || 0, ws.actualRowCount || 0, ws.dimensions?.bottom || 0),
      MAX_ROWS,
    );
    const { masters, covered } = getMergeMaps(ws, rowCount, colCount);
    const colHeaders = Array.from({ length: colCount }, (_, i) => (
      `<th class="col-header">${columnLabel(i + 1)}</th>`
    )).join("");
    const colGroup = [
      `<col class="row-number-col">`,
      ...Array.from({ length: colCount }, (_, i) => {
        const column = ws.getColumn(i + 1);
        return `<col style="width:${columnPixelWidth(column.width)}px">`;
      }),
    ].join("");
    const rows: string[] = [];
    rows.push(`<tr class="letters"><th class="corner"></th>${colHeaders}</tr>`);
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const rowHeight = rowPixelHeight(row.height);
      const cells: string[] = [];
      for (let c = 1; c <= colCount; c++) {
        const mergeKey = `${r}:${c}`;
        if (covered.has(mergeKey)) continue;
        const merge = masters.get(mergeKey);
        const cell = row.getCell(c);
        const attrs = [
          merge?.rowspan && merge.rowspan > 1 ? ` rowspan="${merge.rowspan}"` : "",
          merge?.colspan && merge.colspan > 1 ? ` colspan="${merge.colspan}"` : "",
          styleAttr(cellCss(cell)),
        ].join("");
        cells.push(`<td${attrs}>${renderCellContent(cell)}</td>`);
      }
      rows.push(
        `<tr${rowHeight ? ` style="height:${rowHeight}px"` : ""}><th class="row-header">${r}</th>${cells.join("")}</tr>`,
      );
    }
    const truncated =
      (ws.rowCount ?? 0) > MAX_ROWS || (ws.columnCount ?? 0) > MAX_COLS
        ? `<p class="note">แสดงบางส่วน (ตัดที่ ${MAX_ROWS} แถว / ${MAX_COLS} คอลัมน์)</p>`
        : "";
    sections.push(
      `<section id="sheet-${index}" class="sheet"><div class="sheet-title"><h2>${escapeHtml(ws.name)}</h2><span>${rowCount.toLocaleString()} rows · ${colCount.toLocaleString()} columns</span></div>${truncated}<div class="excel-scroll"><table><colgroup>${colGroup}</colgroup>${rows.join("")}</table></div></section>`,
    );
  }

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEC financial statement</title>
<style>
  :root { color-scheme: light; --grid:#d8dee8; --head:#f3f6fa; --text:#111827; --muted:#64748b; --green:#107c41; }
  * { box-sizing: border-box; }
  body { font-family: Aptos, Calibri, Arial, system-ui, sans-serif; margin: 0; background: #eef2f7; color: var(--text); }
  .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 14px; border-bottom: 1px solid #cbd5e1; background: #107c41; color: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.16); }
  .topbar strong { font-size: 14px; font-weight: 700; }
  .topbar span { color: rgba(255,255,255,.82); font-size: 12px; }
  .sheet-tabs { position: sticky; top: 48px; z-index: 19; display: flex; gap: 4px; overflow-x: auto; padding: 8px 12px 0; border-bottom: 1px solid #cbd5e1; background: #e9eef5; }
  .sheet-tab { display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border: 1px solid #cbd5e1; border-bottom: 0; border-radius: 6px 6px 0 0; background: #fff; color: #0f5132; font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
  main { padding: 14px; }
  .sheet { margin: 0 0 18px; padding: 14px; }
  .sheet-title { display: flex; align-items: baseline; gap: 10px; margin: 0 0 8px; }
  h2 { font-size: 15px; margin: 0; color: #0f5132; }
  .sheet-title span, .note { font-size: 12px; color: var(--muted); }
  .note { margin: 0 0 8px; color: #92400e; }
  .excel-scroll { max-height: calc(100vh - 145px); overflow: auto; border: 1px solid #b8c4d5; border-radius: 6px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.08); }
  table { border-collapse: separate; border-spacing: 0; table-layout: fixed; min-width: 100%; font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12px; line-height: 1.25; }
  .row-number-col { width: 46px; }
  th, td { height: 22px; border-right: 1px solid var(--grid); border-bottom: 1px solid var(--grid); padding: 3px 6px; white-space: nowrap; vertical-align: middle; background: #fff; overflow: hidden; text-overflow: ellipsis; }
  td:hover { outline: 2px solid rgba(16,124,65,.35); outline-offset: -2px; }
  .corner, .col-header, .row-header { background: var(--head); color: #475569; font-weight: 600; text-align: center; user-select: none; }
  .corner { position: sticky; top: 0; left: 0; z-index: 7; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
  .col-header { position: sticky; top: 0; z-index: 5; border-bottom: 1px solid #cbd5e1; }
  .row-header { position: sticky; left: 0; z-index: 4; width: 46px; border-right: 1px solid #cbd5e1; }
  a { color: #0563c1; text-decoration: underline; }
  @media (max-width: 640px) {
    main { padding: 8px; }
    .sheet { padding: 8px; }
    .topbar { min-height: 44px; }
    .sheet-tabs { top: 44px; }
    .excel-scroll { max-height: calc(100vh - 128px); }
  }
</style></head>
<body>${sections.join("") || "<p>ไม่พบข้อมูลในไฟล์</p>"}</body></html>`;
}

/** Render a .docx into a self-contained, readable HTML page. */
async function docxToHtml(bytes: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer: bytes });
  const sanitized = sanitizeDocxHtml(value);
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEC document</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 820px; margin: 0 auto; padding: 24px 16px; background: #f5f7fa; color: #0a1929; line-height: 1.6; }
  .doc { background: #fff; border: 1px solid #d7e2ee; border-radius: 8px; padding: 32px; }
  .doc h1, .doc h2, .doc h3 { color: #1e3a5c; }
  .doc table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
  .doc td, .doc th { border: 1px solid #e3eaf2; padding: 4px 8px; vertical-align: top; }
  .doc img { max-width: 100%; height: auto; }
</style></head>
<body><div class="doc">${sanitized || "<p>ไม่พบเนื้อหาในไฟล์</p>"}</div></body></html>`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = params.get("url");
  // `raw=1` => serve the original file bytes (so the Office Online viewer can
  // fetch and render them). Default => render to HTML in-app (works same-origin
  // on localhost/ngrok where the Office viewer can't reach us).
  const raw = params.get("raw") === "1";
  if (!target) {
    return secureJson({ error: "Missing url parameter." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return secureJson({ error: "Invalid url." }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== ALLOWED_HOST) {
    return secureJson(
      { error: `Only https://${ALLOWED_HOST} URLs are allowed.` },
      { status: 400 },
    );
  }

  const result = await fetchSecOfficeFileForView(parsed.href);
  if (!result.ok) {
    return secureJson({ error: result.message }, { status: result.status });
  }

  // Spreadsheets: render to an HTML table page so they open in-browser on any
  // origin (no external Office viewer dependency — works behind ngrok/auth too).
  if (!raw && result.contentType.includes("spreadsheetml")) {
    try {
      const html = await xlsxToHtml(result.bytes);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, max-age=300",
          ...HTML_SECURITY_HEADERS,
        },
      });
    } catch (err) {
      return secureJson(
        { error: `เปิดไฟล์ xlsx ไม่สำเร็จ: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  }

  // Word documents: render to a readable HTML page so they open in-browser on
  // any origin (same-origin — no external viewer that can't reach ngrok/auth).
  if (!raw && result.contentType.includes("wordprocessingml")) {
    try {
      const html = await docxToHtml(result.bytes);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, max-age=300",
          ...HTML_SECURITY_HEADERS,
        },
      });
    } catch (err) {
      return secureJson(
        { error: `เปิดไฟล์ docx ไม่สำเร็จ: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  }

  // raw=1 (for the Office viewer) or any other type: serve inline so the
  // browser/Office viewer previews it, or the browser downloads it.
  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "Cache-Control": "private, max-age=300",
      ...BASE_SECURITY_HEADERS,
    },
  });
}
