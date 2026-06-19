import { Suspense, type ReactNode } from "react";
import { Box, Chip, Skeleton, Stack, Typography } from "@mui/material";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import UpcomingIpoHero from "./components/UpcomingIpoHero";
import HomeAnalysisPanel from "./components/HomeAnalysisPanel";
import { getDropdownOptions, getUpcomingRecommendations } from "./lib/publicHomeData";
import type { DropdownOptions, UpcomingData } from "./lib/publicHomeTypes";

export const dynamic = "force-dynamic";

const c = {
  card: "#ffffff",
  cardBorder: "#e1e5eb",
  ink: "#0a1929",
  muted: "#64748b",
  accent: "#0ea5e9",
};

function IconHeader({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          bgcolor: "rgba(10,25,41,0.06)",
          display: "grid",
          placeItems: "center",
          color: c.accent,
          flexShrink: 0,
          mt: 0.25,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
          <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 800, color: c.ink, lineHeight: 1.2 }}>
            {title}
          </Typography>
          {badge ? (
            <Chip
              label={badge}
              size="small"
              sx={{
                height: 22,
                borderRadius: 1.5,
                bgcolor: "rgba(10,25,41,0.06)",
                color: c.accent,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.05em",
              }}
            />
          ) : null}
        </Stack>
        <Typography sx={{ mt: 0.5, color: c.muted, fontSize: { xs: 13, md: 14 }, lineHeight: 1.5 }}>
          {subtitle}
        </Typography>
      </Box>
    </Stack>
  );
}

function CardFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: `1px solid ${c.cardBorder}`,
        bgcolor: c.card,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      {children}
    </Box>
  );
}

function UpcomingCardFallback() {
  return (
    <CardFrame>
      <Box sx={{ p: { xs: 1.25, md: 2 }, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "280px minmax(0, 1fr)" } }}>
        <Stack spacing={1}>
          {[0, 1, 2].map((idx) => (
            <Skeleton key={idx} variant="rounded" height={76} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
        <Skeleton variant="rounded" height={352} sx={{ borderRadius: 2 }} />
      </Box>
    </CardFrame>
  );
}

function AnalysisCardFallback() {
  return (
    <CardFrame>
      <Skeleton variant="rectangular" height={49} />
      <Box
        sx={{
          p: { xs: 2, md: 2.5 },
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 380px" },
        }}
      >
        <Stack spacing={1.25}>
          <Skeleton variant="rounded" height={52} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={128} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={220} sx={{ borderRadius: 2 }} />
        </Stack>
        <Skeleton variant="rounded" height={360} sx={{ borderRadius: 2 }} />
      </Box>
    </CardFrame>
  );
}

async function UpcomingCard({ dataPromise }: { dataPromise: Promise<UpcomingData> }) {
  const data = await dataPromise;
  return (
    <CardFrame>
      <UpcomingIpoHero initialData={data} />
    </CardFrame>
  );
}

async function AnalysisCard({ optionsPromise }: { optionsPromise: Promise<DropdownOptions> }) {
  const dropdownOptions = await optionsPromise;
  return (
    <CardFrame>
      <HomeAnalysisPanel dropdownOptions={dropdownOptions} />
    </CardFrame>
  );
}

export default function Page() {
  const upcomingDataPromise = getUpcomingRecommendations();
  const dropdownOptionsPromise = getDropdownOptions();

  return (
    <Stack spacing={3}>
      <IconHeader
        icon={<RocketLaunchRoundedIcon sx={{ fontSize: 22 }} />}
        title="หุ้นที่กำลังจะ IPO เข้าตลาด"
        subtitle="คิวเข้าเทรดเร็วๆ นี้ พร้อมคะแนนแนะนำจาก FA, Underwriter และปัจจัยพื้นฐาน"
      />

      <Suspense fallback={<UpcomingCardFallback />}>
        <UpcomingCard dataPromise={upcomingDataPromise} />
      </Suspense>

      <IconHeader
        icon={<BarChartRoundedIcon sx={{ fontSize: 22 }} />}
        title="วิเคราะห์ IPO เชิงลึก"
        subtitle="กรอกข้อมูล IPO ตัวใหม่ (FA / Lead-Co / Fundamental) เพื่อดูสถิติและคะแนนรวมจากฐานข้อมูล IPO ย้อนหลัง"
        badge="3 หมวด"
      />

      <Suspense fallback={<AnalysisCardFallback />}>
        <AnalysisCard optionsPromise={dropdownOptionsPromise} />
      </Suspense>
    </Stack>
  );
}
