"use client";

import { Stack } from "@mui/material";
import HistoricalPerformance from "../sections/HistoricalPerformance";
import ComparePerformance from "../sections/ComparePerformance";
import { AnalysisProvider } from "../lib/AnalysisContext";

export default function ExplorePage() {
  return (
    <AnalysisProvider>
      <Stack spacing={0}>
        <HistoricalPerformance />
        <ComparePerformance />
      </Stack>
    </AnalysisProvider>
  );
}
