import { randomUUID } from "node:crypto";
import { query, isDatabaseConfigured } from "@/lib/db";
import {
  cleanName,
  hashPassword,
  normalizeEmail,
  validatePassword,
} from "@/lib/admin-password";
import { requirePermission } from "@/lib/auth-guard";
import { logUserManagementEvent } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session";

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

async function authorizeRead(request: Request): Promise<SessionPayload | Response> {
  try {
    return await requirePermission(request, "admin_users:read");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

async function authorizeCreate(request: Request): Promise<SessionPayload | Response> {
  try {
    return await requirePermission(request, "admin_users:create");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

function missingDatabaseResponse() {
  return Response.json(
    { error: "Database is not configured." },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return missingDatabaseResponse();

  const auth = await authorizeRead(request);
  if (auth instanceof Response) return auth;

  try {
    const data = await query<AdminUserRow>(
      "SELECT user_id, email, first_name, last_name, created_at::text AS created_at FROM admin_users ORDER BY created_at DESC",
    );
    return Response.json({ users: data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return missingDatabaseResponse();

  const auth = await authorizeCreate(request);
  if (auth instanceof Response) return auth;

  try {
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

    const passwordError = validatePassword(password);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    const existing = await query(
      "SELECT user_id FROM admin_users WHERE lower(email) = $1 LIMIT 1",
      [email],
    );
    if (existing.length > 0) {
      return Response.json(
        { error: "Email นี้มีบัญชีแอดมินอยู่แล้ว" },
        { status: 409 },
      );
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    const data = await query<AdminUserRow>(
      `INSERT INTO admin_users (user_id, email, first_name, last_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, email, first_name, last_name, created_at::text AS created_at`,
      [userId, email, firstName, lastName, passwordHash],
    );

    if (data[0]) {
      await logUserManagementEvent({
        request,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        targetUserId: data[0].user_id,
        targetEmail: data[0].email,
        action: "admin_user_created",
        diff: {
          after: auditSnapshot(data[0]),
        },
      });
    }

    return Response.json({ user: data[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isDup = /23505/.test(msg) || /unique/i.test(msg);
    return Response.json(
      { error: isDup ? "Email นี้มีบัญชีแอดมินอยู่แล้ว" : msg },
      { status: isDup ? 409 : 500 },
    );
  }
}
