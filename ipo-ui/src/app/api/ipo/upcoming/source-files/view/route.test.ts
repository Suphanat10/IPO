import { sanitizeDocxHtml } from "./route";

describe("SEC source file DOCX sanitizer", () => {
  it("removes scripts, event handlers, unsafe URLs, and inline styles", () => {
    const sanitized = sanitizeDocxHtml(`
      <p style="background:url(javascript:alert(1))" onclick="alert(1)">
        Hello <strong>SEC</strong>
      </p>
      <script>alert(1)</script>
      <img src="x" onerror="alert(1)" alt="bad">
      <a href="javascript:alert(1)" onclick="alert(1)">bad link</a>
      <table><tr><td colspan="2" onmouseover="alert(1)">cell</td></tr></table>
    `);

    expect(sanitized).toContain("<p>");
    expect(sanitized).toContain("<strong>SEC</strong>");
    expect(sanitized).toContain("<table><tbody><tr><td colspan=\"2\">cell</td></tr></tbody></table>");
    expect(sanitized).toContain("<a>bad link</a>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("alert(1)");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain("<img");
  });

  it("keeps safe links and data image sources", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const sanitized = sanitizeDocxHtml(`
      <a href="https://market.sec.or.th/report">SEC</a>
      <img src="${png}" alt="chart">
    `);

    expect(sanitized).toContain(
      '<a href="https://market.sec.or.th/report" target="_blank" rel="noreferrer">SEC</a>',
    );
    expect(sanitized).toContain(`<img src="${png}" alt="chart">`);
  });
});
