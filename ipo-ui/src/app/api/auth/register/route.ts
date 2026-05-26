import { randomUUID } from "node:crypto";
import { query, isDatabaseConfigured } from "@/lib/db";
import {
  cleanName,
  hashPassword,
  normalizeEmail,
  validatePassword,
} from "@/lib/admin-password";
import { createSession } from "@/lib/session";
import { logUserManagementEvent } from "@/lib/audit";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  let body: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = cleanName(body.firstName);
  const lastName = cleanName(body.lastName);

  if (!email || !password || !firstName || !lastName) {
    return Response.json(
      { error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" },
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

  try {
    await query(
      "INSERT INTO admin_users (user_id, email, first_name, last_name, password_hash) VALUES ($1, $2, $3, $4, $5)",
      [userId, email, firstName, lastName, passwordHash],
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลแอดมินได้" },
      { status: 500 },
    );
  }

  await createSession(userId, email, firstName, lastName);

  await logUserManagementEvent({
    request,
    actorUserId: userId,
    actorEmail: email,
    targetUserId: userId,
    targetEmail: email,
    action: "admin_user_created",
    diff: {
      source: "self_register",
      after: {
        user_id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  return Response.json({
    ok: true,
    userId,
    email,
    firstName,
    lastName,
  });
}
