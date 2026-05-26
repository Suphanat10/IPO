import { getSession } from "@/lib/session";
import { logSecurityEvent } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    await logSecurityEvent({
      request,
      action: "unauthorized_api",
      reason: "session_missing_or_invalid",
    });
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  return Response.json({
    userId: session.userId,
    email: session.email,
    firstName: session.firstName ?? null,
    lastName: session.lastName ?? null,
    role: session.role ?? "admin",
  });
}
