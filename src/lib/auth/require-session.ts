import { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE, SessionPayload } from "./session";

// Second line of defence inside API routes. src/proxy.ts already blocks
// requests without a valid session, but the Next.js docs advise checking
// again where the data/action actually lives — never rely on the proxy alone.
export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  return readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}
