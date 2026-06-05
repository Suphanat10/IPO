// Single source of truth for IPO admin-form sections that can be verified
// independently. Used by the verify API and the admin edit form.

export const IPO_SECTIONS = [
  { key: "identity", label: "ข้อมูลหลัก / Identity" },
  { key: "fa", label: "FA และผู้จัดจำหน่าย / FA & underwriters" },
  { key: "day1", label: "ราคาวันแรก / Day-1 prices" },
  { key: "post_ipo", label: "ราคาปิดหลัง IPO / Post-IPO closes" },
  { key: "financials", label: "ข้อมูลการเงิน / Financials" },
] as const;

export type IpoSectionKey = (typeof IPO_SECTIONS)[number]["key"];

export const IPO_SECTION_KEYS: readonly string[] = IPO_SECTIONS.map((s) => s.key);

export function isIpoSectionKey(value: unknown): value is IpoSectionKey {
  return typeof value === "string" && IPO_SECTION_KEYS.includes(value);
}
