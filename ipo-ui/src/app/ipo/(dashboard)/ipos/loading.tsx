import { Box, Skeleton, Stack } from "@mui/material";
import {
  ADMIN_RADIUS,
  AdminPageHeader,
  AdminPanel,
  adminColors,
  adminControlBarSx,
} from "../../components/AdminPrimitives";

function FilterSkeleton({ flex = 1, width }: { flex?: number; width?: number }) {
  return (
    <Skeleton
      variant="rounded"
      height={40}
      width={width}
      sx={{
        flex,
        minWidth: width ? undefined : 150,
        borderRadius: "12px",
        bgcolor: "rgba(10,25,41,0.08)",
      }}
    />
  );
}

function GridRowSkeleton({ header = false }: { header?: boolean }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "92px 118px 178px 126px minmax(180px, 1fr) minmax(180px, 1fr) 190px 230px 172px",
        columnGap: 1.25,
        alignItems: "center",
        minWidth: 1380,
        px: 1.5,
        py: header ? 1.15 : 1,
        borderBottom: `1px solid ${adminColors.borderSoft}`,
        bgcolor: header ? adminColors.panelAlt : "#ffffff",
      }}
    >
      {Array.from({ length: 9 }).map((_, index) => (
        <Skeleton
          key={index}
          variant={index === 1 && !header ? "rounded" : "text"}
          width={header ? "72%" : index === 0 ? 42 : "82%"}
          height={index === 1 && !header ? 24 : header ? 18 : 20}
          sx={{ borderRadius: index === 1 && !header ? 99 : undefined }}
        />
      ))}
    </Box>
  );
}

export default function IposLoading() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="IPO Explorer"
        title="รายการ IPO ทั้งหมด / All IPO Records"
        description="กำลังโหลดรายการ IPO ตัวกรอง และข้อมูลความครบถ้วน"
        actions={<Skeleton variant="rounded" width={134} height={36} sx={{ borderRadius: "8px" }} />}
      />

      <AdminPanel
        title="รายการ / Records"
        subtitle="กำลังโหลดข้อมูลจากฐานข้อมูล"
        noPadding
      >
        <Stack
          spacing={1.25}
          sx={{
            ...adminControlBarSx,
            p: 2,
          }}
        >
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25}>
            <FilterSkeleton />
            <FilterSkeleton width={150} flex={0} />
            <FilterSkeleton width={180} flex={0} />
          </Stack>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25}>
            <FilterSkeleton />
            <FilterSkeleton />
            <FilterSkeleton width={180} flex={0} />
            <FilterSkeleton width={180} flex={0} />
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rounded" width={112} height={40} sx={{ borderRadius: "8px" }} />
              <Skeleton variant="circular" width={40} height={40} />
            </Stack>
          </Stack>
        </Stack>

        <Box sx={{ height: 640, width: "100%", overflow: "hidden" }}>
          <GridRowSkeleton header />
          {Array.from({ length: 14 }).map((_, index) => (
            <GridRowSkeleton key={index} />
          ))}
        </Box>
      </AdminPanel>
    </Stack>
  );
}
