import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Who may sign in. Users live in the APP_USERS environment variable, never in
// code, and passwords are stored only as scrypt hashes (never plain text):
//
//   APP_USERS=EMP001:<salt>:<hash>;EMP002:<salt>:<hash>
//
// Create a line with:  node scripts/create-user.mjs EMP001 "a-strong-password"
//
// Local development without APP_USERS keeps the old demo behaviour (any
// non-empty ID/password works) so you can still run the app with no setup.
// In production, no APP_USERS means nobody can sign in ("fail closed").

const KEY_LENGTH = 32;

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function parseUsers(raw: string | undefined): Map<string, { salt: string; hash: string }> {
  const users = new Map<string, { salt: string; hash: string }>();
  for (const entry of (raw ?? "").split(";")) {
    const [id, salt, hash] = entry.trim().split(":");
    if (id && salt && hash) users.set(id.toUpperCase(), { salt, hash });
  }
  return users;
}

export type LoginCheck = { ok: true; userId: string; demo: boolean } | { ok: false; reason: "invalid" | "not-configured" };

export function checkLogin(employeeId: string, password: string, env = process.env): LoginCheck {
  const id = employeeId.trim().toUpperCase();
  if (!id || !password) return { ok: false, reason: "invalid" };

  const users = parseUsers(env.APP_USERS);
  if (users.size === 0) {
    if (env.NODE_ENV === "production") return { ok: false, reason: "not-configured" };
    return { ok: true, userId: id, demo: true }; // local dev demo mode
  }

  const user = users.get(id);
  // Always run scrypt — even for unknown IDs — so response time doesn't reveal which IDs exist.
  const salt = user?.salt ?? "0".repeat(32);
  const expected = Buffer.from(user?.hash ?? "0".repeat(KEY_LENGTH * 2), "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  const match = expected.length === actual.length && timingSafeEqual(expected, actual);
  return user && match ? { ok: true, userId: id, demo: false } : { ok: false, reason: "invalid" };
}
