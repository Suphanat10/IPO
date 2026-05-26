export const dynamic = "force-dynamic";

import * as React from "react";
import { Button, Chip, Stack } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import Link from "next/link";
import IposTable from "./IposTable";
import { getIposList } from "@/lib/admin/queries";
import {
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "../../components/AdminPrimitives";

export default async function IposPage(props: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    min?: string;
    industry?: string;
    sector?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const params = await props.searchParams;

  const r = await getIposList({
    search: params.q,
    status: params.status,
    minCompleteness: params.min ? Number(params.min) : undefined,
    industry: params.industry,
    sector: params.sector,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    limit: 100,
  });
  const { rows, total } = r;
  const industries = r.industries ?? [];
  const sectors = r.sectors ?? [];

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="IPO Explorer"
        title="รายการ IPO ทั้งหมด / All IPO Records"
        description="ค้นหา กรอง ตรวจความครบถ้วน และเปิดรายการ IPO เพื่อแก้ไขข้อมูล / Search, filter, inspect completeness, and open any IPO for curation."
        actions={
          <Link href="/admin/ipos/new" style={{ textDecoration: "none" }}>
            <Button variant="contained" startIcon={<AddRoundedIcon />}>
              เพิ่ม IPO / New IPO
            </Button>
          </Link>
        }
        chips={
          <>
            <AdminStatusPill label={`${total} rows`} tone="neutral" />
            {params.status ? <Chip label={`สถานะ / status: ${params.status}`} size="small" color="primary" /> : null}
            {params.q ? <Chip label={`ค้นหา / search: ${params.q}`} size="small" /> : null}
            {params.min ? <Chip label={`ความครบถ้วนขั้นต่ำ / min: ${params.min}%`} size="small" /> : null}
          </>
        }
      />

      <AdminPanel
        title="รายการ / Records"
        subtitle="ใช้ตัวกรองเพื่อจำกัดรายการที่ต้องแก้ไข / Use filters to narrow the editing queue"
        noPadding
      >
        <IposTable rows={rows} industries={industries} sectors={sectors} />
      </AdminPanel>
    </Stack>
  );
}
