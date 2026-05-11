"use client";

import * as React from "react";
import type { EntityType } from "./types";

export type ComputedFundamental = {
  costRatio: number | null;
  netProceedsRatio: number | null;
  newPct: number | null;
  totalShares: number | null;
  marketCap: number | null;
  roe: number | null;
  de: number | null;
  pe: number | null;
  pbv: number | null;
};

export type AnalysisState = {
  fa: { person: string | null; company: string | null };
  leadCo: { lead: string | null; co: string | null };
  fundamental: {
    raw: Record<string, string>;
    computed: ComputedFundamental;
  };
  compare: { type: EntityType; nameA: string | null; nameB: string | null };
  historical: { minIpo: number | null; maxIpo: number | null };
};

type Ctx = AnalysisState & {
  setFA: (v: Partial<AnalysisState["fa"]>) => void;
  setLeadCo: (v: Partial<AnalysisState["leadCo"]>) => void;
  setFundamentalField: (key: string, v: string) => void;
  resetFundamental: () => void;
  setCompare: (v: Partial<AnalysisState["compare"]>) => void;
  setHistorical: (v: Partial<AnalysisState["historical"]>) => void;
};

function mergeIfChanged<T extends Record<string, unknown>>(
  prev: T,
  patch: Partial<T>,
): T {
  let changed = false;
  for (const key in patch) {
    if (prev[key] !== patch[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return prev;
  return { ...prev, ...patch };
}

function parseNum(v: string | undefined | null): number | null {
  if (!v) return null;
  const cleaned = v.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function compute(raw: Record<string, string>): ComputedFundamental {
  const ipo = parseNum(raw.ipoPrice);
  const gross = parseNum(raw.grossProceeds);
  const expense = parseNum(raw.totalExpense);
  const shares = parseNum(raw.offeredShares);
  const offered = parseNum(raw.offeredRatio);
  const existing = parseNum(raw.existingPct);
  const liab = parseNum(raw.totalLiabilities);
  const equity = parseNum(raw.totalEquity);
  const income = parseNum(raw.netIncome);

  const costRatio =
    gross != null && gross > 0 && expense != null ? (expense / gross) * 100 : null;
  const netProceedsRatio = costRatio != null ? 100 - costRatio : null;
  const newPct = existing != null ? 100 - existing : null;
  const totalShares =
    shares != null && offered != null && offered > 0 ? shares / (offered / 100) : null;
  const marketCap = totalShares != null && ipo != null ? totalShares * ipo : null;
  const roe =
    income != null && equity != null && equity > 0 ? (income / equity) * 100 : null;
  const de = liab != null && equity != null && equity > 0 ? liab / equity : null;
  const pe = marketCap != null && income != null && income > 0 ? marketCap / income : null;
  const pbv = marketCap != null && equity != null && equity > 0 ? marketCap / equity : null;

  return { costRatio, netProceedsRatio, newPct, totalShares, marketCap, roe, de, pe, pbv };
}

const AnalysisContext = React.createContext<Ctx | null>(null);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [fa, setFaState] = React.useState<AnalysisState["fa"]>({
    person: null,
    company: null,
  });
  const [leadCo, setLeadCoState] = React.useState<AnalysisState["leadCo"]>({
    lead: null,
    co: null,
  });
  const [raw, setRaw] = React.useState<Record<string, string>>({});
  const [compare, setCompareState] = React.useState<AnalysisState["compare"]>({
    type: "FA Company",
    nameA: null,
    nameB: null,
  });
  const [historical, setHistoricalState] = React.useState<AnalysisState["historical"]>({
    minIpo: 3,
    maxIpo: null,
  });

  const computed = React.useMemo(() => compute(raw), [raw]);

  const setFA = React.useCallback((v: Partial<AnalysisState["fa"]>) => {
    setFaState((s) => mergeIfChanged(s, v));
  }, []);

  const setLeadCo = React.useCallback((v: Partial<AnalysisState["leadCo"]>) => {
    setLeadCoState((s) => mergeIfChanged(s, v));
  }, []);

  const setFundamentalField = React.useCallback((key: string, v: string) => {
    setRaw((s) => {
      if (s[key] === v) return s;
      return { ...s, [key]: v };
    });
  }, []);

  const resetFundamental = React.useCallback(() => {
    setRaw((s) => (Object.keys(s).length === 0 ? s : {}));
  }, []);

  const setCompare = React.useCallback((v: Partial<AnalysisState["compare"]>) => {
    setCompareState((s) => mergeIfChanged(s, v));
  }, []);

  const setHistorical = React.useCallback(
    (v: Partial<AnalysisState["historical"]>) => {
      setHistoricalState((s) => mergeIfChanged(s, v));
    },
    [],
  );

  const value = React.useMemo<Ctx>(
    () => ({
      fa,
      leadCo,
      fundamental: { raw, computed },
      compare,
      historical,
      setFA,
      setLeadCo,
      setFundamentalField,
      resetFundamental,
      setCompare,
      setHistorical,
    }),
    [
      fa,
      leadCo,
      raw,
      computed,
      compare,
      historical,
      setFA,
      setLeadCo,
      setFundamentalField,
      resetFundamental,
      setCompare,
      setHistorical,
    ],
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const ctx = React.useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within AnalysisProvider");
  return ctx;
}
