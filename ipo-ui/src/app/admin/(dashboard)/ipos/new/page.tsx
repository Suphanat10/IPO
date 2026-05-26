import * as React from "react";
import { Button, Stack } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import Link from "next/link";
import IpoForm from "../IpoForm";
import { AdminPageHeader, AdminStatusPill } from "../../../components/AdminPrimitives";

export default function NewIpoPage() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="IPO ใหม่ / New IPO"
        title="สร้างรายการ IPO / Create IPO record"
        description="เพิ่มข้อมูลหลักก่อน แล้วค่อยเติม FA ราคา และข้อมูลการเงิน / Add the core listing record first, then enrich advisor, pricing, and financial sections."
        actions={
          <Link href="/admin/ipos" style={{ textDecoration: "none" }}>
            <Button variant="outlined" startIcon={<ArrowBackRoundedIcon />}>
              กลับ / Back
            </Button>
          </Link>
        }
        chips={<AdminStatusPill label="แบบร่าง / Draft" tone="warning" />}
      />

      <IpoForm ipo={{ status: "upcoming" }} financials={{}} isNew />
    </Stack>
  );
}
