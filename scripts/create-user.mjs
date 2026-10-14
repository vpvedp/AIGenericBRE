// Creates one APP_USERS entry with a hashed password (the password itself is never stored).
//
//   node scripts/create-user.mjs EMP001 "a-strong-password"
//
// Paste the printed value into APP_USERS (in .env.local and in Vercel's
// Environment Variables). Several users are separated by ";".
// Must match hashPassword() in src/lib/auth/users.ts.

import { randomBytes, scryptSync } from "node:crypto";

const [id, password] = process.argv.slice(2);
if (!id || !password) {
  console.error('Usage: node scripts/create-user.mjs <EMPLOYEE_ID> "<password>"');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Use a password of at least 10 characters.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 32).toString("hex");
console.log(`${id.toUpperCase()}:${salt}:${hash}`);
console.log("\nAdd it to .env.local, e.g.:\nAPP_USERS=" + `${id.toUpperCase()}:${salt}:${hash}`);
