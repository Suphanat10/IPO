import { Box, Grid, Paper, Skeleton, Stack } from "@mui/material";
import {
  ADMIN_RADIUS,
  AdminPageHeader,
  AdminPanel,
  adminColors,
  adminControlBarSx,
  adminPanelSx,
} from "../../components/AdminPrimitives";

function BuildStatSkeleton() {
  return (
    <Paper sx={{ ...adminPanelSx, height: "100%", p: 2 }}>
      <Stack direction="row" spacing={1.4} sx={{ alignItems: "flex-start" }}>
        <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: `${ADMIN_RADIUS}px` }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="72%" height={18} />
          <Skeleton variant="text" width="44%" height={32} />
          <Skeleton variant="text" width="82%" height={16} />
        </Box>
      </Stack>
    </Paper>
  );
}

function BuildRowSkeleton({ header = false }: { header?: boolean }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "90px 190px 220px 220px 150px minmax(240px, 1fr) 170px minmax(280px, 1fr)",
        columnGap: 1.25,
        alignItems: "center",
        minWidth: 1560,
        px: 1.5,
        py: header ? 1.15 : 1,
        bgcolor: header ? adminColors.panelAlt : "#ffffff",
        borderBottom: `1px solid ${adminColors.borderSoft}`,
      }}
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton
          key={index}
          variant={(index === 1 || index === 2) && !header ? "rounded" : "text"}
          width={header ? "72%" : index === 0 ? 42 : "78%"}
          height={(index === 1 || index === 2) && !header ? 24 : 20}
          sx={{ borderRadius: (index === 1 || index === 2) && !header ? 99 : undefined }}
        />
      ))}
    </Box>
  );
}

export default function BuildsLoading() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="สร้างไฟล์ข้อมูล / Build pipeline"
        title="สายงานสร้างไฟล์ / Build pipeline"
        description="กำลังโหลดสถานะ build ล่าสุดและประวัติการสร้างไฟล์"
        actions={<Skeleton variant="rounded" width={126} height={36} sx={{ borderRadius: "8px" }} />}
      />

      <Grid container spacing={2}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <BuildStatSkeleton />
          </Grid>
        ))}
      </Grid>

      <AdminPanel
        title="รายการ Build ล่าสุด / Recent build runs"
        subtitle="กำลังโหลดเหตุการณ์ใน pipeline"
        noPadding
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1.25}
          sx={{
            ...adminControlBarSx,
            p: 2,
          }}
        >
          <Skeleton variant="rounded" height={40} sx={{ flex: 1, minWidth: { lg: 340 }, borderRadius: "12px" }} />
          <Skeleton variant="rounded" width={190} height={40} sx={{ borderRadius: "12px" }} />
          <Skeleton variant="rounded" width={220} height={40} sx={{ borderRadius: "12px" }} />
          <Skeleton variant="text" width={140} height={20} sx={{ alignSelf: "center" }} />
        </Stack>

        <Box sx={{ height: { xs: 520, lg: 620 }, width: "100%", overflow: "hidden" }}>
          <BuildRowSkeleton header />
          {Array.from({ length: 14 }).map((_, index) => (
            <BuildRowSkeleton key={index} />
          ))}
        </Box>
      </AdminPanel>
    </Stack>
  );
}
