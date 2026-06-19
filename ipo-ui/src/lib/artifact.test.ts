/**
 * @jest-environment node
 */
import { readFile, access } from "fs/promises";
import { extractSlice, readSlice, paginateParams } from "./artifact";

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
  access: jest.fn(),
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockAccess = access as jest.MockedFunction<typeof access>;

const FULL = {
  generatedAt: "2026-01-01",
  counts: { base: 2 },
  faPersons: [{ name: "A" }],
  faCompanies: [{ name: "B" }],
  leadUnderwriters: [],
  faPersonOptions: [],
  faCompanyOptions: [],
  leadUnderwriterOptions: [],
  coUnderwriterOptions: [],
  peerBySector: {},
  peerByIndustry: {},
  sectorParent: {},
  sectorMapping: {},
  knownSectors: [],
  knownIndustries: [],
  tierThresholds: {},
  globalBase: {},
  globalFundamentalStats: {},
  fundamentalsBySymbol: {},
  leadCo: [{ name: "L", co: "C" }],
  leadCoIndex: [["SYM", "L", "C"]],
  companies: [{ symbol: "SYM" }],
  rawIpo: [{ sym: "SYM" }],
  ipoDetails: [{ symbol: "SYM" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  // /tmp is never present in these tests, so readArtifactRaw falls to primary.
  mockAccess.mockRejectedValue(new Error("no tmp"));
});

describe("extractSlice", () => {
  it("projects only the keys that belong to a slice", () => {
    expect(extractSlice(FULL, "leadco")).toEqual({
      leadCo: FULL.leadCo,
      leadCoIndex: FULL.leadCoIndex,
    });
    expect(Object.keys(extractSlice(FULL, "companies"))).toEqual(["companies"]);
    expect(extractSlice(FULL, "unknown-slice")).toEqual({});
  });
});

describe("readSlice", () => {
  it("returns the dedicated slice file when present", async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ companies: [{ symbol: "ONLY" }] }),
    );
    const data = await readSlice<{ companies: unknown[] }>("companies");
    expect(data.companies).toEqual([{ symbol: "ONLY" }]);
  });

  it("falls back to deriving the slice from ipo.json when the slice file is missing", async () => {
    // First readFile (the slice file) rejects; second (ipo.json) resolves full.
    mockReadFile
      .mockRejectedValueOnce(new Error("ENOENT slice"))
      .mockResolvedValueOnce(JSON.stringify(FULL));

    const data = await readSlice<{ rawIpo: unknown[] }>("rawipo");
    expect(data).toEqual({ rawIpo: FULL.rawIpo });
  });
});

describe("paginateParams", () => {
  it("returns null when neither page nor pageSize is present", () => {
    expect(paginateParams("http://x/api?foo=1")).toBeNull();
  });
  it("clamps page and pageSize to valid ranges", () => {
    expect(paginateParams("http://x/api?page=0&pageSize=99999")).toEqual({
      page: 1,
      pageSize: 1000,
    });
    expect(paginateParams("http://x/api?page=3")).toEqual({
      page: 3,
      pageSize: 50,
    });
  });
});
