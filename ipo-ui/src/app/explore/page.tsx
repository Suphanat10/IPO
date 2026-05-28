"use client";

import { Stack } from "@mui/material";
import HistoricalPerformance from "../sections/HistoricalPerformance";
import ComparePerformance from "../sections/ComparePerformance";

export default function ExplorePage() {
  return (
    <Stack spacing={0}>
      <HistoricalPerformance />
      <ComparePerformance />
    </Stack>
  );
}
