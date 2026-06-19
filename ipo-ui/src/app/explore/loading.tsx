import { Box, Skeleton, Stack } from "@mui/material";

function SectionSkeleton({
  rows = 5,
  chartHeight = 320,
}: {
  rows?: number;
  chartHeight?: number;
}) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        bgcolor: "#fff",
        overflow: "hidden",
        border: "1px solid #e1e5eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2.25,
          borderBottom: "1px solid #e5e7eb",
          background:
            "linear-gradient(90deg, rgba(10,25,41,0.05) 0%, rgba(56,189,248,0.04) 100%)",
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: 2 }} />
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Skeleton variant="text" width="32%" height={26} />
            <Skeleton variant="text" width="58%" height={18} />
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 160px" },
            }}
          >
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2 }} />
          </Box>

          <Skeleton variant="rounded" height={chartHeight} sx={{ borderRadius: 2 }} />

          <Stack spacing={1}>
            {Array.from({ length: rows }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={38} sx={{ borderRadius: 1.5 }} />
            ))}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}

export default function ExploreLoading() {
  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
        <Stack spacing={0.75} sx={{ flex: 1 }}>
          <Skeleton variant="text" width="34%" height={28} />
          <Skeleton variant="text" width="62%" height={20} />
        </Stack>
      </Stack>

      <SectionSkeleton rows={6} />
      <SectionSkeleton rows={4} chartHeight={260} />
    </Stack>
  );
}
