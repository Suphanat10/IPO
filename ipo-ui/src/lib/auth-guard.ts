import "server-only";
import { jwtVerify } from "jose";
import { query } from "./db";
import type { SessionPayload } from "./session";
import { COOKIE_NAME } from "./session";
import { logSecurityEvent } from "./audit";

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
    await logUnauthorizedApi(request, "missing_session");
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
      await logUnauthorizedApi(request, "future_iat", session);
      unauthorized("Token issued in the future");
    }

    if (!session.sessionId) {
      await logUnauthorizedApi(request, "missing_session_id", session);
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
          await logUnauthorizedApi(request, "session_not_found", session);
          unauthorized("Session not found");
        }
        if (rows.length > 0) {
          if (rows[0].revoked_at != null) {
            await logUnauthorizedApi(request, "session_revoked", session);
            unauthorized("Session has been revoked");
          }
          if (rows[0].is_active === false) {
            await logUnauthorizedApi(request, "account_deactivated", session);
            unauthorized("Account is deactivated");
          }
        }
      } catch (err) {
        // Re-throw 401/403 Response thrown by unauthorized()
        if (err instanceof Response) throw err;
        if (!isMissingSessionInfrastructureError(err)) {
          await logUnauthorizedApi(request, "session_validation_failed", session);
          unauthorized("Unable to validate session");
        }
        // admin_sessions table may not exist yet — skip DB check
      }
    }

    return session;
  } catch (err) {
    if (err instanceof Response) throw err;
    await logUnauthorizedApi(request, "invalid_or_expired_session");
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
    await logSecurityEvent({
      userId: session.userId,
      email: session.email ?? undefined,
      request,
      action: "permission_denied",
      reason: `role '${role}' not in [${allowedRoles.join(", ")}]`,
      role,
    });
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
      await logPermissionDenied(request, session, permission, role);
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
      await logPermissionDenied(request, session, permission, role);
      forbidden(`ไม่มีสิทธิ์ '${permission}' สำหรับ role '${role}' / Permission '${permission}' not granted to role '${role}'`);
    }
  }

  return session;
}

async function logPermissionDenied(
  request: Request,
  session: SessionPayload,
  permission: string,
  role: string,
): Promise<void> {
  await logSecurityEvent({
    userId: session.userId,
    email: session.email ?? undefined,
    request,
    action: "permission_denied",
    reason: `permission '${permission}' not granted to role '${role}'`,
    role,
    permission,
  });
}

async function logUnauthorizedApi(
  request: Request,
  reason: string,
  session?: Partial<SessionPayload>,
): Promise<void> {
  await logSecurityEvent({
    userId: session?.userId ?? null,
    email: session?.email ?? undefined,
    request,
    action: "unauthorized_api",
    reason,
  });
}
