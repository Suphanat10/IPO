import * as React from "react";
import { Stack } from "@mui/material";
import ImportClient from "./ImportClient";
import { AdminPageHeader, AdminStatusPill } from "../../components/AdminPrimitives";

export default function ImportPage() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="Import CSV"
        title="Preview and commit data"
        description="Drop base, financials, sector, or FA normalization CSV files. ระบบจะ auto-check ข้อมูลก่อนบันทึก พร้อม detect missing fields และ update status อัตโนมัติ"
        chips={
          <>
            <AdminStatusPill label="base.csv" tone="info" />
            <AdminStatusPill label="financials.csv" tone="info" />
            <AdminStatusPill label="df_sector.csv" tone="info" />
            <AdminStatusPill label="fa_company_norm.csv" tone="info" />
          </>
        }
      />
      <ImportClient />
    </Stack>
  );
}
