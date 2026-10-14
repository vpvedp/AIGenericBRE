import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkLogin } from "@/lib/auth/users";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/auth/login  { employeeId, password }  →  sets the session cookie.

const LoginBody = z.object({
  employeeId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = LoginBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter both your Employee ID and password." }, { status: 400 });
  }
  const { employeeId, password } = parsed.data;

  // Slow down password guessing: 5 attempts per minute per IP + ID.
  const limit = rateLimit(`login:${clientIp(req.headers)}:${employeeId.toUpperCase()}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` }, { status: 429 });
  }

  const result = checkLogin(employeeId, password);
  if (!result.ok) {
    const error = result.reason === "not-configured" ? "Sign-in isn't configured on this server (APP_USERS is missing)." : "Wrong Employee ID or password.";
    return NextResponse.json({ ok: false, error }, { status: result.reason === "not-configured" ? 503 : 401 });
  }

  let token: string;
  try {
    token = await createSessionToken({ userId: result.userId });
  } catch (e) {
    console.error("[auth] cannot create session:", e);
    return NextResponse.json({ ok: false, error: "Sign-in isn't configured on this server (SESSION_SECRET is missing)." }, { status: 503 });
  }

  console.info(`[auth] sign-in ${result.userId}${result.demo ? " (demo mode)" : ""}`);
  const res = NextResponse.json({ ok: true, userId: result.userId, demo: result.demo });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
