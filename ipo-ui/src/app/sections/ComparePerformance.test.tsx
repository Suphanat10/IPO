import * as React from "react";
import { render, screen } from "@testing-library/react";
import ComparePerformance from "./ComparePerformance";
import { useAnalysis } from "../lib/AnalysisContext";
import type { SummaryRow } from "../lib/types";

jest.mock("../lib/AnalysisContext", () => ({
  useAnalysis: jest.fn(),
}));

// The component now loads summary data through the ipoDataClient hooks instead
// of statically importing mockData. Mock the hook to return data synchronously.
jest.mock("../lib/ipoDataClient", () => {
  const row = (
    name: string,
    overrides: Partial<SummaryRow> = {},
  ): SummaryRow => ({
    name,
    ipo_count: 0,
    prob_open_above_ipo: 0,
    prob_high_above_ipo: 0,
    prob_low_above_ipo: 0,
    prob_close_above_ipo: 0,
    avg_return_open_d1: 0,
    avg_return_high_d1: 0,
    avg_return_low_d1: 0,
    avg_return_close_d1: 0,
    best_return_d1: 0,
    worst_return_d1: 0,
    avg_intraday_range_d1: 0,
    avg_return_1W: 0,
    avg_return_1M: 0,
    avg_return_3M: 0,
    avg_return_6M: 0,
    max_return_week: 0,
    min_return_week: 0,
    prob_close_d5_above_ipo: 0,
    ...overrides,
  });

  return {
    useSummary: () => ({
      data: {
        faPersons: [] as SummaryRow[],
        faCompanies: [
          row("Alpha Securities", {
            ipo_count: 10,
            prob_close_above_ipo: 70,
            avg_return_close_d1: 5,
            worst_return_d1: -12,
            avg_return_1W: 2,
            avg_return_1M: 6,
            avg_return_3M: 3,
            avg_return_6M: 1,
          }),
          row("Beta Securities", {
            ipo_count: 8,
            prob_close_above_ipo: 50,
            avg_return_close_d1: 8,
            worst_return_d1: -20,
            avg_return_1W: 2,
            avg_return_1M: 4,
            avg_return_3M: 7,
            avg_return_6M: 4,
          }),
          row("Gamma Securities", { ipo_count: 6 }),
        ] as SummaryRow[],
        leadUnderwriters: [] as SummaryRow[],
      },
      loading: false,
      error: false,
    }),
  };
});

type UseAnalysisValue = ReturnType<typeof useAnalysis>;

const mockUseAnalysis = useAnalysis as jest.MockedFunction<typeof useAnalysis>;

const mockSetCompare = jest.fn();

function createAnalysisValue(
  compare: Partial<UseAnalysisValue["compare"]> = {},
): UseAnalysisValue {
  return {
    fa: { person: null, company: null },
    leadCo: { lead: null, co: null },
    fundamental: {
      raw: {},
      computed: {
        costRatio: null,
        netProceedsRatio: null,
        newPct: null,
        totalShares: null,
        marketCap: null,
        roe: null,
        de: null,
        pe: null,
        pbv: null,
      },
    },
    compare: {
      type: "FA Company",
      nameA: null,
      nameB: null,
      ...compare,
    },
    historical: { minIpo: 3, maxIpo: null },
    setFA: jest.fn(),
    setLeadCo: jest.fn(),
    setFundamentalField: jest.fn(),
    resetFundamental: jest.fn(),
    setCompare: mockSetCompare,
    setHistorical: jest.fn(),
  };
}

function renderCompare(compare: Partial<UseAnalysisValue["compare"]> = {}) {
  mockUseAnalysis.mockReturnValue(createAnalysisValue(compare));
  return render(<ComparePerformance />);
}

describe("ComparePerformance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetCompare.mockReset();
  });

  it("shows initial state when no name pair is selected", () => {
    renderCompare();

    expect(screen.getByText("Compare Performance")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Compare FA Company")).not.toBeInTheDocument();
  });

  it("renders comparison table with deltas and win summary when both names are valid", () => {
    renderCompare({
      nameA: "Alpha Securities",
      nameB: "Beta Securities",
    });

    // The comparison table renders directly once both names resolve to summary
    // rows (no reveal button in the current component).
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Compare FA Company")).toBeInTheDocument();
    expect(screen.getByText("Alpha Securities")).toBeInTheDocument();
    expect(screen.getByText("Beta Securities")).toBeInTheDocument();

    expect(screen.getByText("A ชนะ 4")).toBeInTheDocument();
    expect(screen.getByText("B ชนะ 3")).toBeInTheDocument();
    expect(screen.getByText("เสมอ 1")).toBeInTheDocument();

    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getAllByText("-3.00%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.00%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("row")).toHaveLength(9);
  });

  it("does not render table when at least one selected name is missing from summary data", () => {
    renderCompare({
      nameA: "Unknown Name",
      nameB: "Beta Securities",
    });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Compare FA Company")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Unknown Name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Beta Securities")).toBeInTheDocument();
  });
});
