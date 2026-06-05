// Helpers to open a SEC source file (xlsx / docx) for review. Shared by the
// scrape review queue and the IPO edit form so both open files the same way.
//
// Both go through our same-origin unzip proxy:
//   - openSourceFileViewer: renders xlsx as an HTML table / docx as a page,
//     works on localhost, ngrok and production alike.
//   - openInOfficeViewer: hands the proxy's raw bytes to the Microsoft Office
//     Online viewer (full fidelity, but only when the app is on a public URL
//     Microsoft can fetch).

export function openSourceFileViewer(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return;
  const url = `/api/ipo/upcoming/source-files/view?url=${encodeURIComponent(sourceUrl)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openInOfficeViewer(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return;
  const proxy = `${window.location.origin}/api/ipo/upcoming/source-files/view?raw=1&url=${encodeURIComponent(
    sourceUrl,
  )}`;
  const viewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(proxy)}`;
  window.open(viewer, "_blank", "noopener,noreferrer");
}
