export const dynamic = "force-dynamic";

import { Stack } from "@mui/material";
import { getAuditLogs } from "@/lib/admin/queries";
import {
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "../../components/AdminPrimitives";
import { AuditLogGrid } from "./AuditTables";
import { AuditCharts } from "./AuditCharts";

export default async function AuditPage() {
  const audits = await getAuditLogs(500);

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="ตรวจสอบย้อนหลัง / Audit"
        title="บันทึกการตรวจสอบ / Audit log"
        description="ตรวจ log การสร้าง แก้ไข หรือลบข้อมูล / Inspect create, update, and delete events."
        chips={
          <AdminStatusPill label={`${audits.length} เหตุการณ์ / audit events`} tone="neutral" />
        }
      />

      <AuditCharts rows={audits} />

      <AdminPanel title="บันทึกการตรวจสอบ / Audit log" subtitle={`${audits.length} เหตุการณ์ / events`} noPadding>
        <AuditLogGrid rows={audits} />
      </AdminPanel>
    </Stack>
  );
}
