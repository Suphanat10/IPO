/**
 * @jest-environment node
 *
 * Imported via a thin module so the heavy ipo.json/mockData graph still loads
 * under the node environment without opening a DB connection.
 */
import { looseEq, looseIncludes } from "./ipoAnalytics";

describe("FA/UW name matching is tone-mark insensitive", () => {
  // The exact regression: SEC writes "แอดไวเซอรี่" (◌่) while the historical DB
  // row has "แอดไวเซอรี". They must still be treated as the same FA company.
  const secName = "บริษัท เจย์ แคปปิตอล แอดไวเซอรี่ จำกัด";
  const dbName = "บริษัท เจย์ แคปปิตอล แอดไวเซอรี จำกัด";

  it("looseEq matches names differing only by a Thai tone mark", () => {
    expect(looseEq(secName, dbName)).toBe(true);
  });

  it("looseIncludes matches the same pair", () => {
    expect(looseIncludes(dbName, secName)).toBe(true);
    expect(looseIncludes(secName, dbName)).toBe(true);
  });

  it("still matches ignoring spaces, case and parentheses/quotes", () => {
    expect(looseEq("Trinity (Thailand)", 'trinity  "thailand"')).toBe(true);
  });

  it("does not match genuinely different names", () => {
    expect(looseEq("บริษัท เอบีซี จำกัด", "บริษัท เอ็กซ์วายแซด จำกัด")).toBe(false);
    expect(looseIncludes("เอบีซี", "เอ็กซ์วายแซด")).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(looseEq("", "x")).toBe(false);
    expect(looseIncludes("x", "")).toBe(false);
  });
});
