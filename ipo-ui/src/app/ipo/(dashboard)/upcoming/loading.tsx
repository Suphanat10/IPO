import { Box, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import {
  AdminPageHeader,
  AdminPanel,
  adminColors,
  adminPanelSx,
} from "../../components/AdminPrimitives";

function MetricSkeleton() {
  return (
    <Paper sx={{ ...adminPanelSx, height: "100%", p: 2 }}>
      <Stack direction="row" spacing={1.4} sx={{ alignItems: "flex-start" }}>
        <Skeleton variant="rounded" width={38} height={38} sx={{ borderRadius: "10px" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="56%" height={18} />
          <Skeleton variant="text" width="34%" height={36} />
          <Skeleton variant="text" width="72%" height={16} />
        </Box>
      </Stack>
    </Paper>
  );
}

function ChartSkeleton() {
  return (
    <Paper sx={{ ...adminPanelSx, p: 2, height: "100%" }}>
      <Skeleton variant="text" width="60%" height={22} />
      <Skeleton variant="text" width="46%" height={16} sx={{ mb: 1.5 }} />
      <Skeleton variant="rounded" width="100%" height={14} sx={{ borderRadius: 99, mb: 1.5 }} />
      <Stack spacing={1}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Skeleton variant="circular" width={9} height={9} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="48%" height={16} />
              <Skeleton variant="text" width="32%" height={14} />
            </Box>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

function RowSkeleton() {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "140px minmax(260px, 1.55fr) 138px 118px 154px 174px 50px",
        },
        gap: { xs: 1, md: 1.75 },
        alignItems: "center",
        px: { xs: 1.35, md: 2 },
        py: { xs: 1.35, md: 1.45 },
        borderBottom: `1px solid ${adminColors.borderSoft}`,
        bgcolor: "#ffffff",
      }}
    >
      <Skeleton variant="text" width={72} height={26} />
      <Box>
        <Skeleton variant="text" width="72%" height={20} />
        <Skeleton variant="text" width="46%" height={16} />
      </Box>
      <Box>
        <Skeleton variant="text" width={84} height={18} />
        <Skeleton variant="rounded" width={72} height={20} sx={{ borderRadius: "6px" }} />
      </Box>
      <Skeleton variant="circular" width={46} height={46} />
      <Skeleton variant="rounded" width="100%" height={28} sx={{ borderRadius: 99 }} />
      <Skeleton variant="rounded" width={142} height={28} sx={{ borderRadius: 99 }} />
      <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: "10px" }} />
    </Box>
  );
}

export default function UpcomingIposLoading() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="IPO กำลังจะเข้า"
        title="ความพร้อมก่อนเข้าตลาด / Listing readiness"
        description="กำลังโหลดข้อมูล IPO ที่กำลังจะเข้าเทรด คะแนนคำแนะนำ และความครบถ้วนของข้อมูล"
      />

      <Grid container spacing={2}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <MetricSkeleton />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Grid key={index} size={{ xs: 12, lg: 4 }}>
            <ChartSkeleton />
          </Grid>
        ))}
      </Grid>

      <AdminPanel
        title="รายการเข้าตลาดที่กำลังจะมา"
        subtitle="กำลังโหลดข้อมูลจากฐานข้อมูล"
        noPadding
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1.25}
          sx={{
            p: { xs: 1.5, md: 2 },
            bgcolor: adminColors.panelAlt,
            borderBottom: `1px solid ${adminColors.borderSoft}`,
          }}
        >
          <Skeleton variant="rounded" height={40} sx={{ flex: 1, minWidth: { lg: 320 }, borderRadius: "12px" }} />
          <Skeleton variant="rounded" width={190} height={40} sx={{ borderRadius: "12px" }} />
          <Skeleton variant="rounded" width={190} height={40} sx={{ borderRadius: "12px" }} />
          <Skeleton variant="rounded" width={190} height={40} sx={{ borderRadius: "12px" }} />
        </Stack>
        <Stack spacing={0}>
          {Array.from({ length: 7 }).map((_, index) => (
            <RowSkeleton key={index} />
          ))}
        </Stack>
      </AdminPanel>
    </Stack>
  );
}
