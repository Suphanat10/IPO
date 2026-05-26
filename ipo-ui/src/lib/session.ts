import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID, createHash } from "node:crypto";
import { query } from "./db";

export const COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

const encodedKey = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "",
);

export interface SessionPayload {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  email: string,
  firstName: string | null,
  lastName: string | null,
  role?: string,
): Promise<void> {
  // Look up role from DB if not provided
  let userRole = role ?? "admin";
  if (!role) {
    try {
      const rows = await query<{ role: string }>(
        "SELECT role FROM admin_users WHERE user_id = $1 LIMIT 1",
        [userId],
      );
      if (rows.length > 0) userRole = rows[0].role;
    } catch {
      // role column may not exist yet — default to 'admin'
    }
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const token = await new SignJWT({
    userId,
    email,
    firstName,
    lastName,
    role: userRole,
    sessionId,
  } satisfies Omit<SessionPayload, "iat" | "exp">)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encodedKey);

  // Persist session row for server-side revocation
  try {
    await query(
      `INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at)
       VALUES ($1, $2::uuid, $3, $4)`,
      [sessionId, userId, hashToken(token), expiresAt.toISOString()],
    );
  } catch {
    // admin_sessions table may not exist yet (migration not applied)
  }

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    const session = payload as unknown as SessionPayload;

    const iat = typeof payload.iat === "number" ? payload.iat : 0;
    const now = Math.floor(Date.now() / 1000);
    if (iat > now + 60) return null;

    // Check server-side revocation
    if (session.sessionId) {
      try {
        const rows = await query<{ revoked_at: string | null }>(
          "SELECT revoked_at FROM admin_sessions WHERE session_id = $1 LIMIT 1",
          [session.sessionId],
        );
        if (rows.length > 0 && rows[0].revoked_at != null) {
          return null;
        }
        // Update last_seen_at (fire and forget)
        query(
          "UPDATE admin_sessions SET last_seen_at = NOW() WHERE session_id = $1",
          [session.sessionId],
        ).catch(() => {});
      } catch {
        // admin_sessions table may not exist — skip revocation check
      }
    }

    return session;
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  // Revoke the session server-side so old JWTs can't be replayed
  if (token) {
    try {
      const { payload } = await jwtVerify(token, encodedKey, {
        algorithms: ["HS256"],
      });
      const session = payload as unknown as SessionPayload;
      if (session.sessionId) {
        await query(
          "UPDATE admin_sessions SET revoked_at = NOW() WHERE session_id = $1",
          [session.sessionId],
        ).catch(() => {});
      }
    } catch {
      // Token already expired — nothing to revoke
    }
  }

  jar.delete(COOKIE_NAME);
}

/**
 * Revoke all sessions for a user (e.g. when deactivating an account).
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  try {
    await query(
      "UPDATE admin_sessions SET revoked_at = NOW() WHERE user_id = $1::uuid AND revoked_at IS NULL",
      [userId],
    );
  } catch {
    // admin_sessions table may not exist
  }
}
