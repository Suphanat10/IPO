"use client";

// Client-side lazy loader for the per-slice ipo-data endpoints (/api/ipo-data/*).
// Replaces the static `import data from ipo.json` that used to inline the whole
// ~3.7MB artifact into every client bundle. Each slice is fetched on demand,
// cached at module scope (one fetch per slice per page load), and — for the
// slices the compute engines need — pushed into analyticsData so
// ipoAnalytics/leadCoStats/fundamentalFactors can read it through getters.
//
// The cache + inflight-dedupe pattern mirrors useDropdownOptions.ts.

import * as React from "react";
import { fetchJson } from "@/lib/api";
import type {
  CompanyRow,
  IpoDetailRow,
  RawIpoRow,
  LeadCoIndexEntry,
  GlobalFundamentalStats,
  TierThresholds,
  PeerGroupStats,
  IpoFundamental,
  SectorMapping,
  GlobalBaseline,
} from "./mockData";
import type { LeadCoSummaryRow, SummaryRow } from "./types";
import {
  setRawIpo,
  setLeadCoIndex,
  setCompanies,
  setFundamentalData,
} from "./analyticsData";

export interface SummarySlice {
  faPersons: SummaryRow[];
  faCompanies: SummaryRow[];
  leadUnderwriters: SummaryRow[];
  faPersonOptions: string[];
  faCompanyOptions: string[];
  leadUnderwriterOptions: string[];
  coUnderwriterOptions: string[];
  globalBase: GlobalBaseline;
  globalFundamentalStats: GlobalFundamentalStats;
  tierThresholds: TierThresholds;
  peerBySector: Record<string, PeerGroupStats>;
  peerByIndustry: Record<string, PeerGroupStats>;
  sectorParent: Record<string, string>;
  sectorMapping: SectorMapping;
  fundamentalsBySymbol: Record<string, IpoFundamental>;
  knownSectors: string[];
  knownIndustries: string[];
}

export interface LeadCoSlice {
  leadCo: LeadCoSummaryRow[];
  leadCoIndex: LeadCoIndexEntry[];
}

export type SliceState<T> = { data: T | null; loading: boolean; error: boolean };

function createSliceLoader<T>(path: string, onLoad?: (d: T) => void) {
  let cache: T | null = null;
  let inflight: Promise<T> | null = null;

  function load(): Promise<T> {
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
      inflight = fetchJson<T>(path)
        .then((d) => {
          cache = d;
          onLoad?.(d);
          return d;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  function useData(): SliceState<T> {
    // Always initialise to the loading state — never read the module `cache`
    // here. The initializer runs during SSR (cache empty) and again on the
    // client's first render (cache may be warm from a prior fetch/HMR); reading
    // it would make those two renders diverge and break hydration. The effect
    // below (client-only, post-hydration) fills in the real value.
    const [state, setState] = React.useState<SliceState<T>>({
      data: null,
      loading: true,
      error: false,
    });
    React.useEffect(() => {
      let active = true;
      if (cache) {
        setState({ data: cache, loading: false, error: false });
        return;
      }
      load()
        .then((d) => {
          if (active) setState({ data: d, loading: false, error: false });
        })
        .catch(() => {
          if (active) setState({ data: null, loading: false, error: true });
        });
      return () => {
        active = false;
      };
    }, []);
    return state;
  }

  return { load, useData };
}

const summary = createSliceLoader<SummarySlice>(
  "/api/ipo-data/summary",
  (d) =>
    setFundamentalData({
      globalFundamentalStats: d.globalFundamentalStats,
      tierThresholds: d.tierThresholds,
      peerBySector: d.peerBySector,
      peerByIndustry: d.peerByIndustry,
      sectorParent: d.sectorParent,
      sectorMapping: d.sectorMapping,
      fundamentalsBySymbol: d.fundamentalsBySymbol,
    }),
);
const leadCo = createSliceLoader<LeadCoSlice>("/api/ipo-data/lead-co", (d) =>
  setLeadCoIndex(d.leadCoIndex),
);
const rawIpo = createSliceLoader<{ rawIpo: RawIpoRow[] }>(
  "/api/ipo-data/raw-ipo",
  (d) => setRawIpo(d.rawIpo),
);
const companies = createSliceLoader<{ companies: CompanyRow[] }>(
  "/api/ipo-data/companies",
  (d) => setCompanies(d.companies),
);
const ipoDetails = createSliceLoader<{ ipoDetails: IpoDetailRow[] }>(
  "/api/ipo-data/ipo-details",
);

export const useSummary = summary.useData;
export const useLeadCo = leadCo.useData;
export const useRawIpo = rawIpo.useData;
export const useCompanies = companies.useData;
export const useIpoDetails = ipoDetails.useData;

/**
 * Loads the rawIpo + lead-co slices the analytics engine needs and reports when
 * both are in place. Use this in components that call
 * generateFAConclusion/generateLeadCoConclusion/filterBy* so they gate on data.
 */
export function useAnalyticsReady(): boolean {
  const raw = useRawIpo();
  const lc = useLeadCo();
  return !raw.loading && !lc.loading && raw.data != null && lc.data != null;
}
