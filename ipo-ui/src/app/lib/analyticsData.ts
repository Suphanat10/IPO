// Runtime-injected data backing the analytics/fundamental engines.
//
// Previously these values came from `import data from "../data/ipo.json"` in
// mockData.ts, which inlined the full ~3.7MB artifact into the client bundle.
// Now the client fetches the per-slice endpoints (see ipoDataClient.ts) and
// pushes the parsed slices in here once, so the compute libraries
// (ipoAnalytics, leadCoStats, fundamentalFactors) read them through getters
// without statically importing the blob. The UI gates rendering on the slice
// hooks' `loading`, so getters are only read after the relevant setter ran.

import type {
  RawIpoRow,
  LeadCoIndexEntry,
  GlobalFundamentalStats,
  TierThresholds,
  PeerGroupStats,
  SectorMapping,
  IpoFundamental,
  CompanyRow,
} from "./mockData";

// ----- analytics slices (rawipo + leadco) -----
let _rawIpo: RawIpoRow[] = [];
let _rawIpoBySymbol = new Map<string, RawIpoRow>();
let _leadCoIndex: LeadCoIndexEntry[] = [];
let _companyHistoryBySymbol = new Map<string, CompanyRow>();

export function setRawIpo(rows: RawIpoRow[]): void {
  _rawIpo = rows;
  _rawIpoBySymbol = new Map(rows.map((r) => [r.sym, r]));
}
export function setLeadCoIndex(index: LeadCoIndexEntry[]): void {
  _leadCoIndex = index;
}
export function setCompanies(rows: CompanyRow[]): void {
  _companyHistoryBySymbol = new Map(rows.map((r) => [r.symbol, r]));
}
export const getRawIpo = (): RawIpoRow[] => _rawIpo;
export const getRawIpoBySymbol = (): Map<string, RawIpoRow> => _rawIpoBySymbol;
export const getLeadCoIndex = (): LeadCoIndexEntry[] => _leadCoIndex;
export const getCompanyHistoryBySymbol = (): Map<string, CompanyRow> =>
  _companyHistoryBySymbol;

// ----- summary slice (fundamental tiers / peer groups) -----
const DEFAULT_TIERS: TierThresholds = {
  float: { low: 0, medium: 0 },
  existing: { q1: 0, q2: 0 },
  exec: { low: 0, mid: 0 },
  roe: { q1: 0, q2: 0 },
  ey: { q1: 0, q2: 0 },
  de: { q1: 0, q2: 0 },
  cost: { q1: 0, q2: 0 },
};

let _globalFundamentalStats: GlobalFundamentalStats = {};
let _tierThresholds: TierThresholds = DEFAULT_TIERS;
let _peerBySector: Record<string, PeerGroupStats> = {};
let _peerByIndustry: Record<string, PeerGroupStats> = {};
let _sectorParent: Record<string, string> = {};
let _sectorMapping: SectorMapping = {};
let _fundamentalsBySymbol: Record<string, IpoFundamental> = {};

export interface FundamentalData {
  globalFundamentalStats: GlobalFundamentalStats;
  tierThresholds: TierThresholds;
  peerBySector: Record<string, PeerGroupStats>;
  peerByIndustry: Record<string, PeerGroupStats>;
  sectorParent: Record<string, string>;
  sectorMapping: SectorMapping;
  fundamentalsBySymbol: Record<string, IpoFundamental>;
}

export function setFundamentalData(d: FundamentalData): void {
  _globalFundamentalStats = d.globalFundamentalStats;
  _tierThresholds = d.tierThresholds ?? DEFAULT_TIERS;
  _peerBySector = d.peerBySector;
  _peerByIndustry = d.peerByIndustry;
  _sectorParent = d.sectorParent;
  _sectorMapping = d.sectorMapping;
  _fundamentalsBySymbol = d.fundamentalsBySymbol;
}

export const getGlobalFundamentalStats = (): GlobalFundamentalStats =>
  _globalFundamentalStats;
export const getTierThresholds = (): TierThresholds => _tierThresholds;
export const getPeerBySector = (): Record<string, PeerGroupStats> =>
  _peerBySector;
export const getPeerByIndustry = (): Record<string, PeerGroupStats> =>
  _peerByIndustry;
export const getSectorParent = (): Record<string, string> => _sectorParent;
export const getSectorMapping = (): SectorMapping => _sectorMapping;
export const getFundamentalsBySymbol = (): Record<string, IpoFundamental> =>
  _fundamentalsBySymbol;
