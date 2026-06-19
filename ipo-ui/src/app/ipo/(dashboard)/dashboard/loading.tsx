import { Box, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import {
  ADMIN_RADIUS,
  AdminPageHeader,
  AdminPanel,
  adminColors,
  adminPanelSx,
} from "../../components/AdminPrimitives";

function StatSkeleton() {
  return (
    <Paper sx={{ ...adminPanelSx, height: "100%", p: 2 }}>
      <Stack direction="row" spacing={1.4} sx={{ alignItems: "flex-start" }}>
        <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: `${ADMIN_RADIUS}px` }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="68%" height={18} />
          <Skeleton variant="text" width="42%" height={34} />
          <Skeleton variant="text" width="82%" height={16} />
        </Box>
      </Stack>
    </Paper>
  );
}

function TimelineItemSkeleton() {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <Skeleton variant="rounded" width={42} height={42} sx={{ borderRadius: `${ADMIN_RADIUS}px` }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Skeleton variant="text" width="45%" height={17} />
        <Skeleton variant="text" width="62%" height={24} />
      </Box>
    </Stack>
  );
}

function ListPanelSkeleton({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <AdminPanel title={title} subtitle={subtitle} sx={{ flex: 1 }}>
      <Stack spacing={1.25}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Stack
            key={index}
            direction="row"
            spacing={1.25}
            sx={{
              alignItems: "center",
              p: 1,
              borderRadius: `${ADMIN_RADIUS}px`,
              bgcolor: adminColors.panelAlt,
              border: `1px solid ${adminColors.borderSoft}`,
            }}
          >
            <Skeleton variant="rounded" width={54} height={24} sx={{ borderRadius: 99 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" width="72%" height={18} />
              <Skeleton variant="text" width="48%" height={14} />
            </Box>
            <Skeleton variant="rounded" width={76} height={24} sx={{ borderRadius: 99 }} />
          </Stack>
        ))}
      </Stack>
    </AdminPanel>
  );
}

export default function DashboardLoading() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="แดชบอร์ด / Dashboard"
        title="งานข้อมูล IPO / IPO data operations"
        description="กำลังโหลดสถิติ IPO ความครบถ้วนของข้อมูล validation และ build ล่าสุด"
        actions={
          <>
            <Skeleton variant="rounded" width={146} height={36} sx={{ borderRadius: "8px" }} />
            <Skeleton variant="rounded" width={128} height={36} sx={{ borderRadius: "8px" }} />
          </>
        }
      />

      <Grid container spacing={2}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 2.4 }}>
            <StatSkeleton />
          </Grid>
        ))}
      </Grid>

      <AdminPanel
        title="ไทม์ไลน์ระบบ / Operational timeline"
        subtitle="กำลังโหลดสัญญาณความสดใหม่ของข้อมูลและ build"
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TimelineItemSkeleton />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TimelineItemSkeleton />
          </Grid>
        </Grid>
      </AdminPanel>

      <Grid container spacing={2} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, lg: 6 }} sx={{ display: "flex" }}>
          <ListPanelSkeleton
            title="Build ล่าสุด / Recent builds"
            subtitle="กำลังโหลดประวัติการสร้างไฟล์ผลลัพธ์"
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }} sx={{ display: "flex" }}>
          <ListPanelSkeleton
            title="IPO ที่ต้องติดตาม / Upcoming readiness"
            subtitle="กำลังโหลดรายการก่อนเข้าเทรด"
          />
        </Grid>
      </Grid>

      <AdminPanel title="รายงานข้อมูล / Data report" subtitle="กำลังโหลดภาพรวมคุณภาพข้อมูล">
        <Stack spacing={1.25}>
          <Typography sx={{ color: adminColors.muted, fontSize: 12, fontWeight: 800 }}>
            Loading data report...
          </Typography>
          <Skeleton variant="rounded" width="100%" height={14} sx={{ borderRadius: 99 }} />
          <Skeleton variant="rounded" width="100%" height={120} sx={{ borderRadius: `${ADMIN_RADIUS}px` }} />
        </Stack>
      </AdminPanel>
    </Stack>
  );
}
