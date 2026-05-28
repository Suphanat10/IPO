import { query, isDatabaseConfigured } from "@/lib/db";
import { normalizeEmail, verifyPassword } from "@/lib/admin-password";
import { createSession } from "@/lib/session";

type AdminLoginRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  password_hash: string | null;
  is_active: boolean | null;
  role: string | null;
};

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return Response.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { error: "รูปแบบอีเมลไม่ถูกต้อง / Invalid email format" },
      { status: 400 },
    );
  }

  const rows = await query<AdminLoginRow>(
    "SELECT user_id, email, first_name, last_name, password_hash, is_active, role FROM admin_users WHERE lower(email) = $1 LIMIT 1",
    [email],
  );
  const admin = rows[0];
  const ok = admin ? await verifyPassword(password, admin.password_hash) : false;

  if (!admin || !ok) {
    return Response.json(
      { error: "Email or password is incorrect." },
      { status: 401 },
    );
  }

  if (admin.is_active === false) {
    return Response.json(
      { error: "บัญชีนี้ถูกปิดใช้งาน / This account is deactivated." },
      { status: 403 },
    );
  }

  await createSession(
    admin.user_id,
    admin.email,
    admin.first_name,
    admin.last_name,
    admin.role ?? undefined,
  );

  return Response.json({
    ok: true,
    userId: admin.user_id,
    email: admin.email,
    firstName: admin.first_name,
    lastName: admin.last_name,
  });
}
