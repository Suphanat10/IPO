export const dynamic = "force-dynamic";

import { Stack } from "@mui/material";
import Alert from "@mui/material/Alert";
import { getUpcomingIpos } from "@/lib/admin/queries";
import {
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "../../components/AdminPrimitives";
import ListingReadinessDashboard from "./ListingReadinessDashboard";
import UpcomingTable from "./UpcomingTable";

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(
    /postgres(?:ql)?:\/\/[^@]+@/gi,
    "postgresql://***@",
  );
}

export default async function UpcomingIposPage() {
  let rows;
  try {
    rows = await getUpcomingIpos();
  } catch (error) {
    return (
      <Stack spacing={3}>
        <AdminPageHeader
          eyebrow="IPO กำลังจะเข้า"
          title="ความพร้อมก่อนเข้าตลาด / Listing readiness"
          description="ไม่สามารถโหลดข้อมูลจากฐานข้อมูลได้ในขณะนี้ / Unable to load database-backed listing readiness data right now."
          chips={<AdminStatusPill label="Database unavailable" tone="danger" />}
        />
        <Alert severity="error">
          Database connection failed: {safeErrorMessage(error)}
        </Alert>
      </Stack>
    );
  }

  const urgent = rows.filter((row) => row.days_until != null && row.days_until <= 7).length;
  const incomplete = rows.filter((row) => row.completeness_pct < 100).length;

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="IPO กำลังจะเข้า"
        title="ความพร้อมก่อนเข้าตลาด / Listing readiness"
        description="ติดตามวันเข้าเทรด ความเร่งด่วน และความครบถ้วนของข้อมูลก่อนเปิดใช้ในงานวิเคราะห์ / Track upcoming listing dates, urgency, and completeness before records go live in analysis."
        chips={
          <>
            <AdminStatusPill label={`${rows.length} กำลังจะเข้า`} tone="info" />
            <AdminStatusPill label={`${urgent} เร่งด่วน / Urgent`} tone={urgent > 0 ? "danger" : "neutral"} />
            <AdminStatusPill label={`${incomplete} ไม่ครบ / Incomplete`} tone={incomplete > 0 ? "warning" : "success"} />
          </>
        }
      />

      <ListingReadinessDashboard rows={rows} />

      <AdminPanel title="รายการเข้าตลาดที่กำลังจะมา" subtitle="เรียงตามวันที่เข้าเทรดใกล้ที่สุด" noPadding>
        <UpcomingTable rows={rows} />
      </AdminPanel>
    </Stack>
  );
}
