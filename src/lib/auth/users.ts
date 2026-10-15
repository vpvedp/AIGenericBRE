import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getReadyDb, isDbConfigured } from "@/lib/db";

// Who may sign in. Two places, checked in this order by authenticate():
//   1. the app_users table in Postgres (when DATABASE_URL is set) — add people
//      with:  node scripts/db-user.mjs add EMP002 "a-strong-password"
//   2. the APP_USERS environment variable — handy as a "break-glass" admin
//      that works even if the database is down.
// Passwords are stored only as scrypt hashes (never plain text):
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
  const match = verifyPassword(password, user?.salt ?? DUMMY_SALT, user?.hash ?? DUMMY_HASH);
  return user && match ? { ok: true, userId: id, demo: false } : { ok: false, reason: "invalid" };
}

const DUMMY_SALT = "0".repeat(32);
const DUMMY_HASH = "0".repeat(KEY_LENGTH * 2);

// Constant-time compare. Callers run it even for unknown IDs, so response time
// doesn't reveal which IDs exist.
function verifyPassword(password: string, salt: string, hashHex: string): boolean {
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Full sign-in check used by /api/auth/login: database users first, then APP_USERS.
 * If the database can't be reached, APP_USERS still works (and the error is logged).
 */
export async function authenticate(employeeId: string, password: string, env = process.env): Promise<LoginCheck> {
  const id = employeeId.trim().toUpperCase();
  if (!id || !password) return { ok: false, reason: "invalid" };

  const result = await realLogin(id, password, env);
  // DEMO_MODE=on (local development only): IDs that aren't real users may sign
  // in with any password. Real users still need their real password, and
  // production ignores this switch completely.
  if (!result.ok && env.DEMO_MODE === "on" && env.NODE_ENV !== "production" && !(await isRealUser(id, env))) {
    return { ok: true, userId: id, demo: true };
  }
  return result;
}

async function isRealUser(id: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (parseUsers(env.APP_USERS).has(id)) return true;
  if (!isDbConfigured(env)) return false;
  try {
    const db = await getReadyDb();
    return db ? (await db("SELECT 1 FROM app_users WHERE employee_id = $1", [id])).length > 0 : false;
  } catch {
    return true; // can't tell → don't hand out a demo login for what may be a real ID
  }
}

async function realLogin(id: string, password: string, env: NodeJS.ProcessEnv): Promise<LoginCheck> {
  if (isDbConfigured(env)) {
    try {
      const db = await getReadyDb();
      const rows = db ? await db("SELECT salt, hash, active FROM app_users WHERE employee_id = $1", [id]) : [];
      const row = rows[0];
      if (row) {
        const match = verifyPassword(password, row.salt, row.hash);
        return match && row.active ? { ok: true, userId: id, demo: false } : { ok: false, reason: "invalid" };
      }
    } catch (e) {
      console.error("[auth] user database unavailable, falling back to APP_USERS:", e instanceof Error ? e.message : e);
    }
    // Not in the database: try APP_USERS. With a database there is no demo mode
    // and no "not configured" — an unknown ID is simply wrong.
    if (parseUsers(env.APP_USERS).size > 0) return checkLogin(id, password, env);
    verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }

  return checkLogin(id, password, env);
}
