import { SignJWT, jwtVerify } from "jose";

// Stateless sessions, as recommended in the Next.js authentication guide:
// the session is a signed token (JWT) stored in an httpOnly cookie. Nobody
// can change it without SESSION_SECRET, and page JavaScript can't read it.
//
// Used by: src/proxy.ts (checks every request), the /api/auth/* routes
// (create / clear the cookie) and protected API routes (check again).

export const SESSION_COOKIE = "bre_session";
export const SESSION_HOURS = 8;

export interface SessionPayload {
  userId: string;
}

const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret";

/** The signing key. In production a missing/short secret is a hard error. */
function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (32+ characters) in production.");
  }
  return new TextEncoder().encode(DEV_SECRET);
}

export async function createSessionToken(payload: SessionPayload, now = Date.now()): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_HOURS * 3600)
    .sign(secretKey());
}

/** Returns the session if the token is valid and not expired, otherwise null. Never throws. */
export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.userId === "string" ? { userId: payload.userId } : null;
  } catch {
    return null; // tampered, expired, or wrong secret
  }
}

/** Cookie settings: httpOnly (no JS access), secure on https, sameSite=lax (CSRF protection for normal links). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  };
}
