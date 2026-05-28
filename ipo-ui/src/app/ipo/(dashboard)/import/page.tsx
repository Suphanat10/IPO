import { Stack } from "@mui/material";
import ImportClient from "./ImportClient";
import { AdminPageHeader } from "../../components/AdminPrimitives";

export default function ImportPage() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="นำเข้าไฟล์ CSV / Import CSV"
        title="พรีวิวและบันทึกข้อมูล / Preview and commit data"
        description="วางไฟล์ CSV (base, financials, sector หรือ FA normalization) — ระบบจะตรวจสอบความครบถ้วน, ระบุ missing fields และอัปเดต status อัตโนมัติก่อนบันทึก / Drop base, financials, sector, or FA normalization CSV files. The system auto-checks data, detects missing fields, and updates status before commit."
      />
      <ImportClient />
    </Stack>
  );
}
