import { Box, Skeleton, Stack } from "@mui/material";
import {
  AdminPageHeader,
  AdminPanel,
  adminColors,
  adminControlBarSx,
} from "../../components/AdminPrimitives";

function PredictionRowSkeleton({ header = false }: { header?: boolean }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.4fr) 150px 150px 110px 110px 110px",
        columnGap: 1.5,
        alignItems: "center",
        minWidth: 860,
        px: 2,
        py: header ? 1.05 : 1.25,
        bgcolor: header ? adminColors.panelAlt : "#ffffff",
        borderBottom: `1px solid ${adminColors.borderSoft}`,
      }}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton
          key={index}
          variant={index === 2 && !header ? "rounded" : "text"}
          width={header ? "70%" : index === 0 ? "78%" : "62%"}
          height={index === 2 && !header ? 24 : header ? 18 : 20}
          sx={{ borderRadius: index === 2 && !header ? 99 : undefined }}
        />
      ))}
    </Box>
  );
}

export default function PredictionsLoading() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="ประวัติคะแนนคำแนะนำ"
        title="ประวัติคำแนะนำ IPO"
        description="กำลังโหลดประวัติคะแนน อัตราชนะ เป้าหมาย และคำแนะนำของ IPO"
      />

      <AdminPanel
        title="ประวัติคะแนนล่าสุดต่อ IPO"
        subtitle="กำลังโหลดตารางประวัติคำแนะนำ"
        noPadding
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1.5}
          sx={{
            ...adminControlBarSx,
            p: { xs: 1.5, md: 2 },
            alignItems: { xs: "stretch", lg: "center" },
          }}
        >
          <Skeleton variant="rounded" height={40} sx={{ flex: 1, minWidth: { lg: 320 }, borderRadius: "12px" }} />
          <Skeleton variant="text" width={180} height={22} />
          <Skeleton variant="rounded" width={92} height={38} sx={{ borderRadius: "12px" }} />
        </Stack>

        <Box sx={{ overflow: "hidden" }}>
          <PredictionRowSkeleton header />
          {Array.from({ length: 10 }).map((_, index) => (
            <PredictionRowSkeleton key={index} />
          ))}
        </Box>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          sx={{
            p: { xs: 1.5, md: 2 },
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${adminColors.border}`,
          }}
        >
          <Skeleton variant="text" width={168} height={20} />
          <Stack direction="row" spacing={0.75}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" width={32} height={32} sx={{ borderRadius: "8px" }} />
            ))}
          </Stack>
        </Stack>
      </AdminPanel>
    </Stack>
  );
}
