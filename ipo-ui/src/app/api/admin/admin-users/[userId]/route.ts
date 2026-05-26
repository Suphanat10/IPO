import { query, buildUpdateReturning, isDatabaseConfigured } from "@/lib/db";
import {
  cleanName,
  hashPassword,
  normalizeEmail,
  validatePassword,
} from "@/lib/admin-password";
import { logUserManagementEvent } from "@/lib/audit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminUserRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

function auditSnapshot(row: AdminUserRow) {
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

function validateUserId(userId: string) {
  if (!UUID_RE.test(userId)) return "user_id ต้องเป็น UUID";
  return null;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  if (!isDatabaseConfigured()) return missingDatabaseResponse();

  try {
    const { userId: rawUserId } = await ctx.params;
    const userId = decodeURIComponent(rawUserId).trim();
    const userIdError = validateUserId(userId);
    if (userIdError) return Response.json({ error: userIdError }, { status: 400 });

    const beforeRows = await query<AdminUserRow>(
      "SELECT user_id, email, first_name, last_name, created_at::text AS created_at FROM admin_users WHERE user_id = $1 LIMIT 1",
      [userId],
    );
    if (beforeRows.length === 0) return Response.json({ error: "Admin user not found" }, { status: 404 });

    const body = await request.json();
    const email = normalizeEmail(body.email);
    const firstName = cleanName(body.first_name ?? body.firstName);
    const lastName = cleanName(body.last_name ?? body.lastName);
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !firstName || !lastName) {
      return Response.json(
        { error: "First name, last name, and email are required." },
        { status: 400 },
      );
    }

    const duplicate = await query(
      "SELECT user_id FROM admin_users WHERE lower(email) = $1 AND user_id <> $2 LIMIT 1",
      [email, userId],
    );
    if (duplicate.length > 0) {
      return Response.json(
        { error: "Email นี้มีบัญชีแอดมินอยู่แล้ว" },
        { status: 409 },
      );
    }

    const updateData: Record<string, unknown> = {
      email,
      first_name: firstName,
      last_name: lastName,
    };

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      updateData.password_hash = await hashPassword(password);
    }

    const { text, values } = buildUpdateReturning(
      "admin_users",
      updateData,
      "user_id = $1",
      [userId],
      "user_id, email, first_name, last_name, created_at::text AS created_at",
    );
    const rows = await query<AdminUserRow>(text, values);

    if (rows.length === 0) return Response.json({ error: "Admin user not found" }, { status: 404 });

    await logUserManagementEvent({
      request,
      actorUserId: null,
      actorEmail: "admin",
      targetUserId: rows[0].user_id,
      targetEmail: rows[0].email,
      action: "admin_user_updated",
      diff: {
        before: auditSnapshot(beforeRows[0]),
        after: auditSnapshot(rows[0]),
        password_changed: Boolean(password),
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

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  if (!isDatabaseConfigured()) return missingDatabaseResponse();

  const { userId: rawUserId } = await ctx.params;
  const userId = decodeURIComponent(rawUserId).trim();
  const userIdError = validateUserId(userId);
  if (userIdError) return Response.json({ error: userIdError }, { status: 400 });

  try {
    const rows = await query<AdminUserRow>(
      "DELETE FROM admin_users WHERE user_id = $1 RETURNING user_id, email, first_name, last_name, created_at::text AS created_at",
      [userId],
    );
    if (rows.length === 0) {
      return Response.json({ error: "Admin user not found" }, { status: 404 });
    }
    await logUserManagementEvent({
      request,
      actorUserId: null,
      actorEmail: "admin",
      targetUserId: rows[0].user_id,
      targetEmail: rows[0].email,
      action: "admin_user_deleted",
      diff: {
        before: auditSnapshot(rows[0]),
      },
    });
    return Response.json({ user_id: userId, deleted: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
