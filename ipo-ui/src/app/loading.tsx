import { Box, Skeleton, Stack } from "@mui/material";

export default function Loading() {
  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
        <Stack spacing={0.75} sx={{ flex: 1 }}>
          <Skeleton variant="text" width="38%" height={28} />
          <Skeleton variant="text" width="64%" height={20} />
        </Stack>
      </Stack>
      <Box
        sx={{
          borderRadius: 3,
          border: "1px solid #e1e5eb",
          bgcolor: "#ffffff",
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: { xs: 1.25, md: 2 }, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "280px minmax(0, 1fr)" } }}>
          <Stack spacing={1}>
            {[0, 1, 2].map((idx) => (
              <Skeleton key={idx} variant="rounded" height={76} sx={{ borderRadius: 2 }} />
            ))}
          </Stack>
          <Skeleton variant="rounded" height={352} sx={{ borderRadius: 2 }} />
        </Box>
      </Box>
    </Stack>
  );
}
