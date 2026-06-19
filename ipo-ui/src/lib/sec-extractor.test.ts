/**
 * @jest-environment node
 *
 * Pure parsing/decision logic that pulls in node-only deps (pg via
 * sec-source-files, adm-zip via sec-extractor). Run under the node environment
 * so globals like TextEncoder exist; no DB connection is ever opened.
 */
import {
  parseSecuritiesOffering,
  parseAnyTextDoc,
  parseThaiNumber,
  parseFaFromIndexRows,
} from "./sec-extractor";
import { isAutoImportable, secAutoImportEnabled } from "./sec-source-files";
import { shouldSkipUnchanged } from "./sec-pipeline";

// ---------------------------------------------------------------------------
// Regression coverage for the PETPAL "Offered shares" bug.
//
// Two independent failures combined to make จำนวนหุ้นที่เสนอขาย disappear in the
// UI even though the source filing clearly stated it:
//   1. (extractor) the number had to be parsed out of prose with commas
//      (52,769,000) and the count + "หุ้น" unit potentially on different lines.
//   2. (pipeline)  prose docs validate as "skipped" (no accounting identity),
//      and the old import gate required "passed", so the correctly-extracted
//      value was parked in needs_review forever and never shown.
//
// The fixtures below mirror PETPAL's actual offering document text, but the
// assertions are generic — nothing is hard-coded to the PETPAL symbol.
// ---------------------------------------------------------------------------

describe("parseFaFromIndexRows — FA company + person (ที่ปรึกษาทางการเงิน)", () => {
  it("splits 'Company / Person' into both fields", () => {
    const rows = [
      ["บริษัทที่ออกหลักทรัพย์", "บริษัท ทดสอบ จำกัด (มหาชน)"],
      ["ที่ปรึกษาทางการเงิน", "บริษัทหลักทรัพย์ เอบีซี จำกัด / นายสมชาย ใจดี"],
    ];
    expect(parseFaFromIndexRows(rows)).toEqual({
      fa_company_sec: "บริษัทหลักทรัพย์ เอบีซี จำกัด",
      fa_person: "นายสมชาย ใจดี",
    });
  });

  it("returns company only when no person is listed", () => {
    const rows = [["ที่ปรึกษาทางการเงิน", "บริษัทหลักทรัพย์ เอบีซี จำกัด"]];
    expect(parseFaFromIndexRows(rows)).toEqual({
      fa_company_sec: "บริษัทหลักทรัพย์ เอบีซี จำกัด",
    });
  });

  it("drops placeholder persons (N.A. / -) but keeps the company", () => {
    expect(
      parseFaFromIndexRows([["ที่ปรึกษาทางการเงิน", "บริษัท เอบีซี / N.A."]]),
    ).toEqual({ fa_company_sec: "บริษัท เอบีซี" });
    expect(
      parseFaFromIndexRows([["ที่ปรึกษาทางการเงิน", "บริษัท เอบีซี / -"]]),
    ).toEqual({ fa_company_sec: "บริษัท เอบีซี" });
  });

  it("keeps a person name that itself contains a slash", () => {
    expect(
      parseFaFromIndexRows([
        ["ที่ปรึกษาทางการเงิน", "บริษัท เอบีซี / นายสมชาย / กรรมการ"],
      ]),
    ).toEqual({ fa_company_sec: "บริษัท เอบีซี", fa_person: "นายสมชาย / กรรมการ" });
  });

  it("returns {} when no FA row is present", () => {
    expect(parseFaFromIndexRows([["หัวข้ออื่น", "ค่าอื่น"]])).toEqual({});
  });
});

