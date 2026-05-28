import * as React from "react";
import { Alert, Button, Stack } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import Link from "next/link";
import IpoForm from "../IpoForm";
import { toDateOnly } from "@/lib/date-format";
import { getIpo } from "@/lib/admin/queries";
import {
  ADMIN_RADIUS,
  AdminPageHeader,
  AdminStatusPill,
} from "../../../components/AdminPrimitives";

const STATUS_META = {
  listed: { label: "จดทะเบียนแล้ว / Listed", tone: "success" },
  upcoming: { label: "IPO กำลังจะเข้า", tone: "info" },
  cancelled: { label: "ยกเลิก / Cancelled", tone: "warning" },
} as const;

export default async function IpoEditPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const { ipo, financials } = await getIpo(Number(id));

  if (!ipo) {
    return (
      <Stack spacing={2}>
        <Alert severity="error" sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
          ไม่พบ IPO id={id} / IPO id={id} was not found.
        </Alert>
        <Link href="/ipo/ipos">กลับไปหน้ารายการ IPO / Back to IPO Explorer</Link>
      </Stack>
    );
  }

  const statusMeta = STATUS_META[(ipo.status ?? "") as keyof typeof STATUS_META];

  return (
    <Stack spacing={3}>
      <Link href="/ipo/ipos" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
        <Button variant="outlined" startIcon={<ArrowBackRoundedIcon />}>
          กลับ / Back
        </Button>
      </Link>

      <AdminPageHeader
        eyebrow="แก้ไข IPO / Edit IPO"
        title={ipo.symbol}
        description={ipo.company_name ?? "ยังไม่มีชื่อบริษัท / No company name recorded yet."}
        chips={
          <>
            <AdminStatusPill
              label={statusMeta?.label ?? "ไม่ทราบ / Unknown"}
              tone={statusMeta?.tone ?? "info"}
            />
            <AdminStatusPill label={ipo.market ?? "ไม่มีตลาด / No market"} />
            <AdminStatusPill label={toDateOnly(ipo.listing_date) || "ไม่มีวันที่เข้าเทรด / No listing date"} tone="warning" />
          </>
        }
      />

      <IpoForm ipo={ipo} financials={financials} />
    </Stack>
  );
}
