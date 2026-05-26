const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateOnly(value: Date): string {
  return [
    value.getFullYear(),
    pad2(value.getMonth() + 1),
    pad2(value.getDate()),
  ].join("-");
}

export function toDateOnly(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return localDateOnly(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const prefix = trimmed.match(DATE_ONLY_PREFIX);
    if (prefix) return prefix[1];

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

    return trimmed;
  }

  return String(value);
}

export function formatThaiDate(value: unknown, fallback = "รอวันที่") {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return fallback;

  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateOnly;

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
