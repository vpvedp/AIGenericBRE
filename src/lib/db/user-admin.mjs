// Add, list, enable and disable sign-in users in the database.
// Used by scripts/db-user.mjs (and by the tests). Plain .mjs so Node can run it.
//
// `db` is any function (text, params) => Promise<rows>.
/** @typedef {(text: string, params?: unknown[]) => Promise<Record<string, any>[]>} Db */

import { randomBytes, scryptSync } from "node:crypto";
import { SCHEMA_SQL } from "./schema.mjs";

// Must match hashPassword() in src/lib/auth/users.ts (a test checks this).
/** @param {string} password @param {string} [salt] */
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 32).toString("hex") };
}

const ID_PATTERN = /^[A-Z0-9_.-]{2,40}$/;

/** @param {Db} db */
export async function ensureSchema(db) {
  for (const statement of SCHEMA_SQL) await db(statement);
}

/**
 * @param {Db} db
 * @param {string} employeeId
 * @param {string} password
 * @param {string | null} [displayName]
 */
export async function addUser(db, employeeId, password, displayName = null) {
  const id = String(employeeId ?? "").trim().toUpperCase();
  if (!ID_PATTERN.test(id)) throw new Error("Employee ID: 2–40 letters, digits, _ . or -");
  if (!password || password.length < 10) throw new Error("Use a password of at least 10 characters.");
  const { salt, hash } = hashPassword(password);
  // Insert, or replace the password of an existing user (and re-enable them).
  await db(
    `INSERT INTO app_users (employee_id, salt, hash, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id) DO UPDATE
       SET salt = EXCLUDED.salt, hash = EXCLUDED.hash,
           display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
           active = TRUE, updated_at = now()`,
    [id, salt, hash, displayName]
  );
  return id;
}

/** @param {Db} db @param {string} employeeId @param {boolean} active */
export async function setActive(db, employeeId, active) {
  const rows = await db(
    "UPDATE app_users SET active = $2, updated_at = now() WHERE employee_id = $1 RETURNING employee_id",
    [String(employeeId).trim().toUpperCase(), active]
  );
  return rows.length > 0;
}

/** @param {Db} db */
export async function listUsers(db) {
  return db("SELECT employee_id, display_name, active, created_at FROM app_users ORDER BY employee_id");
}