describe("parseSecuritiesOffering — offered shares (จำนวนหุ้นที่เสนอขาย)", () => {
  // Close to the real PETPAL "รายละเอียดของหลักทรัพย์ที่เสนอขาย" prose.
  const PETPAL_OFFERING_DOC = [
    "ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย",
    "การเสนอขายหุ้นสามัญต่อประชาชนเป็นครั้งแรก (Initial Public Offering) ในครั้งนี้",
    "เป็นการเสนอขายหุ้นสามัญเพิ่มทุนของ บริษัท เพ็ทพัล โปรดักส์ จำกัด (มหาชน)",
    "เป็นจำนวนไม่เกิน 52,769,000 หุ้น",
    "คิดเป็นร้อยละ 35 ของจำนวนหุ้นสามัญที่ออกและจำหน่ายได้แล้วทั้งหมดของบริษัทฯ",
  ].join("\n");

  it("extracts PETPAL offered_shares = 52,769,000 (commas intact, value complete)", () => {
    const { fields } = parseSecuritiesOffering(PETPAL_OFFERING_DOC, "url");
    expect(fields.offered_shares).toBe(52_769_000);
    expect(fields.offered_ratio_pct).toBe(35);
  });

  it("keeps evidence (extracted_value + source_text + source_file) for the number", () => {
    const { evidence } = parseSecuritiesOffering(PETPAL_OFFERING_DOC, "https://sec/doc");
    expect(evidence.offered_shares.extracted_value).toBe(52_769_000);
    expect(evidence.offered_shares.source_file).toBe("https://sec/doc");
    expect(evidence.offered_shares.source_text).toContain("52,769,000");
  });

  it("keeps the number IN the evidence even when it is far from the section header", () => {
    // Mirrors the real filing: a long preamble sits between the section header
    // and the actual figure, so a header-anchored snippet would cut off before
    // ever reaching 52,769,000. The evidence must still show the value.
    const filler =
      "การเสนอขายหุ้นสามัญต่อประชาชนเป็นครั้งแรก (Initial Public Offering) ในครั้งนี้ " +
      "เป็นการเสนอขายหุ้นสามัญเพิ่มทุนของบริษัทฯ ซึ่งมีรายละเอียดและเงื่อนไขตามที่ระบุไว้ " +
      "ในหนังสือชี้ชวนฉบับนี้ โดยมีวัตถุประสงค์เพื่อระดมทุนสำหรับการขยายกำลังการผลิต ".repeat(2);
    const doc = `ลักษณะสำคัญของหลักทรัพย์ที่เสนอขาย ${filler} เป็นจำนวนไม่เกิน 52,769,000 หุ้น`;
    const { fields, evidence } = parseSecuritiesOffering(doc, "url");
    expect(fields.offered_shares).toBe(52_769_000);
    expect(evidence.offered_shares.source_text).toContain("52,769,000");
  });

  it("survives the count and the หุ้น unit landing on different scraped lines", () => {
    const splitLines = "จำนวนหุ้นที่เสนอขาย\n52,769,000\nหุ้นสามัญเพิ่มทุน";
    const { fields } = parseSecuritiesOffering(splitLines, "url");
    expect(fields.offered_shares).toBe(52_769_000);
  });

  it("tolerates a stray space inside the grouped number (52, 769,000)", () => {
    const spaced = "จำนวนหุ้นที่เสนอขาย ไม่เกิน 52, 769,000 หุ้น";
    const { fields } = parseSecuritiesOffering(spaced, "url");
    expect(fields.offered_shares).toBe(52_769_000);
  });

  it("reads an English-labelled filing (Offered shares: 52,769,000 shares ... 35%)", () => {
    const en = "Offered shares: 52,769,000 shares, representing 35% of the paid-up capital";
    const { fields } = parseSecuritiesOffering(en, "url");
    expect(fields.offered_shares).toBe(52_769_000);
    expect(fields.offered_ratio_pct).toBe(35);
  });

  it("falls back to a bare number after the label when the unit word is absent", () => {
    const noUnit = "จำนวนหุ้นที่เสนอขาย : 52,769,000";
    const { fields } = parseSecuritiesOffering(noUnit, "url");
    expect(fields.offered_shares).toBe(52_769_000);
  });

  it("returns no value (never a wrong one) when the doc has no offered-shares figure", () => {
    const { fields } = parseSecuritiesOffering(
      "เอกสารแนบ 1 รายละเอียดเกี่ยวกับกรรมการของบริษัท",
      "url",
    );
    expect(fields.offered_shares).toBeUndefined();
  });

  it("is reachable through the combined parseAnyTextDoc dispatcher", () => {
    const { fields } = parseAnyTextDoc(PETPAL_OFFERING_DOC, "url");
    expect(fields.offered_shares).toBe(52_769_000);
  });
});

