import "server-only";
import { jwtVerify } from "jose";
import { query } from "./db";
import type { SessionPayload } from "./session";
import { COOKIE_NAME } from "./session";

const encodedKey = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "",
);

function isMissingSessionInfrastructureError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String(err.code) : "";
  return code === "42P01" || code === "42703";
}

function unauthorized(message = "Not authenticated"): never {
  throw new Response(
    JSON.stringify({ error: message }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

function forbidden(message = "Forbidden"): never {
  throw new Response(
    JSON.stringify({ error: message }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Verify the admin session JWT from the request cookie.
 * Returns the decoded session payload.
 * Throws a 401 Response if unauthenticated.
 */
export async function requireAdmin(
  request: Request,
): Promise<SessionPayload> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  const token = match?.[1];

  if (!token) {
    unauthorized();
  }

  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    const session = payload as unknown as SessionPayload;

    const iat = typeof payload.iat === "number" ? payload.iat : 0;
    const now = Math.floor(Date.now() / 1000);
    if (iat > now + 60) {
      unauthorized("Token issued in the future");
    }

    if (!session.sessionId) {
      unauthorized("Session not found");
    }

    // Check server-side session revocation
    if (session.sessionId) {
      try {
        const rows = await query<{ revoked_at: string | null; is_active: boolean }>(
          `SELECT s.revoked_at, u.is_active
           FROM admin_sessions s
           JOIN admin_users u ON u.user_id = s.user_id
           WHERE s.session_id = $1
           LIMIT 1`,
          [session.sessionId],
        );
        if (rows.length === 0) {
          unauthorized("Session not found");
        }
        if (rows.length > 0) {
          if (rows[0].revoked_at != null) {
            unauthorized("Session has been revoked");
          }
          if (rows[0].is_active === false) {
            unauthorized("Account is deactivated");
          }
        }
      } catch (err) {
        // Re-throw 401/403 Response thrown by unauthorized()
        if (err instanceof Response) throw err;
        if (!isMissingSessionInfrastructureError(err)) {
          unauthorized("Unable to validate session");
        }
        // admin_sessions table may not exist yet — skip DB check
      }
    }

    return session;
  } catch (err) {
    if (err instanceof Response) throw err;
    unauthorized("Invalid or expired session");
  }
}

/**
 * Verify the admin session and require a specific role.
 * Throws 401 if not authenticated, 403 if wrong role.
 */
export async function requireRole(
  request: Request,
  allowedRoles: string[],
): Promise<SessionPayload> {
  const session = await requireAdmin(request);
  const role = session.role ?? "admin";

  if (!allowedRoles.includes(role)) {
    forbidden(`Role '${role}' ไม่มีสิทธิ์ / is not allowed for this operation`);
  }

  return session;
}

/**
 * Verify the admin session and require a specific permission.
 * Checks the admin_role_permissions table.
 * Falls back to role-based check if the table doesn't exist.
 */
export async function requirePermission(
  request: Request,
  permission: string,
): Promise<SessionPayload> {
  const session = await requireAdmin(request);
  const role = session.role ?? "admin";

  // super_admin always has all permissions
  if (role === "super_admin") return session;

  try {
    const rows = await query<{ permission: string }>(
      "SELECT permission FROM admin_role_permissions WHERE role = $1 AND permission = $2 LIMIT 1",
      [role, permission],
    );
    if (rows.length === 0) {
      forbidden(`ไม่มีสิทธิ์ '${permission}' สำหรับ role '${role}' / Permission '${permission}' not granted to role '${role}'`);
    }
  } catch (err) {
    if (err instanceof Response) throw err;
    // Table may not exist — fall back to role-based defaults
    const defaults: Record<string, string[]> = {
      admin: [
        "ipos:read", "ipos:write", "ipos:delete",
        "validation:read", "validation:write",
        "builds:read", "builds:trigger",
        "scraper:trigger",
      ],
      scraper: ["ipos:read", "scraper:trigger"],
      readonly: ["ipos:read", "validation:read", "builds:read"],
    };
    if (!(defaults[role] ?? []).includes(permission)) {
      forbidden(`ไม่มีสิทธิ์ '${permission}' สำหรับ role '${role}' / Permission '${permission}' not granted to role '${role}'`);
    }
  }

  return session;
}
