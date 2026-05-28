export const dynamic = "force-dynamic";

import { Grid, Stack } from "@mui/material";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { getRecentBuilds } from "@/lib/admin/queries";
import {
  AdminPageHeader,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
} from "../../components/AdminPrimitives";
import BuildButton from "./BuildButton";
import BuildRunsGrid from "./BuildRunsGrid";

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function BuildsPage() {
  const runs = await getRecentBuilds(50);

  const summary = {
    total: runs.length,
    success: runs.filter((r) => r.status === "success").length,
    failed: runs.filter((r) => r.status === "failed").length,
    running: runs.filter((r) => r.status === "running" || r.status === "queued").length,
    lastSuccess: runs.find((r) => r.status === "success")?.finished_at ?? null,
  };

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="สร้างไฟล์ข้อมูล / Build pipeline"
        title="สายงานสร้างไฟล์ / Build pipeline"
        description="ระบบจะสร้าง ipo.json อัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยน (หน่วงเวลา 3 วินาที) / Automatically builds ipo.json when data changes with a 3-second debounce. กด Build ตอนนี้เพื่อสั่งสร้างไฟล์เอง / Use Build now to run it manually."
        actions={<BuildButton />}
        chips={
          <>
            <AdminStatusPill label={`${summary.success} สำเร็จ / success`} tone="success" />
            <AdminStatusPill label={`${summary.failed} ล้มเหลว / failed`} tone={summary.failed > 0 ? "danger" : "neutral"} />
            <AdminStatusPill label={`${summary.running} กำลังทำงาน / running`} tone="warning" />
            <AdminStatusPill label="ฐานข้อมูล -> ipo.json / DB -> ipo.json" tone="info" />
          </>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <AdminStatCard label="รันทั้งหมด / Total runs" value={summary.total} icon={<BuildRoundedIcon fontSize="small" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <AdminStatCard label="สำเร็จ / Success" value={summary.success} tone="success" icon={<CheckCircleIcon fontSize="small" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <AdminStatCard label="ล้มเหลว / Failed" value={summary.failed} tone="danger" icon={<ErrorOutlineIcon fontSize="small" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <AdminStatCard label="สำเร็จล่าสุด / Last success" value={fmtDateTime(summary.lastSuccess)} helper="ไฟล์ผลลัพธ์ล่าสุด / Most recent artifact" tone="info" />
        </Grid>
      </Grid>

      <AdminPanel title="รายการ Build ล่าสุด / Recent build runs" subtitle={`${runs.length} เหตุการณ์ / pipeline events`} noPadding>
        <BuildRunsGrid rows={runs} />
      </AdminPanel>
    </Stack>
  );
}
