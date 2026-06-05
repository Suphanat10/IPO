import { Alert, Button, Stack } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import Link from "next/link";
import IpoForm from "../IpoForm";
import { getIpo, getIpoFieldEvidence } from "@/lib/admin/queries";
import { effectiveIpoStatus } from "@/lib/ipo-status";
import {
  ADMIN_RADIUS,
  AdminPageHeader,
} from "../../../components/AdminPrimitives";

export default async function IpoEditPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const [{ ipo, financials }, evidence] = await Promise.all([
    getIpo(Number(id)),
    getIpoFieldEvidence(Number(id)),
  ]);

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

  const backHref =
    effectiveIpoStatus(ipo.status, ipo.listing_date) === "upcoming"
      ? "/ipo/upcoming"
      : "/ipo/ipos";

  return (
    <Stack spacing={3}>
      <Link href={backHref} style={{ alignSelf: "flex-start", textDecoration: "none" }}>
        <Button variant="outlined" startIcon={<ArrowBackRoundedIcon />}>
          กลับ / Back
        </Button>
      </Link>

      <AdminPageHeader
        eyebrow="แก้ไข IPO / Edit IPO"
        title={ipo.symbol}
        description={ipo.company_name ?? "ยังไม่มีชื่อบริษัท / No company name recorded yet."}
      />

      <IpoForm ipo={ipo} financials={financials} evidence={evidence} />
    </Stack>
  );
}
