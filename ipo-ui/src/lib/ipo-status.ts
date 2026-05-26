import { query } from "@/lib/db";
import { toDateOnly } from "@/lib/date-format";

export type IpoStatus = "upcoming" | "listed" | "cancelled";

export function getBangkokDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function effectiveIpoStatus(
  status: IpoStatus | string | null | undefined,
  listingDate: string | Date | null | undefined,
): IpoStatus {
  if (status === "cancelled") return "cancelled";
  if (!listingDate) return status === "listed" ? "listed" : "upcoming";

  const dateOnly = toDateOnly(listingDate);

  return dateOnly <= getBangkokDateString() ? "listed" : "upcoming";
}

export function applyEffectiveIpoStatus<T extends Record<string, unknown>>(row: T): T {
  if (!("status" in row) || !("listing_date" in row)) return row;
  return {
    ...row,
    status: effectiveIpoStatus(
      row.status as string | null | undefined,
      row.listing_date as string | Date | null | undefined,
    ),
  };
}

export async function syncMaturedIpoStatuses() {
  const today = getBangkokDateString();
  await query(
    `UPDATE ipos SET status = 'listed', updated_at = now() WHERE status = 'upcoming' AND listing_date IS NOT NULL AND listing_date <= $1`,
    [today],
  );
}