describe("parseThaiNumber — grouped-number tolerance", () => {
  it.each<[string, number | null]>([
    ["52,769,000", 52_769_000],
    ["52, 769, 000", 52_769_000],
    ["1,234.56", 1234.56],
    ["52,769,000 หุ้น", 52_769_000],
    ["-", null],
    ["", null],
    ["   ", null],
  ])("parses %p", (input, expected) => {
    expect(parseThaiNumber(input)).toBe(expected);
  });
});

describe("isAutoImportable — prose extractions must not be parked forever", () => {
  it("auto-imports a valid prose extraction (validation 'skipped')", () => {
    expect(
      isAutoImportable({ formatOk: true, validationStatus: "skipped", hasNumericFields: true }),
    ).toBe(true);
  });

  it("auto-imports a passing structured (Excel/CSV) extraction", () => {
    expect(
      isAutoImportable({ formatOk: true, validationStatus: "passed", hasNumericFields: true }),
    ).toBe(true);
  });

  it("parks a file whose sanity validation FAILED", () => {
    expect(
      isAutoImportable({ formatOk: true, validationStatus: "failed", hasNumericFields: true }),
    ).toBe(false);
  });

  it("parks a file with an unrecognized format", () => {
    expect(
      isAutoImportable({ formatOk: false, validationStatus: "skipped", hasNumericFields: true }),
    ).toBe(false);
  });

  it("never imports a file that yielded no numeric fields", () => {
    expect(
      isAutoImportable({ formatOk: true, validationStatus: "skipped", hasNumericFields: false }),
    ).toBe(false);
  });
});

describe("secAutoImportEnabled — scraped data needs confirmation by default", () => {
  const original = process.env.SEC_PIPELINE_AUTO_IMPORT;
  afterEach(() => {
    if (original === undefined) delete process.env.SEC_PIPELINE_AUTO_IMPORT;
    else process.env.SEC_PIPELINE_AUTO_IMPORT = original;
  });

  it("is OFF when the env var is unset (require confirmation before main DB)", () => {
    delete process.env.SEC_PIPELINE_AUTO_IMPORT;
    expect(secAutoImportEnabled()).toBe(false);
  });

  it.each(["0", "false", "no", "off", ""])("treats %p as OFF", (val) => {
    process.env.SEC_PIPELINE_AUTO_IMPORT = val;
    expect(secAutoImportEnabled()).toBe(false);
  });

  it.each(["1", "true", "yes", "on", "TRUE"])("treats %p as ON (opt-in)", (val) => {
    process.env.SEC_PIPELINE_AUTO_IMPORT = val;
    expect(secAutoImportEnabled()).toBe(true);
  });
});

describe("shouldSkipUnchanged — unchanged files must still backfill missing values", () => {
  it("backfills (does NOT skip) an unchanged file that can still import", () => {
    // The PETPAL case: the SEC doc never changes bytes, but offered_shares is
    // missing from the DB — the next scrape must import it, not skip forever.
    expect(shouldSkipUnchanged("unchanged", true)).toBe(false);
  });

  it("skips an unchanged file with nothing importable", () => {
    expect(shouldSkipUnchanged("unchanged", false)).toBe(true);
  });

  it("never skips new/changed files via this gate", () => {
    expect(shouldSkipUnchanged("new", false)).toBe(false);
    expect(shouldSkipUnchanged("changed", false)).toBe(false);
  });
});
