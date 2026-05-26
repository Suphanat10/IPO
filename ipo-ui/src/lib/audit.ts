import "server-only";
import { query } from "./db";

type AuditDiff = Record<string, unknown>;
type SecurityAuditAction =
  | "login_failed"
  | "login_rejected"
  | "unauthorized_api"
  | "permission_denied"
  | "csrf_denied";

function requestPath(request?: Request): string | null {
  if (!request) return null;
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url || null;
  }
}

function requestIp(request?: Request): string | null {
  if (!request) return null;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? null;
}

function requestAuditFields(request?: Request) {
  return {
    ip: requestIp(request),
    method: request?.method ?? null,
    path: requestPath(request),
    user_agent: request?.headers.get("user-agent") ?? null,
    qaRun: request?.headers.get("x-qa-run") ?? null,
  };
}

export async function writeAuditLog({
  userId = null,
  entity,
  entityId,
  action,
  diff = {},
}: {
  userId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  diff?: AuditDiff;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, diff)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      [
        userId,
        entity,
        entityId.slice(0, 200),
        action,
        JSON.stringify(diff),
      ],
    );
  } catch (err) {
    // Audit logging must not block auth flows when the audit table is absent.
    console.warn(
      "Audit logging failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function logSecurityEvent({
  userId,
  email,
  ip,
  request,
  action,
  reason,
  role,
  permission,
}: {
  userId?: string | null;
  email?: string;
  ip?: string;
  request?: Request;
  action: SecurityAuditAction;
  reason: string;
  role?: string;
  permission?: string;
}): Promise<void> {
  const requestFields = requestAuditFields(request);
  const path = requestFields.path;
  await writeAuditLog({
    userId,
    entity: "auth",
    entityId: email?.slice(0, 200) ?? (path ? `anonymous:${path}` : "unknown"),
    action,
    diff: {
      ...requestFields,
      ip: ip ?? requestFields.ip,
      reason,
      role: role ?? null,
      permission: permission ?? null,
    },
  });
}

export async function logUserManagementEvent({
  request,
  actorUserId,
  actorEmail,
  targetUserId,
  targetEmail,
  action,
  diff = {},
}: {
  request: Request;
  actorUserId: string;
  actorEmail?: string | null;
  targetUserId: string;
  targetEmail?: string | null;
  action: "admin_user_created" | "admin_user_updated" | "admin_user_deleted" | "admin_profile_updated";
  diff?: AuditDiff;
}): Promise<void> {
  await writeAuditLog({
    userId: actorUserId,
    entity: "admin_users",
    entityId: targetUserId,
    action,
    diff: {
      ...requestAuditFields(request),
      actor_email: actorEmail ?? null,
      target_email: targetEmail ?? null,
      ...diff,
    },
  });
}

export async function logImportEvent({
  request,
  actorUserId,
  actorEmail,
  action,
  csvType,
  diff = {},
}: {
  request: Request;
  actorUserId: string;
  actorEmail?: string | null;
  action: "import_preview" | "import_commit";
  csvType: string;
  diff?: AuditDiff;
}): Promise<void> {
  await writeAuditLog({
    userId: actorUserId,
    entity: "import",
    entityId: csvType,
    action,
    diff: {
      ...requestAuditFields(request),
      actor_email: actorEmail ?? null,
      csv_type: csvType,
      ...diff,
    },
  });
}

export async function logScraperEvent({
  request,
  actorUserId,
  actorEmail,
  entity,
  entityId,
  action,
  diff = {},
}: {
  request?: Request;
  actorUserId?: string | null;
  actorEmail?: string | null;
  entity: "scraper_schedule" | "scrape_runs";
  entityId: string;
  action: "scraper_schedule_updated" | "scraper_triggered";
  diff?: AuditDiff;
}): Promise<void> {
  await writeAuditLog({
    userId: actorUserId ?? null,
    entity,
    entityId,
    action,
    diff: {
      ...requestAuditFields(request),
      actor_email: actorEmail ?? null,
      ...diff,
    },
  });
}
