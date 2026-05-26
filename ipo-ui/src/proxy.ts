import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "admin_session";
const encodedKey = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "",
);

/** Paths that don't require authentication */
const PUBLIC_PATHS = [
  "/admin/login",
  "/admin/register",
  "/api/auth/",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // API routes return 401 JSON; pages redirect to login
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
