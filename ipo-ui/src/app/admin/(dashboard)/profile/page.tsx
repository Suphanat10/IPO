import { Stack } from "@mui/material";
import { AdminPageHeader } from "../../components/AdminPrimitives";
import ProfileClient from "./ProfileClient";

export default function AdminProfilePage() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="โปรไฟล์ / Profile"
        title="โปรไฟล์แอดมิน / Admin profile"
        description="ดูและแก้ไขข้อมูลส่วนตัว เปลี่ยนรหัสผ่าน / View and edit your personal information and change password."
      />

      <ProfileClient currentUserId={null} />
    </Stack>
  );
}
