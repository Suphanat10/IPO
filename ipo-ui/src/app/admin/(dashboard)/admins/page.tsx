export const dynamic = "force-dynamic";

import { Stack } from "@mui/material";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  AdminPageHeader,
} from "../../components/AdminPrimitives";
import AdminUsersClient from "./AdminUsersClient";

type AdminUserRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

async function getAdminUsers(): Promise<{ rows: AdminUserRow[]; error: string | null }> {
  try {
    const rows = await query<AdminUserRow>(
      "SELECT user_id, email, first_name, last_name, created_at::text AS created_at FROM admin_users ORDER BY created_at DESC",
    );
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: (err as Error).message };
  }
}

export default async function AdminUsersPage() {
  const [{ rows, error }, session] = await Promise.all([
    getAdminUsers(),
    getSession(),
  ]);

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="แอดมิน / Admins"
        title="จัดการผู้ดูแลระบบ / Admin management"
        description="เพิ่ม แก้ไข หรือลบผู้ดูแลระบบผ่าน PostgreSQL โดยตรง พร้อมแสดงชื่อ-นามสกุลและป้องกันการลบบัญชีที่กำลังใช้งานอยู่"
      />

      <AdminUsersClient
        initialRows={rows}
        initialError={error}
        currentUserId={session?.userId ?? null}
      />
    </Stack>
  );
}
