"use client";

import { Box, Stack } from "@mui/material";
import FAAnalysis from "./sections/FAAnalysis";
import LeadCoAnalysis from "./sections/LeadCoAnalysis";
import FundamentalAnalysis from "./sections/FundamentalAnalysis";
import LivePerformanceSummary from "./sections/LivePerformanceSummary";
import SectionToggle, {
  useVisibleSections,
  type SectionKey,
} from "./components/SectionToggle";

const SECTION_RENDERERS: Record<SectionKey, () => React.ReactElement> = {
  fa: () => <FAAnalysis />,
  leadCo: () => <LeadCoAnalysis />,
  fundamental: () => <FundamentalAnalysis />,
};

const ORDER: SectionKey[] = ["fa", "leadCo", "fundamental"];

export default function Page() {
  const [visible, setVisible] = useVisibleSections();

  return (
    <Stack spacing={2}>
      <SectionToggle value={visible} onChange={setVisible} />
      <Box
        sx={{
          display: "grid",
          gap: 3,
          alignItems: "start",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 380px" },
        }}
      >
        <Stack spacing={3}>
          {ORDER.filter((k) => visible[k]).map((k) => {
            const Render = SECTION_RENDERERS[k];
            return <Render key={k} />;
          })}
        </Stack>
        <Box sx={{ position: { lg: "sticky" }, top: { lg: 92 } }}>
          <LivePerformanceSummary />
        </Box>
      </Box>
    </Stack>
  );
}
