import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/require-session";

// GET /api/auth/session  →  { ok: true, userId } if signed in, else 401.
// The login page uses it to avoid a redirect loop when the browser still
// *thinks* it's signed in but the server session has expired.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  return session ? NextResponse.json({ ok: true, userId: session.userId }) : NextResponse.json({ ok: false }, { status: 401 });
}
