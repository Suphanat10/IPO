import { query, buildUpdateReturning, isDatabaseConfigured } from "@/lib/db";
import {
  cleanName,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "@/lib/admin-password";
import { logUserManagementEvent } from "@/lib/audit";

type ProfileRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileAuditRow = ProfileRow & {
  password_hash: string | null;
};

function auditSnapshot(row: ProfileRow) {
  return {
    user_id: row.user_id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
  };
}

function missingDatabaseResponse() {
  return Response.json(
    { error: "Database is not configured." },
    { status: 503 },
  );
}

export async function GET() {
  if (!isDatabaseConfigured()) return missingDatabaseResponse();

  try {
    const rows = await query<ProfileRow>(
      `SELECT user_id, email, first_name, last_name, created_at::text AS created_at, updated_at::text AS updated_at
       FROM admin_users ORDER BY created_at ASC LIMIT 1`,
    );

    if (rows.length === 0) {
      return Response.json({ error: "No admin found" }, { status: 404 });
    }

    return Response.json({ user: rows[0] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  return PATCH(request);
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) return missingDatabaseResponse();

  try {
    const body = await request.json();
    const userId = body.user_id;
    if (!userId) {
      return Response.json({ error: "user_id is required" }, { status: 400 });
    }

    const beforeRows = await query<ProfileAuditRow>(
      `SELECT user_id, email, first_name, last_name, password_hash, created_at::text AS created_at, updated_at::text AS updated_at
       FROM admin_users WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (beforeRows.length === 0) {
      return Response.json({ error: "Admin not found" }, { status: 404 });
    }

    const email = normalizeEmail(body.email);
    const firstName = cleanName(body.first_name ?? body.firstName);
    const lastName = cleanName(body.last_name ?? body.lastName);
    const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
    const newPassword = typeof body.new_password === "string" ? body.new_password : "";

    if (!email || !firstName || !lastName) {
      return Response.json(
        { error: "ชื่อ นามสกุล และอีเมลจำเป็นต้องกรอก / First name, last name, and email are required." },
        { status: 400 },
      );
    }

    const duplicate = await query(
      "SELECT user_id FROM admin_users WHERE lower(email) = $1 AND user_id <> $2 LIMIT 1",
      [email, userId],
    );
    if (duplicate.length > 0) {
      return Response.json(
        { error: "Email นี้มีบัญชีแอดมินอยู่แล้ว / This email is already in use." },
        { status: 409 },
      );
    }

    const updateData: Record<string, unknown> = {
      email,
      first_name: firstName,
      last_name: lastName,
    };

    if (newPassword) {
      if (!currentPassword) {
        return Response.json(
          { error: "กรุณากรอกรหัสผ่านปัจจุบัน / Current password is required." },
          { status: 400 },
        );
      }

      const valid = await verifyPassword(currentPassword, beforeRows[0].password_hash);
      if (!valid) {
        return Response.json(
          { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง / Current password is incorrect." },
          { status: 400 },
        );
      }

      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return Response.json({ error: passwordError }, { status: 400 });
      }

      updateData.password_hash = await hashPassword(newPassword);
    }

    const { text, values } = buildUpdateReturning(
      "admin_users",
      updateData,
      "user_id = $1",
      [userId],
      "user_id, email, first_name, last_name, created_at::text AS created_at, updated_at::text AS updated_at",
    );
    const rows = await query<ProfileRow>(text, values);

    if (rows.length === 0) {
      return Response.json({ error: "Admin not found" }, { status: 404 });
    }

    await logUserManagementEvent({
      request,
      actorUserId: userId,
      actorEmail: email,
      targetUserId: rows[0].user_id,
      targetEmail: rows[0].email,
      action: "admin_profile_updated",
      diff: {
        before: auditSnapshot(beforeRows[0]),
        after: auditSnapshot(rows[0]),
        password_changed: Boolean(newPassword),
      },
    });

    return Response.json({ user: rows[0] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
