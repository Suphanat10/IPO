import { toDateOnly } from "@/lib/date-format";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parsePositiveIdParam(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeDateOnlyField(
  data: Record<string, unknown>,
  field: string,
): string | null {
  if (!(field in data)) return null;

  const value = data[field];
  if (value == null || value === "") {
    data[field] = null;
    return null;
  }

  const dateOnly = toDateOnly(value);
  if (!DATE_ONLY_PATTERN.test(dateOnly)) {
    return `${field} must be a valid date in yyyy-mm-dd format`;
  }

  data[field] = dateOnly;
  return null;
}

export function normalizeNumericFields(
  data: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  const errors: string[] = [];

  for (const field of fields) {
    if (!(field in data)) continue;

    const value = data[field];
    if (value == null || value === "") {
      data[field] = null;
      continue;
    }

    const numeric = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

    if (!Number.isFinite(numeric)) {
      errors.push(`${field} must be a valid number`);
      continue;
    }

    data[field] = numeric;
  }

  return errors;
}

function dbErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
}

export function isUniqueConstraintError(error: unknown): boolean {
  return dbErrorCode(error) === "23505";
}

export function isInvalidNumericError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return dbErrorCode(error) === "22P02" || /invalid input syntax for type (numeric|bigint|integer|double precision)/i.test(message);
}
