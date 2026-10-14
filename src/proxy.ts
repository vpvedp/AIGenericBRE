import { NextRequest, NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

// Next.js 16 "proxy" (the renamed middleware): runs on the server BEFORE
// every matching request. Without a valid session cookie:
//   - pages      → redirect to /login
//   - API routes → 401 JSON
// Public: the login page, the auth API itself, the engine's demo decision API
// (other systems call it; it uses no AI key), and static files (see matcher).

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/decision"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next.js internals and files with an extension (images, favicon, fonts…).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
