import { Box, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import {
  AdminPageHeader,
  AdminPanel,
  adminColors,
  adminPanelSx,
} from "../../components/AdminPrimitives";

function SmallStatSkeleton() {
  return (
    <Paper sx={{ ...adminPanelSx, p: 2 }}>
      <Stack spacing={0.75}>
        <Skeleton variant="text" width="68%" height={18} />
        <Skeleton variant="text" width="42%" height={34} />
        <Skeleton variant="text" width="80%" height={16} />
      </Stack>
    </Paper>
  );
}

export default function ValidationLoading() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="ตรวจคุณภาพ / Validation"
        title="คิวตรวจคุณภาพข้อมูล / Data quality queue"
        description="กำลังโหลดรายการ validation และ IPO ที่ยังขาดข้อมูล"
      />

      <Stack spacing={1.5}>
        <Typography variant="h6" sx={{ color: adminColors.text, fontWeight: 850 }}>
          สถิติคุณภาพข้อมูล / Data quality statistics
        </Typography>
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid key={index} size={{ xs: 12, sm: 6, lg: 4 }}>
              <SmallStatSkeleton />
            </Grid>
          ))}
        </Grid>
      </Stack>

      <AdminPanel
        title="สรุปข้อมูลที่ขาด / Missing fields breakdown"
        subtitle="กำลังโหลดจุดข้อมูลที่ยังขาด"
      >
        <Grid container spacing={3} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Skeleton variant="circular" width={180} height={180} sx={{ mx: "auto" }} />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={1}>
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} variant="rounded" height={34} sx={{ borderRadius: "10px" }} />
              ))}
            </Stack>
          </Grid>
        </Grid>
      </AdminPanel>

      <AdminPanel
        title="ข้อมูลที่ยังขาด / Missing fields"
        subtitle="กำลังโหลดคิวเติมข้อมูล"
        noPadding
      >
        <Box sx={{ p: 2, bgcolor: adminColors.panelAlt, borderBottom: `1px solid ${adminColors.borderSoft}` }}>
          <Skeleton variant="rounded" height={40} sx={{ borderRadius: "12px" }} />
        </Box>
        <Stack spacing={0} sx={{ p: 2 }}>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} variant="rounded" height={44} sx={{ mb: 1, borderRadius: "10px" }} />
          ))}
        </Stack>
      </AdminPanel>
    </Stack>
  );
}
