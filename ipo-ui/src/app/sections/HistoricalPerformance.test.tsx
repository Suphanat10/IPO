import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HistoricalPerformance from "./HistoricalPerformance";
import { useAnalysis } from "../lib/AnalysisContext";
import type { LeadCoSummaryRow, SummaryRow } from "../lib/types";

jest.mock("../lib/AnalysisContext", () => ({
  useAnalysis: jest.fn(),
}));

jest.mock("../components/SummaryDataGrid", () => ({
  __esModule: true,
  default: function SummaryDataGridMock(props: {
    rows: (SummaryRow & { co?: string })[];
    nameLabel: string;
    view: string;
    showCo?: boolean;
    minIpo?: number | null;
    maxIpo?: number | null;
  }) {
    return (
      <div data-testid="summary-grid">
        <span data-testid="grid-name-label">{props.nameLabel}</span>
        <span data-testid="grid-view">{props.view}</span>
        <span data-testid="grid-show-co">{String(Boolean(props.showCo))}</span>
        <span data-testid="grid-min">{String(props.minIpo)}</span>
        <span data-testid="grid-max">{String(props.maxIpo)}</span>
        <span data-testid="grid-rows">{props.rows.length}</span>
      </div>
    );
  },
}));

jest.mock("../lib/mockData", () => {
  const row = (
    name: string,
    ipoCount: number,
    overrides: Partial<SummaryRow> = {},
  ): SummaryRow => ({
    name,
    ipo_count: ipoCount,
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

  const leadCo = (
    name: string,
    co: string,
    ipoCount: number,
  ): LeadCoSummaryRow => ({
    ...row(name, ipoCount),
    co,
  });

  return {
    faPersonsSummary: [
      row("Person A", 2),
      row("Person B", 5),
      row("Person C", 8),
    ] as SummaryRow[],
    faCompaniesSummary: [
      row("Company A", 4),
      row("Company B", 9),
    ] as SummaryRow[],
    leadUnderwritersSummary: [row("Lead A", 6)] as SummaryRow[],
    leadCoSummary: [
      leadCo("Lead A", "Co A", 7),
      leadCo("Lead B", "Co B", 3),
    ] as LeadCoSummaryRow[],
  };
});

type UseAnalysisValue = ReturnType<typeof useAnalysis>;

const mockUseAnalysis = useAnalysis as jest.MockedFunction<typeof useAnalysis>;

function createAnalysisValue(
  historical: Partial<UseAnalysisValue["historical"]> = {},
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
    },
    historical: {
      minIpo: 3,
      maxIpo: null,
      ...historical,
    },
    setFA: jest.fn(),
    setLeadCo: jest.fn(),
    setFundamentalField: jest.fn(),
    resetFundamental: jest.fn(),
    setCompare: jest.fn(),
    setHistorical: jest.fn(),
  };
}

function renderHistorical(historical: Partial<UseAnalysisValue["historical"]> = {}) {
  const ctx = createAnalysisValue(historical);
  mockUseAnalysis.mockReturnValue(ctx);
  render(<HistoricalPerformance />);
  return ctx;
}

function expandDetails() {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

describe("HistoricalPerformance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with initial historical state and sends it to setHistorical", async () => {
    const ctx = renderHistorical();

    await waitFor(() => {
      expect(ctx.setHistorical).toHaveBeenCalledWith({ minIpo: 3, maxIpo: null });
    });

    expect(screen.getByText("2 rows")).toBeInTheDocument();
    expandDetails();
    expect(screen.getByTestId("summary-grid")).toBeInTheDocument();
    expect(screen.getByTestId("grid-name-label")).toHaveTextContent("FA Person");
    expect(screen.getByTestId("grid-view")).toHaveTextContent("Key Metrics");
    expect(screen.getByTestId("grid-show-co")).toHaveTextContent("false");
    expect(screen.getByTestId("grid-min")).toHaveTextContent("3");
    expect(screen.getByTestId("grid-max")).toHaveTextContent("null");
  });

  it("shows validation error for invalid MIN_IPO and does not push invalid values", async () => {
    const ctx = renderHistorical();
    const [minInput] = screen.getAllByRole("textbox");

    await waitFor(() => {
      expect(ctx.setHistorical).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(minInput, { target: { value: "0" } });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    await waitFor(() => {
      expect(ctx.setHistorical).toHaveBeenCalledTimes(1);
    });
  });

  it("shows validation error when MIN_IPO is greater than MAX_IPO", () => {
    const ctx = renderHistorical({ minIpo: null, maxIpo: null });
    const [minInput, maxInput] = screen.getAllByRole("textbox");

    fireEvent.change(minInput, { target: { value: "5" } });
    fireEvent.change(maxInput, { target: { value: "3" } });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(ctx.setHistorical).not.toHaveBeenCalledWith({ minIpo: 5, maxIpo: 3 });
  });

  it("changes tab and passes Lead-Co props to SummaryDataGrid", () => {
    renderHistorical();
    expandDetails();

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[3]);

    expect(screen.getByTestId("grid-name-label")).toHaveTextContent("Lead Underwriter");
    expect(screen.getByTestId("grid-show-co")).toHaveTextContent("true");
  });
});
