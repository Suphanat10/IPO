import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
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
